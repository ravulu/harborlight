import { describe, expect, it } from 'vitest'

import { EMPTY_REGISTER } from '@/lib/balance-sheet'
import { DEFAULT_INPUTS } from '@/lib/retirement'
import {
  HOUSEHOLD_KEY,
  PLAN_PREFIX,
  createLocalStore,
  type StorageLike,
} from '@/lib/store/local'
import { StaleWriteError, type PlanDraft } from '@/lib/store/types'

/**
 * A `Storage` that is a plain object.
 *
 * `lib/**` is tested in the node environment, which has no `window`. Injecting
 * storage rather than reaching for it is what lets the isolation guarantee —
 * the reason for the whole layout — be asserted at all, and asserted against
 * the keys themselves rather than through the store that wrote them.
 */
class MemoryStorage implements StorageLike {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  /** Test-only: the bytes, so a test can prove they did not move. */
  raw(key: string) {
    return this.map.get(key)
  }
  keys() {
    return [...this.map.keys()]
  }
}

/** A clock that only goes forwards, so `updatedAt` comparisons mean something. */
function ticking(start = 0) {
  let t = start
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, t++)).toISOString()
}

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  name: 'Retire at 58',
  personName: 'Ravi',
  inputs: { ...DEFAULT_INPUTS, retirementAge: 58 },
  register: EMPTY_REGISTER,
  ...over,
})

describe('the local store', () => {
  it('round-trips a plan', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())

    const id = await store.save(draft())
    const back = await store.get(id)

    expect(back?.name).toBe('Retire at 58')
    expect(back?.personName).toBe('Ravi')
    expect(back?.inputs.retirementAge).toBe(58)
    expect(back?.id).toBe(id)
  })

  /**
   * The reason the layout is one key per plan, asserted against the keys
   * rather than through the store.
   *
   * The design this replaced kept every plan in one key, and a store like that
   * passes "round-trips a plan" perfectly while deleting the plan in the next
   * key: a tab open for an hour writes its own idea of the whole list. Nothing
   * that reads back only what it just wrote can catch that, which is why this
   * test reaches for the bytes of a plan it never touched.
   */
  it('leaves every other plan byte-identical when one is saved', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())

    const first = await store.save(draft({ name: 'Keep the rental' }))
    const second = await store.save(draft({ name: 'Sell the rental' }))
    const untouched = storage.raw(`${PLAN_PREFIX}${first}`)

    await store.update(second, draft({ name: 'Sell the rental, later' }))

    expect(storage.raw(`${PLAN_PREFIX}${first}`)).toBe(untouched)
    expect((await store.list()).map((p) => p.name).sort()).toEqual([
      'Keep the rental',
      'Sell the rental, later',
    ])
  })

  /**
   * The same guarantee from the other direction: a store that has never read
   * the other plans still must not lose them.
   *
   * This is the "second tab" case exactly — a store instance that knows
   * nothing about what another one wrote, saving into the same storage.
   */
  it('does not lose plans written by another tab', async () => {
    const storage = new MemoryStorage()
    const tabA = createLocalStore(storage, ticking())
    const tabB = createLocalStore(storage, ticking(100))

    const one = await tabA.save(draft({ name: 'One' }))
    // Tab B opened here and has never seen anything.
    const two = await tabB.save(draft({ name: 'Two' }))
    // Tab A, still holding its own idea of the world, saves again.
    await tabA.update(one, draft({ name: 'One, edited' }))

    const names = (await tabA.list()).map((p) => p.name).sort()
    expect(names).toEqual(['One, edited', 'Two'])
    expect(two).not.toBe(one)
  })

  it('takes the next id from storage, not from memory', async () => {
    const storage = new MemoryStorage()
    const tabA = createLocalStore(storage, ticking())
    const tabB = createLocalStore(storage, ticking(100))

    const first = await tabA.save(draft())
    const second = await tabB.save(draft())
    // Tab A has no idea tab B exists, and must still not reuse the id.
    const third = await tabA.save(draft())

    expect(new Set([first, second, third]).size).toBe(3)
    expect(third).toBeGreaterThan(second)
  })

  /**
   * A payload written by an older build, which is every payload eventually.
   *
   * There is no migration tool for somebody else's browser, so the reader has
   * to start from the defaults and take only what it recognises — the rule
   * `readExpenses` already follows. A field added later has to arrive at its
   * default rather than as `undefined` leaking into the arithmetic.
   */
  it('loads a plan missing fields this build knows about', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())

    storage.setItem(
      `${PLAN_PREFIX}7`,
      JSON.stringify({
        id: 7,
        name: 'From an older build',
        updatedAt: '2026-01-01T00:00:00.000Z',
        // Two fields, where a plan has fifty.
        inputs: { currentAge: 55, retirementAge: 58 },
      }),
    )

    const back = await store.get(7)
    expect(back?.inputs.currentAge).toBe(55)
    expect(back?.inputs.retirementAge).toBe(58)
    // Defaulted, not undefined — the difference between a projection and a NaN.
    expect(back?.inputs.inflationRate).toBe(DEFAULT_INPUTS.inflationRate)
    expect(back?.inputs.filingStatus).toBe('single')
    expect(back?.register).toEqual(EMPTY_REGISTER)
    expect(back?.personName).toBe('')
  })

  it('refuses a value of the wrong type rather than passing it to the engine', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())

    storage.setItem(
      `${PLAN_PREFIX}3`,
      JSON.stringify({
        name: 'Hand-edited',
        inputs: {
          currentAge: 'fifty-five',
          inflationRate: null,
          filingStatus: 'complicated',
          healthCoverBefore65: 'something else',
        },
      }),
    )

    const back = await store.get(3)
    expect(back?.inputs.currentAge).toBe(DEFAULT_INPUTS.currentAge)
    expect(back?.inputs.inflationRate).toBe(DEFAULT_INPUTS.inflationRate)
    expect(back?.inputs.filingStatus).toBe('single')
    expect(back?.inputs.healthCoverBefore65).toBe('marketplace')
  })

  /**
   * A plan this build cannot parse is skipped and kept.
   *
   * Deleting it would be this release destroying somebody's plan on behalf of
   * the next one, which may well be able to read it. There is no backup on a
   * machine we do not control.
   */
  it('skips an unreadable plan without deleting it', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())
    await store.save(draft({ name: 'Fine' }))
    storage.setItem(`${PLAN_PREFIX}99`, '{ not json at all')

    expect((await store.list()).map((p) => p.name)).toEqual(['Fine'])
    expect(storage.raw(`${PLAN_PREFIX}99`)).toBe('{ not json at all')
  })

  it('ignores keys it does not own', async () => {
    const storage = new MemoryStorage()
    // Both written by earlier versions of this app, on the same origin.
    storage.setItem('fairwater_holdings', '{"holdings":[]}')
    storage.setItem('fairwater_register_pending', '{}')
    const store = createLocalStore(storage, ticking())

    await store.save(draft())
    expect(await store.list()).toHaveLength(1)
    expect(storage.raw('fairwater_holdings')).toBe('{"holdings":[]}')
  })

  it('lists newest first, as the cloud does', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())

    await store.save(draft({ name: 'First' }))
    await store.save(draft({ name: 'Second' }))
    await store.save(draft({ name: 'Third' }))

    expect((await store.list()).map((p) => p.name)).toEqual([
      'Third',
      'Second',
      'First',
    ])
  })

  it('removes only what it was asked to remove', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())
    const keep = await store.save(draft({ name: 'Keep' }))
    const drop = await store.save(draft({ name: 'Drop' }))

    await store.remove(drop)

    expect((await store.list()).map((p) => p.name)).toEqual(['Keep'])
    expect(await store.get(keep)).not.toBeNull()
    expect(await store.get(drop)).toBeNull()
  })
})

