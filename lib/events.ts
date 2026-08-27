/**
 * The only events this app records.
 *
 * A fixed list rather than free text, because the action that writes them is
 * open to anybody: without it, a stranger could fill the table with whatever
 * they liked. An unrecognised name is dropped silently — a visitor is not owed
 * an error message about our instrumentation.
 *
 * Kept out of the server-action file on purpose. A `'use server'` module may
 * only export async functions, so a shared constant has to live beside it
 * rather than in it.
 */
export const EVENT_NAMES = [
  /** A page was opened. The path says which. */
  'page_view',
  /** The first figure was typed into the planner. */
  'plan_started',
  /** Enough was entered for a projection to appear. */
  'plan_completed',
  /** One of the result tabs was opened. */
  'tab_viewed',
  /** The savings goal page produced an answer. */
  'goal_answered',
  /** Someone carried a goal across into the planner. */
  'goal_handoff',
  /** A plan was saved, which needs an account. */
  'plan_saved',
  /**
   * The first holding or debt was entered on Assets & liabilities.
   *
   * The tab being opened was already counted, and told us only that somebody
   * clicked it. This is the other half: whether anyone, having looked, went on
   * to put anything in. A tab people open and leave is a different problem
   * from one they never find.
   */
  'register_started',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

export const isEventName = (v: string): v is EventName =>
  (EVENT_NAMES as readonly string[]).includes(v)
