import { TOGETHER_AI_API_KEY } from '$env/static/private'
import { CHROMA_DB_PATH } from '$env/static/private'
import { TogetherAIEmbeddings } from '@langchain/community/embeddings/togetherai'
import { TogetherAI } from '@langchain/community/llms/togetherai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { error, json } from '@sveltejs/kit'
import { ChromaClient } from 'chromadb'
import type { RequestHandler } from './$types'
const model = new TogetherAI({
	apiKey: TOGETHER_AI_API_KEY,
	modelName: 'deepseek-ai/DeepSeek-V3',
	temperature: 0.7,
	maxTokens: 4096
})

const embeddings = new TogetherAIEmbeddings({
	apiKey: TOGETHER_AI_API_KEY,
	modelName: 'togethercomputer/m2-bert-80M-8k-retrieval'
})

const chroma = new ChromaClient({
	path: CHROMA_DB_PATH
})

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { presentationId, question } = await request.json()

		if (!presentationId || !question) {
			throw error(400, 'Presentation ID and question are required')
		}

		// Get collection
		const collection = await chroma.getCollection({
			name: `presentation_${presentationId}`
		})

		// Get embeddings for the question
		const questionEmbedding = await embeddings.embedQuery(question)

		// Search for relevant chunks
		const results = await collection.query({
			queryEmbeddings: [questionEmbedding],
			nResults: 3
		})

		// Create context from results
		const context = results.documents[0].join('\n\n')

		// Create prompt template
		const prompt = ChatPromptTemplate.fromTemplate(`
      You are a helpful AI assistant answering questions about a presentation.
      Use the following context to answer the question:
      
      Context:
      {context}
      
      Question: {question}
      
      Answer the question based on the context provided. If you cannot answer the question from the context, say so.
    `)

		// Generate response
		const formattedPrompt = await prompt.format({
			context,
			question
		})

		const response = await model.invoke(formattedPrompt)
		return json({ answer: response })
	} catch (err) {
		console.error('Error handling question:', err)
		throw error(500, 'Failed to handle question')
	}
}
