import { useCallback, useEffect, useRef, useState } from "react";

interface Loaded<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (d: T) => void;
}

/**
 * Load data once (and on `reload`). If `pollWhile` returns true for the loaded data,
 * refetch every `intervalMs` until it returns false — used for background match/tailoring jobs.
 */
export function useLoad<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  pollWhile?: (d: T) => boolean,
  intervalMs = 1500,
): Loaded<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const pollRef = useRef(pollWhile);
  pollRef.current = pollWhile;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetch = useCallback(fetcher, deps);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        const d = await fetch();
        if (cancelled) return;
        setData(d);
        setError(null);
        setLoading(false);
        if (pollRef.current?.(d)) timer = setTimeout(run, intervalMs);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetch, tick, intervalMs]);

  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}

export const isRunning = (d: { status: string }) => d.status === "pending" || d.status === "running";
