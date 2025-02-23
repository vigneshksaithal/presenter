<script lang="ts">
import { createEventDispatcher } from 'svelte'
const dispatch = createEventDispatcher<{
	result: string
}>()

let isListening = $state(false)
let recognition: SpeechRecognition | null = null

const startListening = () => {
	if (!('webkitSpeechRecognition' in window)) {
		alert('Speech recognition is not supported in this browser')
		return
	}

	recognition = new webkitSpeechRecognition()
	recognition.continuous = false
	recognition.interimResults = false
	recognition.lang = 'en-US'

	recognition.onresult = (event) => {
		const transcript = event.results[0][0].transcript
		dispatch('result', transcript)
		isListening = false
	}

	recognition.onerror = (event) => {
		console.error('Speech recognition error:', event.error)
		isListening = false
	}

	recognition.onend = () => {
		isListening = false
	}

	isListening = true
	recognition.start()
}

const stopListening = () => {
	if (recognition) {
		recognition.stop()
		isListening = false
	}
}
</script>

<button 
  class="mic-button" 
  class:listening={isListening}
  onclick={isListening ? stopListening : startListening}
  title="Press to speak"
>
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    {#if isListening}
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="22"></line>
    {:else}
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="22"></line>
    {/if}
  </svg>
</button>

<style>
  .mic-button {
    background: #2c3e50;
    border: none;
    border-radius: 50%;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .mic-button:hover {
    transform: scale(1.1);
  }

  .mic-button.listening {
    background: #e74c3c;
    animation: pulse 1.5s infinite;
  }

  .mic-button svg {
    color: white;
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(231, 76, 60, 0.7);
    }
    70% {
      transform: scale(1.1);
      box-shadow: 0 0 0 10px rgba(231, 76, 60, 0);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(231, 76, 60, 0);
    }
  }
</style> 