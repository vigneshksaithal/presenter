import { TOGETHER_AI_API_KEY } from '$env/static/private'
import { CHROMA_DB_PATH } from '$env/static/private'
import { TogetherAIEmbeddings } from '@langchain/community/embeddings/togetherai'
import { TogetherAI } from '@langchain/community/llms/togetherai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
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
		const embeddings = new TogetherAIEmbeddings({
			apiKey: TOGETHER_AI_API_KEY
		})

		// Initialize ChromaDB client
		const chroma = new ChromaClient({
			path: CHROMA_DB_PATH
		})

		// Get collection with embeddings function
		const collection = await chroma.getOrCreateCollection({
			name: `presentation_${presentationId}`,
			embeddingFunction: embeddings
		})

		// Get embeddings for the question
		const questionEmbedding = await embeddings.embedQuery(question)

		// Query the collection
		const results = await collection.query({
			queryEmbeddings: questionEmbedding,
			nResults: 5
		})

		// Initialize the model
		const model = new TogetherAI({
			apiKey: TOGETHER_AI_API_KEY,
			modelName: 'mistralai/Mixtral-8x7B-Instruct-v0.1'
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
		return json({ answer: response })
	} catch (err) {
		console.error('Error handling question:', err)
		throw error(500, 'Failed to handle question')
	}
}
