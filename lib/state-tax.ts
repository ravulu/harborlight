/**
 * 2026 state individual income tax schedules, used to estimate an effective
 * rate on retirement withdrawals.
 *
 * Brackets and standard deductions are from the Tax Foundation's 2026 state
 * tables, for single and married-filing-jointly filers. `retirementExempt`
 * overrides the schedule: those states levy an income tax but do not apply it
 * to retirement distributions.
 *
 * Where `married` is absent the single schedule is used and the estimate is
 * flagged, rather than doubling the single thresholds — states widen their
 * married brackets by varying amounts and guessing would be worse than saying
 * the number is rough.
 */
export interface Bracket {
  /** percent */
  rate: number
  /** taxable income at which this rate starts */
  from: number
}

export interface Schedule {
  brackets: Bracket[]
  standardDeduction: number
}

export type FilingStatus = 'single' | 'married'

export const FILING_STATUSES: {
  value: FilingStatus
  label: string
  /** reads naturally mid-sentence: "for a joint filer" */
  short: string
}[] = [
  { value: 'single', label: 'Single', short: 'single' },
  { value: 'married', label: 'Married filing jointly', short: 'joint' },
]

export interface StateTax {
  code: string
  name: string
  /** empty brackets mean no income tax at all */
  single: Schedule
  /** absent means no married schedule was available; single is used instead */
  married?: Schedule
  /** levies an income tax, but not on retirement distributions */
  retirementExempt?: boolean
  note?: string
  /** only a top rate was available, so the estimate is coarse */
  approximate?: boolean
  /** single brackets stand in for married ones */
  marriedApproximate?: boolean
  /**
   * Taxes Social Security benefits. Eight states still do in 2026; the other
   * 42 and DC do not. West Virginia finished phasing its tax out this year.
   */
  taxesSocialSecurity?: boolean
  /**
   * The income below which the benefit is exempt anyway.
   *
   * Every one of the eight sets a limit, and most retirees fall under it — so
   * a state that "taxes Social Security" usually does not tax any given
   * household's. Treated as a clean line: exempt below, taxable above. The
   * real rules taper across a band in several states, so a household sitting
   * just over the line is charged a little more here than it would be.
   *
   * `fromAge` covers Colorado, whose exemption is by age rather than income:
   * a full deduction from 65 and none before it, which is why its income
   * limits are zero — under 65 there is no income small enough to escape.
   */
  socialSecurityExempt?: { single: number; married: number; fromAge?: number }
}

const NONE = 'No state income tax'
const EXEMPT = 'Retirement withdrawals exempt'

