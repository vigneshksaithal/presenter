<script lang="ts">
import Reveal from 'reveal.js'
import type { Options, Api as RevealApi } from 'reveal.js'
import type { PageData } from './$types'
import 'reveal.js/dist/reveal.css'
import 'reveal.js/dist/theme/black.css'
import VoiceInput from '$lib/components/VoiceInput.svelte'
import { marked } from 'marked'
// import 'reveal.js/dist/theme/fonts/source-sans-pro/source-sans-pro.css'
import { onMount } from 'svelte'

let { data }: { data: PageData } = $props()
let deck: RevealApi | null = null
let isLoading = $state(true)
let loadingStatus = $state('Initializing...')
let isPresenting = $state(false)
let currentAudio: HTMLAudioElement | null = null
let isAskingQuestion = $state(false)
let question = $state('')
let answer = $state('')
let isProcessingQuestion = $state(false)
let currentSlideAudio: string | null = null

const processMarkdownToSlides = async (markdown: string) => {
	// Split content by horizontal rule (---) to separate slides
	const slides = markdown.split(/\n---\n/)

	// Process each slide with marked and wrap in section
	return (
		await Promise.all(
			slides.map(async (slideContent) => {
				const processedContent = await marked.parse(slideContent.trim())
				// Add r-stretch class to images
				return `<section>${processedContent.replace(/<img/g, '<img class="r-stretch"')}</section>`
			})
		)
	).join('\n')
}

// Function to extract text content from slide HTML
const extractTextContent = (slideHtml: string) => {
	const div = document.createElement('div')
	div.innerHTML = slideHtml
	return div.textContent || ''
}

// Function to generate speech for text
const generateSpeech = async (text: string): Promise<HTMLAudioElement> => {
	const response = await fetch('/api/speech', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ text })
	})

	if (!response.ok) {
		throw new Error('Failed to generate speech')
	}

	const audioBlob = await response.blob()
	const audioUrl = URL.createObjectURL(audioBlob)
	const audio = new Audio(audioUrl)

	// Clean up the URL when the audio is loaded
	audio.onloadeddata = () => {
		console.log('Audio loaded, duration:', audio.duration)
	}

	// Clean up the URL when the audio ends
	audio.onended = () => {
		URL.revokeObjectURL(audioUrl)
	}

	return audio
}

// Function to play audio and wait for completion
const playAudio = async (audio: HTMLAudioElement): Promise<void> => {
	return new Promise((resolve, reject) => {
		audio.onended = () => resolve();
		audio.onerror = (e) => reject(e);
		audio.play().catch(reject)
	})
}

// Function to handle auto-presentation
const startAutoPresentation = async () => {
	if (!deck) {
		console.error('Deck not initialized')
		return
	}

	try {
		isPresenting = true
		const slides = document.querySelectorAll('.slides section')
		console.log('Starting presentation with', slides.length, 'slides')

		for (let i = 0; i < slides.length && isPresenting; i++) {
			deck.slide(i)
			const slideText = extractTextContent(slides[i].innerHTML)

			if (!slideText.trim()) {
				console.log('Empty slide, skipping')
				continue
			}

			try {
				console.log(`Playing slide ${i + 1}/${slides.length}`)
				currentAudio = await generateSpeech(slideText)
				await playAudio(currentAudio)
			} catch (error) {
				console.error('Error playing slide:', error)
			}
		}
	} catch (error) {
		console.error('Error during presentation:', error)
	} finally {
		isPresenting = false
		if (currentAudio) {
			currentAudio.pause()
			currentAudio = null
		}
	}
}

const stopAutoPresentation = () => {
	isPresenting = false
	if (currentAudio) {
		currentAudio.pause()
		currentAudio = null
	}
}

