import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CreateOrrnnDemoAccountRequest,
  OrrnnDemoAccountResponse,
  getOrrnnDemoStatus,
  getOrrnnDemoGroups,
  createOrrnnDemoAccount,
  OrrnnDemoApiError,
  OrrnnDemoGroupsResponse,
  OrrnnDemoStatusResponse,
} from '../api/publicDemo';

export const ORRNN_DEMO_STATUS_KEY = 'orrnnDemoStatus';
export const ORRNN_DEMO_GROUPS_KEY = 'orrnnDemoGroups';

function shouldRetryDemoStatus(failureCount: number, error: Error): boolean {
  if (failureCount >= 2) return false;

  if (error instanceof OrrnnDemoApiError) {
    return error.statusCode === 0 || error.statusCode >= 500 || error.statusCode === 429;
  }

  return true;
}

export function useOrrnnDemoStatus(enabled = true) {
  return useQuery<OrrnnDemoStatusResponse, Error>({
    queryKey: [ORRNN_DEMO_STATUS_KEY],
    queryFn: getOrrnnDemoStatus,
    enabled,
    staleTime: 15 * 1000,
    refetchInterval: enabled ? 30 * 1000 : false,
    retry: shouldRetryDemoStatus,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

export function useOrrnnDemoGroups(enabled?: boolean) {
  const isEnabled = enabled ?? true;
  return useQuery<OrrnnDemoGroupsResponse, Error>({
    queryKey: [ORRNN_DEMO_GROUPS_KEY],
    queryFn: getOrrnnDemoGroups,
    enabled: isEnabled,
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryDemoStatus,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

export function useCreateOrrnnDemoAccount() {
  return useMutation<OrrnnDemoAccountResponse, Error, CreateOrrnnDemoAccountRequest>({
    mutationFn: createOrrnnDemoAccount,
    retry: false,
  });
}
