import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CreateUserInput, UpdateUserInput } from '@kiotviet-lite/shared'

import { createUserApi, listUsersApi, lockUserApi, unlockUserApi, updateUserApi } from './users-api'

const USERS_KEY = ['users'] as const

export function useUsersQuery() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: async () => (await listUsersApi()).data,
  })
}

export function useCreateUserMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserInput) => createUserApi(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

export function useUpdateUserMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateUserInput }) =>
      updateUserApi(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

export function useLockUserMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => lockUserApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}

export function useUnlockUserMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => unlockUserApi(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY })
    },
  })
}
