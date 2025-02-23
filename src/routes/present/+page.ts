import type { PageLoad } from './$types'
import pb from '$lib/pocketbase'

export const load = (async ({ params }) => {
	const presentationId = params.id
	if (!presentationId) {
		return {
			status: 404,
			error: 'Presentation not found'
		}
	}

	try {
		const presentation = await pb.collection('presentations').getOne(presentationId)
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