export const STATE_TAXES: StateTax[] = [
  { code: 'AL', name: 'Alabama', single: { brackets: [{rate:2,from:0},{rate:4,from:500},{rate:5,from:3000}], standardDeduction: 3000 }, married: { brackets: [{rate:2,from:0},{rate:4,from:1000},{rate:5,from:6000}], standardDeduction: 8500 } },
  { code: 'AK', name: 'Alaska', single: { brackets: [], standardDeduction: 0 }, married: { brackets: [], standardDeduction: 0 }, note: NONE },
  { code: 'AZ', name: 'Arizona', single: { brackets: [{rate:2.5,from:0}], standardDeduction: 8350 }, married: { brackets: [{rate:2.5,from:0}], standardDeduction: 16700 } },
  { code: 'AR', name: 'Arkansas', single: { brackets: [{rate:2,from:0}], standardDeduction: 2470 }, married: { brackets: [{rate:2,from:0},{rate:3.9,from:4600}], standardDeduction: 4940 } },
  { code: 'CA', name: 'California', single: { brackets: [{rate:1,from:0},{rate:2,from:11079},{rate:4,from:26264},{rate:6,from:41452},{rate:8,from:57542},{rate:9.3,from:72724},{rate:10.3,from:371479},{rate:11.3,from:445771},{rate:12.3,from:742953},{rate:13.3,from:1000000}], standardDeduction: 5540 }, married: { brackets: [{rate:1,from:0},{rate:2,from:22158},{rate:4,from:52528},{rate:6,from:82904},{rate:8,from:115084},{rate:9.3,from:145448},{rate:10.3,from:742958},{rate:11.3,from:891542},{rate:12.3,from:1000000},{rate:13.3,from:1485906}], standardDeduction: 11080 } },
  { code: 'CO', name: 'Colorado', single: { brackets: [{rate:4.4,from:0}], standardDeduction: 16100 }, married: { brackets: [{rate:4.4,from:0}], standardDeduction: 32200 }, taxesSocialSecurity: true, socialSecurityExempt: { single: 0, married: 0, fromAge: 65 } },
  { code: 'CT', name: 'Connecticut', single: { brackets: [{rate:2,from:0},{rate:4.5,from:10000},{rate:5.5,from:50000},{rate:6,from:100000},{rate:6.5,from:200000},{rate:6.9,from:250000},{rate:6.99,from:500000}], standardDeduction: 0 }, married: { brackets: [{rate:2,from:0},{rate:4.5,from:20000},{rate:5.5,from:100000},{rate:6,from:200000},{rate:6.5,from:400000},{rate:6.9,from:500000},{rate:6.99,from:1000000}], standardDeduction: 0 }, taxesSocialSecurity: true, socialSecurityExempt: { single: 75_000, married: 100_000 } },
  { code: 'DE', name: 'Delaware', single: { brackets: [{rate:0,from:0},{rate:2.2,from:2000},{rate:3.9,from:5000},{rate:4.8,from:10000},{rate:5.2,from:20000},{rate:5.55,from:25000},{rate:6.6,from:60000}], standardDeduction: 3250 }, married: { brackets: [{rate:0,from:0},{rate:2.2,from:2000},{rate:3.9,from:5000},{rate:4.8,from:10000},{rate:5.2,from:20000},{rate:5.55,from:25000},{rate:6.6,from:60000}], standardDeduction: 6500 } },
  { code: 'DC', name: 'District of Columbia', single: { brackets: [{rate:4,from:0},{rate:6,from:10000},{rate:6.5,from:40000},{rate:8.5,from:60000},{rate:9.25,from:250000},{rate:9.75,from:500000},{rate:10.75,from:1000000}], standardDeduction: 16100 }, married: { brackets: [{rate:4,from:0},{rate:6,from:10000},{rate:6.5,from:40000},{rate:8.5,from:60000},{rate:9.25,from:250000},{rate:9.75,from:500000},{rate:10.75,from:1000000}], standardDeduction: 32200 } },
  { code: 'FL', name: 'Florida', single: { brackets: [], standardDeduction: 0 }, married: { brackets: [], standardDeduction: 0 }, note: NONE },
  { code: 'GA', name: 'Georgia', single: { brackets: [{rate:5.19,from:0}], standardDeduction: 12000 }, married: { brackets: [{rate:5.19,from:0}], standardDeduction: 24000 } },
  { code: 'HI', name: 'Hawaii', single: { brackets: [{rate:1.4,from:0},{rate:3.2,from:9600},{rate:5.5,from:14400},{rate:6.4,from:19200},{rate:6.8,from:24000},{rate:7.2,from:36000},{rate:7.6,from:48000},{rate:7.9,from:125000},{rate:8.25,from:175000},{rate:9,from:225000},{rate:10,from:275000},{rate:11,from:325000}], standardDeduction: 4400 }, married: { brackets: [{rate:1.4,from:0},{rate:3.2,from:19200},{rate:5.5,from:28800},{rate:6.4,from:38400},{rate:6.8,from:48000},{rate:7.2,from:72000},{rate:7.6,from:96000},{rate:7.9,from:250000},{rate:8.25,from:350000},{rate:9,from:450000},{rate:10,from:550000},{rate:11,from:650000}], standardDeduction: 8800 } },
  { code: 'ID', name: 'Idaho', single: { brackets: [{rate:5.3,from:0}], standardDeduction: 16100 }, married: { brackets: [{rate:5.3,from:9622}], standardDeduction: 32200 } },
  { code: 'IL', name: 'Illinois', single: { brackets: [{rate:4.95,from:0}], standardDeduction: 0 }, married: { brackets: [{rate:4.95,from:0}], standardDeduction: 0 }, retirementExempt: true, note: EXEMPT },
  { code: 'IN', name: 'Indiana', single: { brackets: [{rate:2.95,from:0}], standardDeduction: 0 }, married: { brackets: [{rate:2.95,from:0}], standardDeduction: 0 } },
  { code: 'IA', name: 'Iowa', single: { brackets: [{rate:3.8,from:0}], standardDeduction: 16100 }, married: { brackets: [{rate:3.8,from:0}], standardDeduction: 32200 }, retirementExempt: true, note: 'Exempt from age 55' },
  { code: 'KS', name: 'Kansas', single: { brackets: [{rate:5.2,from:0},{rate:5.58,from:23000}], standardDeduction: 3605 }, married: { brackets: [{rate:5.2,from:0},{rate:5.58,from:46000}], standardDeduction: 8240 } },
  { code: 'KY', name: 'Kentucky', single: { brackets: [{rate:3.5,from:0}], standardDeduction: 3360 }, married: { brackets: [{rate:3.5,from:0}], standardDeduction: 3360 } },
  { code: 'LA', name: 'Louisiana', single: { brackets: [{rate:3,from:0}], standardDeduction: 12875 }, married: { brackets: [{rate:3,from:0}], standardDeduction: 25750 } },
  { code: 'ME', name: 'Maine', single: { brackets: [{rate:5.8,from:0},{rate:6.75,from:27399},{rate:7.15,from:64849}], standardDeduction: 8350 }, married: { brackets: [{rate:5.8,from:0},{rate:6.75,from:54849},{rate:7.15,from:129749}], standardDeduction: 16700 } },
  { code: 'MD', name: 'Maryland', single: { brackets: [{rate:2,from:0},{rate:3,from:1000},{rate:4,from:2000},{rate:4.75,from:3000},{rate:5,from:100000},{rate:5.25,from:125000},{rate:5.5,from:150000},{rate:5.75,from:250000},{rate:6.25,from:500000},{rate:6.5,from:1000000}], standardDeduction: 3350 }, married: { brackets: [{rate:2,from:0},{rate:3,from:1000},{rate:4,from:2000},{rate:4.75,from:3000},{rate:5,from:150000},{rate:5.25,from:175000},{rate:5.5,from:225000},{rate:5.75,from:300000},{rate:6.25,from:600000},{rate:6.5,from:1200000}], standardDeduction: 6700 } },
  { code: 'MA', name: 'Massachusetts', single: { brackets: [{rate:5,from:0},{rate:9,from:1083150}], standardDeduction: 0 }, married: { brackets: [{rate:5,from:0},{rate:9,from:1083150}], standardDeduction: 0 } },
  { code: 'MI', name: 'Michigan', single: { brackets: [{rate:4.25,from:0}], standardDeduction: 0 }, married: { brackets: [{rate:4.25,from:0}], standardDeduction: 0 }, note: 'Large retirement exemption phasing in' },
  { code: 'MN', name: 'Minnesota', single: { brackets: [{rate:5.35,from:0},{rate:6.8,from:33310},{rate:7.85,from:109430},{rate:9.85,from:203150}], standardDeduction: 15300 }, married: { brackets: [{rate:5.35,from:0},{rate:6.8,from:48700},{rate:7.85,from:193480},{rate:9.85,from:337930}], standardDeduction: 30600 }, taxesSocialSecurity: true, socialSecurityExempt: { single: 86_410, married: 110_780 } },
  { code: 'MS', name: 'Mississippi', single: { brackets: [{rate:0,from:0},{rate:4,from:10000}], standardDeduction: 2300 }, married: { brackets: [{rate:0,from:0},{rate:4,from:10000}], standardDeduction: 4600 }, retirementExempt: true, note: EXEMPT },
  { code: 'MO', name: 'Missouri', single: { brackets: [{rate:0,from:0},{rate:2,from:1348},{rate:2.5,from:2696},{rate:3,from:4044},{rate:3.5,from:5392},{rate:4,from:6740},{rate:4.5,from:8088},{rate:4.7,from:9436}], standardDeduction: 16100 }, married: { brackets: [{rate:0,from:0},{rate:2,from:1348},{rate:2.5,from:2696},{rate:3,from:4044},{rate:3.5,from:5392},{rate:4,from:6740},{rate:4.5,from:8088},{rate:4.7,from:9436}], standardDeduction: 32200 } },
  { code: 'MT', name: 'Montana', single: { brackets: [{rate:4.7,from:0},{rate:5.65,from:47500}], standardDeduction: 16100 }, married: { brackets: [{rate:4.7,from:0},{rate:5.65,from:95000}], standardDeduction: 32200 }, taxesSocialSecurity: true, socialSecurityExempt: { single: 25_000, married: 32_000 } },
  { code: 'NE', name: 'Nebraska', single: { brackets: [{rate:2.46,from:0},{rate:3.51,from:4130},{rate:4.55,from:24760}], standardDeduction: 8850 }, married: { brackets: [{rate:2.46,from:0},{rate:3.51,from:8250},{rate:4.55,from:49530}], standardDeduction: 17700 } },
  { code: 'NV', name: 'Nevada', single: { brackets: [], standardDeduction: 0 }, married: { brackets: [], standardDeduction: 0 }, note: NONE },
  { code: 'NH', name: 'New Hampshire', single: { brackets: [], standardDeduction: 0 }, married: { brackets: [], standardDeduction: 0 }, note: NONE },
  { code: 'NJ', name: 'New Jersey', single: { brackets: [{rate:1.4,from:0},{rate:1.75,from:20000},{rate:3.5,from:35000},{rate:5.53,from:40000},{rate:6.37,from:75000},{rate:8.97,from:500000},{rate:10.75,from:1000000}], standardDeduction: 0 }, married: { brackets: [{rate:1.4,from:0},{rate:1.75,from:20000},{rate:2.45,from:50000},{rate:3.5,from:70000},{rate:5.53,from:80000},{rate:6.37,from:150000},{rate:8.97,from:500000},{rate:10.75,from:1000000}], standardDeduction: 0 } },
  { code: 'NM', name: 'New Mexico', single: { brackets: [{rate:1.5,from:0},{rate:3.2,from:5500},{rate:4.3,from:16500},{rate:4.7,from:33500},{rate:4.9,from:66500},{rate:5.9,from:210000}], standardDeduction: 16100 }, married: { brackets: [{rate:1.5,from:0},{rate:3.2,from:8000},{rate:4.3,from:25000},{rate:4.7,from:50000},{rate:4.9,from:100000},{rate:5.9,from:315000}], standardDeduction: 32200 }, taxesSocialSecurity: true, socialSecurityExempt: { single: 100_000, married: 150_000 } },
  { code: 'NY', name: 'New York', single: { brackets: [{rate:3.9,from:0},{rate:4.4,from:8500},{rate:5.15,from:11700},{rate:5.4,from:13900},{rate:5.9,from:80650},{rate:6.85,from:215400},{rate:9.65,from:1077550},{rate:10.3,from:5000000},{rate:10.9,from:25000000}], standardDeduction: 8000 }, married: { brackets: [{rate:3.9,from:0},{rate:4.4,from:17150},{rate:5.15,from:23600},{rate:5.4,from:27900},{rate:5.9,from:161550},{rate:6.85,from:323200},{rate:9.65,from:2155350},{rate:10.3,from:5000000},{rate:10.9,from:25000000}], standardDeduction: 16050 } },
  { code: 'NC', name: 'North Carolina', single: { brackets: [{rate:3.99,from:0}], standardDeduction: 12750 }, married: { brackets: [{rate:3.99,from:0}], standardDeduction: 25500 } },
  { code: 'ND', name: 'North Dakota', single: { brackets: [{rate:0,from:0},{rate:1.95,from:48475},{rate:2.5,from:244825}], standardDeduction: 16100 }, married: { brackets: [{rate:0,from:0},{rate:1.95,from:80975},{rate:2.5,from:298075}], standardDeduction: 32200 } },
  { code: 'OH', name: 'Ohio', single: { brackets: [{rate:0,from:0},{rate:2.75,from:26050}], standardDeduction: 0 }, married: { brackets: [{rate:0,from:0},{rate:2.75,from:26050}], standardDeduction: 0 } },
  { code: 'OK', name: 'Oklahoma', single: { brackets: [{rate:0,from:0},{rate:2.5,from:3750},{rate:3.5,from:4900},{rate:4.5,from:7200}], standardDeduction: 6350 }, married: { brackets: [{rate:0,from:0},{rate:2.5,from:7500},{rate:3.5,from:9800},{rate:4.5,from:14400}], standardDeduction: 12700 } },
  { code: 'OR', name: 'Oregon', single: { brackets: [{rate:4.75,from:0},{rate:6.75,from:4550},{rate:8.75,from:11400},{rate:9.9,from:125000}], standardDeduction: 2910 }, married: { brackets: [{rate:4.75,from:0},{rate:6.75,from:9100},{rate:8.75,from:22800},{rate:9.9,from:250000}], standardDeduction: 5820 } },
  { code: 'PA', name: 'Pennsylvania', single: { brackets: [{rate:3.07,from:0}], standardDeduction: 0 }, married: { brackets: [{rate:3.07,from:0}], standardDeduction: 0 }, retirementExempt: true, note: 'Exempt from age 59½' },
  { code: 'RI', name: 'Rhode Island', single: { brackets: [{rate:3.75,from:0},{rate:4.75,from:82050},{rate:5.99,from:186450}], standardDeduction: 11200 }, married: { brackets: [{rate:3.75,from:0},{rate:4.75,from:82050},{rate:5.99,from:186450}], standardDeduction: 22400 }, taxesSocialSecurity: true, socialSecurityExempt: { single: 104_200, married: 133_250 } },
  { code: 'SC', name: 'South Carolina', single: { brackets: [{rate:0,from:0},{rate:3,from:3640},{rate:6,from:18230}], standardDeduction: 8350 }, married: { brackets: [{rate:0,from:0},{rate:3,from:3640},{rate:6,from:18230}], standardDeduction: 16700 } },
  { code: 'SD', name: 'South Dakota', single: { brackets: [], standardDeduction: 0 }, married: { brackets: [], standardDeduction: 0 }, note: NONE },
  { code: 'TN', name: 'Tennessee', single: { brackets: [], standardDeduction: 0 }, married: { brackets: [], standardDeduction: 0 }, note: NONE },
  { code: 'TX', name: 'Texas', single: { brackets: [], standardDeduction: 0 }, married: { brackets: [], standardDeduction: 0 }, note: NONE },
  { code: 'UT', name: 'Utah', single: { brackets: [{rate:4.5,from:0}], standardDeduction: 0 }, married: { brackets: [{rate:4.5,from:0}], standardDeduction: 0 }, taxesSocialSecurity: true, socialSecurityExempt: { single: 54_000, married: 90_000 } },
  { code: 'VT', name: 'Vermont', single: { brackets: [{rate:3.35,from:0},{rate:6.6,from:49400},{rate:7.6,from:119700},{rate:8.75,from:249700}], standardDeduction: 7650 }, married: { brackets: [{rate:3.35,from:0},{rate:6.6,from:82500},{rate:7.6,from:199450},{rate:8.75,from:304000}], standardDeduction: 15300 }, taxesSocialSecurity: true, socialSecurityExempt: { single: 65_000, married: 80_000 } },
  { code: 'VA', name: 'Virginia', single: { brackets: [{rate:2,from:0},{rate:3,from:3000},{rate:5,from:5000},{rate:5.75,from:17000}], standardDeduction: 8750 }, married: { brackets: [{rate:2,from:0},{rate:3,from:3000},{rate:5,from:5000},{rate:5.75,from:17000}], standardDeduction: 17500 } },
  { code: 'WA', name: 'Washington', single: { brackets: [], standardDeduction: 0 }, married: { brackets: [], standardDeduction: 0 }, note: 'No tax on retirement withdrawals' },
  { code: 'WV', name: 'West Virginia', single: { brackets: [{rate:5.12,from:0}], standardDeduction: 0 }, approximate: true, note: 'Top rate only — brackets unavailable' },
  { code: 'WI', name: 'Wisconsin', single: { brackets: [{rate:3.5,from:0},{rate:4.4,from:15110},{rate:5.3,from:51950},{rate:7.65,from:332720}], standardDeduction: 13960 }, marriedApproximate: true },
  { code: 'WY', name: 'Wyoming', single: { brackets: [], standardDeduction: 0 }, married: { brackets: [], standardDeduction: 0 }, note: NONE },
]

