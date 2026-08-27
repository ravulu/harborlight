/**
 * The questions this app can honestly answer, and its answers.
 *
 * Written from what the planner actually does — the run count, the account
 * order, the bracket year, the ages in law — because an answer that flatters
 * the product is worth less than one someone can check, and both the page and
 * its structured data are generated from this list.
 *
 * Kept beside the FAQ page rather than in lib/seo.ts: these are the words a
 * reader sees, and the fact that a crawler also reads them is a consequence.
 */
export interface Qa {
  q: string
  a: string
}

/**
 * What a Monte Carlo run is, in one place.
 *
 * Said twice — on the FAQ page, and beside the projection itself where the
 * band it describes is being looked at — so it is written once. Two copies of
 * an explanation drift, and the stale one is always the one somebody reads.
 *
 * Held as paragraphs because the popover wants them apart; the FAQ joins them
 * back into the single string its page and its structured data expect.
 */
export const MONTE_CARLO_PARAGRAPHS: string[] = [
  'A single average return hides the thing that decides most retirements: the order the good and bad years arrive in. Planners call it sequence-of-returns risk, and it is why two retirements with identical average returns end very differently when one of them begins with a crash. The same losses in a different order leave a different amount of money, because what a bad year costs depends on how much was in the account when it landed — and the worst place for one is the first few years of drawing down, when the balance is at its largest and every withdrawal sells more of it.',
  'Fairwater runs 10,000 simulated futures, each with its own random sequence of returns drawn from the return and volatility you set, and reports how many of them your plan survived. That percentage is the confidence figure — the share of runs whose money lasted, not a guarantee about yours.',
  'Fairwater treats 90% as the bar: above it a plan is marked as holding up, below it the planner offers changes that would reach it, and the retirement age it suggests is the earliest that clears it. That number is a choice rather than a law — some planners use 80%, some 95% — and it is worth knowing which one you are being judged against. At 90%, roughly one simulated market in ten still ran the money out.',
]

