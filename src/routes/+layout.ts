import posthog from 'posthog-js'
import { browser } from '$app/environment';
import { onMount } from 'svelte';

onMount(() => {
  if (browser) {
    posthog.init(
      'phc_ICVutv55XS8VyMlB2c93KDcvpNUaRoTRukSuYTdoGeN',
      { 
        api_host: 'https://us.i.posthog.com',
        person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
      }
    )
  }
  return
});