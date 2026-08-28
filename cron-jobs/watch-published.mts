/**
 * Has anybody published a table this build does not have?
 *
 * Layer 1 of `docs/tax-data-updates.md`. It asks that one question of each
 * source and reports. It does not read a figure, propose a patch, or touch
 * anything under `lib/` — a scraper that misreads one bracket boundary changes
 * every projection this app produces and nothing on the screen looks wrong,
 * which is the trade this design refuses.
 *
 *   npm run watch:figures          # report, and fail if anything wants a look
 *   npm run watch:figures -- --accept   # record what is there now as seen
 *
 * See `cron-jobs/README.md`.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { PUBLISHED, staleTables, yearsBehind } from '../lib/published'
import { SOURCES, type Check } from './sources'

const here = dirname(fileURLToPath(import.meta.url))
const STATE = join(here, 'state.json')

interface Seen {
  /** Hash of the page the last time somebody looked at it. */
  hash?: string
  /** Newest Federal Register document id seen. */
  document?: string
  /** When a person last confirmed there was nothing new worth acting on. */
  checkedOn?: string
}

const state: Record<string, Seen> = JSON.parse(readFileSync(STATE, 'utf8'))
const accept = process.argv.includes('--accept')

/** Never let one unreachable site end the run: the others still have answers. */
async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'fairwater-figure-watcher (+https://github.com/ravulu/harborlight)' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

interface Finding {
  key: string
  label: string
  what: string
  detail: string
  /** True when a person should go and look. */
  act: boolean
}

async function check(key: string, source: Check): Promise<Finding | null> {
  const table = PUBLISHED.find((t) => t.key === key)!
  const was = state[key] ?? {}

  if (source.kind === 'federal-register') {
    const params = new URLSearchParams({
      'conditions[term]': source.term,
      order: 'newest',
      'per_page': '40',
      'fields[]': 'document_number',
    })
    params.append('fields[]', 'title')
    params.append('conditions[type][]', 'NOTICE')
    for (const a of source.agencies) params.append('conditions[agencies][]', a)
    // Only what was published after the year this build already holds. Asking
    // for everything would report the document the current table came from.
    params.append('conditions[publication_date][gte]', `${table.year}-01-01`)
    const body = await get(`https://www.federalregister.gov/api/v1/documents.json?${params}`)
    if (body === null) {
      return { key, label: table.label, what: 'unreachable', detail: 'The Federal Register API did not answer.', act: false }
    }
    let newest: string | undefined
    try {
      // Filtered on the title, not merely on the full-text match — see the
      // note on `titlePattern`. A document that mentions the guidelines is not
      // a document that publishes them.
      const wanted = new RegExp(source.titlePattern, 'i')
      const results: { document_number: string; title: string }[] =
        JSON.parse(body)?.results ?? []
      newest = results.find((r) => wanted.test(r.title ?? ''))?.document_number
    } catch {
      return { key, label: table.label, what: 'unreadable', detail: 'The API answered with something that was not JSON.', act: false }
    }
    if (!newest) return null
    if (was.document === newest) return null
    if (accept) {
      state[key] = { ...was, document: newest, checkedOn: new Date().toISOString().slice(0, 10) }
      return null
    }
    return {
      key,
      label: table.label,
      what: 'new document',
      detail: `federalregister.gov/d/${newest} — searched "${source.term}" since ${table.year}-01-01.`,
      act: true,
    }
  }

  const body = await get(source.url)
  if (body === null) {
    return { key, label: table.label, what: 'unreachable', detail: `${source.url} did not answer.`, act: false }
  }
  const now = hash(body)
  if (was.hash === now) return null
  if (accept) {
    state[key] = { ...was, hash: now, checkedOn: new Date().toISOString().slice(0, 10) }
    return null
  }
  return {
    key,
    label: table.label,
    what: was.hash ? 'page changed' : 'first look',
    detail: `${source.url}${was.hash ? ' — the page is not what it was when this was last accepted.' : ' — no hash recorded yet.'}`,
    act: true,
  }
}

const findings = (
  await Promise.all(Object.entries(SOURCES).map(([k, s]) => check(k, s)))
).filter((f): f is Finding => f !== null)

// ---- report ---------------------------------------------------------------

const overdue = staleTables()
const lines: string[] = []

if (overdue.length > 0) {
  lines.push(`## ${overdue.length} table${overdue.length === 1 ? '' : 's'} the calendar has passed`, '')
  for (const t of overdue) {
    lines.push(
      `- **${t.label}** — holding ${t.year}, ${yearsBehind(t)} year(s) behind.`,
      `  ${t.where} Published ${t.publishedAround}.`,
      `  ${t.source.title} — ${t.source.url}`,
    )
  }
  lines.push('')
}

const actionable = findings.filter((f) => f.act)
if (actionable.length > 0) {
  lines.push(`## ${actionable.length} source${actionable.length === 1 ? '' : 's'} worth a look`, '')
  for (const f of actionable) lines.push(`- **${f.label}** (${f.what})`, `  ${f.detail}`)
  lines.push('')
}

const broken = findings.filter((f) => !f.act)
if (broken.length > 0) {
  lines.push('## Could not be checked', '')
  for (const f of broken) lines.push(`- **${f.label}** — ${f.detail}`)
  lines.push(
    '',
    'A source that cannot be reached is not a source that has published nothing.',
    'If one of these stays unreachable, the check has quietly stopped working and',
    'the entry in `cron-jobs/sources.ts` needs a new address.',
    '',
  )
}

if (accept) {
  writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n')
  console.log('Recorded what is there now. Commit cron-jobs/state.json.')
  process.exit(0)
}

if (lines.length === 0) {
  console.log('Every published table is current, and no source has moved since it was last accepted.')
  process.exit(0)
}

console.log(lines.join('\n'))
console.log(
  [
    '---',
    '',
    'Nothing here has read a figure. Go to the source, check the numbers by hand,',
    'add the new year beside the old one and move its year constant — adding a year',
    'is additive, so nothing already stored changes. Then run:',
    '',
    '    npm run watch:figures -- --accept',
    '',
    'to record what is there now, and commit `cron-jobs/state.json`.',
  ].join('\n'),
)

// Non-zero so a scheduled run is visibly a job that wants attention rather
// than one that merely printed something.
process.exit(actionable.length > 0 || overdue.length > 0 ? 1 : 0)
