import { useEffect, useRef, useState } from "react";
import {
  EMPTY_SEARCH_RESULTS,
  fetchSearchResults,
  type SearchResults,
} from "@/lib/searchApi";

export function useSearchQuery(
  query: string,
  limit = 5,
  debounceMs = 120
) {
  const [results, setResults] = useState<SearchResults>(EMPTY_SEARCH_RESULTS);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      abortRef.current?.abort();
      setResults(EMPTY_SEARCH_RESULTS);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const requestId = ++requestIdRef.current;

      try {
        const data = await fetchSearchResults(trimmed, limit, controller.signal);
        if (requestId !== requestIdRef.current) return;
        setResults(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (requestId !== requestIdRef.current) return;
        setResults({ ...EMPTY_SEARCH_RESULTS, query: trimmed });
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [query, limit, debounceMs]);

  const trimmed = query.trim();
  const isReady = !trimmed || results.query === trimmed;

  return { results, isReady };
}
