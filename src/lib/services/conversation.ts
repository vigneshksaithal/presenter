import { CHROMA_DB_PATH, OPENAI_API_KEY, OPENAI_MODEL } from '$env/static/private'
import { OpenAIEmbeddings } from "@langchain/openai"
import { ChatOpenAI } from "@langchain/openai"
import { Chroma } from '@langchain/community/vectorstores/chroma'
import { Document } from '@langchain/core/documents'
import { ChatPromptTemplate } from '@langchain/core/prompts'

// Initialize OpenAI model
const model = new ChatOpenAI({
	apiKey: OPENAI_API_KEY,
	model: OPENAI_MODEL,
	temperature: 0.7,
	maxTokens: 4096
})

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
	apiKey: OPENAI_API_KEY,
	modelName: 'text-embedding-3-small'
})

export const setupPresentationKnowledge = async (
	presentationId: string,
	content: string
) => {
	try {
		// Split content into chunks
		const chunks = content.split('\n\n').filter((chunk) => chunk.trim())

		// Convert chunks to LangChain Documents
		const documents = chunks.map(
			(chunk, i) =>
				new Document({
					pageContent: chunk,
					metadata: { source: `chunk-${i}` }
				})
		)

		// Create or get collection using LangChain's Chroma integration
		const vectorStore = await Chroma.fromDocuments(documents, embeddings, {
			collectionName: `presentation_${presentationId}`,
			url: CHROMA_DB_PATH, // Using local Chroma instance
			collectionMetadata: {
				'hnsw:space': 'cosine'
			}
		})

		return vectorStore
	} catch (error) {
		console.error('Error setting up knowledge base:', error)
		throw error
	}
}

export const handleQuestion = async (
	presentationId: string,
	question: string
): Promise<string> => {
	try {
		// Get the vector store
		const vectorStore = await Chroma.fromExistingCollection(embeddings, {
			collectionName: `presentation_${presentationId}`,
			url: CHROMA_DB_PATH // Using local Chroma instance
		})

		// Search for relevant documents
		const relevantDocs = await vectorStore.similaritySearch(question, 3)

		// Create context from results
		const context = relevantDocs.map((doc) => doc.pageContent).join('\n\n')

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
		return response
	} catch (error) {
		console.error('Error handling question:', error)
		throw error
	}
}
