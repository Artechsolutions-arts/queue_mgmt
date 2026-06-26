import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneCall, SkipForward, CheckCircle2, Users, Clock, Gauge, TrendingUp,
  Building2, Download, ArrowRightLeft, CheckCheck, Loader2, X,
  MapPin, Search, Route as RouteIcon,
} from "lucide-react";
import { useMemo, useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCounters, useDashboard, useQueueMutations, useTokens } from "@/hooks/use-queue-data";
import { KpiCard, type KpiTone } from "@/components/dash/KpiCard";
import { api, apiErrorMessage } from "@/lib/api";
import type { Counter, Token, ServiceType, PatientVisit } from "@/lib/api";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff Console · SmartQueue" }] }),
  component: StaffPage,
});

const TONES: KpiTone[] = ["cyan", "violet", "emerald", "warn"];

// ─── Transfer Modal ─────────────────────────────────────────────────────────

function TransferModal({ token, onClose, onSuccess }: {
  token: Token;
  onClose: () => void;
  onSuccess: (result: { token: string; counter: string; directions: string }) => void;
}) {
  const qc = useQueryClient();
  const { data: serviceTypes = [] } = useQuery({ queryKey: ["service-types"], queryFn: api.serviceTypes });
  const { data: counters = [] } = useCounters();
  const [tab, setTab] = useState<"CONSULTATION" | "DIAGNOSTIC">("CONSULTATION");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const transfer = useMutation({
    mutationFn: ({ tokenNumber, serviceId }: { tokenNumber: string; serviceId: number }) =>
      api.transfer(tokenNumber, serviceId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["tokens"] });
      qc.invalidateQueries({ queryKey: ["counters"] });
      qc.invalidateQueries({ queryKey: ["journey"] });
      onSuccess({ token: res.new_token_number, counter: res.counter, directions: res.directions });
    },
  });

  const consultations = serviceTypes.filter((s) => s.kind === "CONSULTATION");
  const diagnostics = serviceTypes.filter((s) => s.kind === "DIAGNOSTIC");
  const shown = tab === "CONSULTATION" ? consultations : diagnostics;

  const counterForService = (serviceId: number) =>
    counters.find((c) => c.service_types.includes(serviceId));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border p-5">
          <div>
            <div className="flex items-center gap-2 text-foreground">
              <ArrowRightLeft className="h-4 w-4 text-[var(--cyan-glow)]" />
              <span className="font-semibold">Department Transfer</span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Moving{" "}
              <span className="font-mono font-bold text-foreground">{token.number}</span>
              {" "}· {token.patient_name} to a new department
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 border-b border-border px-5">
          {(["CONSULTATION", "DIAGNOSTIC"] as const).map((k) => (
            <button
              key={k}
              onClick={() => { setTab(k); setSelectedId(null); }}
              className={`mb-[-1px] border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === k ? "border-[var(--cyan-glow)] text-[var(--cyan-glow)]" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "CONSULTATION" ? "Consultations" : "Diagnostics"}
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                {k === "CONSULTATION" ? consultations.length : diagnostics.length}
              </span>
            </button>
          ))}
        </div>

        {/* Service grid */}
        <div className="max-h-72 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shown.map((s) => {
              const sel = selectedId === s.id;
              const ctr = counterForService(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(sel ? null : s.id)}
                  className="relative overflow-hidden rounded-xl border p-3 text-left transition-all"
                  style={{
                    borderColor: sel ? "var(--cyan-glow)" : undefined,
                    background: sel ? "color-mix(in oklab, var(--cyan-glow) 10%, transparent)" : undefined,
                  }}
                >
                  {sel && (
                    <CheckCheck className="absolute right-2 top-2 h-3.5 w-3.5 text-[var(--cyan-glow)]" />
                  )}
                  <div className="font-medium text-foreground text-sm">{s.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] uppercase text-muted-foreground">{s.prefix}</div>
                  {ctr && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <MapPin className="h-2.5 w-2.5" />{ctr.name}
                      <span className="ml-1 font-semibold text-foreground">{ctr.queue_depth}</span> waiting
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border p-5">
          <div className="text-sm text-muted-foreground">
            {selectedId
              ? <>Sending to <span className="font-medium text-foreground">{serviceTypes.find((s) => s.id === selectedId)?.name}</span></>
              : "Select a department above"}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/60">
              Cancel
            </button>
            <button
              disabled={!selectedId || transfer.isPending}
              onClick={() => selectedId && transfer.mutate({ tokenNumber: token.number, serviceId: selectedId })}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--cyan-glow)" }}
            >
              {transfer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
              {transfer.isPending ? "Transferring…" : "Confirm transfer"}
            </button>
          </div>
        </div>
        {transfer.error && (
          <div className="px-5 pb-4 text-sm text-[var(--danger)]">{apiErrorMessage(transfer.error)}</div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Transfer Success Banner ─────────────────────────────────────────────────

function TransferSuccess({ result, onDismiss }: {
  result: { token: string; counter: string; directions: string };
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-xl border border-[var(--emerald-glow)]/40 bg-[var(--emerald-glow)]/10 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[var(--emerald-glow)]">
          <CheckCheck className="h-4 w-4 shrink-0" />
          <span className="font-semibold">Transfer complete</span>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">New token</div>
          <div className="mt-0.5 font-mono text-lg font-bold text-foreground">{result.token}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Counter</div>
          <div className="mt-0.5 font-medium text-foreground">{result.counter}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{result.directions}</div>
    </motion.div>
  );
}

// ─── Patient Journey Timeline ────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "var(--emerald-glow)",
  IN_PROGRESS: "var(--cyan-glow)",
  WAITING: "var(--warn)",
  NO_SHOW: "var(--danger)",
  CANCELLED: "var(--muted-foreground)",
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In progress",
  WAITING: "Waiting",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelled",
};

function JourneyTimeline({ visit }: { visit: PatientVisit }) {
  const tokens = [...visit.tokens].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12px] font-semibold uppercase tracking-widest text-muted-foreground">
            Visit journey · {visit.patient_name}
          </span>
          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
            {visit.patient_id}
          </span>
        </div>
        <span className="text-[12px] text-muted-foreground">{tokens.length} stop{tokens.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="relative">
        {tokens.length > 1 && (
          <div className="absolute left-[19px] top-10 bottom-10 w-px bg-border/60" />
        )}
        <div className="space-y-3">
          {tokens.map((t, i) => {
            const color = STATUS_COLOR[t.status] ?? "var(--muted-foreground)";
            const label = STATUS_LABEL[t.status] ?? t.status;
            const done = t.status === "COMPLETED";
            const active = t.status === "IN_PROGRESS";

            return (
              <div key={t.id} className="flex items-start gap-4">
                {/* Step indicator */}
                <div
                  className="relative z-10 mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 bg-card"
                  style={{ borderColor: color }}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4" style={{ color }} />
                  ) : active ? (
                    <div className="h-2.5 w-2.5 rounded-full pulse-dot" style={{ background: color }} />
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full bg-border" />
                  )}
                </div>

                {/* Step card */}
                <div
                  className="flex-1 rounded-xl border border-border/60 bg-card px-4 py-3"
                  style={active ? { boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 30%, transparent), 0 0 20px color-mix(in oklab, ${color} 8%, transparent)` } : undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">{t.number}</span>
                        {i === tokens.length - 1 && !done && (
                          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">latest</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-sm text-foreground/80">{t.service_type_name}</div>
                      {t.counter_name && (
                        <div className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {t.counter_name}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
                      >
                        {label}
                      </span>
                      {t.actual_wait_minutes != null && (
                        <span className="text-[11px] text-muted-foreground">{t.actual_wait_minutes.toFixed(0)} min wait</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
                    {t.service_start_at && (
                      <span>Started {new Date(t.service_start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                    {t.completed_at && (
                      <span>Done {new Date(t.completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                    {!t.service_start_at && !t.completed_at && (
                      <span>Queued {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Journey Lookup Panel ────────────────────────────────────────────────────

function JourneyLookup() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: visit, isLoading, error, isFetching } = useQuery({
    queryKey: ["journey-lookup", submitted],
    queryFn: () => api.journeyByToken(submitted.trim().toUpperCase()),
    enabled: !!submitted,
    retry: false,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) setSubmitted(query.trim());
  }

  return (
    <Panel className="overflow-hidden">
      <PanelHeader title="Patient Journey Lookup" subtitle="Look up any patient's full visit history by their token number" accent="violet" action={<RouteIcon className="h-3.5 w-3.5 text-muted-foreground" />} />
      <div className="p-5">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter token number, e.g. GEN-001 or BLD-012…"
              className="w-full rounded-lg border border-border bg-muted/40 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--cyan-glow)]/40"
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim() || isFetching}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--violet-glow)" }}
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {isFetching ? "Searching…" : "Lookup"}
          </button>
        </form>

        {error && (
          <div className="mt-3 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/8 px-3 py-2 text-sm text-[var(--danger)]">
            {apiErrorMessage(error, "Token not found or has no journey.")}
          </div>
        )}

        {visit && <JourneyTimeline visit={visit} />}
      </div>
    </Panel>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

function StaffPage() {
  const { data: counters } = useCounters();
  const { data: stats } = useDashboard();
  const { data: inProgressTokens } = useTokens("IN_PROGRESS");

  const [historyStatus, setHistoryStatus] = useState<Token["status"]>("COMPLETED");
  const { data: history, isLoading: historyLoading } = useTokens(historyStatus);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const counter = useMemo(() => {
    if (!counters || counters.length === 0) return null;
    return counters.find((c) => c.id === selectedId) ?? counters[0];
  }, [counters, selectedId]);

  const currentToken = useMemo(
    () => inProgressTokens?.find((t) => t.counter === counter?.id) ?? null,
    [inProgressTokens, counter?.id],
  );

  const { callNext, complete, noShow } = useQueueMutations();
  const queryClient = useQueryClient();

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferResult, setTransferResult] = useState<{ token: string; counter: string; directions: string } | null>(null);

  // Journey for current active patient
  const visitId = currentToken?.visit_id ?? null;
  const { data: visit } = useQuery({
    queryKey: ["journey", visitId],
    queryFn: () => api.journey(visitId!),
    enabled: !!visitId,
    refetchInterval: 8_000,
  });

  const subtitle = counter
    ? `${counter.name}${counter.location_description ? ` · ${counter.location_description}` : ""}`
    : "No counters available";

  const otherCounters = (counters ?? []).filter((c) => c.id !== counter?.id);

  const exportHistoryCsv = () => {
    const rows = history ?? [];
    if (rows.length === 0) return;
    const headers = ["Token", "Patient", "Phone", "Service", "Counter", "Status", "Created", "Completed", "Wait (min)"];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const t of rows) {
      lines.push([t.number, t.patient_name, t.phone_number, t.service_type_name ?? "", t.counter_name ?? "", t.status, t.created_at, t.completed_at ?? "", t.actual_wait_minutes != null ? t.actual_wait_minutes.toFixed(2) : ""].map(esc).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `service-history-${historyStatus.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell title="Staff Operations Console" subtitle={subtitle}>
      {/* Transfer modal */}
      <AnimatePresence>
        {transferOpen && currentToken && (
          <TransferModal
            token={currentToken}
            onClose={() => setTransferOpen(false)}
            onSuccess={(res) => { setTransferResult(res); setTransferOpen(false); }}
          />
        )}
      </AnimatePresence>

      {counters && counters.length > 1 && (
        <div className="mb-5 flex items-center gap-2 text-sm">
          <span className="shrink-0 text-muted-foreground">Counter:</span>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {counters.map((c) => {
              const active = c.id === counter?.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 whitespace-nowrap transition ${active ? "border-[var(--cyan-glow)]/60 bg-[var(--cyan-glow)]/10 text-[var(--cyan-glow)]" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                >
                  {c.name}
                  {!c.is_active && " · offline"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard to="/queues" tone="cyan" icon={Users} label="Queue Depth" value={counter ? String(counter.queue_depth) : "—"} delta={counter && counter.next_tokens.length > 0 ? `Next: ${counter.next_tokens.slice(0, 3).join(" · ")}` : counter ? "Queue clear" : null} deltaTone={counter && counter.queue_depth > 0 ? "warn" : "good"} status={counter?.is_active ? "Counter active" : counter ? "Counter offline" : "No counter selected"} />
        <KpiCard to="/system" tone="emerald" icon={Gauge} label="Avg Service" value={stats ? stats.avg_service_minutes.toFixed(1) : "—"} unit="min" delta={stats ? `window ${stats.window_hours}h` : null} deltaTone="muted" status={stats && stats.avg_service_minutes < 10 ? "On target" : stats ? "Above target" : "Waiting for backend"} />
        <KpiCard to="/system" tone="violet" icon={Clock} label="Avg Wait" value={stats ? stats.avg_wait_minutes.toFixed(1) : "—"} unit="min" delta={stats ? `${stats.total_waiting} patients waiting` : null} deltaTone="violet" status={stats && stats.avg_wait_minutes < 15 ? "Improving wait times" : stats ? "Higher than target" : "—"} />
        <KpiCard to="/system" tone="warn" icon={TrendingUp} label="Completed" value={stats ? String(stats.completed_in_window) : "—"} delta={stats ? `last ${stats.window_hours}h` : null} deltaTone="warn" status={stats && stats.completed_in_window > 0 ? `${stats.completed_in_window} served in window` : "No completions yet"} />
      </section>

      <section className="mt-5">
        <Panel className="overflow-hidden">
          <PanelHeader
            title={counter ? `${counter.name} · Now serving` : "Now serving"}
            subtitle={currentToken ? `Token ${currentToken.number} · ${currentToken.patient_name}` : "Idle"}
            accent="cyan"
          />
          <div className="p-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-6 text-center">
                <div className="text-[12px] uppercase tracking-widest text-muted-foreground">Now Serving</div>
                <div className="mt-2 font-mono text-[74px] font-bold text-[var(--cyan-glow)]">
                  {currentToken?.number ?? counter?.current_token ?? "—"}
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  {currentToken?.service_start_at
                    ? `${currentToken.service_type_name ?? ""} · started ${relativeMinutes(currentToken.service_start_at)} ago`
                    : "Waiting to call next"}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="text-[12px] uppercase tracking-widest text-muted-foreground">Up next</div>
                <div className="mt-2 space-y-2">
                  {(counter?.next_tokens ?? []).length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">Queue empty</div>
                  ) : (
                    counter?.next_tokens.map((t, i) => (
                      <div key={t} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono">
                        <span className="text-base text-foreground">{t}</span>
                        <span className="text-[12px] text-muted-foreground">~{(i + 1) * Math.max(1, Math.round(stats?.avg_service_minutes ?? 4))}m</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <ActionButton
                icon={PhoneCall}
                label={callNext.isPending ? "Calling…" : "Call next"}
                tone="cyan"
                onClick={() => counter && callNext.mutate(counter.id)}
                disabled={!counter || !counter.is_active || callNext.isPending || !!currentToken || (counter.queue_depth ?? 0) === 0}
              />
              <ActionButton
                icon={CheckCircle2}
                label={complete.isPending ? "Completing…" : "Complete"}
                tone="emerald"
                onClick={() => currentToken && complete.mutate(currentToken.number)}
                disabled={!currentToken || complete.isPending}
              />
              <ActionButton
                icon={SkipForward}
                label={noShow.isPending ? "Marking…" : "No-show"}
                tone="violet"
                onClick={() => currentToken && noShow.mutate(currentToken.number)}
                disabled={!currentToken || noShow.isPending}
              />
              <ActionButton
                icon={ArrowRightLeft}
                label="Transfer dept."
                tone="cyan"
                onClick={() => { setTransferOpen(true); setTransferResult(null); }}
                disabled={!currentToken}
              />
            </div>

            {(callNext.error || complete.error || noShow.error) && (
              <div className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
                {apiErrorMessage(callNext.error || complete.error || noShow.error)}
              </div>
            )}

            {/* Transfer result banner */}
            <AnimatePresence>
              {transferResult && (
                <TransferSuccess result={transferResult} onDismiss={() => setTransferResult(null)} />
              )}
            </AnimatePresence>

            {/* Current patient journey */}
            {visit && visit.tokens.length > 0 && (
              <JourneyTimeline visit={visit} />
            )}
          </div>
        </Panel>
      </section>

      {otherCounters.length > 0 && (
        <section className="mt-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Other counters</span>
            {otherCounters.length > 8 && (
              <span className="text-[12px] text-muted-foreground">Showing 8 of {otherCounters.length}</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {otherCounters.slice(0, 8).map((c, i) => (
              <CounterMiniCard key={c.id} counter={c} tone={TONES[i % TONES.length]} />
            ))}
          </div>
        </section>
      )}

      {/* Journey Lookup — staff can search any patient by token number */}
      <section className="mt-5">
        <JourneyLookup />
      </section>

      <section className="mt-5">
        <Panel className="overflow-hidden">
          <PanelHeader title="Service history" subtitle="Past visits — completed, no-show, and cancelled tokens" accent="violet" />
          <div className="flex items-center gap-1 border-b border-border px-4 py-2 text-sm">
            {([["COMPLETED", "Completed"], ["NO_SHOW", "No-show"], ["CANCELLED", "Cancelled"]] as const).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setHistoryStatus(s)}
                className={`rounded-lg px-3 py-1.5 transition ${historyStatus === s ? "bg-[var(--violet-glow)]/12 text-[var(--violet-glow)]" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12px] uppercase tracking-widest text-muted-foreground">{history?.length ?? 0} records</span>
              <button
                onClick={exportHistoryCsv}
                disabled={(history?.length ?? 0) === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-foreground transition hover:bg-muted/60 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </button>
            </div>
          </div>
          <div className="max-h-[440px] overflow-y-auto">
            <table className="w-full text-left text-base">
              <thead className="sticky top-0 bg-card">
                <tr className="text-[12px] uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Token</th>
                  <th className="px-4 py-2 font-medium">Patient</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 font-medium">Counter</th>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium text-right">Wait (min)</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading history…</td></tr>
                ) : (history?.length ?? 0) === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No {historyStatus.toLowerCase().replace("_", "-")} records yet.</td></tr>
                ) : (
                  history!.map((t) => (
                    <tr key={t.id} className="border-t border-border/40 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-foreground">{t.number}</td>
                      <td className="px-4 py-2 text-foreground">{t.patient_name}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.service_type_name ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.counter_name ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{formatDateTime(t.completed_at ?? t.created_at)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground/90">
                        {t.actual_wait_minutes != null ? t.actual_wait_minutes.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CounterMiniCard({ counter, tone }: { counter: Counter; tone: KpiTone }) {
  const depth = counter.queue_depth ?? 0;
  return (
    <KpiCard
      to="/queues"
      tone={!counter.is_active ? "violet" : depth > 0 && !counter.current_token ? "warn" : tone}
      icon={Building2}
      label={counter.name}
      value={counter.current_token ?? "—"}
      delta={depth > 0 ? `${depth} waiting` : "Queue clear"}
      deltaTone={depth > 0 ? "warn" : "good"}
      status={!counter.is_active ? "Offline" : counter.next_tokens.length > 0 ? `Next: ${counter.next_tokens.slice(0, 3).join(" · ")}` : "Idle · ready to serve"}
    />
  );
}

function ActionButton({ icon: Icon, label, tone = "cyan", onClick, disabled }: {
  icon: any; label: string; tone?: "cyan" | "violet" | "emerald" | "danger"; onClick?: () => void; disabled?: boolean;
}) {
  const c = tone === "danger" ? "var(--danger)" : tone === "violet" ? "var(--violet-glow)" : tone === "emerald" ? "var(--emerald-glow)" : "var(--cyan-glow)";
  return (
    <motion.button
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-40"
      style={{ borderColor: `color-mix(in oklab, ${c} 35%, transparent)`, background: `color-mix(in oklab, ${c} 10%, transparent)`, color: c }}
    >
      <Icon className="h-4 w-4" /> {label}
    </motion.button>
  );
}

function relativeMinutes(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0 || Number.isNaN(diffMs)) return "just now";
  const m = Math.floor(diffMs / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
