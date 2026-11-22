import { createClient } from 'npm:@supabase/supabase-js@2.119.2'
import { AwsClient } from 'npm:aws4fetch@1.0.20'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

export const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export const limits = {
  'image/jpeg': { extension: 'jpg', bytes: 25 * 1024 * 1024 },
  'image/png': { extension: 'png', bytes: 25 * 1024 * 1024 },
  'image/webp': { extension: 'webp', bytes: 25 * 1024 * 1024 },
  'video/mp4': { extension: 'mp4', bytes: 100 * 1024 * 1024 },
} as const

export function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: cors })
}

export function serviceClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function endpoint(handler: (body: Record<string, unknown>, userId: string, db: ReturnType<typeof serviceClient>, isOwner: boolean) => Promise<Response>, ownerOnly = true) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405)
    const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) return reply({ error: 'Sign in to continue.' }, 401)
    try {

      const db = serviceClient()
      const { data, error } = await db.auth.getUser(token)
      if (error || !data.user) return reply({ error: 'Your session is invalid or expired.' }, 401)
      const isOwner = data.user.app_metadata?.role === 'super_admin'
      if (ownerOnly && !isOwner) return reply({ error: 'Owner access required.' }, 403)
      const body = await request.json().catch(() => null)
      if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'Invalid request.' }, 400)
      return await handler(body, data.user.id, db, isOwner)
    } catch (error) {
      if (error instanceof UploadConfigurationError) return reply({ error: error.message }, 503)
      return reply({ error: 'Upload service unavailable. Check the Supabase and R2 configuration.' }, 503)
    }
  }
}

class UploadConfigurationError extends Error {}

export function storage(key: string) {
  const account = Deno.env.get('R2_ACCOUNT_ID')?.trim()
  const bucket = Deno.env.get('R2_BUCKET_NAME')?.trim() || 'printlab'
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')
  if (!account || !/^[a-f0-9]{32}$/i.test(account)) {
    throw new UploadConfigurationError('R2_ACCOUNT_ID must contain the 32-character Cloudflare account ID.')
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new UploadConfigurationError('Set both R2 S3 credential secrets in Supabase.')
  }
  const url = new URL(`https://${account}.r2.cloudflarestorage.com/${encodeURIComponent(bucket)}/${key}`)
  const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  return { r2, url }
}

export async function mayUpload(db: ReturnType<typeof serviceClient>, eventId: string) {
  const { data, error } = await db.from('events').select('status').eq('id', eventId).maybeSingle()
  if (error) throw new Error('Upload permission lookup failed')
  return Boolean(data && data.status !== 'archived')
}


