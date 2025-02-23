<!-- src/routes/present/[id]/+page.svelte -->
<script lang="ts">
import Reveal from 'reveal.js'
import type { Options, Api as RevealApi } from 'reveal.js'
import type { PageData } from './$types'
import 'reveal.js/dist/reveal.css'
import 'reveal.js/dist/theme/black.css'
import { marked } from 'marked'
// import 'reveal.js/dist/theme/fonts/source-sans-pro/source-sans-pro.css'
import { onMount } from 'svelte'

let { data }: { data: PageData } = $props()
let deck: RevealApi | null = null
let isLoading = $state(true)
let loadingStatus = $state('Initializing...')

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

onMount(() => {
	const initDeck = async () => {
		console.log('Initializing deck')
		if (!data.presentation?.content) {
			console.log('No presentation content found')
			isLoading = false
			return
		}

		try {
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
		if (deck) {
			console.log('Cleaning up Reveal.js')
			deck.destroy()
		}
	}
})
</script>

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
</style> 