export const FAQ: Qa[] = [
  {
    q: 'When can I retire?',
    a: 'Enter your age, your balances, what you put away each month and the spending you want in retirement. Fairwater projects the years ahead and reports the share of simulated market outcomes in which the money lasts. It also searches for the earliest age your plan could support — the youngest age at which nine runs in ten still leave money at the end — and shows it as somewhere to look rather than an answer, with the reasons it might be wrong beside it. You can still move the retirement age yourself and watch the share change; the suggestion is a starting point, not a verdict. Chasing 100% is not the goal, and usually means underspending a whole life to insure against a future that did not happen.',
  },
  {
    q: 'How long will my money last in retirement?',
    a: 'The projection runs year by year from today to the end of your plan. Each year it adds growth and any contributions, subtracts what you spend, adds Social Security and any pension, and takes the shortfall out of savings along with the tax on that withdrawal — plus health cover before 65 and the Medicare surcharge after it, both of which are real costs the year has to fund and neither of which is a tax. It reports either the age the money runs out or that it lasts through the whole plan — and because markets are not a straight line, it does this across thousands of different sequences of returns rather than one average.',
  },
  {
    q: 'Is Fairwater a free retirement calculator?',
    a: 'Yes. The planner is free and works without an account. An account exists only so you can save plans, compare them side by side, and come back to them later. There is nothing to install and no card.',
  },
  {
    q: 'What is a Monte Carlo retirement simulation, and why use one?',
    a: MONTE_CARLO_PARAGRAPHS.join(' '),
  },
  {
    q: 'What is a safe withdrawal rate, and does the 4% rule apply to me?',
    a: 'The 4% rule came from historical US data and says a portfolio can support withdrawals of about 4% of its starting value, rising with inflation, for thirty years. It is a rule of thumb, not a law: it assumes a particular mix of stocks and bonds, a thirty-year retirement, and history repeating. Fairwater shows your own withdrawal rate against your own projected pot, and because it simulates rather than assumes, a plan that would fail at 4% and one that would survive at 5% both show up as what they are.',
  },
  {
    q: 'How are 401(k) and IRA withdrawals taxed in the projection?',
    a: 'By the account they come from, not by a flat rate. A dollar from a brokerage account is taxed only on its gain, at capital-gains rates. A dollar from a 401(k) or traditional IRA is ordinary income in full. A dollar from a Roth is not taxed at all. The planner spends the taxable account first, then the tax-deferred accounts, then the Roth, and works out federal tax on 2026 brackets, capital-gains tax stacked on top of ordinary income, and state tax for the state you choose. Withdrawals from a 401(k) or IRA before 59½ also carry the extra 10% under IRC §72(t), and the projection charges it rather than mentioning it: the withdrawal is grossed up so the year still delivers the spending you asked for, and those years are named so you can see what stopping early actually costs.',
  },
  {
    q: 'When should I claim Social Security?',
    a: 'A Social Security claiming strategy is worth more than most people expect: claiming at 62 pays about 70% of your full benefit for life, while waiting until 70 pays about 124%. Fairwater compares the claiming ages and shows what each does to your lifetime income and to your tax bill, which are not the same question — a larger benefit drags more of itself into tax. For couples it models spousal benefits, the larger of the two being what actually gets paid, and two people claiming on different dates — which splits the retirement into a stretch with one payment and a stretch with both. One thing it does not yet model is the household becoming one person: whoever lives longer keeps the larger benefit and loses the smaller, and files single from then on. That matters most to exactly this decision, because it is the strongest argument for the higher earner waiting, so the comparison says on the page that it understates the case for claiming later.',
  },
  {
    q: 'How much of my Social Security will be taxed?',
    a: 'Up to 85% of it counts as ordinary income federally. Which part depends on provisional income — your other income plus half the benefit — measured against a $25,000 floor and a $34,000 ceiling for single filers, or $32,000 and $44,000 filing jointly. Those thresholds were fixed in 1983 and 1993 and have never been indexed to inflation, so more of the benefit becomes taxable as the years pass. The planner works this out for every year rather than applying one rate.',
  },
  {
    q: 'Should I do a Roth conversion, and when?',
    a: 'The window worth looking at is usually between retiring and claiming Social Security: the paychecks have stopped, the benefit has not started, and the lower tax brackets are sitting empty. Converting then fills those brackets at a known rate instead of leaving the money to be drawn later on top of a benefit, or forced out by required distributions. Fairwater names that stretch and prices a ladder of amounts across it, ranked on what each costs over the whole plan — income tax, the Medicare surcharge it buys two years later, and, if you stop before 65, what it does to your health-insurance subsidy. All the amounts are shown rather than one recommended, because a conversion that saves tax and costs more in premiums is not a saving, and which side of that you land on depends on figures only you have.',
  },
  {
    q: 'What are required minimum distributions, and when do they start?',
    a: 'From a certain age the IRS requires you to withdraw a minimum amount from tax-deferred accounts each year whether you need it or not, and to pay ordinary income tax on it. Under SECURE 2.0 that age is 73 if you were born between 1951 and 1959, and 75 if you were born in 1960 or later. If your tax-deferred balance is large, the required amount can exceed what you planned to spend — pushing you into a higher bracket in your seventies. A required minimum distribution calculator is built in: the planner works out your age under the current rules, projects the amount that will be forced out, and flags it when the balance makes this likely.',
  },
  {
    q: 'Does this work for FIRE — retiring at 45 or 50 rather than 65?',
    a: 'Yes, and the years it is most useful for are the ones a conventional calculator skips. Retiring decades early puts three costs in front of you that a plan starting at 65 never meets. Health cover is the first and usually the largest: no Medicare until 65, so every year before it is bought on the marketplace, and the credit that pays most of it stops rather than tapers above four times the poverty line — Fairwater prices each of those years from that year’s own income instead of asking you to guess. The second is the 10% penalty on anything drawn from a 401(k) or IRA before 59½, which the projection charges rather than mentions, grossing the withdrawal up so the year still delivers the spending you asked for. The third is the horizon itself: the 4% rule is a figure measured over thirty years, and the withdrawal note compares your own rate against your own length rather than against somebody else’s retirement. The conversion ladder that FIRE plans usually run on is modelled too — the low-income stretch between stopping work and required distributions is exactly the window the Roth comparison searches, and the planner shows what each amount costs in tax, in Medicare surcharges two years later, and in lost health credit. Two things it does not model, and both matter at these ages: substantially equal periodic payments under §72(t), and the rule of 55 for a 401(k) left with the employer you retired from. It also tracks the five-year Roth clock as something to watch rather than charging what breaking it would cost, so a ladder that is not yet seasoned will look cheaper here than it would be.',
  },
  {
    q: 'What will health insurance cost if I retire before 65?',
    a: 'Medicare does not start until 65, so retiring before then means buying cover yourself — usually on the ACA marketplace, and usually the largest single line in those years. Fairwater prices it rather than asking you to guess it, because almost nobody can: for each year before 65 it works out the premium tax credit from that year’s own income, your age and your household size, and charges what is left on top of your spending. The credit is substantial — a single 60-year-old on $40,000 pays about $3,400 a year toward a benchmark plan costing over $12,000 — but it stops rather than tapering. Above four times the federal poverty line, about $62,600 for one person in 2026 and $84,600 for two, the whole credit disappears, so a few hundred dollars of extra income can cost several thousand. That cliff is why drawing from a brokerage account rather than a 401(k) in those years can be worth more than it looks. The figures use the national average benchmark plan, which genuinely varies by where you live, sometimes by half — treat the shape as reliable and check your own marketplace quote before acting on the amount.',
  },
  {
    q: 'Why does Medicare cost more if my income is high?',
    a: 'From 65, Medicare adds a surcharge to Parts B and D for higher earners — IRMAA, the income-related monthly adjustment amount — on top of the standard premium. Two things about it surprise people. It is decided by the tax return from two years earlier, so the income you have at 63 sets your first premium at 65, and a large Roth conversion at 68 raises what you pay at 70, by which time the year that caused it is closed. And the thresholds are steps rather than a slope: one dollar over the first one, $109,001 for a single filer in 2026, takes the whole step, and it is charged per person, so a couple pays it twice. Fairwater works the surcharge out for every year, names the year whose income caused it, and prices it into the Roth conversion comparison so an amount that saves tax but buys a surcharge is not reported as a saving. Two caveats it states on the page: the premiums are assumed to rise faster than inflation, which is most of why a lifetime figure on a long plan looks large, and a form — SSA-44 — can have the surcharge reassessed after a life-changing event such as retiring, though not merely because a year was unusual.',
  },
  {
    q: 'Can I add my house, rentals and debts, and do they change the projection?',
    a: 'You can add them, and they do not change the projection yet — which is worth knowing before you spend an evening entering them. Assets & liabilities is a second tab beside the plan, and it holds what a retirement projection normally ignores: the home you live in, rentals, land, a share of a syndication, a private company stake, crypto, cars and boats, certificates of deposit and private loans, and the mortgages, car loans and cards set against them. It works out your net worth as savings plus those holdings less what is owed, and for anything you give an end date it prices what selling or maturing actually leaves you — the §121 exclusion on a home you have lived in, depreciation recaptured at up to 25% on a rental, §1202 on qualifying small business stock, the 3.8% net investment income tax, your state, and the gain charged against the income the plan itself shows for that year rather than a flat rate somebody typed. What it does not do is feed any of that back: the money a sale releases does not appear in the projection, the rent does not reduce what savings must cover, and the upkeep is not charged. The two halves are joined deliberately slowly, because a figure that quietly moved your retirement date would be worse than one that plainly does not. Passive loss rules, 1031 exchanges and instalment sales are not modelled either, so a sale spread over several years would cost less than shown. One press of Save keeps both tabs together, and each plan carries its own — keeping the rental and selling it are two plans rather than one plan edited twice.',
  },
  {
    q: 'Can I include a pension?',
    a: 'Yes. Pension retirement planning works the same way as the rest: enter the monthly amount, the age it starts, and its cost-of-living adjustment if it has one — many public pensions do and most private ones do not, which matters more over thirty years than the starting figure does. The pension reduces what has to come out of savings each year and is taxed as ordinary income, which also affects how much of your Social Security becomes taxable.',
  },
  {
    q: 'Does it account for inflation?',
    a: 'Throughout, and it shows the results in today’s dollars so the figures mean something. Spending is held level in real terms, which means it rises in the dollars of the day; Social Security drifts by the gap between its cost-of-living adjustment and your inflation rate. Tax brackets and the standard deduction are the published figures for as long as those exist, and beyond them are carried forward at an assumed rate — the page names the year it is using and says when that year is an estimate rather than a published table. One thing is deliberately not held level: Medicare premiums are grown faster than prices, because they have outrun inflation for most of the past decade, so a lifetime surcharge on a long plan is larger in today’s money than today’s rates would suggest. The insight that reports it says by how much. Where a figure is shown in the dollars of a future year rather than today’s, the page says so.',
  },
  {
    q: 'Can I compare different retirement plans?',
    a: 'Yes. Save as many as you like — retiring at 62 against 67, spending $5,000 a month against $7,000, claiming Social Security early against late — then tick two or more on My plans and they line up in columns: confidence, the pot at retirement, how long the money lasts, and the lifetime tax bill. Rows where one plan clearly wins are marked; rows where "better" is a matter of judgement are left as information.',
  },
  {
    q: 'Is my financial information private?',
    a: 'Your plans are stored against your account and served only to you. The planner itself runs entirely in your browser — the projection and the simulations are computed on your own device, not sent anywhere — so you can model a whole retirement without saving anything or creating an account at all. What is recorded is anonymous and deliberately thin: that a page was opened, that a projection was run, roughly which country from — never a figure you typed, and tied to a random id that lasts one browser session and cannot follow you across days or sites. That is why there is no cookie banner: there is no cookie.',
  },
  {
    q: 'Is this financial advice?',
    a: 'No. Fairwater is a modelling tool for thinking about your own numbers, and every projection is only as good as the assumptions you give it. It cannot know your health, your job security, your family, or what markets will do. Use it to understand the shape of the decisions in front of you, and talk to a qualified adviser before acting on any of them.',
  },
]