/**
 * Marks rates the user set by hand. Distinct from '' — an empty code means no
 * state income tax, which still has a federal rate worth deriving.
 */
export const CUSTOM_RATES = 'CUSTOM'

/** Whether the rates should be worked out from brackets rather than left alone. */
export const usesDerivedRates = (taxState: string) => taxState !== CUSTOM_RATES

export const findState = (code: string) => STATE_TAXES.find((s) => s.code === code)

/** The schedule to use for a filing status, falling back to single. */
export function scheduleFor(state: StateTax, status: FilingStatus): Schedule {
  return status === 'married' && state.married ? state.married : state.single
}

/**
 * Whether this state actually taxes a given household's Social Security.
 *
 * "Taxes Social Security" is a property of the state; whether it taxes *your*
 * benefit is a property of your income, and for most retirees the answer is
 * no. Colorado is the exception that turns on age instead.
 *
 * `age` defaults past full retirement age because that is when almost every
 * plan is drawing a benefit; it only matters for Colorado.
 */
export function taxesSocialSecurityAt(
  state: StateTax | undefined,
  status: FilingStatus,
  income: number,
  age = 67,
): boolean {
  if (!state?.taxesSocialSecurity) return false
  const exempt = state.socialSecurityExempt
  if (!exempt) return true
  if (exempt.fromAge !== undefined && age >= exempt.fromAge) return false
  return income > exempt[status]
}
