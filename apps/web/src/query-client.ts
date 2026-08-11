import { isCancelledError, QueryClient } from "@tanstack/react-query";

export function shouldRetryQuery(count: number, error: unknown): boolean {
  if (isCancelledError(error) || (error instanceof Error && error.name === "AbortError")) return false;
  const status = error && typeof error === "object" && "status" in error
    ? error.status
    : undefined;
  if (status === 429 || status === 504) return false;
  return count < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: shouldRetryQuery,
      refetchOnWindowFocus: false,
    },
  },
});
