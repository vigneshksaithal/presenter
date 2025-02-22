import type { Actions } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load = (async () => {
	return {}
}) satisfies PageServerLoad

export const actions: Actions = {
	generate: async ({ request, fetch }) => {
		const formData = await request.formData()
		const prompt = formData.get('prompt') as string
		console.log('Prompt', prompt)

		const urls = extractUrls(prompt)
		console.log('URLs', urls)

		const scrapedResults = await scrapeUrls(urls, fetch)

		console.log('Scraped Results', scrapedResults)

		return {
			urls,
			scrapedResults
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
