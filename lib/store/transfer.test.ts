import { describe, expect, it } from 'vitest'

import { EMPTY_REGISTER } from '@/lib/balance-sheet'
import { DEFAULT_INPUTS } from '@/lib/retirement'
import {
  HOUSEHOLD_KEY,
  PLAN_PREFIX,
  createLocalStore,
  forgetLocal,
  storageWorks,
  type StorageLike,
} from '@/lib/store/local'
import {
  EXPORT_VERSION,
  UnreadableFileError,
  exportFilename,
  exportOnePlan,
  exportPlans,
  importPlans,
  planFilename,
  slugForFilename,
} from '@/lib/store/transfer'
import type { PlanDraft } from '@/lib/store/types'

class MemoryStorage implements StorageLike {
  constructor(private failWrites = false) {}
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    // What Safari does in a private window: the object is there and the write
    // is refused. Presence proves nothing.
    if (this.failWrites) throw new DOMException('QuotaExceededError')
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
  keys() {
    return [...this.map.keys()]
  }
}

const ticking = (start = 0) => {
  let t = start
  return () => new Date(Date.UTC(2026, 7, 28, 0, 0, t++)).toISOString()
}

const draft = (name: string, over: Partial<PlanDraft> = {}): PlanDraft => ({
  name,
  personName: 'Ravi',
  inputs: { ...DEFAULT_INPUTS, retirementAge: 58 },
  register: EMPTY_REGISTER,
  ...over,
})

/**
 * Export and import are the only way figures leave a machine or arrive on one.
 *
 * Everything else in local mode assumes the browser keeps its promises. These
 * are what a reader has when it does not — a new laptop, cleared site data, a
 * support request nobody at this end can answer by looking it up.
 */
describe('export and import', () => {
  it('round-trips every plan and the household', async () => {
    const from = createLocalStore(new MemoryStorage(), ticking())
    await from.saveHousehold({
      name: 'Ravi',
      currentAge: 55,
      filingStatus: 'married',
      taxState: 'CA',
    })
    await from.save(draft('Keep the rental'))
    await from.save(draft('Sell the rental'))

    const file = await exportPlans(from, ticking(500))
    expect(file.v).toBe(EXPORT_VERSION)
    expect(file.plans).toHaveLength(2)
    expect(file.household.currentAge).toBe(55)

    // A different machine entirely.
    const to = createLocalStore(new MemoryStorage(), ticking(900))
    const report = await importPlans(to, JSON.parse(JSON.stringify(file)))

    expect(report).toEqual({ added: 2, skipped: 0, household: 'adopted' })
    expect((await to.list()).map((p) => p.name).sort()).toEqual([
      'Keep the rental',
      'Sell the rental',
    ])
    expect((await to.getHousehold()).taxState).toBe('CA')
    const back = await to.get((await to.list())[0].id)
    expect(back?.inputs.retirementAge).toBe(58)
    expect(back?.personName).toBe('Ravi')
  })

  /**
   * The rule that matters most, because getting it wrong is unrecoverable.
   *
   * There is no undo and no backup on a device we do not control. Somebody
   * who wants a clean slate forgets everything first, deliberately, with a
   * control that says so.
   */
  it('adds rather than replacing, and never reuses an id', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())
    const mine = await store.save(draft('Mine, already here'))

    const file = {
      v: 1,
      savedAt: '2026-08-28T00:00:00.000Z',
      household: { name: '', currentAge: 0, filingStatus: 'single', taxState: '' },
      plans: [
        // Deliberately claiming the id that is already taken.
        { id: mine, name: 'Theirs', personName: '', inputs: {}, register: {} },
      ],
    }
    const report = await importPlans(store, file)

    expect(report.added).toBe(1)
    expect((await store.list()).map((p) => p.name).sort()).toEqual([
      'Mine, already here',
      'Theirs',
    ])
    expect((await store.get(mine))?.name).toBe('Mine, already here')
  })

  it('keeps a household that already says something', async () => {
    const store = createLocalStore(new MemoryStorage(), ticking())
    await store.saveHousehold({
      name: 'Mine',
      currentAge: 61,
      filingStatus: 'single',
      taxState: 'NY',
    })
    const report = await importPlans(store, {
      v: 1,
      plans: [],
      household: { name: 'Theirs', currentAge: 30, filingStatus: 'married', taxState: 'TX' },
    })
    expect(report.household).toBe('kept')
    expect((await store.getHousehold()).currentAge).toBe(61)
  })

  /**
   * A file from a later build is refused, and this is the one place the
   * take-what-you-recognise rule is deliberately not applied.
   *
   * Reading it forgivingly would drop whatever this build does not know about
   * and report success — producing a different plan under the same name,
   * silently. Refusing says something true.
   */
  it('refuses a file written by a newer version', async () => {
    const store = createLocalStore(new MemoryStorage(), ticking())
    await expect(
      importPlans(store, { v: EXPORT_VERSION + 1, plans: [draft('Future')] }),
    ).rejects.toBeInstanceOf(UnreadableFileError)
    expect(await store.list()).toHaveLength(0)
  })

  it('refuses something that is not an export at all', async () => {
    const store = createLocalStore(new MemoryStorage(), ticking())
    for (const junk of [null, 42, 'hello', {}, { plans: 'no' }]) {
      await expect(importPlans(store, junk)).rejects.toBeInstanceOf(UnreadableFileError)
    }
  })

  it('skips a broken plan and keeps the rest, reporting both', async () => {
    const store = createLocalStore(new MemoryStorage(), ticking())
    const report = await importPlans(store, {
      v: 1,
      plans: [draft('Good one'), null, 'not a plan', draft('Another good one')],
    })
    expect(report).toEqual({ added: 2, skipped: 2, household: 'kept' })
    expect(await store.list()).toHaveLength(2)
  })

  it('exports one plan on its own, in the same envelope', async () => {
    const store = createLocalStore(new MemoryStorage(), ticking())
    await store.save(draft('One'))
    const two = await store.save(draft('Two'))

    const file = await exportOnePlan(store, two, () => '2026-08-28T14:02:11.000Z')
    expect(file?.plans).toHaveLength(1)
    expect(file?.plans[0].name).toBe('Two')
    // Same shape, so the same reader takes it back.
    const back = createLocalStore(new MemoryStorage(), ticking(900))
    expect((await importPlans(back, file)).added).toBe(1)

    expect(await exportOnePlan(store, 9999, () => 'x')).toBeNull()
  })
})

