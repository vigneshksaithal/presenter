import { ELEVENLABS_API_KEY } from '$env/static/private'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

const VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Rachel voice

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { text } = await request.json()
    
    if (!text) {
      throw error(400, 'Text is required')
    }

    console.log(`Generating speech for: ${text.substring(0, 50)}...`)

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      }
    )

    if (!response.ok) {
      throw error(500, 'Failed to generate speech')
    }

    // Return the audio directly
    return new Response(await response.arrayBuffer(), {
      headers: {
        'Content-Type': 'audio/mpeg'
      }
    })
  } catch (err) {
    console.error('Error generating speech:', err)
    throw error(500, 'Failed to generate speech')
  }
} 