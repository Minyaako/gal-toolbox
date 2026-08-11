import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: (count, error) => count < 2 && !("status" in error && error.status === 429),
      refetchOnWindowFocus: false,
    },
  },
});
