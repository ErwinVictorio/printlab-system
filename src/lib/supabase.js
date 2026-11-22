import { createClient } from '@supabase/supabase-js'

const { VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY } = import.meta.env
const url = VITE_SUPABASE_URL?.trim()
const key = VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
const productionHost = 'printlab-system.vercel.app'

// These project settings are public and are already exposed by Vite in the browser.
const production = {
  url: 'https://hysiwafftadsxkifhcyg.supabase.co',
  key: 'sb_publishable_PtG5ZaCcUrXEJSPM6YLzCQ_uQHnC2XJ',
}
const config = url && key
  ? { url, key }
  : window.location.hostname === productionHost ? production : null

export const supabase = config ? createClient(config.url, config.key) : null

