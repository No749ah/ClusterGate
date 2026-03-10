import { Badge } from '@/components/ui/badge'
import { RouteStatus } from '@/types'

interface RouteStatusBadgeProps {
  status: RouteStatus
  isActive: boolean
}

export function RouteStatusBadge({ status, isActive }: RouteStatusBadgeProps) {
  if (!isActive) {
    return <Badge variant="secondary">Inactive</Badge>
  }
  if (status === 'PUBLISHED') {
    return <Badge variant="success">Published</Badge>
  }
  return <Badge variant="warning">Draft</Badge>
}
