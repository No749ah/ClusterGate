'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useRoute, useUpdateRoute } from '@/hooks/useRoutes'
import { RouteForm } from '@/components/routes/RouteForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteFormData } from '@/types'

export default function EditRoutePage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const { data: routeData, isLoading } = useRoute(id)
  const updateRoute = useUpdateRoute(id)

  const handleSubmit = async (data: RouteFormData) => {
    await updateRoute.mutateAsync(data)
    router.push(`/routes/${id}`)
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const route = routeData?.data

  if (!route) {
    return (
      <div className="text-center py-24">
        <p className="text-lg font-medium">Route not found</p>
        <Button className="mt-4" asChild><Link href="/routes">Back to Routes</Link></Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/routes/${id}`}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Route: {route.name}</CardTitle>
          <CardDescription>Update the routing configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <RouteForm
            defaultValues={{ ...route, description: route.description ?? undefined, authValue: route.authValue ?? undefined, webhookSecret: route.webhookSecret ?? undefined, maintenanceMessage: route.maintenanceMessage ?? undefined }}
            onSubmit={handleSubmit}
            isSubmitting={updateRoute.isPending}
            submitLabel="Save Changes"
            editRouteId={id}
          />
        </CardContent>
      </Card>
    </div>
  )
}
