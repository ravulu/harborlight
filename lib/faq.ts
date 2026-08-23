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

export const FAQ: Qa[] = [
  {
    q: 'When can I retire?',
    a: 'Enter your age, your balances, what you put away each month and the spending you want in retirement. Harborlight projects the years ahead and reports the share of simulated market outcomes in which the money lasts. Move the retirement age until that share is one you are comfortable with — most people settle somewhere between 85% and 95% rather than chasing 100%, which usually means underspending a whole life to insure against a future that did not happen.',
  },
  {
    q: 'How long will my money last in retirement?',
    a: 'The projection runs year by year from today to the end of your plan. Each year it adds growth and any contributions, subtracts what you spend, adds Social Security and any pension, and takes the shortfall out of savings along with the tax on that withdrawal. It reports either the age the money runs out or that it lasts through the whole plan — and because markets are not a straight line, it does this across thousands of different sequences of returns rather than one average.',
  },
  {
    q: 'Is Harborlight a free retirement calculator?',
    a: 'Yes. The planner is free and works without an account. An account exists only so you can save plans, compare them side by side, and come back to them later. There is nothing to install and no card.',
  },
  {
    q: 'What is a Monte Carlo retirement simulation, and why use one?',
    a: 'A single average return hides the thing that decides most retirements: the order the good and bad years arrive in. Two retirements with identical average returns end very differently if one begins with a crash. Harborlight runs 10,000 simulated futures, each with its own random sequence of returns drawn from the return and volatility you set, and reports how many of them your plan survived. That percentage is the confidence figure — the share of runs whose money lasted, not a guarantee about yours.',
  },
  {
    q: 'What is a safe withdrawal rate, and does the 4% rule apply to me?',
    a: 'The 4% rule came from historical US data and says a portfolio can support withdrawals of about 4% of its starting value, rising with inflation, for thirty years. It is a rule of thumb, not a law: it assumes a particular mix of stocks and bonds, a thirty-year retirement, and history repeating. Harborlight shows your own withdrawal rate against your own projected pot, and because it simulates rather than assumes, a plan that would fail at 4% and one that would survive at 5% both show up as what they are.',
  },
  {
    q: 'How are 401(k) and IRA withdrawals taxed in the projection?',
    a: 'By the account they come from, not by a flat rate. A dollar from a brokerage account is taxed only on its gain, at capital-gains rates. A dollar from a 401(k) or traditional IRA is ordinary income in full. A dollar from a Roth is not taxed at all. The planner spends the taxable account first, then the tax-deferred accounts, then the Roth, and works out federal tax on 2026 brackets, capital-gains tax stacked on top of ordinary income, and state tax for the state you choose. One thing it does not do is charge the 10% penalty on tax-deferred withdrawals before 59½ — it names those years and tells you they really cost more than the rate shown.',
  },
  {
    q: 'When should I claim Social Security?',
    a: 'A Social Security claiming strategy is worth more than most people expect: claiming at 62 pays about 70% of your full benefit for life, while waiting until 70 pays about 124%. Harborlight compares the claiming ages and shows what each does to your lifetime income and to your tax bill, which are not the same question — a larger benefit drags more of itself into tax. Couples are handled properly: spousal benefits, deemed filing, and two people claiming on different dates, which splits the retirement into a stretch with one payment and a stretch with both.',
  },
  {
    q: 'How much of my Social Security will be taxed?',
    a: 'Up to 85% of it counts as ordinary income federally. Which part depends on provisional income — your other income plus half the benefit — measured against a $25,000 floor and a $34,000 ceiling for single filers, or $32,000 and $44,000 filing jointly. Those thresholds were fixed in 1983 and 1993 and have never been indexed to inflation, so more of the benefit becomes taxable as the years pass. The planner works this out for every year rather than applying one rate.',
  },
  {
    q: 'Should I do a Roth conversion, and when?',
    a: 'The window worth looking at is usually between retiring and claiming Social Security: the paychecks have stopped, the benefit has not started, and the lower tax brackets are sitting empty. Converting then fills those brackets at a known rate instead of leaving the money to be drawn later on top of a benefit, or forced out by required distributions. Harborlight names that stretch, shows the rate you would pay in it, and flags conversions in its insights when the shape of your plan suggests they are worth modelling.',
  },
  {
    q: 'What are required minimum distributions, and when do they start?',
    a: 'From a certain age the IRS requires you to withdraw a minimum amount from tax-deferred accounts each year whether you need it or not, and to pay ordinary income tax on it. Under SECURE 2.0 that age is 73 if you were born between 1951 and 1959, and 75 if you were born in 1960 or later. If your tax-deferred balance is large, the required amount can exceed what you planned to spend — pushing you into a higher bracket in your seventies. A required minimum distribution calculator is built in: the planner works out your age under the current rules, projects the amount that will be forced out, and flags it when the balance makes this likely.',
  },
  {
    q: 'Can I include a pension?',
    a: 'Yes. Pension retirement planning works the same way as the rest: enter the monthly amount, the age it starts, and its cost-of-living adjustment if it has one — many public pensions do and most private ones do not, which matters more over thirty years than the starting figure does. The pension reduces what has to come out of savings each year and is taxed as ordinary income, which also affects how much of your Social Security becomes taxable.',
  },
  {
    q: 'Does it account for inflation?',
    a: 'Throughout, and it shows the results in today’s dollars so the figures mean something. Spending is held level in real terms, which means it rises in the dollars of the day; tax brackets and the standard deduction are indexed as they are in law; Social Security drifts by the gap between its cost-of-living adjustment and your inflation rate. Where a figure is shown in the dollars of a future year rather than today’s, the page says so.',
  },
  {
    q: 'Can I compare different retirement plans?',
    a: 'Yes. Save as many as you like — retiring at 62 against 67, spending $5,000 a month against $7,000, claiming Social Security early against late — then tick two or more on My plans and they line up in columns: confidence, the pot at retirement, how long the money lasts, and the lifetime tax bill. Rows where one plan clearly wins are marked; rows where "better" is a matter of judgement are left as information.',
  },
  {
    q: 'Is my financial information private?',
    a: 'Your plans are stored against your account and served only to you. The planner itself runs entirely in your browser — the projection and the simulations are computed on your own device, not sent anywhere — so you can model a whole retirement without saving anything or creating an account at all.',
  },
  {
    q: 'Is this financial advice?',
    a: 'No. Harborlight is a modelling tool for thinking about your own numbers, and every projection is only as good as the assumptions you give it. It cannot know your health, your job security, your family, or what markets will do. Use it to understand the shape of the decisions in front of you, and talk to a qualified adviser before acting on any of them.',
  },
]
