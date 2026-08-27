/**
 * The result tabs, named once.
 *
 * Both the planner that renders them and the admin page that reports which
 * ones get opened read this list, so a tab cannot be labelled one thing on
 * screen and another in the numbers. That is not hypothetical: copy elsewhere
 * told readers to check "the Table tab" for a while after it had been renamed
 * to Yearly detail, and an instruction naming a tab that does not exist is
 * worse than no instruction.
 *
 * The hint is what the tab answers, not what it contains. Four abstract nouns
 * in a row read as decoration and get ignored — people opened the projection
 * and never touched three quarters of it — so each one says what question it
 * settles instead.
 *
 * The value is also what gets recorded, as a fragment on the path — a tab is a
 * place within a page, which is what a fragment is for, and it keeps the event
 * vocabulary a fixed list of names rather than one name per tab.
 */
export const PLANNER_TABS = [
  {
    value: 'balance',
    label: 'Balance',
    hint: 'what you will have',
  },
  {
    value: 'income',
    label: 'Income',
    hint: 'where it comes from',
  },
  {
    value: 'tax',
    label: 'Tax',
    hint: 'what it costs you',
  },
  {
    value: 'table',
    label: 'Yearly detail',
    hint: 'every year, in full',
  },
] as const

export type PlannerTab = (typeof PLANNER_TABS)[number]['value']

/**
 * The two top-level tabs, which are a different question from the four above.
 *
 * Those four are views of one projection; these two are the halves of the
 * household. Both are worth knowing about and they are counted apart, because
 * "did anybody open the register" and "did anybody read the tax view" are not
 * the same finding.
 */
export const WORKSPACE_TABS = [
  { value: 'plan', label: 'Retirement plan' },
  { value: 'assets', label: 'Assets & liabilities' },
] as const

export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]['value']

/**
 * The path a top-level tab is recorded against.
 *
 * Prefixed, and deliberately: the register's tab was called `balance` for a
 * while, which is also the name of the projection's first tab — the two would
 * have been recorded against the same fragment and counted as one thing.
 */
export const sectionPath = (value: string) => `/planner#section-${value}`

/** The path a tab view is recorded against. */
export const tabPath = (value: string) => `/planner#${value}`

/** The label for a recorded path, for the admin to show. Unknown stays raw. */
export function tabLabel(path: string): string {
  const fragment = path.split('#')[1] ?? ''
  if (fragment.startsWith('section-')) {
    const value = fragment.slice('section-'.length)
    return WORKSPACE_TABS.find((t) => t.value === value)?.label ?? path
  }
  return PLANNER_TABS.find((t) => t.value === fragment)?.label ?? path
}

/** Whether a recorded path is one of the top-level tabs. */
export const isSectionPath = (path: string) =>
  (path.split('#')[1] ?? '').startsWith('section-')
