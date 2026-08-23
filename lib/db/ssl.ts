import type { ConnectionOptions } from 'node:tls'
import { SUPABASE_ROOT_CA } from './supabase-ca'

/**
 * TLS settings for the Postgres connection.
 *
 * Against Supabase we pin their root CA and verify the chain and hostname in
 * full. Anywhere else we return undefined and let `pg` derive TLS from the
 * connection string, so a local or non-Supabase database still works.
 *
 * Set DATABASE_SSL_NO_VERIFY=true to fall back to encrypt-without-verify —
 * an escape hatch for a proxy that re-signs traffic, not a default.
 */
export function sslConfig(url = ''): ConnectionOptions | undefined {
  if (!url.includes('.supabase.')) return undefined

  if (process.env.DATABASE_SSL_NO_VERIFY === 'true') {
    return { rejectUnauthorized: false }
  }

  return {
    ca: SUPABASE_ROOT_CA,
    rejectUnauthorized: true,
  }
}
