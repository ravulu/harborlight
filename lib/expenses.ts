/**
 * The categories a monthly spending figure gets built from.
 *
 * Most are a group of lines that add up rather than one box, because "housing"
 * asked for a number nobody holds in their head — a mortgage, a tax bill and
 * an insurance premium arrive separately and are remembered separately. The
 * groups that are genuinely one habit stay a single box.
 *
 * They start at nothing and stay there until someone types: a suggested figure
 * is a number the user did not choose, and it would be carried into the plan by
 * anyone who skipped the line. A zero is at least an answer.
 *
 * Every figure is what actually leaves the account, before any tax on the
 * withdrawal that funds it. That is what the planner's spending field wants,
 * and it adds the tax itself.
 */
export interface ExpenseItem {
  key: string
  label: string
}

export interface ExpenseCategory {
  key: string
  label: string
  hint: string
  /** When present the group takes no figure of its own; its lines add up. */
  items?: ExpenseItem[]
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  {
    key: 'housing',
    label: 'Housing',
    hint: 'Everything the roof costs, insurance on it included',
    items: [
      { key: 'mortgage', label: 'Mortgage or rent' },
      { key: 'propertyTax', label: 'Property tax' },
      { key: 'homeInsurance', label: 'Home or renters insurance' },
      { key: 'homeUpkeep', label: 'Maintenance and repairs' },
      { key: 'hoa', label: 'HOA or condo fees' },
    ],
  },
  {
    key: 'utilities',
    label: 'Utilities',
    hint: 'What it costs to keep the house running',
    items: [
      { key: 'power', label: 'Electricity and gas' },
      { key: 'water', label: 'Water and sewer' },
      { key: 'internet', label: 'Internet and TV' },
      { key: 'phone', label: 'Mobile phones' },
      { key: 'trash', label: 'Trash and recycling' },
    ],
  },
  {
    key: 'food',
    label: 'Food',
    hint: 'Eaten at home and out',
    items: [
      { key: 'groceries', label: 'Groceries' },
      { key: 'dining', label: 'Restaurants and takeout' },
    ],
  },
  {
    key: 'transport',
    label: 'Transport',
    hint: 'Running the car; its insurance sits under Insurance',
    items: [
      { key: 'carPayment', label: 'Car payment or lease' },
      { key: 'fuel', label: 'Fuel and charging' },
      { key: 'carUpkeep', label: 'Servicing and repairs' },
      { key: 'registration', label: 'Registration and license' },
      { key: 'transit', label: 'Transit, taxis and parking' },
    ],
  },
  {
    key: 'health',
    label: 'Health care',
    hint: 'Premiums and what you pay on top of them',
    items: [
      { key: 'partB', label: 'Medicare Part B' },
      { key: 'medigap', label: 'Medigap or Advantage plan' },
      { key: 'partD', label: 'Part D and prescriptions' },
      { key: 'dental', label: 'Dental and vision' },
      { key: 'outOfPocket', label: 'Other out-of-pocket' },
    ],
  },
  {
    key: 'insurance',
    label: 'Insurance',
    hint: 'Cover that is not on the house or in a health plan',
    items: [
      { key: 'autoInsurance', label: 'Auto' },
      { key: 'lifeInsurance', label: 'Life' },
      { key: 'umbrella', label: 'Umbrella or liability' },
      { key: 'longTermCare', label: 'Long-term care' },
      { key: 'disability', label: 'Disability' },
    ],
  },
  {
    key: 'travel',
    label: 'Travel',
    hint: 'Spread a year of trips across twelve months',
    items: [
      { key: 'flights', label: 'Flights and transport' },
      { key: 'lodging', label: 'Hotels and lodging' },
      { key: 'tours', label: 'Cruises and tours' },
      { key: 'visiting', label: 'Visiting family' },
    ],
  },
  {
    key: 'leisure',
    label: 'Leisure',
    hint: 'How the days get filled',
    items: [
      { key: 'hobbies', label: 'Hobbies and clubs' },
      { key: 'subscriptions', label: 'Subscriptions and streaming' },
      { key: 'events', label: 'Events and outings' },
      { key: 'fitness', label: 'Sport and fitness' },
    ],
  },
  {
    key: 'personal',
    label: 'Clothing and personal',
    hint: 'Clothes, haircuts, toiletries',
  },
  {
    key: 'gifts',
    label: 'Gifts and giving',
    hint: 'Family, charity, celebrations',
  },
  {
    key: 'other',
    label: 'Anything else',
    hint: 'Pets, help around the house, the unexpected',
  },
]

/** The fields that actually take a figure: a group's lines, or the group. */
export const leafKeys = (c: ExpenseCategory): string[] =>
  c.items ? c.items.map((i) => i.key) : [c.key]

const ALL_KEYS = EXPENSE_CATEGORIES.flatMap(leafKeys)

export const emptyExpenses = (): Record<string, number> =>
  Object.fromEntries(ALL_KEYS.map((k) => [k, 0]))

export const categoryTotal = (c: ExpenseCategory, values: Record<string, number>) =>
  leafKeys(c).reduce((sum, k) => sum + (values[k] || 0), 0)

export const totalExpenses = (values: Record<string, number>) =>
  ALL_KEYS.reduce((sum, k) => sum + (values[k] || 0), 0)

/** Kept for the tab that opened the dialog, and no longer than that. */
const STORAGE_KEY = 'harborlight_expenses'

/**
 * Reads what was typed earlier in this tab. Anything unrecognised is treated
 * as absent rather than trusted, since a user can edit their own storage.
 */
export function readExpenses(): Record<string, number> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const source = parsed as Record<string, unknown>
    const out = emptyExpenses()
    for (const key of ALL_KEYS) {
      const v = source[key]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v
    }
    return out
  } catch {
    return null
  }
}

/** Best effort: the figures are a convenience, so a failed write is silent. */
export function writeExpenses(values: Record<string, number>) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(values))
  } catch {}
}
