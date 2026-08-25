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

/** The path a tab view is recorded against. */
export const tabPath = (value: string) => `/planner#${value}`

/** The label for a recorded path, for the admin to show. Unknown stays raw. */
export function tabLabel(path: string): string {
  const value = path.split('#')[1] ?? ''
  return PLANNER_TABS.find((t) => t.value === value)?.label ?? path
}
