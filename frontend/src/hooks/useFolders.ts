import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: () => api.folders.list(),
    staleTime: 30 * 1000,
  })
}

// Folder membership changes what routes a folder-bound key covers, so every
// mutation refreshes routes, folders and key lists together.
function useFolderMutation<TVars>(fn: (vars: TVars) => Promise<unknown>, success: string, failure: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['routes'] })
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] })
      if (success) toast.success(success)
    },
    onError: (err: any) => {
      toast.error(err.message || failure)
    },
  })
}

export function useCreateFolder() {
  return useFolderMutation(
    (data: { name: string; organizationId?: string | null }) => api.folders.create(data),
    'Folder created',
    'Failed to create folder'
  )
}

export function useUpdateFolder() {
  return useFolderMutation(
    ({ id, ...data }: { id: string; name?: string; sortOrder?: number }) => api.folders.update(id, data),
    'Folder updated',
    'Failed to update folder'
  )
}

export function useDeleteFolder() {
  return useFolderMutation((id: string) => api.folders.delete(id), 'Folder deleted', 'Failed to delete folder')
}

export function useAssignRoutesToFolder() {
  return useFolderMutation(
    ({ folderId, routeIds }: { folderId: string; routeIds: string[] }) => api.folders.assignRoutes(folderId, routeIds),
    '',
    'Failed to move routes'
  )
}

export function useRemoveRouteFromFolder() {
  return useFolderMutation(
    ({ folderId, routeId }: { folderId: string; routeId: string }) => api.folders.removeRoute(folderId, routeId),
    '',
    'Failed to remove route from folder'
  )
}
