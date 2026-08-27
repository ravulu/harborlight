import { describe, expect, it, beforeEach, vi } from 'vitest'
import { stashPending, takeStashedPending } from '@/lib/holdings-store'

/**
 * The register has to survive a redirect that the plan survives in a cookie.
 *
 * This is the flow that failed: signed out, figures typed under Assets &
 * liabilities, "Sign in to save" pressed, signed in — and the register arrived
 * empty because nothing carried it. The plan is a new page after a redirect,
 * and component state does not cross one.
 */
describe('carrying a register across a sign-in', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    })
  })

  it('gives back exactly what was put in', () => {
    // Who they are travels with what they own: an account created from this
    // page should arrive knowing both, or the register is priced against a
    // household it has never been told about.
    const pending = {
      household: { name: 'Ravi Metta', currentAge: 55, filingStatus: 'married', taxState: 'CA' },
      register: {
        holdings: [{ id: 'a', kind: 'home', name: 'Home', value: 800_000 }],
        liabilities: [{ id: 'b', kind: 'card', name: 'Visa', balance: 10_000 }],
      },
    }
    stashPending(pending)
    expect(takeStashedPending()).toEqual(pending)
  })

  it('gives it back once and once only', () => {
    // Read-once, so a later reload cannot adopt the same figures a second
    // time and overwrite whatever the account already had.
    stashPending({ household: { name: 'X' }, register: { holdings: [{ id: 'a' }], liabilities: [] } })
    expect(takeStashedPending()).not.toBeNull()
    expect(takeStashedPending()).toBeNull()
  })

  it('keeps the two halves together, so neither arrives without the other', () => {
    // The register is priced against the household — a gain stacks on the
    // household's income, at the household's filing status, in its state.
    // Carrying one without the other means figures worked out against
    // somebody who has not been described yet.
    stashPending({
      household: { name: 'Ravi', currentAge: 55, filingStatus: 'married', taxState: 'CA' },
      register: { holdings: [{ id: 'a' }], liabilities: [] },
    })
    const back = takeStashedPending() as Record<string, unknown>
    expect(back.household).toBeDefined()
    expect(back.register).toBeDefined()
  })

  it('has nothing to give when nothing was stashed', () => {
    expect(takeStashedPending()).toBeNull()
  })

  it('survives being handed something it cannot parse', () => {
    window.sessionStorage.setItem('harborlight_register_pending', '{not json')
    expect(takeStashedPending()).toBeNull()
  })
})

/**
 * The same figures have to survive whichever door somebody comes through.
 *
 * "Sign in to save" sends them to `/sign-in?next=…`, and the switch link on
 * that page carries `next` on to `/sign-up`. Both pages are the same form, so
 * both land back where the save is waiting — but the return path is a URL
 * built twice and read twice, and an encoding lost in the middle would drop
 * somebody on the planner with no `save=1` and nothing to show for it.
 */
describe('the return path survives the sign-in and the sign-up door', () => {
  const RETURN_TO = '/planner?save=1'

  /** What the auth form does with `next`, including its open-redirect guard. */
  const readNext = (url: string) => {
    const raw = new URL(url, 'https://example.test').searchParams.get('next')
    return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
  }

  it('reaches sign-in intact', () => {
    const url = `/sign-in?next=${encodeURIComponent(RETURN_TO)}`
    expect(readNext(url)).toBe(RETURN_TO)
  })

  it('reaches sign-up intact, through the switch link', () => {
    // The form builds the other door's link from the `next` it just read.
    const atSignIn = readNext(`/sign-in?next=${encodeURIComponent(RETURN_TO)}`)
    const switchLink = `/sign-up?next=${encodeURIComponent(atSignIn)}`
    expect(readNext(switchLink)).toBe(RETURN_TO)
  })

  it('still carries the flag the arrival save waits for', () => {
    const landed = new URL(readNext(`/sign-up?next=${encodeURIComponent(RETURN_TO)}`), 'https://example.test')
    expect(landed.pathname).toBe('/planner')
    expect(landed.searchParams.get('save')).toBe('1')
  })

  it('refuses a return path pointing off the site', () => {
    // Otherwise "sign in to save" is an open redirect wearing a useful hat.
    expect(readNext('/sign-up?next=https://elsewhere.test/steal')).toBe('/')
    expect(readNext('/sign-up?next=//elsewhere.test')).toBe('/')
  })
})

/**
 * And it should come back to the tab it left from.
 *
 * Somebody who pressed Save from their balance sheet did not ask to be
 * returned to the projection. The tab rides in the URL so the right one is
 * server-rendered, rather than flashing the wrong one and correcting itself.
 */
describe('coming back to the tab you left', () => {
  const readNext = (url: string) => {
    const raw = new URL(url, 'https://example.test').searchParams.get('next')
    return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
  }
  /** What the planner builds when Save is pressed. */
  const back = (tab: string) =>
    tab && tab !== 'plan' ? `/planner?save=1&tab=${tab}` : '/planner?save=1'

  it('carries the balance sheet back through sign-in', () => {
    const landed = new URL(
      readNext(`/sign-in?next=${encodeURIComponent(back('assets'))}`),
      'https://example.test',
    )
    expect(landed.searchParams.get('tab')).toBe('assets')
    expect(landed.searchParams.get('save')).toBe('1')
  })

  it('carries it through sign-up too', () => {
    const atSignIn = readNext(`/sign-in?next=${encodeURIComponent(back('assets'))}`)
    const landed = new URL(
      readNext(`/sign-up?next=${encodeURIComponent(atSignIn)}`),
      'https://example.test',
    )
    expect(landed.searchParams.get('tab')).toBe('assets')
  })

  it('adds nothing to the URL when leaving from the plan itself', () => {
    expect(back('plan')).toBe('/planner?save=1')
  })
})
