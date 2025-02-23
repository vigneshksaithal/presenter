import { CHROMA_DB_PATH, TOGETHER_AI_API_KEY, FAL_AI_API_KEY } from '$env/static/private'
import pb from '$lib/pocketbase'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { TogetherAIEmbeddings } from '@langchain/community/embeddings/togetherai'
import { TogetherAI } from '@langchain/community/llms/togetherai'
import { Chroma } from '@langchain/community/vectorstores/chroma'
import type { Document } from '@langchain/core/documents'
import type { Actions } from '@sveltejs/kit'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import type { PageServerLoad } from './$types'
import { fal } from "@fal-ai/client"

fal.config({
	credentials: FAL_AI_API_KEY
})

export const load = (async () => {
	return {}
}) satisfies PageServerLoad

export const actions: Actions = {
	generate: async ({ request, fetch }) => {
		console.log('Generate action started')
		let presentationId: string | undefined

		try {
			const formData = await request.formData()
			const prompt = formData.get('prompt') as string
			const files = formData.getAll('files') as File[]

			if (!prompt && files.length === 0) {
				throw new Error(
					'Please provide either a prompt with URLs or upload PDF files'
				)
			}

			console.log('Received form data:', {
				prompt,
				fileCount: files.length,
				fileTypes: files.map((f) => f.type)
			})

			// Create presentation record
			console.log('Creating presentation record')
			presentationId = await createPresentationInPocketbase(prompt)
			console.log('Created presentation with ID:', presentationId)

			// Process PDFs if any
			console.log('Processing PDFs')
			const pdfResults = []
			for (const file of files) {
				if (file.type === 'application/pdf') {
					console.log('Processing PDF:', file.name)
					try {
						const result = await processPDF(file, presentationId)
						pdfResults.push(result)
					} catch (error) {
						console.error(`Error processing PDF ${file.name}:`, error)
						throw new Error(
							`Failed to process PDF ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
						)
					}
				}
			}
			console.log('PDF processing complete')

			// Process URLs if any
			console.log('Processing URLs')
			const urls = extractUrls(prompt)
			console.log('Extracted URLs:', urls)

			let scrapedSummaries = ''
			if (urls.length > 0) {
				try {
					const scrapedResults = await scrapeUrls(urls, fetch)
					console.log('Scraped results:', scrapedResults)

					if (scrapedResults.some((r) => !r.success)) {
						const failedUrls = scrapedResults
							.filter((r) => !r.success)
							.map((r) => r.url)
						console.warn('Some URLs failed to scrape:', failedUrls)
					}

					const validResults = scrapedResults.filter(
						(r) => r.success && r.content
					)
					if (validResults.length > 0) {
						scrapedSummaries = await generateSummary(
							validResults.map((result) => result.content).join('\n')
						)
						console.log('Generated summaries')
					}
				} catch (error) {
					console.error('Error processing URLs:', error)
					throw new Error(
						`Failed to process URLs: ${error instanceof Error ? error.message : 'Unknown error'}`
					)
				}
			}

			// Save scraped content to ChromaDB
			if (scrapedSummaries) {
				try {
					console.log('Saving scraped content to ChromaDB')
					const chunks = await splitText(scrapedSummaries)
					const embeddings = createEmbeddings()
					await createVectorStore(chunks, embeddings, presentationId)
					console.log('Saved to ChromaDB')
				} catch (error) {
					console.error('Error saving to ChromaDB:', error)
					throw new Error(
						`Failed to save to ChromaDB: ${error instanceof Error ? error.message : 'Unknown error'}`
					)
				}
			}

			// Generate final presentation
			console.log('Generating final presentation')
			const allContent = [...pdfResults, scrapedSummaries]
				.filter(Boolean)
				.join('\n\n')

			if (!allContent) {
				throw new Error('No content available to generate presentation')
			}

			// Generate image prompts
			console.log('Generating image prompts')
			const imagePrompts = await generateImagePrompts(allContent, createModel())
			console.log('Generated image prompts:', imagePrompts)

			// Generate images using Fal AI
			console.log('Generating images')
			const generatedImages = await generateImages(imagePrompts)
			console.log('Generated images:', generatedImages)

			// Save images to PocketBase
			console.log('Saving images to PocketBase')
			const savedImages = await saveImagesToPocketbase(generatedImages, presentationId)
			console.log('Saved images:', savedImages)

			// Update the presentation generation to include images
			const presentationContent = {
				content: allContent,
				images: savedImages
			}

			let presentation: string
			try {
				presentation = await generatePresentation(presentationContent)
				console.log('Generated presentation content')
			} catch (error) {
				console.error('Error generating presentation:', error)
				throw new Error(
					`Failed to generate presentation: ${error instanceof Error ? error.message : 'Unknown error'}`
				)
			}

			// Save presentation content to PocketBase
			try {
				console.log('Saving to PocketBase')
				await pb.collection('presentations').update(presentationId, {
					content: presentation,
					status: 'completed'
				})
				console.log('Saved to PocketBase')
			} catch (error) {
				console.error('Error saving to PocketBase:', error)
				throw new Error(
					`Failed to save presentation: ${error instanceof Error ? error.message : 'Unknown error'}`
				)
			}

			return {
				success: true,
				presentationId
			}
		} catch (error) {
			console.error('Error in generate action:', error)

			// Update status to failed if we have a presentationId
			if (presentationId) {
				try {
					await pb.collection('presentations').update(presentationId, {
						status: 'failed'
					})
				} catch (updateError) {
					console.error('Failed to update status to failed:', updateError)
				}
			}

			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			}
		}
	}
}

const extractUrls = (text: string) => {
	const urlRegex = /(https?:\/\/[^\s]+)/g
	const urls = [...text.matchAll(urlRegex)].map((match) => match[0])

	return urls
}

const scrapeUrls = async (urls: string[], fetch: typeof globalThis.fetch) => {
	const results = []

	for (const url of urls) {
		try {
			const response = await fetch('/api/scrape', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ url })
			})

			if (!response.ok) {
				throw new Error(`Failed to scrape ${url}`)
			}

			const data = await response.json()
			results.push({
				url,
				content: data.content,
				success: true
			})
		} catch (error) {
			console.error(`Error scraping ${url}:`, error)
			results.push({
				url,
				content: null,
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			})
		}
	}

	return results
}

const generateSummary = async (content: string) => {
	const llm = new TogetherAI({
		apiKey: TOGETHER_AI_API_KEY,
		model: 'deepseek-ai/DeepSeek-V3'
	})

	const inputText = `
    You are provided with scraped website data. 
    Generate a concise summary that retains only the relevant and actionable insights.
    Discard any extraneous details like ads, navigation elements, or boilerplate text.

    Content: ${content}
    `

	const completion = await llm.invoke(inputText)

	return completion
}

const splitText = async (text: string) => {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 1024,
		chunkOverlap: 100
	})

	return splitter.createDocuments([text])
}

const generatePresentation = async (data: {content: string, images: Array<{url: string, description: string}>}) => {
	const model = createModel()
	const response = await model.invoke([
		{
			role: 'system',
			content: PRESENTATION_PROMPT
		},
		{
			role: 'user',
			content: JSON.stringify(data)
		}
	])

	// Log the response for debugging
	console.log('LLM Response:', response)

	if (!response) {
		throw new Error('No response from LLM')
	}

	// Clean the response
	let cleanResponse = response
	if (typeof response === 'string') {
		// Remove any markdown code block syntax
		cleanResponse = response.replace(/^```[\s\S]*?```$/g, '')
	} else {
		cleanResponse = JSON.stringify(response)
	}

	return cleanResponse
}

const PRESENTATION_PROMPT = `
You are an expert presentation creator. Create a beautiful presentation from the provided content and images.
Follow these rules strictly:

1. Use reveal.js markdown format
2. Separate each slide with "---" on its own line (with newlines before and after)
3. Start with a title slide
4. Create clear and concise slides
5. Use proper headings (# for title, ## for sections, ### for subsections)
6. Include key points and insights
7. Use bullet points for lists
8. Keep each slide focused on one topic
9. Add speaker notes using "Note:" after slide content where helpful
10. DO NOT wrap your response in backticks or markdown code blocks
11. Start directly with the presentation content
12. Maximum 5-7 bullet points per slide
13. Use descriptive section titles
14. Include a summary/conclusion slide at the end
15. Include the provided images in relevant slides using markdown image syntax: ![description](image_url)
16. Place images where they best support the content
17. Add the image description as a caption below the image

Example format:

# Main Title
Subtitle or description

---

## Section 1
* Key point 1
* Key point 2

![Image description](image_url)
*Caption: Image description*

Note: Additional context for the speaker
`

const processPDF = async (pdfFile: File, presentationId: string) => {
	const loader = createPDFLoader(pdfFile)
	const docs = await loader.load()
	const chunks = await splitDocuments(docs)
	const embeddings = createEmbeddings()
	await createVectorStore(chunks, embeddings, presentationId)
	const model = createModel()
	const response = await extractInformation(chunks, model)
	return response
}

const createModel = () =>
	new TogetherAI({
		model: 'deepseek-ai/DeepSeek-V3',
		apiKey: TOGETHER_AI_API_KEY
	})

const createPDFLoader = (file: File) => new PDFLoader(file)

const splitDocuments = async (docs: Document[]) => {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 1024,
		chunkOverlap: 100
	})

	return splitter.splitDocuments(docs)
}

const extractInformation = async (chunks: Document[], model: TogetherAI) => {
	const allContent = chunks.map((chunk) => chunk.pageContent).join(' ')
	return model.invoke([
		{
			role: 'system',
			content: SYSTEM_PROMPT
		},
		{
			role: 'user',
			content: allContent
		}
	])
}

const SYSTEM_PROMPT = `
    You are an expert at extracting and organizing information. 
	Follow the Rules provided below:

	RULES:
    1. Extract all important information and make it concise and to the point.
    2. Give the output in markdown format.
    3. Include all key details but remove redundant or unnecessary information.
    4. Don't include references or embeddings in the output.
    5. Don't add any extra information.
    6. All information should be useful.
    7. Don't repeat any information.

    Example for outputs:
    "# Heading 1
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

    ## Heading 2
    Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat."
`

const createEmbeddings = () =>
	new TogetherAIEmbeddings({
		apiKey: TOGETHER_AI_API_KEY,
		model: 'togethercomputer/m2-bert-80M-8k-retrieval'
	})

const createVectorStore = async (
	chunks: Document[],
	embeddings: TogetherAIEmbeddings,
	presentationId: string
) =>
	Chroma.fromDocuments(chunks, embeddings, {
		url: CHROMA_DB_PATH,
		collectionName: presentationId,
		collectionMetadata: {
			'hnsw:space': 'cosine'
		}
	})

const createPresentationInPocketbase = async (title = '') => {
	const record = await pb.collection('presentations').create({
		title: title,
		status: 'pending'
	})

	return record.id
}

const IMAGE_PROMPT_SYSTEM = `
You are an expert at generating image prompts for presentations. For the given content:
1. Generate 3-5 image prompts that would enhance the presentation
2. Each prompt should be detailed and specific for high-quality image generation
3. Include a short description of what the image represents and how it relates to the content
4. Return ONLY a valid JSON array with 'prompt' and 'description' fields
5. DO NOT include any text before or after the JSON array
6. DO NOT include any markdown, code blocks, or formatting
7. The response must be EXACTLY in this format, no extra characters:
[{"prompt":"your prompt here","description":"your description here"}]

Example output (copy this format exactly):
[
  {
    "prompt": "A detailed 3D render of a modern laptop with holographic data visualization floating above it, blue glowing elements, high-tech aesthetic",
    "description": "Represents digital transformation and modern technology adoption"
  }
]`

async function generateImagePrompts(content: string, model: TogetherAI) {
	const response = await model.invoke([
		{
			role: 'system',
			content: IMAGE_PROMPT_SYSTEM
		},
		{
			role: 'user',
			content: `Generate image prompts for this content: ${content}`
		}
	])

	try {
		// Clean the response more thoroughly
		const cleanedResponse = response
			.replace(/```json\s*/g, '')    // Remove JSON code block markers
			.replace(/```\s*/g, '')        // Remove any other code block markers
			.replace(/^\s+|\s+$/g, '')     // Remove leading/trailing whitespace
			.replace(/[\r\n]+/g, '\n')     // Normalize line endings
			.replace(/.*?\[/s, '[')        // Remove any text before the first [
			// biome-ignore lint/correctness/noEmptyCharacterClassInRegex: <explanation>
			.replace(/\][^]*$/, ']')       // Remove any text after the last ]
			
		console.log('Cleaned response:', cleanedResponse)
		
		const parsed = JSON.parse(cleanedResponse)

		// Validate the structure
		if (!Array.isArray(parsed)) {
			throw new Error('Response is not an array')
		}

		// Validate each item in the array
		const validPrompts = parsed.every(item => 
			typeof item === 'object' && 
			typeof item.prompt === 'string' && 
			typeof item.description === 'string'
		)

		if (!validPrompts) {
			throw new Error('Invalid prompt format in response')
		}

		return parsed as Array<{prompt: string, description: string}>
	} catch (error) {
		console.error('Failed to parse image prompts:', error)
		console.error('Raw response:', response)
		throw new Error(`Failed to generate valid image prompts: ${error instanceof Error ? error.message : 'Unknown error'}`)
	}
}

async function generateImages(imagePrompts: Array<{prompt: string, description: string}>) {
	const results = []
	
	for (const {prompt, description} of imagePrompts) {
		try {
			const result = await fal.subscribe('fal-ai/flux', {
				input: {
					prompt,
					image_size: 'landscape_16_9',
					num_images: 1,
				}
			})
			
			// Debug log to see the response structure
			console.log('Fal AI response:', JSON.stringify(result.data, null, 2))
			
			// Check if we have an image URL in the response
			const imageUrl = result.data.images?.[0]?.url || result.data.images?.[0]
			if (imageUrl && typeof imageUrl === 'string') {
				results.push({
					imageUrl,
					prompt,
					description
				})
			} else {
				console.error('Invalid image URL in response:', result.data)
			}
		} catch (error) {
			console.error('Failed to generate image for prompt:', prompt, error)
		}
	}
	
	return results
}

async function saveImagesToPocketbase(
	images: Array<{imageUrl: string, prompt: string, description: string}>,
	presentationId: string
) {
	const savedImages = []
	
	for (const {imageUrl, prompt, description} of images) {
		try {
			// Validate URL before fetching
			if (!imageUrl || typeof imageUrl !== 'string') {
				console.error('Invalid image URL:', imageUrl)
				continue
			}

			// Try to create URL object to validate
			try {
				new URL(imageUrl)
			} catch (e) {
				console.error('Invalid URL format:', imageUrl)
				continue
			}

			// Fetch the image
			const response = await fetch(imageUrl)
			if (!response.ok) {
				throw new Error(`Failed to fetch image: ${response.statusText}`)
			}

			const blob = await response.blob()
			
			// Create file object
			const file = new File([blob], `presentation_image_${Date.now()}.png`, {
				type: 'image/png'
			})
			
			// Create form data
			const formData = new FormData()
			formData.append('image', file)
			formData.append('description', description)
			formData.append('prompt', prompt)
			formData.append('presentation', presentationId)
			
			// Save to PocketBase
			const record = await pb.collection('images').create(formData)
			
			savedImages.push({
				url: pb.files.getUrl(record, record.image),
				description
			})
		} catch (error) {
			console.error('Failed to save image:', error)
		}
	}
	
	return savedImages
}