const handleQuestionSubmit = async () => {
	if (!question.trim() || !data.presentation?.id) return

	isProcessingQuestion = true
	try {
		const response = await fetch('/api/question', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				presentationId: data.presentation.id,
				question
			})
		})

		if (!response.ok) {
			throw new Error('Failed to get answer')
		}

		const result = await response.json()
		answer = result.answer

		// Generate speech for the answer using form action
		const form = new FormData()
		form.append('text', result.answer)

		const speechResponse = await fetch('?/generateSpeech', {
			method: 'POST',
			body: form
		})

		const speechResult = await speechResponse.json()
		if (speechResult.success) {
			const audio = new Audio(speechResult.audio) // Use data URL directly
			audio.onerror = (e) => console.error('Audio playback error:', e)
			const playPromise = audio.play()
			if (playPromise) {
				playPromise.catch((e) => console.error('Audio play error:', e))
			}
		}
	} catch (error) {
		console.error('Error handling question:', error)
	} finally {
		isProcessingQuestion = false
	}
}

const handleVoiceInput = async (event: CustomEvent<string>) => {
	const question = event.detail
	if (!question.trim() || !data.presentation?.id) return

	isProcessingQuestion = true
	try {
		const response = await fetch('/api/question', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				presentationId: data.presentation.id,
				question
			})
		})

		if (!response.ok) {
			throw new Error('Failed to get answer')
		}

		const result = await response.json()
		answer = result.answer

		// Generate speech for the answer
		const audioResponse = await fetch('/api/speech', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ text: result.answer })
		})

		if (!audioResponse.ok) {
			throw new Error('Failed to generate speech')
		}

		const audioBlob = await audioResponse.blob()
		const audioUrl = URL.createObjectURL(audioBlob)
		const audio = new Audio(audioUrl)

		audio.onended = () => URL.revokeObjectURL(audioUrl)
		await audio.play()
	} catch (error) {
		console.error('Error handling voice input:', error)
	} finally {
		isProcessingQuestion = false
	}
}

onMount(() => {
	const initDeck = async () => {
		console.log('Initializing deck')
		if (!data.presentation?.content) {
			console.log('No presentation content found')
			isLoading = false
			return
		}

		try {
			loadingStatus = 'Setting up knowledge base...'

			loadingStatus = 'Parsing markdown...'
			console.log('Parsing presentation content')

			// Process markdown into separate slides
			const slidesHtml = await processMarkdownToSlides(
				data.presentation.content
			)

			loadingStatus = 'Setting up slides...'
			console.log('Setting up slide container')
			const slideContainer = document.querySelector('.slides')
			if (slideContainer) {
				slideContainer.innerHTML = slidesHtml
			}

			loadingStatus = 'Configuring presentation...'
			console.log('Configuring Reveal.js')
			const options: Options = {
				hash: true,
				slideNumber: 'c/t',
				center: true,
				width: 1200,
				height: 800,
				transition: 'slide'
			}

			console.log('Creating Reveal instance')
			const RevealConstructor = Reveal as unknown as new (
				options: Options
			) => RevealApi
			deck = new RevealConstructor(options)

			if (deck) {
				loadingStatus = 'Starting presentation...'
				console.log('Initializing Reveal.js')
				await deck.initialize()
				console.log('Reveal.js initialized')
			}
		} catch (error) {
			console.error('Error initializing presentation:', error)
			loadingStatus = 'Error loading presentation'
		} finally {
			isLoading = false
		}
	}

	initDeck()

	return () => {
		stopAutoPresentation()
		if (deck) {
			console.log('Cleaning up Reveal.js')
			deck.destroy()
		}
	}
})
</script>

