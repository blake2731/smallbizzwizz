import type { Metadata, Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import Script from 'next/script'
import './globals.css'

const GA_MEASUREMENT_ID = 'G-MEE10S53ZR'

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
  icons: {
    icon: [
      { url: '/icon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icon-64x64.png', sizes: '64x64', type: 'image/png' },
      { url: '/icon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
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
        <head>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `}
          </Script>
        </head>
        <body suppressHydrationWarning>{children}</body>
      </html>
    </ClerkProvider>
  )
}