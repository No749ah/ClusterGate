'use client'

import localFont from 'next/font/local'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog'
import { useState } from 'react'
import './globals.css'

const inter = localFont({
  src: '../../public/fonts/InterVariable.woff2',
  variable: '--font-inter',
  display: 'swap',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error: any) => {
              if (error?.status === 401 || error?.status === 403) return false
              return failureCount < 2
            },
          },
        },
      })
  )

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <title>ClusterGate — Kubernetes Routing Gateway</title>
        <meta name="description" content="Manage and expose internal Kubernetes services over public domains" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/logo.svg" />
      </head>
      <body className={inter.className}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            <ConfirmDialogProvider>
              {children}
            </ConfirmDialogProvider>
            <Toaster richColors position="top-right" closeButton />
            {process.env.NODE_ENV === 'development' && (
              <ReactQueryDevtools initialIsOpen={false} />
            )}
          </ThemeProvider>
        </QueryClientProvider>
      </body>
    </html>
  )
}
