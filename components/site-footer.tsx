import Link from 'next/link'

export function SiteFooter() {
  // Rendered on the server each request, so the notice never goes stale the
  // way a year typed into the file would on 1 January.
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-x-6 gap-y-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        {/* One block, wrapping where it needs to. A rule between the lines
            drew a border around a footer that is already inside one. */}
        <div className="flex flex-col gap-1">
          <p className="text-foreground/70">
            Harborlight — Retirement planning tools
          </p>
          <p className="text-xs text-muted-foreground/80 text-pretty">
            © {year} Harborlight. For educational purposes, not financial
            advice.
          </p>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/planner" className="transition-colors hover:text-foreground">
            Retirement calculator
          </Link>
          {/* Linked from every page that has a footer: an answers page nothing
              points at is one nothing finds. */}
          <Link href="/faq" className="transition-colors hover:text-foreground">
            FAQ
          </Link>
        </nav>
      </div>
    </footer>
  )
}
