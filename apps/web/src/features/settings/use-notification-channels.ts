import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateNotificationChannelInput,
  UpdateNotificationChannelInput,
} from '@kiotviet-lite/shared'

import { useAuthStore } from '@/stores/use-auth-store'

import {
  createNotificationChannelApi,
  deleteNotificationChannelApi,
  listNotificationChannelsApi,
  testNotificationChannelApi,
  updateNotificationChannelApi,
} from './notification-channels-api'

const CHANNELS_KEY = ['notification-channels'] as const

export function useNotificationChannelsQuery() {
  const storeId = useAuthStore((state) => state.user?.storeId)
  return useQuery({
    queryKey: [...CHANNELS_KEY, storeId],
    queryFn: async () => (await listNotificationChannelsApi()).data,
    enabled: !!storeId,
  })
}

function useInvalidateChannels() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: CHANNELS_KEY })
}

export function useCreateNotificationChannelMutation() {
  const invalidate = useInvalidateChannels()
  return useMutation({
    mutationFn: (input: CreateNotificationChannelInput) => createNotificationChannelApi(input),
    onSuccess: invalidate,
  })
}

export function useUpdateNotificationChannelMutation() {
  const invalidate = useInvalidateChannels()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateNotificationChannelInput }) =>
      updateNotificationChannelApi(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteNotificationChannelMutation() {
  const invalidate = useInvalidateChannels()
  return useMutation({
    mutationFn: (id: string) => deleteNotificationChannelApi(id),
    onSuccess: invalidate,
  })
}

export function useTestNotificationChannelMutation() {
  return useMutation({
    mutationFn: async (id: string) => (await testNotificationChannelApi(id)).data,
  })
}
