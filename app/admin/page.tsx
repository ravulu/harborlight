import { isLocal } from '@/lib/persistence'
import { PlanLookup } from './plan-lookup'
import { FeedbackRange } from './feedback-range'
import { StaleTables } from './stale-tables'
import { Usage } from './usage'

export default function AdminPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Support tools
        </h1>
        <p className="text-sm text-muted-foreground">
          See where visits get to, look up an account&apos;s plans, and read
          what people have sent in.
        </p>
      </div>
      {/* First, and above the numbers: if the tables are stale, every figure
          below is being worked out from last year's law. Renders nothing while
          they are current. */}
      <StaleTables />
      <Usage />
      {/* Gated, not deleted. There are no stored plans to look up in local
          mode, and "nothing to read" is not a guard — it is an empty result
          that becomes a full one the day somebody flips the mode. The actions
          behind this refuse it too; this only stops offering it. */}
      {!isLocal && <PlanLookup />}
      <FeedbackRange />
    </>
  )
}
