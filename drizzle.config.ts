import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { sslConfig } from './lib/db/ssl'

// drizzle-kit runs outside Next, so it does not pick up .env.local on its own.
config({ path: '.env.local' })

// Passed as discrete fields rather than `url`: drizzle-kit ignores
// dbCredentials.ssl when a url is present, which would drop TLS entirely.
const url = new URL(process.env.DATABASE_URL!)

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: sslConfig(process.env.DATABASE_URL),
  },
})
