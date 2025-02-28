import {
	CHROMA_DB_PATH,
	FAL_AI_API_KEY,
	OPENAI_API_KEY,
	OPENAI_MODEL
} from '$env/static/private'
import pb from '$lib/pocketbase'
import { fal } from '@fal-ai/client'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { Chroma } from '@langchain/community/vectorstores/chroma'
import type { Document } from '@langchain/core/documents'
import { OpenAIEmbeddings } from '@langchain/openai'
import { ChatOpenAI } from '@langchain/openai'
import type { Actions } from '@sveltejs/kit'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import type { PageServerLoad } from './$types'

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
		let success = false // Track success state explicitly

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

			// NEW: Process raw prompt as content if no other content is available
			let promptContent = ''
			if (pdfResults.length === 0 && !scrapedSummaries && prompt.trim()) {
				console.log('Using prompt text as content')
				// Process the prompt text to generate presentation content
				const model = createModel()
				promptContent = await generateContentFromPrompt(prompt, model)
				console.log('Generated content from prompt')

				// Also save this to ChromaDB
				try {
					const chunks = await splitText(promptContent)
					const embeddings = createEmbeddings()
					await createVectorStore(chunks, embeddings, presentationId)
					console.log('Saved prompt content to ChromaDB')
				} catch (error) {
					console.error('Error saving prompt content to ChromaDB:', error)
					// Non-fatal error, continue with generation
				}
			}

			// Combine all content sources, now including promptContent
			const allContent = [...pdfResults, scrapedSummaries, promptContent]
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
			const savedImages = await saveImagesToPocketbase(
				generatedImages,
				presentationId
			)
			console.log('Saved images:', savedImages)

			// Update the presentation generation to include images
			const presentationContent = {
				content: allContent,
				images: savedImages
			}

			let presentation: { title: string; content: string }
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
					title: presentation.title,
					content: presentation.content,
					status: 'completed'
				})
				console.log('Saved to PocketBase')

				// Set success flag after confirmed save
				success = true
			} catch (error) {
				console.error('Error saving to PocketBase:', error)
				throw new Error(
					`Failed to save presentation: ${error instanceof Error ? error.message : 'Unknown error'}`
				)
			}

			// Check success state before returning
			if (!success) {
				throw new Error('Operation completed but success state not set')
			}

			console.log('Returning success response with ID:', presentationId)
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
					console.log('Updated presentation status to failed')
				} catch (updateError) {
					console.error('Failed to update status to failed:', updateError)
				}
			}

			console.log(
				'Returning error response:',
				error instanceof Error ? error.message : 'Unknown error'
			)
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
	const llm = new ChatOpenAI({
		apiKey: OPENAI_API_KEY,
		model: 'gpt-4o-mini'
	})

	const inputText = `
    You are provided with scraped website data. 
    Generate a concise summary that retains only the relevant and actionable insights.
    Discard any extraneous details like ads, navigation elements, or boilerplate text.

    Content: ${content}
    `

	const completion = await llm.invoke(inputText)

	// Extract the actual content string from the AIMessage
	return completion.content.toString()
}

const splitText = async (text: string) => {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 1024,
		chunkOverlap: 100
	})

	return splitter.createDocuments([text])
}

