import posthog from 'posthog-js'
import { browser } from '$app/environment';

export const load = async () => {

  if (browser) {
    posthog.init(
      'phc_ICVutv55XS8VyMlB2c93KDcvpNUaRoTRukSuYTdoGeN',
      { api_host: 'https://us.i.posthog.com' }
    )
  }
  return
};