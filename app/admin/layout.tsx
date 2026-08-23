import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/lib/admin'
import { ShieldCheck } from 'lucide-react'

// Never indexed, never followed. The gate is what protects this, but a page
// that is not meant to be found should not also be advertising itself.
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false, nocache: true },
}

// Always checked against the live session rather than served from a cache.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await requireAdmin()

  return (
    <div className="min-h-svh bg-muted/30">
      {/* Its own header, not the app's: nothing here should link back into
          the product chrome, and nothing there should link to this. */}
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
              <ShieldCheck className="size-4" />
            </span>
            <span className="font-serif text-base font-medium text-foreground">
              Harborlight admin
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{admin.email}</span>
            <Link href="/" className="transition-colors hover:text-foreground">
              Leave admin
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  )
}
