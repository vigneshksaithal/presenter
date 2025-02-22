<script lang="ts">
import Navbar from './Navbar.svelte'
import { onMount } from 'svelte'

let textareaEl: HTMLTextAreaElement

const handlePaste = (e: ClipboardEvent) => {
    const pastedText = e.clipboardData?.getData('text') || ''
    const urlRegex = /(https?:\/\/[^\s]+)/g
    
    if (!urlRegex.test(pastedText)) return
    
    const start = textareaEl.selectionStart
    const end = textareaEl.selectionEnd
    const text = textareaEl.value
    
    const formattedText = pastedText.replace(urlRegex, '@$1')
    const newText = text.slice(0, start) + formattedText + text.slice(end)
    textareaEl.value = newText
    
    // Update cursor position
    const newPosition = start + formattedText.length
    textareaEl.setSelectionRange(newPosition, newPosition)
}

onMount(() => {
    textareaEl?.focus()
})
</script>

<Navbar />

<!-- svelte-ignore element_invalid_self_closing_tag -->
<section class="max-w-xl mx-auto p-4">
   <form action="POST">
    <textarea 
        bind:this={textareaEl}
        on:paste|preventDefault={handlePaste}
        placeholder="Enter your prompt... paste URLs to scrape it" 
        rows={6}
        class="w-full p-2 border rounded [&_a]:underline"
    />
    <button class="secondary">+</button>
    <button type="submit">Generate</button>
   </form>
</section>
