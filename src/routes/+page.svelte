<script lang="ts">
import { onMount } from 'svelte'
import Navbar from './Navbar.svelte'

let textareaEl: HTMLTextAreaElement
let prompt = $state('')
let files = $state<File[]>([])
let previewUrls = $state<string[]>([])

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

onMount(() => {
	textareaEl?.focus()
	return () => {
		// Cleanup preview URLs
		for (const url of previewUrls) {
			URL.revokeObjectURL(url)
		}
	}
})
</script>

<Navbar />

<section class="max-w-xl mx-auto p-4">
   <form method="POST" action="?/generate">
    <textarea
        bind:value={prompt}
        id="prompt"
        name="prompt"
        bind:this={textareaEl}
        onpaste={handlePaste}
        placeholder="Enter your prompt... paste URLs to scrape it" 
        rows={6}
        class="[&_@]:underline"
    ></textarea>
    
    <div class="mb-4" role="group">
        <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
        <label
            role="button"
            for="files"
            class="secondary"
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
            />
        </label>
        <button 
        type="submit" 
    >
        Generate
    </button>
    </div>

    {#if files.length > 0}
        <div class="mb-4">
            <h6>Selected files</h6>
            <ul class=" gap-2">
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
