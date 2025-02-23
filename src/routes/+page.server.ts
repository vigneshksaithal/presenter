import { CHROMA_DB_PATH, TOGETHER_AI_API_KEY } from '$env/static/private'
import pb from '$lib/pocketbase'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { TogetherAIEmbeddings } from '@langchain/community/embeddings/togetherai'
import { TogetherAI } from '@langchain/community/llms/togetherai'
import { Chroma } from '@langchain/community/vectorstores/chroma'
import type { Actions } from '@sveltejs/kit'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import type { PageServerLoad } from './$types'
import type { Document } from '@langchain/core/documents'

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
				throw new Error('Please provide either a prompt with URLs or upload PDF files')
			}
			
			console.log('Received form data:', {
				prompt,
				fileCount: files.length,
				fileTypes: files.map(f => f.type)
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
						throw new Error(`Failed to process PDF ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
					
					if (scrapedResults.some(r => !r.success)) {
						const failedUrls = scrapedResults.filter(r => !r.success).map(r => r.url)
						console.warn('Some URLs failed to scrape:', failedUrls)
					}
					
					const validResults = scrapedResults.filter(r => r.success && r.content)
					if (validResults.length > 0) {
						scrapedSummaries = await generateSummary(
							validResults.map((result) => result.content).join('\n')
						)
						console.log('Generated summaries')
					}
				} catch (error) {
					console.error('Error processing URLs:', error)
					throw new Error(`Failed to process URLs: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
					throw new Error(`Failed to save to ChromaDB: ${error instanceof Error ? error.message : 'Unknown error'}`)
				}
			}

			// Generate final presentation
			console.log('Generating final presentation')
			const allContent = [
				...pdfResults,
				scrapedSummaries
			].filter(Boolean).join('\n\n')

			if (!allContent) {
				throw new Error('No content available to generate presentation')
			}

			let presentation: string
			try {
				presentation = await generatePresentation(allContent)
				console.log('Generated presentation content')
			} catch (error) {
				console.error('Error generating presentation:', error)
				throw new Error(`Failed to generate presentation: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
				throw new Error(`Failed to save presentation: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

const generatePresentation = async (content: string) => {
	const model = createModel()
	const response = await model.invoke([
		{
			role: 'system',
			content: PRESENTATION_PROMPT
		},
		{
			role: 'user',
			content
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
You are an expert presentation creator. Create a beautiful presentation from the provided content.
Follow these rules:

1. Use reveal.js markdown format with horizontal slides separated by "---"
2. Create clear and concise slides
3. Use proper headings and sections
4. Include key points and insights
5. Make it visually appealing with proper spacing
6. Use bullet points for lists
7. Keep each slide focused on one topic
8. Add transition hints where appropriate
9. DO NOT wrap your response in backticks or markdown code blocks
10. Start directly with the presentation content

Example format:
# Title Slide

---

## Section 1

* Point 1
* Point 2

---

## Section 2

Content for section 2

Note: Speaker notes go here
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
