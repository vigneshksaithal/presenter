<script lang="ts">
import Reveal from 'reveal.js'
import type { PageData } from './$types'
import 'reveal.js/dist/reveal.css'
import { marked } from 'marked'
// import 'reveal.js/dist/theme/black.css'
import { onMount } from 'svelte'

let { data }: { data: PageData } = $props()
let deck: Reveal | null = null

onMount(() => {
	if (!data.presentation?.content) return

	const slides = marked.parse(data.presentation.content)
	const slideContainer = document.querySelector('.slides')
	if (slideContainer) {
		slideContainer.innerHTML = slides
	}

	deck = new Reveal({
		hash: true,
		slideNumber: true,
		plugins: []
	})

	deck.initialize()

	return () => {
		deck?.destroy()
	}
})
</script>

<div class="reveal">
	<div class="slides">
		{#if !data.presentation}
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
</style>