import type { Metadata, Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

export const metadata: Metadata = {
  title: 'SmallBizzWizz — AI Business Advisor for Small Business Owners',
  description: 'Get instant advice on pricing, contracts, clients, and hiring. SmallBizzWizz gives small business owners and freelancers direct, plain-English answers from an AI business advisor. Try free for 7 days.',
  keywords: [
    'AI business advisor',
    'small business advice',
    'contract review tool',
    'pricing advice for freelancers',
    'business advisor app',
    'AI contract review',
    'small business consulting',
    'freelancer business advice',
    'how to handle clients',
    'small business hiring advice',
  ],
  authors: [{ name: 'SmallBizzWizz' }],
  creator: 'SmallBizzWizz',
  metadataBase: new URL('https://smallbizzwizz.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: 'https://smallbizzwizz.com',
    siteName: 'SmallBizzWizz',
    title: 'SmallBizzWizz — AI Business Advisor for Small Business Owners',
    description: 'Direct, plain-English answers on pricing, contracts, clients, and hiring. No hedging. No jargon. Try free for 7 days.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'SmallBizzWizz — AI Business Advisor' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SmallBizzWizz — AI Business Advisor for Small Business Owners',
    description: 'Direct, plain-English answers on pricing, contracts, clients, and hiring. Try free for 7 days.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#c8410a',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en">
        <body suppressHydrationWarning>{children}</body>
      </html>
    </ClerkProvider>
  )
}