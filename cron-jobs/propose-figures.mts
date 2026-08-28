/**
 * Read a published document and offer the figures for somebody to check.
 *
 * Layer 2 of `docs/tax-data-updates.md`. It prints a candidate patch, a diff
 * against what this build holds, and the lines it read the numbers from. It
 * **does not write to `lib/`** and it opens no pull request: the design's
 * third layer is a person, and that is not a step to be optimised away.
 *
 *   npm run propose:figures
 *
 * One source today — the HHS poverty guidelines, which is the only one served
 * as text rather than a PDF. The others are listed at the end so the gap is
 * visible rather than implied.
 */
import { ACA_YEAR, FPL_BASE, FPL_PER_EXTRA_PERSON } from '../lib/aca'
import { extractPovertyGuidelines } from './extract/poverty-guidelines'
import { SOURCES } from './sources'

const UA = 'fairwater-figure-watcher (+https://github.com/ravulu/harborlight)'

async function get(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(25_000),
    })
    return res.ok ? await res.text() : null
  } catch {
    return null
  }
}

/** The newest Federal Register notice whose *title* says what it is. */
async function newestNotice(term: string, agencies: string[], titlePattern: string) {
  const params = new URLSearchParams({
    'conditions[term]': term,
    order: 'newest',
    per_page: '40',
  })
  for (const f of ['document_number', 'title', 'publication_date', 'raw_text_url']) {
    params.append('fields[]', f)
  }
  params.append('conditions[type][]', 'NOTICE')
  for (const a of agencies) params.append('conditions[agencies][]', a)

  const body = await get(`https://www.federalregister.gov/api/v1/documents.json?${params}`)
  if (!body) return null
  const wanted = new RegExp(titlePattern, 'i')
  const results: {
    document_number: string
    title: string
    publication_date: string
    raw_text_url: string
  }[] = JSON.parse(body).results ?? []
  return results.find((r) => wanted.test(r.title ?? '')) ?? null
}

const out: string[] = []
const say = (...l: string[]) => out.push(...l)
let proposals = 0

// ---- the ACA poverty guidelines -------------------------------------------

{
  const source = SOURCES.aca
  if (source.kind !== 'federal-register') throw new Error('aca source changed shape')

  const notice = await newestNotice(source.term, source.agencies, source.titlePattern)
  if (!notice) {
    say('## ACA poverty guidelines', '', 'No matching notice found. Nothing to propose.', '')
  } else {
    const text = await get(notice.raw_text_url)
    if (!text) {
      say('## ACA poverty guidelines', '', `Could not read ${notice.raw_text_url}.`, '')
    } else {
      const got = extractPovertyGuidelines(text, notice.raw_text_url)
      say('## ACA poverty guidelines', '')
      if (!got.ok) {
        // A refusal is a result, and it is reported as loudly as a proposal.
        // The alternative — falling back to a looser parse — is how a number
        // nobody understood reaches a reviewer with a source URL beside it.
        say(
          `**Refused.** ${got.reason}`,
          '',
          `Document: ${notice.title} (${notice.publication_date})`,
          `          ${notice.raw_text_url}`,
          '',
          'The parser and the document have disagreed. Either the layout changed —',
          'in which case `cron-jobs/extract/poverty-guidelines.ts` needs updating and',
          'a fixture adding — or this is not the document it was looking for.',
          '',
        )
      } else if (got.year <= ACA_YEAR) {
        say(
          `Nothing newer. The latest notice is for ${got.evidence.documentYear}, which prices`,
          `${got.year} cover, and this build already holds ${ACA_YEAR}.`,
          '',
        )
      } else {
        proposals++
        const changed = (was: number, now: number) =>
          `${was.toLocaleString()} → ${now.toLocaleString()}  (${
            ((now - was) / was) * 100 >= 0 ? '+' : ''
          }${(((now - was) / was) * 100).toFixed(1)}%)`

        // Flagged, never rejected: indexation is not always small, and a
        // reviewer should be pointed at the largest movement rather than have
        // it decided for them.
        const jump = (was: number, now: number) => Math.abs((now - was) / was) > 0.1

        say(
          `**Candidate for ${got.year}**, from ${notice.title} (${notice.publication_date}).`,
          '',
          '```',
          `fplBase              ${changed(FPL_BASE, got.values.fplBase)}`,
          `fplPerExtraPerson    ${changed(FPL_PER_EXTRA_PERSON, got.values.fplPerExtraPerson)}`,
          '```',
          '',
          ...(jump(FPL_BASE, got.values.fplBase) ||
          jump(FPL_PER_EXTRA_PERSON, got.values.fplPerExtraPerson)
            ? ['> One of these moved more than 10%. Not necessarily wrong — check it first.', '']
            : []),
          'Read from:',
          '```',
          ...got.evidence.quoted,
          '```',
          '',
          'Patch `lib/aca.ts`:',
          '```ts',
          `export const ACA_YEAR = ${got.year}`,
          `export const FPL_BASE = ${got.values.fplBase.toLocaleString('en-US').replace(/,/g, '_')}`,
          `export const FPL_PER_EXTRA_PERSON = ${got.values.fplPerExtraPerson.toLocaleString('en-US').replace(/,/g, '_')}`,
          '```',
          '',
          `Source: ${notice.raw_text_url}`,
          '',
          ...got.notes.map((n) => `_${n}_`),
          '',
          '**The applicable percentages and the benchmark premium are not in this',
          'document and are not proposed here.** They come from the IRS Revenue',
          'Procedure and from CMS respectively, and `ACA_YEAR` should not move until',
          'all three have been checked.',
          '',
        )
      }
    }
  }
}

// ---- what is not automated yet --------------------------------------------

say(
  '## Still by hand',
  '',
  'No extractor yet — these are PDFs or third-party pages, and `npm run watch:figures`',
  'only says that something has changed:',
  '',
  '- Federal brackets, standard deduction, capital-gains bands (IRS Rev. Proc., PDF)',
  '- Medicare Part B premium and IRMAA tiers (CMS)',
  '- ACA applicable percentages (IRS Rev. Proc., PDF) and benchmark premium (CMS/KFF)',
  '- State brackets (Tax Foundation)',
  '- HSA limits (IRS Rev. Proc., PDF)',
  '',
)

console.log(out.join('\n'))
console.log(
  [
    '---',
    '',
    'Nothing above has been written anywhere. Check the figures against the',
    'document, add the year beside the old one, move the year constant, then:',
    '',
    '    npm test',
    '    npm run watch:figures -- --accept',
  ].join('\n'),
)

// Non-zero when there is something to act on, so a scheduled run is visibly a
// job that wants attention.
process.exit(proposals > 0 ? 1 : 0)
