import { readFileSync } from 'node:fs'
import { config } from 'dotenv'

config({ path: '.env.local' })

const { Client } = await import('pg')
const { sslConfig } = await import('../lib/db/ssl')

const sql = readFileSync(new URL('../db/lockdown.sql', import.meta.url), 'utf8')
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig(process.env.DATABASE_URL),
})

client.on('notice', (n) => console.log(' ', n.message))

await client.connect()
await client.query(sql)
await client.end()
console.log('lockdown applied')
