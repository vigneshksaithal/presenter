<script lang="ts">
import '../app.css'
let { children } = $props()

import { browser } from '$app/environment';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import posthog from 'posthog-js'

  if (browser) {
    beforeNavigate(() => posthog.capture('$pageleave'));
    afterNavigate(() => posthog.capture('$pageview'));
  }
</script>

{@render children()}

<button class="secondary fixed top-4 left-4" data-tally-open="3lM9zB"  data-tally-layout="modal" data-tally-emoji-text="👋" data-tally-emoji-animation="wave">Feedback</button>
