import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'

export function usePathTemplates() {
  return useQuery({
    queryKey: ['pathTemplates'],
    queryFn: () => api.pathTemplates.list(),
    staleTime: 60 * 1000,
  })
}

export function useCreatePathTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; paths: string[]; organizationId?: string | null }) =>
      api.pathTemplates.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pathTemplates'] })
      toast.success('Template saved')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to save template'),
  })
}

export function useDeletePathTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.pathTemplates.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pathTemplates'] })
      toast.success('Template deleted')
    },
    onError: (err: any) => toast.error(err.message || 'Failed to delete template'),
  })
}
