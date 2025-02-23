import { PUBLIC_POCKETBASE_URL } from '$env/static/public'
import PocketBase from 'pocketbase'

const pb = new PocketBase(PUBLIC_POCKETBASE_URL)

export default pb
