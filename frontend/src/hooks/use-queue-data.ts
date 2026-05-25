import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  api,
  WS_URL,
  type RegisterPayload,
  type RegisterMultiPayload,
} from "@/lib/api";

const STALE = 10_000;

export const useDashboard = () =>
  useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard, staleTime: STALE });

export const useCounters = () =>
  useQuery({ queryKey: ["counters"], queryFn: api.counters, staleTime: STALE });

export const useServiceTypes = () =>
  useQuery({
    queryKey: ["service-types"],
    queryFn: api.serviceTypes,
    staleTime: 60_000,
  });

export const useTokens = (status?: "WAITING" | "IN_PROGRESS" | "COMPLETED") =>
  useQuery({
    queryKey: ["tokens", status ?? "active"],
    queryFn: () => api.tokens(status),
    staleTime: STALE,
  });

export const useHealth = () =>
  useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });

// Registers a new patient and refreshes the live queue views on success.
export function useRegisterPatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterPayload) => api.register(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["counters"] });
      qc.invalidateQueries({ queryKey: ["tokens"] });
    },
  });
}

// Registers a patient against multiple services/tests in one call.
export function useRegisterMulti() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterMultiPayload) => api.registerMulti(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["counters"] });
      qc.invalidateQueries({ queryKey: ["tokens"] });
    },
  });
}

export function useQueueMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["counters"] });
    qc.invalidateQueries({ queryKey: ["tokens"] });
  };
  return {
    callNext: useMutation({
      mutationFn: (counterId: number) => api.callNext(counterId),
      onSuccess: refresh,
    }),
    complete: useMutation({
      mutationFn: (tokenNumber: string) => api.complete(tokenNumber),
      onSuccess: refresh,
    }),
    noShow: useMutation({
      mutationFn: (tokenNumber: string) => api.noShow(tokenNumber),
      onSuccess: refresh,
    }),
    setCounterActive: useMutation({
      mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
        api.setCounterActive(id, isActive),
      onSuccess: refresh,
    }),
  };
}

// Subscribes to the Django Channels group "queue_updates" and invalidates the
// queue-data queries whenever the backend emits a tick. Reconnects with
// exponential backoff up to 30s.
export function useQueueLiveUpdates() {
  const qc = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(WS_URL);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
      };
      ws.onmessage = () => {
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        qc.invalidateQueries({ queryKey: ["counters"] });
        qc.invalidateQueries({ queryKey: ["tokens"] });
      };
      ws.onclose = scheduleReconnect;
      ws.onerror = () => ws.close();
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      const delay = Math.min(30_000, 500 * 2 ** attempt++);
      timer = setTimeout(connect, delay);
    };

    connect();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [qc]);
}
