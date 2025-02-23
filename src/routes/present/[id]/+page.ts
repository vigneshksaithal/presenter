import pb from '$lib/pocketbase'
import type { PageLoad } from './$types'

export const load = (async ({ params }) => {
	try {
		const presentation = await pb.collection('presentations').getOne(params.id)
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
