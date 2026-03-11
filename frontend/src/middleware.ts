import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const token = request.cookies.get('cg_session')?.value
  const pathname = request.nextUrl.pathname

  // Protect dashboard routes
  if (pathname.startsWith('/dashboard') ||
      pathname.startsWith('/routes') ||
      pathname.startsWith('/activity') ||
      pathname.startsWith('/users') ||
      pathname.startsWith('/settings') ||
      pathname.startsWith('/audit') ||
      pathname.startsWith('/analytics') ||
      pathname.startsWith('/backups')) {
    if (!token) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Redirect authenticated users away from login
  if (pathname === '/login' && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
