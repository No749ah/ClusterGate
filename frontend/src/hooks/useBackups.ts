import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useBackups() {
  return useQuery({
    queryKey: ['backups'],
    queryFn: () => api.backups.list(),
    staleTime: 30 * 1000,
  })
}

export function useCreateBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (options?: { tags?: string[]; note?: string }) => api.backups.create(options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })
}

export function useRestoreBackup() {
  return useMutation({
    mutationFn: (filename: string) => api.backups.restore(filename),
  })
}

export function useDeleteBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filename: string) => api.backups.delete(filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
    },
  })
}
