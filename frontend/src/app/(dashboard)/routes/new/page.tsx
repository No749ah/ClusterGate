'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RouteForm } from '@/components/routes/RouteForm'
import { useCreateRoute } from '@/hooks/useRoutes'
import { RouteFormData } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function NewRoutePage() {
  const router = useRouter()
  const createRoute = useCreateRoute()

  const handleSubmit = async (data: RouteFormData) => {
    const route = await createRoute.mutateAsync(data)
    router.push(`/routes/${route.data.id}`)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/routes">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Routes
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create New Route</CardTitle>
          <CardDescription>
            Configure a new public route that forwards requests to an internal Kubernetes service.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RouteForm
            onSubmit={handleSubmit}
            isSubmitting={createRoute.isPending}
            submitLabel="Create Route"
          />
        </CardContent>
      </Card>
    </div>
  )
}
