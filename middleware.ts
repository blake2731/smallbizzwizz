import { NextResponse } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
    '/',
    '/scan(.*)',
    '/proof(.*)',
    '/methodology(.*)',
    '/sample(.*)',
    '/validation(.*)',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/subscribe(.*)',
    '/audit/report(.*)',
    '/api/revenue-audit(.*)',
    '/api/webhook(.*)',
    '/api/healthcheck(.*)',
    '/api/control-plane-health(.*)',
    '/sitemap.xml',
    '/robots.txt',
    '/opengraph-image(.*)',
    '/icon(.*)',
    '/apple-icon(.*)',
])

// Skip common internet background-radiation probes before Clerk does any work.
const BOT_NOISE_PATH = /^\/(?:wp-admin(?:\/.*)?|wp-content(?:\/.*)?|wp-includes(?:\/.*)?|wp-login\.php|xmlrpc\.php|phpmyadmin(?:\/.*)?|pma(?:\/.*)?|cgi-bin(?:\/.*)?|server-status|HNAP1|boaform(?:\/.*)?)(?:$|\/)/i
const DOTFILE_PATH = /(?:^|\/)\.(?!well-known(?:\/|$))[^/]+/i
const NON_APP_FILE_PATH = /\/[^/]+\.(?:php\d*|asp|aspx|jsp|cgi|pl|py|rb|env|bak|old|sql|ya?ml|toml|ini|log|conf)(?:$|\/)/i

export default clerkMiddleware(async (auth, request) => {
    const { pathname } = request.nextUrl

    if (
        BOT_NOISE_PATH.test(pathname) ||
        DOTFILE_PATH.test(pathname) ||
        NON_APP_FILE_PATH.test(pathname)
    ) {
        return NextResponse.next()
    }

    if (!isPublicRoute(request)) {
        await auth.protect()
    }
})

export const config = {
    matcher: [
        '/((?!_next|wp-admin(?:/.*)?|wp-content(?:/.*)?|wp-includes(?:/.*)?|wp-login\\.php|xmlrpc\\.php|phpmyadmin(?:/.*)?|pma(?:/.*)?|cgi-bin(?:/.*)?|server-status|HNAP1|boaform(?:/.*)?|(?:[^?]*/)?\\.(?!well-known(?:/|$))|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt|map|php\\d*|asp|aspx|jsp|cgi|pl|py|rb|env|bak|old|sql|ya?ml|toml|ini|log|conf)).*)',
        '/(api|trpc)(.*)',
    ],
}
