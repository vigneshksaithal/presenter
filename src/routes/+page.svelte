<script lang="ts">
import { onMount } from 'svelte'
import Navbar from './Navbar.svelte'
import { enhance } from '$app/forms'

let textareaEl: HTMLTextAreaElement
let prompt = $state('')
let files = $state<File[]>([])
let previewUrls = $state<string[]>([])
let isSubmitting = $state(false)
let showSuccessModal = $state(false)
let generatedPresentationId = $state('')
let error = $state('')

const handlePaste = (e: ClipboardEvent) => {
	const pastedText = e.clipboardData?.getData('text') || ''
	const urlRegex = /(https?:\/\/[^\s]+)/g

	if (!urlRegex.test(pastedText)) return

	const start = textareaEl.selectionStart
	const end = textareaEl.selectionEnd
	const text = textareaEl.value
	e.preventDefault()

	const formattedText = pastedText.replace(urlRegex, '@$1')
	const newText = text.slice(0, start) + formattedText + text.slice(end)
	textareaEl.value = newText

	// Update cursor position
	const newPosition = start + formattedText.length
	textareaEl.setSelectionRange(newPosition, newPosition)
}

const handleFileSelect = (e: Event) => {
	const input = e.target as HTMLInputElement
	if (!input.files?.length) return

	const newFiles = Array.from(input.files)
	files = [...files, ...newFiles]

	// Generate new preview URLs for new files
	for (const file of newFiles) {
		if (file.type.startsWith('image/')) {
			previewUrls = [...previewUrls, URL.createObjectURL(file)]
		}
	}
}

const removeFile = (index: number) => {
	// Remove file
	files = files.filter((_, i) => i !== index)

	// If it was an image, cleanup its preview URL and remove it
	if (previewUrls[index]) {
		URL.revokeObjectURL(previewUrls[index])
		previewUrls = previewUrls.filter((_, i) => i !== index)
	}
}

const closeModal = () => {
	showSuccessModal = false
}

const goToPresentation = () => {
	window.location.href = `/present/${generatedPresentationId}`
}

onMount(() => {
	textareaEl?.focus()
	return () => {
		// Cleanup preview URLs
		for (const url of previewUrls) {
			URL.revokeObjectURL(url)
		}
	}
})

function handleGenerate(form: HTMLFormElement) {
	error = ''
	isSubmitting = true
	return async ({ result }: { result: any }) => {
		isSubmitting = false
		
		if (result.type === 'success') {
			const data = result.data
			if (data && data.success === true) {
				generatedPresentationId = data.presentationId
				showSuccessModal = true
			} else {
				error = data.error || 'Failed to generate presentation'
			}
		} else {
			error = 'Failed to process request'
		}
	}
}
</script>

<Navbar />

<section class="max-w-xl mx-auto p-4">
   <form 
		method="POST" 
		action="?/generate"
		use:enhance={handleGenerate}
		enctype="multipart/form-data"
	>
    <textarea
        bind:value={prompt}
        id="prompt"
        name="prompt"
        bind:this={textareaEl}
        onpaste={handlePaste}
        placeholder="Enter your prompt... paste URLs to scrape it" 
        rows={8}
        class="[&_@]:underline"
        disabled={isSubmitting}
    ></textarea>
    
    <div class="mb-4" role="group">
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <!-- file upload -->
        <label
            role="button"
            for="files"
            class="secondary outline"
            aria-disabled={isSubmitting}
        >
            <span>Upload (PDF, images)</span>
            <input
                type="file"
                name="files"
                id="files"
                multiple
                accept=".pdf,image/*"
                class="hidden"
                onchange={handleFileSelect}
                disabled={isSubmitting}
            />
        </label>
        <button 
            type="submit"
            aria-busy={isSubmitting}
            disabled={isSubmitting}
        >
            {isSubmitting ? 'Generating...' : 'Generate'}
        </button>
    </div>

    {#if files.length > 0}
        <div class="mb-4" aria-busy={isSubmitting}>
            <h6>Selected files</h6>
            <ul class="gap-2">
                {#each files as file, index}
                    <li class="flex items-center gap-2 group">
                        {#if file.type.startsWith('image/')}
                            <img 
                                src={previewUrls[index]} 
                                alt={file.name}
                                class="w-8 h-8 object-cover rounded"
                            />
                        {:else}
                            <svg class="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                        {/if}
                        <span class="text-sm flex-1">{file.name}</span>
                        <button 
                            type="button"
                            onclick={() => removeFile(index)}
                            class="outline secondary"
                            aria-label="Remove file"
                            disabled={isSubmitting}
                        >
                            <svg class="size-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                            </svg>
                        </button>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}
</form>
</section>

{#if showSuccessModal}
<dialog open>
	<article>
		<h2>Presentation Generated!</h2>
		<p>
			Your presentation has been successfully generated.
			Click below to view it.
		</p>
		<footer>
			<button class="secondary" onclick={closeModal}>
				Close
			</button>
			<button onclick={goToPresentation}>View Presentation</button>
		</footer>
	</article>
</dialog>
{/if}

{#if error}
  <div class="error-message bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative max-w-xl mx-auto mt-4">
    <strong class="font-bold">Error: </strong>
    <span class="block sm:inline">{error}</span>
  </div>
{/if}
