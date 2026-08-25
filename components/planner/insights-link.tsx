/**
 * A link to the insights card, and the id it points at.
 *
 * Both live here so they cannot drift: an anchor whose target has been renamed
 * fails silently — the click does nothing and the reader concludes the section
 * does not exist — and that is exactly the failure this link was added to fix.
 *
 * A plain `href` rather than a scripted scroll. The card is on the same page,
 * so the browser already knows how to reach it, honours the reader's
 * reduced-motion setting on the way, and leaves the link openable in a new tab
 * and reachable from the keyboard. None of that is free when it is an onClick.
 */
export const INSIGHTS_ID = 'worth-looking-at'

export function InsightsLink() {
  return (
    <a
      href={`#${INSIGHTS_ID}`}
      className="font-medium text-foreground underline decoration-dotted underline-offset-2 transition-colors hover:decoration-solid hover:text-primary"
    >
      Worth looking at
    </a>
  )
}
