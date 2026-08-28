import type { Metadata, Viewport } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import Script from 'next/script'
import './globals.css'

const GA_MEASUREMENT_ID = 'G-MEE10S53ZR'

export const metadata: Metadata = {
  title: 'SmallBizzWizz — Website Capture Scanner for Local Service Businesses',
  description: 'Check public website conversion paths for observable friction around calls, service requests, bookings, trust, and measurement. Free first pass, no signup required.',
  keywords: [
    'website conversion audit',
    'home services lead conversion',
    'local service website audit',
    'lead capture audit',
    'HVAC website conversion',
    'plumbing website audit',
    'contractor lead conversion',
    'website capture scanner',
    'local business conversion optimization',
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
    title: 'SmallBizzWizz — Check the Path From Visit to Lead',
    description: 'Free public-source website capture scan for HVAC, plumbing, electrical, roofing, restoration, landscaping, and other local service businesses.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'SmallBizzWizz Website Capture Scanner' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SmallBizzWizz — Website Capture Scanner',
    description: 'Find observable website friction around calls, service requests, bookings, trust, and measurement.',
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
  themeColor: '#07110f',
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
