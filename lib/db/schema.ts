import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  real,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  /**
   * Better Auth requires a single `name`, so it stays and holds both parts
   * joined. The two beside it are what was actually typed: a name does not
   * reliably split on its first space, and greeting someone by a guess is
   * worse than asking.
   */
  name: text('name').notNull(),
  firstName: text('firstName'),
  lastName: text('lastName'),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    // Better Auth 1.7 writes an `issuer` on every account row, including the
    // local "credential" one created at email sign-up.
    issuer: text('issuer').notNull(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('account_issuer_accountId_idx').on(table.issuer, table.accountId),
  ],
)

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// --- App tables ------------------------------------------------------------
// Retirement plans. Scoped per user via `userId` (no FK by convention).

export const retirementPlans = pgTable('retirement_plans', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  /** Who the plan is for. Defaults to the account holder, but a plan can be
      drawn up for someone else, so it lives on the plan rather than the user. */
  personName: text('personName').notNull().default(''),

  // Accumulation inputs
  currentAge: integer('currentAge').notNull(),
  retirementAge: integer('retirementAge').notNull(),
  endAge: integer('endAge').notNull(),
  brokerageBalance: real('brokerageBalance').notNull().default(0),
  brokerageGainShare: real('brokerageGainShare').notNull().default(40),
  balance401k: real('balance401k').notNull().default(0),
  traditionalIraBalance: real('traditionalIraBalance').notNull().default(0),
  rothIraBalance: real('rothIraBalance').notNull().default(0),
  monthlyContribution: real('monthlyContribution').notNull(),

  // What the employer adds, and the HSA. Both default to zero, so every plan
  // saved before these existed reads back exactly as it did.
  annualSalary: real('annualSalary').notNull().default(0),
  employerMatchPercent: real('employerMatchPercent').notNull().default(0),
  employerMatchLimitPercent: real('employerMatchLimitPercent').notNull().default(0),
  hsaBalance: real('hsaBalance').notNull().default(0),
  hsaMonthlyContribution: real('hsaMonthlyContribution').notNull().default(0),
  preRetirementReturn: real('preRetirementReturn').notNull(),
  preRetirementVolatility: real('preRetirementVolatility').notNull().default(15),

  // Drawdown inputs
  postRetirementReturn: real('postRetirementReturn').notNull(),
  postRetirementVolatility: real('postRetirementVolatility').notNull().default(8),
  inflationRate: real('inflationRate').notNull(),
  monthlyRetirementSpending: real('monthlyRetirementSpending').notNull(),
  spendingStep1Age: integer('spendingStep1Age').notNull().default(75),
  spendingStep1Monthly: real('spendingStep1Monthly').notNull().default(0),
  spendingStep2Age: integer('spendingStep2Age').notNull().default(85),
  spendingStep2Monthly: real('spendingStep2Monthly').notNull().default(0),

  // Social Security and taxes
  /**
   * How health cover is paid for between retiring and Medicare. Defaults to
   * the marketplace, which is what most people who stop before 65 are on —
   * and which the projection can price for itself, so nobody has to guess it.
   */
  healthCoverBefore65: text('healthCoverBefore65').notNull().default('marketplace'),
  // Birth years, so a reopened plan still describes the same children. A
  // column rather than a table: it is a handful of small integers with no
  // fields of their own and nothing to join to.
  dependentBirthYears: integer('dependentBirthYears').array().notNull().default([]),
  healthPremiumMonthly: real('healthPremiumMonthly').notNull().default(0),
  /** Medicare-side costs from 65, kept out of the single spending figure. */
  healthAfter65Monthly: real('healthAfter65Monthly').notNull().default(0),

  socialSecurityMonthly: real('socialSecurityMonthly').notNull().default(0),
  socialSecurityAge: integer('socialSecurityAge').notNull().default(67),
  socialSecurityCola: real('socialSecurityCola').notNull().default(2.8),
  spouseBenefitMonthly: real('spouseBenefitMonthly').notNull().default(0),
  spouseClaimAge: integer('spouseClaimAge').notNull().default(67),
  /** Age the plan becomes a one-person household; 0 leaves it unmodelled. */
  survivorFromAge: integer('survivorFromAge').notNull().default(0),
  pensionMonthly: real('pensionMonthly').notNull().default(0),
  pensionStartAge: integer('pensionStartAge').notNull().default(65),
  pensionCola: real('pensionCola').notNull().default(0),
  otherIncomeMonthly: real('otherIncomeMonthly').notNull().default(0),
  otherIncomeStartAge: integer('otherIncomeStartAge').notNull().default(65),
  federalTaxRate: real('federalTaxRate').notNull().default(0),
  stateTaxRate: real('stateTaxRate').notNull().default(0),
  taxState: text('taxState').notNull().default(''),
  filingStatus: text('filingStatus').notNull().default('single'),

  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export type RetirementPlan = typeof retirementPlans.$inferSelect
export type NewRetirementPlan = typeof retirementPlans.$inferInsert

// --- The household ----------------------------------------------------------

/**
 * Who the household is, asked once.
 *
 * Name, age, filing status and state belong to the person: nobody is two ages,
 * and a plan is a scenario rather than a second identity. What they own and
 * owe does *not* live here — that varies by scenario, so it belongs to the
 * plan.
 *
 * One row per user.
 */
export const household = pgTable('household', {
  userId: text('userId').primaryKey(),
  /**
   * Who this is. It sat on every plan as `personName`, which existed only to
   * let a plan be drawn up for somebody else — replaced by naming the plan
   * after them. One household, one name.
   */
  name: text('name').notNull().default(''),
  currentAge: integer('currentAge').notNull().default(0),
  filingStatus: text('filingStatus').notNull().default('single'),
  taxState: text('taxState').notNull().default(''),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export type Household = typeof household.$inferSelect

// --- The balance sheet ------------------------------------------------------

/**
 * What a plan assumes the household owns, beyond the pots it draws down.
 *
 * Illiquid by definition — property, a business stake, a fund position, a loan
 * owed to them. The liquid balances stay on `retirement_plans` itself, and
 * that split is what lets net worth be a plain sum with nothing to reconcile.
 *
 * Attached to a plan rather than to a user, because keeping the rental and
 * selling it are two scenarios and a household wants to compare them. Saving a
 * plan saves these with it; there is no separate act.
 */
export const holdings = pgTable(
  'holdings',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    /** The plan these belong to. Gone when it is. */
    planId: integer('planId')
      .notNull()
      .references(() => retirementPlans.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull().default(''),
    value: real('value').notNull().default(0),
    basis: real('basis').notNull().default(0),
    growthPercent: real('growthPercent').notNull().default(0),
    /** Null where it is being held rather than sold. */
    saleAge: integer('saleAge'),
    /** Interest-bearing kinds mature on a date rather than at an age. */
    maturityYear: integer('maturityYear'),
    counted: boolean('counted').notNull().default(false),

    // Property
    ownedYears: real('ownedYears').notNull().default(0),
    landSharePercent: real('landSharePercent').notNull().default(20),
    mortgage: real('mortgage').notNull().default(0),
    mortgageRatePercent: real('mortgageRatePercent').notNull().default(0),
    monthlyRent: real('monthlyRent').notNull().default(0),
    propertyTax: real('propertyTax').notNull().default(0),
    insurance: real('insurance').notNull().default(0),
    maintenance: real('maintenance').notNull().default(0),
    primaryResidence: boolean('primaryResidence').notNull().default(false),

    // Interest-bearing
    interestPercent: real('interestPercent').notNull().default(0),
    interestPaidOut: boolean('interestPaidOut').notNull().default(true),

    /** Qualified small business stock, §1202. */
    qsbs: boolean('qsbs').notNull().default(false),

    // A syndication's share, as its K-1 reports it.
    annualDepreciationShare: real('annualDepreciationShare').notNull().default(0),
    annualDistribution: real('annualDistribution').notNull().default(0),

    // The sponsor's side of the same deal, kept apart because it is taxed
    // apart: fees are ordinary income, a promote is carried under §1061.
    sponsors: boolean('sponsors').notNull().default(false),
    sponsorFees: real('sponsorFees').notNull().default(0),
    promoteAtExit: real('promoteAtExit').notNull().default(0),

    /** Their own order on the page, so a list does not reshuffle on save. */
    position: integer('position').notNull().default(0),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('holdings_plan_idx').on(t.planId, t.position)],
)

export type StoredHolding = typeof holdings.$inferSelect

/**
 * Debt with nothing behind it. A mortgage lives on the holding it secures.
 *
 * Attached to a plan for the same reason the holdings are: clearing the card
 * before retiring and carrying it are two scenarios.
 */
export const liabilities = pgTable(
  'liabilities',
  {
    id: text('id').primaryKey(),
    userId: text('userId').notNull(),
    planId: integer('planId')
      .notNull()
      .references(() => retirementPlans.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    name: text('name').notNull().default(''),
    balance: real('balance').notNull().default(0),
    ratePercent: real('ratePercent').notNull().default(0),
    monthlyPayment: real('monthlyPayment').notNull().default(0),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('liabilities_plan_idx').on(t.planId, t.position)],
)

export type StoredLiability = typeof liabilities.$inferSelect

// --- Feedback ---------------------------------------------------------------

/**
 * What people tell us about the app.
 *
 * Not tied to an account: someone can be signed out and still have something
 * worth saying, which is often exactly when they do. The user id is recorded
 * when there is one so a reply is possible, and the page is recorded because
 * "this number is wrong" means little without knowing which number.
 */
export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  userId: text('userId').references(() => user.id, { onDelete: 'set null' }),
  /** Where to reply, if they want one. Optional and never required. */
  email: text('email').notNull().default(''),
  message: text('message').notNull(),
  /** The page they were on when they wrote it. */
  path: text('path').notNull().default(''),
  /** With a time zone, for the reason given on `events.createdAt`. */
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})

export type Feedback = typeof feedback.$inferSelect
export type NewFeedback = typeof feedback.$inferInsert

// --- Usage ------------------------------------------------------------------

/**
 * What happened, not who it happened to.
 *
 * Enough to see where people give up — landed, opened the planner, filled it
 * in, saw an answer, signed up — without any figure anybody typed. The FAQ
 * promises that the projection is computed on the visitor's own device and not
 * sent anywhere, and that promise is worth more than knowing what balances
 * people enter.
 *
 * `session` is a random id held in sessionStorage, so it lasts one browser run
 * and cannot follow anyone across days or sites. It identifies a visit, not a
 * person. Nothing here needs a cookie, and so nothing here needs a banner.
 */
export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    /** One browser run. Not a person, and not persisted past the tab. */
    session: text('session').notNull(),
    /** One of a fixed list; anything else is rejected before it reaches here. */
    name: text('name').notNull(),
    path: text('path').notNull().default(''),
    /** Read from the session server-side, never trusted from the caller. */
    isAuthed: boolean('isAuthed').notNull().default(false),
    /** Where the visit came from, recorded once at the start of a run. */
    referrer: text('referrer').notNull().default(''),
    /**
     * Roughly where in the world, from the edge headers the host adds.
     *
     * The address those headers were derived from is read to decide whether to
     * record the visit at all, and then discarded. An IP address is personal
     * data; a country is not, and a country is what the question "where are
     * people coming from" actually wants.
     */
    country: text('country').notNull().default(''),
    region: text('region').notNull().default(''),
    city: text('city').notNull().default(''),
    /**
     * With a time zone, unlike the Better Auth tables above.
     *
     * A bare `timestamp` stores wall-clock with nothing recording which clock,
     * so it reads correctly only while the process that parses it happens to
     * run in the same zone as the server that wrote it. That held on Vercel
     * and not on a laptop, and the difference once led to reading these very
     * rows five hours out and concluding the wrong thing about them. Storing
     * the instant instead makes a Central-time display a formatting choice
     * rather than a calculation that can be wrong.
     */
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The funnel counts distinct sessions per event name over a date range,
    // and a bounce is a session with one row. Both walk these two.
    index('events_session_idx').on(t.session),
    index('events_name_created_idx').on(t.name, t.createdAt),
  ],
)

export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
