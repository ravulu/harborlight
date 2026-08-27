import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { SessionGuard } from '@/components/session-guard'
import { UsageTracker } from '@/components/usage-tracker'
import { Fraunces, Geist } from 'next/font/google'
import './globals.css'
import { cn } from "@/lib/utils";
import { SITE, KEYWORDS_UNIQUE } from '@/lib/seo'

const geist = Geist({subsets:['latin'],variable:'--font-sans'});
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' })

export const metadata: Metadata = {
  // Every relative URL below — canonicals, share images, the sitemap — is
  // resolved against this. Without it Next emits paths a crawler cannot follow.
  metadataBase: new URL(SITE.url),
  title: {
    // A page sets its own; anything that does not gets the default.
    default: 'Fairwater — Retirement Calculator & Planning',
    template: `%s — ${SITE.name}`,
  },
  description:
    'Free retirement calculator. Project your savings, see how long your money lasts, and find the decisions still open to you — taxes and Social Security included.',
  keywords: KEYWORDS_UNIQUE,
  applicationName: SITE.name,
  authors: [{ name: SITE.publisher }],
  creator: SITE.publisher,
  publisher: SITE.publisher,
  alternates: { canonical: '/' },
  /**
   * The mark on its tile, not on nothing.
   *
   * `icon` is the SVG, which every current browser prefers and which stays
   * sharp at any size. `shortcut` points at the .ico for older ones, and
   * `apple` at the PNG Safari insists on — it will not take an SVG for a home
   * screen, and without it iOS screenshots the page instead.
   *
   * The SVG carries baked colours rather than `currentColor`: an icon file has
   * nothing to inherit from, so `currentColor` would resolve to black.
   */
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    locale: SITE.locale,
    url: SITE.url,
    title: 'Fairwater — Retirement Calculator & Planning',
    description:
      'Project your savings, see how long your money lasts, and find the decisions still open to you.',
    images: [{ url: '/hero-coast.png', width: 1200, height: 630, alt: 'Fairwater retirement planner' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fairwater — Retirement Calculator & Planning',
    description:
      'Project your savings, see how long your money lasts, and find the decisions still open to you.',
    images: ['/hero-coast.png'],
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <html lang="en" className={cn("bg-background", geist.variable, fraunces.variable, "font-sans")}>
      <body className="antialiased font-sans">
        {/* Renders nothing; ends a session whose browser has already closed. */}
        <SessionGuard isAuthed={!!session?.user} />
        <UsageTracker />
        {children}
      </body>
    </html>
  )
}
