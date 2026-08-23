import { PlanLookup } from './plan-lookup'
import { FeedbackRange } from './feedback-range'

export default function AdminPage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Support tools
        </h1>
        <p className="text-sm text-muted-foreground">
          Look up an account&apos;s plans, and read what people have sent in.
        </p>
      </div>
      <PlanLookup />
      <FeedbackRange />
    </>
  )
}
