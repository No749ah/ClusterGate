'use client'

import { use } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useRoute, useUpdateRoute } from '@/hooks/useRoutes'
import { RouteForm } from '@/components/routes/RouteForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { RouteFormData } from '@/types'
import { resolveRouteLookupKey, routeUrl } from '@/lib/urls'

export default function EditRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: pathId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const lookupKey = resolveRouteLookupKey(pathId, searchParams.get('id'))
  const { data: routeData, isLoading } = useRoute(lookupKey)
  const id = routeData?.data?.id ?? lookupKey
  const updateRoute = useUpdateRoute(id)

  const handleSubmit = async (data: RouteFormData) => {
    const res: any = await updateRoute.mutateAsync(data)
    if (res.changeRequest) {
      router.push('/change-requests')
    } else if (routeData?.data) {
      router.push(routeUrl(routeData.data as any))
    } else {
      router.push(`/routes/${id}`)
    }
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Button variant="outline" size="sm" asChild className="gap-2 rounded-full pl-2.5">
          <Link href={routeData?.data ? routeUrl(routeData.data as any) : `/routes/${pathId}`}>
            <ArrowLeft className="w-4 h-4" />
            Back to route
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