const generatePresentation = async (data: {
	content: string
	images: Array<{ url: string; description: string }>
}) => {
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

	console.log('LLM Response type:', typeof response.content)
	const responseText = response.content.toString()

	// Log part of the response for debugging
	console.log('LLM Response (first 500 chars):', responseText.substring(0, 500))
	console.log(
		'LLM Response (last 500 chars):',
		responseText.substring(Math.max(0, responseText.length - 500))
	)

	try {
		// More aggressively clean and parse the response
		let jsonString = responseText

		// Remove any markdown code block formatting
		jsonString = jsonString.replace(/```(json)?/g, '').trim()

		// Try to extract just the JSON part (everything between first { and last })
		const firstBrace = jsonString.indexOf('{')
		const lastBrace = jsonString.lastIndexOf('}')

		if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
			jsonString = jsonString.substring(firstBrace, lastBrace + 1)
		}

		// Remove any escape characters that might break JSON
		jsonString = jsonString.replace(/\\(?=[^"\\])/g, '\\\\')

		// Fix common JSON formatting issues
		jsonString = jsonString
			.replace(/"\s*\n\s*"/g, '", "')
			.replace(/"\s*\n\s*}/g, '"}')
			.replace(/}\s*\n\s*"/g, '}, "')

		// For debugging
		console.log(
			'Processed JSON string (first 500 chars):',
			jsonString.substring(0, 500)
		)

		// Try to parse the cleaned JSON
		const result = JSON.parse(jsonString)

		if (!result.title || !result.content) {
			throw new Error('Invalid response format from LLM')
		}

		return result
	} catch (error) {
		console.error('Failed to parse presentation response:', error)
		console.error('Raw response text:', responseText)

		// Fallback: Create a simple valid response
		try {
			// Extract title and content manually
			let title = 'Generated Presentation'
			let content = responseText

			// Try to extract a title from the response
			const titleMatch = responseText.match(/title["']?\s*:\s*["']([^"']+)["']/)
			if (titleMatch?.[1]) {
				title = titleMatch[1]
			}

			// Try to extract content from the response
			const contentMatch = responseText.match(
				/content["']?\s*:\s*["']([^"']+)["']/
			)
			if (contentMatch?.[1]) {
				content = contentMatch[1]
			} else {
				// If no content found, use the raw response but remove JSON and Markdown formatting
				content = responseText
					.replace(/```json/g, '')
					.replace(/```/g, '')
					.replace(/{|\}|"title":|"content":/g, '')
					.trim()
			}

			return {
				title,
				content
			}
		} catch (fallbackError) {
			console.error('Even fallback extraction failed:', fallbackError)
			throw new Error('Failed to generate valid presentation format')
		}
	}
}

const PRESENTATION_PROMPT = `
You are an expert presentation designer specializing in reveal.js markdown presentations in Markdown format. Create a visually appealing, professional presentation.

FORMAT RULES (CRITICAL):
1. Your response must be EXACTLY in this JSON format: {"title": "Title Here", "content": "markdown content here"}
2. The "content" field must contain actual line breaks, NOT literal "\\n"

SLIDE STRUCTURE:
- Title slide: Use "# Title" on first line, followed by a subtitle on next line
- Separate slides with three dashes like this "---"
- Keep slides minimal: 1 concept per slide, 5-7 bullet points maximum
- Use ## for section headings (not ### or deeper)
- Use blank lines between different elements on a slide

FORMATTING:
- Bullet lists: Use "*" for main points and " - " (two spaces) for sub-points
- Numbered lists: Use "1. ", "2. ", etc.
- Images: "![Description](image_url)" followed by "*Caption: text*" on next line
- Speaker notes: Start with "Note: " after slide content

EXAMPLE:
{
  "title": "Effective Communication",
  "content": "
  	# Effective Communication

	Building stronger teams through clarity

	---

	## Key Principles

	* Clear messaging
	* Active listening
	* Timely feedback
	* Appropriate channels
	* Empathetic approach

	![Communication flow](https://i.ibb.co/0r00000/image.png)
	*Caption: Effective communication flow in organizations*

	Note: Emphasize that these principles build on each other

	---

	## Implementation Steps
	1. Assess current patterns
	2. Identify gaps
	3. Develop strategies
	4. Train team members
	5. Measure improvements"
}
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

const createModel = () => {
	return new ChatOpenAI({
		apiKey: OPENAI_API_KEY,
		model: OPENAI_MODEL
	})
}

const createPDFLoader = (file: File) => new PDFLoader(file)

const splitDocuments = async (docs: Document[]) => {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 1024,
		chunkOverlap: 100
	})

	return splitter.splitDocuments(docs)
}

const extractInformation = async (chunks: Document[], model: ChatOpenAI) => {
	const allContent = chunks.map((chunk) => chunk.pageContent).join(' ')
	const response = await model.invoke([
		{
			role: 'system',
			content: SYSTEM_PROMPT
		},
		{
			role: 'user',
			content: allContent
		}
	])

	// Return the actual content string
	return response.content.toString()
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
	8. Don't add "\n" (backslash n) in the output. Instead use "---" for new slides. And use blank lines between different elements on a slide.

    Example for outputs:
    "# Heading 1
    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

    ## Heading 2
    Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat."
`

const createEmbeddings = () => {
	return new OpenAIEmbeddings({
		apiKey: OPENAI_API_KEY,
		modelName: 'text-embedding-3-small'
	})
}

const createVectorStore = async (
	chunks: Document[],
	embeddings: OpenAIEmbeddings,
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

async function generateImagePrompts(content: string, model: ChatOpenAI) {
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
		// Get the response as a string
		const responseText = response.content.toString()

		// Clean the response more thoroughly
		const cleanedResponse = responseText
			.replace(/```json\s*/g, '') // Remove JSON code block markers
			.replace(/```\s*/g, '') // Remove any other code block markers
			.replace(/^\s+|\s+$/g, '') // Remove leading/trailing whitespace
			.replace(/[\r\n]+/g, '\n') // Normalize line endings
			.replace(/.*?\[/s, '[') // Remove any text before the first [
			// biome-ignore lint/correctness/noEmptyCharacterClassInRegex: <explanation>
			.replace(/\][^]*$/, ']') // Remove any text after the last ]

		console.log('Cleaned response:', cleanedResponse)

		const parsed = JSON.parse(cleanedResponse)

		// Validate the structure
		if (!Array.isArray(parsed)) {
			throw new Error('Response is not an array')
		}

		// Validate each item in the array
		const validPrompts = parsed.every(
			(item) =>
				typeof item === 'object' &&
				typeof item.prompt === 'string' &&
				typeof item.description === 'string'
		)

		if (!validPrompts) {
			throw new Error('Invalid prompt format in response')
		}

		return parsed as Array<{ prompt: string; description: string }>
	} catch (error) {
		console.error('Failed to parse image prompts:', error)
		console.error('Raw response:', response)
		throw new Error(
			`Failed to generate valid image prompts: ${error instanceof Error ? error.message : 'Unknown error'}`
		)
	}
}

async function generateImages(
	imagePrompts: Array<{ prompt: string; description: string }>
) {
	const results = []

	for (const { prompt, description } of imagePrompts) {
		try {
			const result = await fal.subscribe('fal-ai/flux-pro/new', {
				input: {
					prompt,
					image_size: 'landscape_16_9',
					num_images: 1
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
	images: Array<{ imageUrl: string; prompt: string; description: string }>,
	presentationId: string
) {
	const savedImages = []

	for (const { imageUrl, prompt, description } of images) {
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
				url: pb.files.getURL(record, record.image),
				description
			})
		} catch (error) {
			console.error('Failed to save image:', error)
		}
	}

	return savedImages
}

// Add this new function to process the prompt directly
async function generateContentFromPrompt(prompt: string, model: ChatOpenAI) {
	const response = await model.invoke([
		{
			role: 'system',
			content: `
You are an expert at creating comprehensive, well-structured content for presentations.
Given a prompt or topic, generate detailed presentation content that covers:
1. A thorough introduction to the topic
2. Key points and concepts
3. Examples and illustrations where appropriate
4. Practical applications or implications
5. Conclusions or next steps

Format your response in well-structured markdown, ready to be used in a presentation.
Make sure the content is informative, engaging, and suitable for slides.
Focus on providing high-quality, actionable information that would make for an excellent presentation.`
		},
		{
			role: 'user',
			content: `Generate presentation content about: ${prompt}`
		}
	])

	return response.content.toString()
}
