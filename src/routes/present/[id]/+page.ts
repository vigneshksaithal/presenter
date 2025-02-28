import type { PageLoad } from './$types'

// Disable server-side rendering for this page
export const ssr = false

export const load = (async ({ params, fetch }) => {
	try {
		// Fetch presentation data from API
		const response = await fetch(`/api/presentation/${params.id}`)

		if (!response.ok) {
			const errorData = await response.json()
			console.error('Error fetching presentation:', errorData)
			return {
				presentation: null,
				error: errorData.error || 'Failed to load presentation'
			}
		}

		const data = await response.json()
		return data
	} catch (error) {
		console.error('Error in page load:', error)
		return {
			presentation: null,
			error: error instanceof Error ? error.message : 'Unknown error'
		}
	}
}) satisfies PageLoad
