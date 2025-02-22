<script lang="ts">
import Navbar from './Navbar.svelte'
</script>

<Navbar />

<!-- svelte-ignore element_invalid_self_closing_tag -->
<section class="max-w-xl mx-auto p-4">
    <textarea id="editor" placeholder="Enter your text here" rows={6} />
    <button type="submit">Generate</button>
</section>
