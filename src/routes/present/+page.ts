import pb from '$lib/pocketbase'
import type { PageLoad } from './$types'

export const load = (async ({ params }) => {
	const presentationId = params.id
	if (!presentationId) {
		return {
			status: 404,
			error: 'Presentation not found'
		}
	}

	try {
		const presentation = await pb
			.collection('presentations')
			.getOne(presentationId)
		return {
			presentation
		}
	} catch (error) {
		return {
			status: 404,
			error: 'Presentation not found'
		}
	}
}) satisfies PageLoad
