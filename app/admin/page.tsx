import { PlanLookup } from './plan-lookup'
import { FeedbackRange } from './feedback-range'
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
      <Usage />
      <PlanLookup />
      <FeedbackRange />
    </>
  )
}
