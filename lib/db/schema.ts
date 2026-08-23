import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  real,
  uniqueIndex,
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
  socialSecurityMonthly: real('socialSecurityMonthly').notNull().default(0),
  socialSecurityAge: integer('socialSecurityAge').notNull().default(67),
  socialSecurityCola: real('socialSecurityCola').notNull().default(2.8),
  spouseBenefitMonthly: real('spouseBenefitMonthly').notNull().default(0),
  spouseClaimAge: integer('spouseClaimAge').notNull().default(67),
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
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export type Feedback = typeof feedback.$inferSelect
export type NewFeedback = typeof feedback.$inferInsert
