import { ELEVENLABS_API_KEY } from '$env/static/private'
import { ElevenLabsClient } from 'elevenlabs'

const elevenlabs = new ElevenLabsClient({
	apiKey: ELEVENLABS_API_KEY
})

// Default voice settings for presentations
const defaultVoiceSettings = {
	stability: 0.5,
	similarity_boost: 0.75,
	style: 0.5,
	use_speaker_boost: true
}

export const generateSpeech = async (text: string): Promise<string> => {
	try {
		const response = await fetch('/api/speech', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ text })
		})

		if (!response.ok) {
			throw new Error('Speech generation failed')
		}

		const audioBlob = await response.blob()
		return URL.createObjectURL(audioBlob)
	} catch (error) {
		console.error('Error generating speech:', error)
		throw error
	}
}