/**
 * Filenames, which is the whole of what a reader sees of this.
 *
 * A backup they cannot tell apart from the last one is not much of a backup:
 * `fairwater-plans (1).json` says nothing about which is which, and the moment
 * somebody has two of them they have to open both to find out.
 */
describe('what the file is called', () => {
  it('carries the date and the time, so two downloads never collide', () => {
    expect(exportFilename('2026-08-28T14:02:11.000Z')).toBe(
      'fairwater-plans-2026-08-28-140211.json',
    )
    expect(exportFilename('2026-08-28T14:02:11.000Z')).not.toBe(
      exportFilename('2026-08-28T14:03:44.000Z'),
    )
  })

  it("uses the plan's own name for a single plan", () => {
    // Case is kept, because it is the name they typed and it is what will
    // tell them which file is which in a folder.
    expect(planFilename('Retire at 58', '2026-08-28T14:02:11.000Z')).toBe(
      'Retire-at-58-2026-08-28-140211.json',
    )
  })

  it('keeps a name recognisable rather than sanitising it away', () => {
    expect(slugForFilename('Retire at 58')).toBe('Retire-at-58')
    expect(slugForFilename('Sell the rental — plan B')).toBe('Sell-the-rental-plan-B')
    expect(slugForFilename('  /../etc/passwd  ')).toBe('etc-passwd')
    expect(slugForFilename('Ravi & Priya: 2026 (draft)')).toBe('Ravi-Priya-2026-draft')
    // Accents and non-Latin scripts are letters, not punctuation.
    expect(slugForFilename('Régime früh 老後')).toBe('Régime-früh-老後')
  })

  it('always produces something openable', () => {
    expect(slugForFilename('')).toBe('plan')
    expect(slugForFilename('///')).toBe('plan')
    expect(slugForFilename('x'.repeat(200)).length).toBeLessThanOrEqual(60)
    // No separator, no traversal, nothing a filesystem argues with.
    for (const name of ['../../etc', 'a/b\\c', 'con:', '.hidden', 'a\u0000b']) {
      expect(slugForFilename(name)).not.toMatch(/[/\\:\u0000]/)
    }
  })
})

/**
 * Taking figures back off the machine.
 *
 * The other half of keeping them on it. `lib/holdings-store.ts` removed
 * browser storage in the first place because "a browser that remembers
 * somebody's house, their debts and their income shows all of it to whoever
 * opens it next". Storing deliberately is only defensible if undoing it is one
 * step.
 */
describe('forgetting everything on this device', () => {
  it('removes every key this app owns, and nothing else', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())
    await store.saveHousehold({
      name: 'Ravi',
      currentAge: 55,
      filingStatus: 'single',
      taxState: '',
    })
    await store.save(draft('One'))
    await store.save(draft('Two'))
    storage.setItem('something-else-entirely', 'keep me')
    storage.setItem('fairwater_holdings', 'from an older build')

    const removed = forgetLocal(storage)

    expect(removed).toBe(3)
    expect(await store.list()).toHaveLength(0)
    expect((await store.getHousehold()).currentAge).toBe(0)
    expect(storage.getItem('something-else-entirely')).toBe('keep me')
    // Not this function's job: `forgetBrowserCopies` clears the retired keys,
    // and it runs on every mount already.
    expect(storage.getItem('fairwater_holdings')).toBe('from an older build')
  })

  it('leaves no key behind when there are several plans', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())
    for (const n of ['a', 'b', 'c', 'd']) await store.save(draft(n))
    forgetLocal(storage)
    expect(storage.keys().filter((k) => k.startsWith('fairwater.v1'))).toEqual([])
  })
})

describe('a browser that refuses to store anything', () => {
  it('is detected by trying, not by looking', () => {
    expect(storageWorks(new MemoryStorage())).toBe(true)
    // The object is present and the write throws — which is exactly what
    // Safari does in a private window.
    expect(storageWorks(new MemoryStorage(true))).toBe(false)
  })

  it('throws on save rather than reporting a write that did not happen', async () => {
    const store = createLocalStore(new MemoryStorage(true), ticking())
    await expect(store.save(draft('Nowhere to put this'))).rejects.toThrow(
      /will not let the page store anything/,
    )
  })
})

describe('the keys themselves', () => {
  it('are the ones the design names', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())
    await store.saveHousehold({
      name: '',
      currentAge: 40,
      filingStatus: 'single',
      taxState: '',
    })
    const id = await store.save(draft('One'))
    expect(storage.keys().sort()).toEqual([HOUSEHOLD_KEY, `${PLAN_PREFIX}${id}`])
  })
})
