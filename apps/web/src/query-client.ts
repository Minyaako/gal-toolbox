import { isCancelledError, QueryClient } from "@tanstack/react-query";

export function shouldRetryQuery(count: number, error: unknown): boolean {
  if (isCancelledError(error) || (error instanceof Error && error.name === "AbortError")) return false;
  return count < 2 && !(error && typeof error === "object" && "status" in error && error.status === 429);
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