/**
 * Saving over a copy that moved underneath you.
 *
 * Last write wins within one plan is ordinary and stays. What this refuses is
 * the *silent* version of it, and the reason is this project's own history:
 * the register wipe took every holding on a plan while "the projection above
 * it was correct throughout, so there was nothing on screen to suggest what
 * had happened". Here there is no database to restore from.
 */
describe('the staleness check', () => {
  it('refuses a write over a newer copy when told what was expected', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())

    const id = await store.save(draft({ name: 'Opened here' }))
    const opened = (await store.get(id))!.updatedAt

    // Another tab saves in the meantime.
    await store.update(id, draft({ name: 'Saved elsewhere' }))

    await expect(
      store.update(id, draft({ name: 'Stale' }), opened),
    ).rejects.toBeInstanceOf(StaleWriteError)
    // And the newer copy is still there, untouched.
    expect((await store.get(id))?.name).toBe('Saved elsewhere')
  })

  it('allows the write when the copy has not moved', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())

    const id = await store.save(draft())
    const opened = (await store.get(id))!.updatedAt

    await store.update(id, draft({ name: 'Edited' }), opened)
    expect((await store.get(id))?.name).toBe('Edited')
  })

  it('is opt-in: without an expectation, the last write wins', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())

    const id = await store.save(draft({ name: 'First' }))
    await store.update(id, draft({ name: 'Second' }))
    await store.update(id, draft({ name: 'Third' }))

    expect((await store.get(id))?.name).toBe('Third')
  })
})

describe('the household', () => {
  it('round-trips, and clamps what it is given', async () => {
    const storage = new MemoryStorage()
    const store = createLocalStore(storage, ticking())

    await store.saveHousehold({
      name: 'Ravi',
      // The figure `saveHousehold` clamps on the way into Postgres for the
      // same reason: it sails through every later calculation without once
      // looking wrong enough to stop.
      currentAge: 3053,
      filingStatus: 'married',
      taxState: 'CA',
    })

    const back = await store.getHousehold()
    expect(back.currentAge).toBe(120)
    expect(back.filingStatus).toBe('married')
    expect(back.taxState).toBe('CA')
  })

  it('is empty rather than broken when nothing has been stored', async () => {
    const store = createLocalStore(new MemoryStorage(), ticking())
    expect((await store.getHousehold()).currentAge).toBe(0)
  })

  it('survives a household key somebody corrupted', async () => {
    const storage = new MemoryStorage()
    storage.setItem(HOUSEHOLD_KEY, 'not json')
    const store = createLocalStore(storage, ticking())
    expect((await store.getHousehold()).name).toBe('')
  })
})
