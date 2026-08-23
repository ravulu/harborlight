import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'
import { sslConfig } from './ssl'

/**
 * How many connections one instance may hold.
 *
 * `pg` defaults to 10, which is close to what Supabase's session pooler allows
 * on the smaller plans — and it is per instance, so a service that scales to
 * two exhausts the pool and the second one starts refusing to connect. Kept
 * low and configurable rather than left to a default that only breaks once
 * there is traffic.
 */
const MAX_CONNECTIONS = Number(process.env.DATABASE_POOL_MAX ?? 5)

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(process.env.DATABASE_URL),
  max: Number.isFinite(MAX_CONNECTIONS) && MAX_CONNECTIONS > 0 ? MAX_CONNECTIONS : 5,
  // A pooler in front of Postgres will drop an idle connection itself; holding
  // one open past that just means discovering it is dead on the next query.
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

export const db = drizzle(pool, { schema })