<div class="presentation-controls">
	{#if !isPresenting}
		<button onclick={startAutoPresentation}>
			Start Auto-Presentation
		</button>
	{:else}
		<button onclick={stopAutoPresentation}>
			Stop Presentation
		</button>
	{/if}
</div>

<div class="question-interface" class:active={isAskingQuestion}>
	<button 
		class="question-toggle" 
		onclick={() => isAskingQuestion = !isAskingQuestion}
	>
		{isAskingQuestion ? 'Close' : 'Ask a Question'}
	</button>
	
	{#if isAskingQuestion}
		<div class="question-form">
			<input 
				type="text" 
				bind:value={question} 
				placeholder="Ask about the presentation..."
			/>
			<button 
				onclick={handleQuestionSubmit}
				disabled={isProcessingQuestion}
			>
				{isProcessingQuestion ? 'Processing...' : 'Ask'}
			</button>
		</div>
		
		{#if answer}
			<div class="answer">
				{answer}
			</div>
		{/if}
	{/if}
</div>

<div class="voice-interface">
	<VoiceInput on:result={handleVoiceInput} />
	{#if answer}
		<div class="answer" class:processing={isProcessingQuestion}>
			{answer}
		</div>
	{/if}
</div>

<div class="reveal">
	<div class="slides">
		{#if isLoading}
			<section>
				<h2>{loadingStatus}</h2>
				<div aria-busy="true">Loading...</div>
			</section>
		{:else if !data.presentation}
			<section>
				<h1>Presentation not found</h1>
			</section>
		{/if}
	</div>
</div>

<style>
:global(.reveal) {
	height: 100vh;
}

:global(.reveal .slides) {
	text-align: left;
}

/* :global(.reveal h1) {
	font-size: 2.5em;
	color: #2c3e50;
	margin-bottom: 0.5em;
} */

/* :global(.reveal h2) {
	font-size: 1.8em;
	color: #34495e;
	margin-bottom: 0.5em;
} */

/* :global(.reveal h3) {
	font-size: 1.4em;
	color: #2c3e50;
}

:global(.reveal p) {
	font-size: 1.2em;
	line-height: 1.4;
	color: #2c3e50;
}

:global(.reveal ul) {
	font-size: 1.2em;
	line-height: 1.4;
} */

/* :global(.reveal li) {
	margin-bottom: 0.5em;
}

:global(.reveal code) {
	background-color: #f8f9fa;
	padding: 0.2em 0.4em;
	border-radius: 3px;
	font-family: 'Monaco', monospace;
}

:global(.reveal pre) {
	background-color: #f8f9fa;
	padding: 1em;
	border-radius: 5px;
	margin: 1em 0;
}

:global(.reveal blockquote) {
	border-left: 4px solid #3498db;
	padding-left: 1em;
	margin: 1em 0;
	font-style: italic;
	background-color: #f8f9fa;
}

:global(.reveal .progress) {
	height: 5px;
}

:global(.reveal .controls) {
	color: #2c3e50;
}

:global(.reveal .slide-number) {
	background-color: transparent;
	font-size: 16px;
	color: #666;
} */

.presentation-controls {
	position: fixed;
	bottom: 20px;
	right: 20px;
	z-index: 1000;
}

.presentation-controls button {
	padding: 10px 20px;
	border-radius: 5px;
	background: #2c3e50;
	color: white;
	border: none;
	cursor: pointer;
}

.question-interface {
	position: fixed;
	bottom: 8px;
	left: 96px;
	z-index: 1000;
	padding: 15px;
	border-radius: 8px;
	box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.question-form {
	display: flex;
	gap: 10px;
	margin-top: 10px;
}

.question-form input {
	flex: 1;
	padding: 8px;
	border: 1px solid #ddd;
	border-radius: 4px;
}

.answer {
	margin-top: 15px;
	padding: 10px;
	background: #f5f5f5;
	border-radius: 4px;
}

.voice-interface {
	position: fixed;
	bottom: 20px;
	left: 20px;
	z-index: 1000;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 10px;
}

.answer {
	background: rgba(255, 255, 255, 0.9);
	padding: 15px;
	border-radius: 8px;
	max-width: 300px;
	box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.answer.processing {
	opacity: 0.7;
}
</style> 