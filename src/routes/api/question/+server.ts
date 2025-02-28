import { CHROMA_DB_PATH, DEEPSEEK_API_KEY, DEEPSEEK_MODEL, OPENAI_API_KEY } from '$env/static/private'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { ChatDeepSeek } from '@langchain/deepseek'
import { OpenAIEmbeddings } from '@langchain/openai'
import { error, json } from '@sveltejs/kit'
import { ChromaClient } from 'chromadb'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { question, presentationId } = await request.json()

		if (!question) {
			throw error(400, 'Question is required')
		}

		if (!presentationId) {
			throw error(400, 'Presentation ID is required')
		}

		// Initialize embeddings
		const embeddings = new OpenAIEmbeddings({
			apiKey: OPENAI_API_KEY,
			modelName: 'text-embedding-3-small'
		})

		// Initialize ChromaDB client
		const chroma = new ChromaClient({
			path: CHROMA_DB_PATH
		})

		// Get collection with embeddings function
		const collection = await chroma.getOrCreateCollection({
			name: `presentation_${presentationId}`,
			embeddingFunction: {
				generate: async (texts: string[]) => {
					return await embeddings.embedDocuments(texts)
				}
			}
		})

		// Get embeddings for the question
		const questionEmbedding = await embeddings.embedQuery(question)

		// Query the collection
		const results = await collection.query({
			queryEmbeddings: questionEmbedding,
			nResults: 5
		})

		// Initialize the model
		const model = new ChatDeepSeek({
			apiKey: DEEPSEEK_API_KEY,
			model: DEEPSEEK_MODEL
		})

		// Create prompt template
		const prompt = ChatPromptTemplate.fromTemplate(`
			Answer the following question using only the context provided. If you cannot answer the question based on the context, say "I cannot answer this question based on the available information."
			
			Context: {context}
			
			Question: {question}
			
			Answer:
		`)

		// Format prompt with context and question
		const formattedPrompt = await prompt.format({
			context: results.documents[0].join('\n'),
			question
		})

		// Get response from model
		const response = await model.invoke(formattedPrompt)
		return json({ answer: response.content.toString() })
	} catch (err) {
		console.error('Error handling question:', err)
		throw error(500, 'Failed to handle question')
	}
}
