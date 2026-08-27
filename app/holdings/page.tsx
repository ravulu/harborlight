import { redirect } from 'next/navigation'

/**
 * The register moved in with the plan.
 *
 * They were two pages, which made a household look like two unrelated things.
 * The link is kept because it was in the navigation and may be bookmarked;
 * sending people to the plan puts them one tab away from where they meant to
 * be, which beats a dead URL.
 */
export default function HoldingsPage() {
  redirect('/planner')
}
