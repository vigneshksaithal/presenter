<script lang="ts">
  import posthog from 'posthog-js'
</script>

<nav class="max-w-xl mx-auto px-4">
    <ul>
      <li>
        <hgroup>
          <h1>Research + Presentation + Voice</h1>
          <p>If you are getting errors it means I might have exhausted my LLMs, ElevenLabs API quota. Sorry :/</p>
        </hgroup>
      </li>
      <li>
        <button onclick={() => {
          posthog.capture('my event', { property: 'value' })
        }}>
          Posthog
        </button>
      </li>
    </ul>
    <!-- <ul>
      <li><a href="/about">About</a></li>
    </ul> -->
</nav>