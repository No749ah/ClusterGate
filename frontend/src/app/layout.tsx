'use client'

import { Inter } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'
import { useState } from 'react'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

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
      </head>
      <body className={inter.className}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem={false}
            disableTransitionOnChange
          >
            {children}
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
