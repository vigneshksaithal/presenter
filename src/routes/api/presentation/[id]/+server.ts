import { CHROMA_DB_PATH, OPENAI_API_KEY } from '$env/static/private'
import pb from '$lib/pocketbase'
import { OpenAIEmbeddings } from '@langchain/openai'
import { json } from '@sveltejs/kit'
import { ChromaClient } from 'chromadb'

const embeddings = new OpenAIEmbeddings({
	apiKey: OPENAI_API_KEY,
	modelName: 'text-embedding-3-small'
})

const chroma = new ChromaClient({
	path: CHROMA_DB_PATH
})

export async function GET({ params }) {
	try {
		const presentation = await pb.collection('presentations').getOne(params.id)

		if (presentation?.content) {
			try {
				// Try to get existing collection first
				try {
					await chroma.getCollection({
						name: `presentation_${params.id}`,
						embeddingFunction: {
							async generate(texts: string[]): Promise<number[][]> {
								return await embeddings.embedDocuments(texts)
							}
						}
					})
				} catch {
					// Create new collection if it doesn't exist
					const collection = await chroma.createCollection({
						name: `presentation_${params.id}`,
						metadata: { 'hnsw:space': 'cosine' },
						embeddingFunction: {
							async generate(texts: string[]): Promise<number[][]> {
								return await embeddings.embedDocuments(texts)
							}
						}
					})

					const chunks = presentation.content.split('\n\n').filter(Boolean)
					const embeddingsArray = await embeddings.embedDocuments(chunks)

					await collection.add({
						ids: chunks.map((chunk: string, i: number) => `chunk_${i}`),
						embeddings: embeddingsArray,
						documents: chunks
					})
				}
			} catch (err) {
				console.error('Error setting up knowledge base:', err)
				// Continue even if ChromaDB setup fails
			}
		}

		return json({ presentation })
	} catch (err) {
		console.error('Error loading presentation:', err)
		return json(
			{
				status: 404,
				error: 'Presentation not found'
			},
			{ status: 404 }
		)
	}
}
