import type { Actions } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async () => {
    return {};
}) satisfies PageServerLoad;

export const actions: Actions = {
    generate: async ({ request }) => {
        const formData = await request.formData()
        const prompt = formData.get('prompt') as string
        console.log('Prompt', prompt)

        const urls = extractUrls(prompt)
        console.log('URLs', urls)

        return { urls }
    }
}

const extractUrls = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const urls = [...text.matchAll(urlRegex)].map(match => match[0])
    
    return urls
}
