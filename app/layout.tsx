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
    default: 'Harborlight — Retirement Calculator & Planning',
    template: `%s — ${SITE.name}`,
  },
  description:
    'Free retirement calculator. Project your savings, model your spending, and see how long your money lasts — with taxes, Social Security and inflation included.',
  keywords: KEYWORDS_UNIQUE,
  applicationName: SITE.name,
  authors: [{ name: SITE.publisher }],
  creator: SITE.publisher,
  publisher: SITE.publisher,
  alternates: { canonical: '/' },
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
    title: 'Harborlight — Retirement Calculator & Planning',
    description:
      'Project your savings, model your spending, and see how long your money lasts.',
    images: [{ url: '/hero-coast.png', width: 1200, height: 630, alt: 'Harborlight retirement planner' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Harborlight — Retirement Calculator & Planning',
    description:
      'Project your savings, model your spending, and see how long your money lasts.',
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
