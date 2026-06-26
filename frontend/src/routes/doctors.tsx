import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiErrorMessage, type Doctor, type DoctorStatus } from "@/lib/api";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { CheckCircle2, Clock, XCircle, AlertOctagon, ChevronDown, Users, Loader2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/doctors")({
  head: () => ({ meta: [{ title: "Doctor Availability · SmartQueue" }] }),
  component: DoctorsPage,
});

const STATUS_META: Record<DoctorStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  AVAILABLE: { label: "Available",  color: "var(--emerald-glow)", icon: CheckCircle2  },
  DELAYED:   { label: "Delayed",    color: "var(--warn)",         icon: Clock         },
  ON_LEAVE:  { label: "On Leave",   color: "var(--violet-glow)",  icon: XCircle       },
  EMERGENCY: { label: "Emergency",  color: "var(--danger)",       icon: AlertOctagon  },
};

function DoctorCard({ doctor }: { doctor: Doctor }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [delayMin, setDelayMin] = useState(String(doctor.delay_minutes || 15));
  const [notes, setNotes] = useState(doctor.notes);

  // Sync local form state from fresh server data whenever the panel is closed,
  // so the next time the user opens it they see the latest values.
  useEffect(() => {
    if (!open) {
      setNotes(doctor.notes);
      setDelayMin(String(doctor.delay_minutes || 15));
    }
  }, [doctor.notes, doctor.delay_minutes, open]);

  const setStatus = useMutation({
    mutationFn: (payload: { status: DoctorStatus; delay_minutes?: number; notes?: string }) =>
      api.setDoctorStatus(doctor.id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["doctors"] }); setOpen(false); },
  });

  const meta = STATUS_META[doctor.status];
  const Icon = meta.icon;

  const delayNum = parseInt(delayMin, 10);
  const delayValid = !Number.isNaN(delayNum) && delayNum >= 1 && delayNum <= 120;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5"
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${meta.color} 20%, transparent)` }}
    >
      <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-20 blur-3xl" style={{ background: meta.color }} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-foreground">Dr. {doctor.name}</div>
          <div className="mt-0.5 text-[13px] text-muted-foreground">{doctor.service_type_name}</div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
          style={{ background: `color-mix(in oklab, ${meta.color} 14%, transparent)`, color: meta.color }}>
          <Icon className="h-3 w-3" />
          {meta.label}
          {doctor.status === "DELAYED" && doctor.delay_minutes > 0 && ` +${doctor.delay_minutes}m`}
        </div>
      </div>

      {doctor.notes && (
        <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">{doctor.notes}</p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Updated {new Date(doctor.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-foreground hover:bg-muted/60 transition-colors"
        >
          Update <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-4 space-y-3 border-t border-border/50 pt-4"
        >
          {/* Quick-status grid — DELAYED uses the row below, not this grid */}
          <div className="grid grid-cols-2 gap-2">
            {(["AVAILABLE", "DELAYED", "ON_LEAVE", "EMERGENCY"] as DoctorStatus[]).map((s) => {
              const m = STATUS_META[s];
              const active = doctor.status === s;
              const isDelayedBtn = s === "DELAYED";
              return (
                <button
                  key={s}
                  disabled={isDelayedBtn || setStatus.isPending}
                  onClick={() => setStatus.mutate({ status: s, notes })}
                  title={isDelayedBtn ? "Use the delay row below to set a delay" : undefined}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    borderColor: active ? m.color : undefined,
                    background: active ? `color-mix(in oklab, ${m.color} 12%, transparent)` : undefined,
                    color: active ? m.color : undefined,
                  }}
                >
                  {setStatus.isPending && !isDelayedBtn && active ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <m.icon className="h-3.5 w-3.5" style={{ color: m.color }} />
                  )}
                  {m.label}
                  {isDelayedBtn && <span className="ml-auto text-[10px] opacity-60">↓ below</span>}
                </button>
              );
            })}
          </div>

          {/* Delay row */}
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={120}
              value={delayMin}
              onChange={(e) => setDelayMin(e.target.value)}
              className={`w-24 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm text-foreground ${!delayValid ? "border-[var(--danger)]" : "border-border"}`}
              placeholder="1–120"
            />
            <button
              disabled={!delayValid || setStatus.isPending}
              onClick={() => delayValid && setStatus.mutate({ status: "DELAYED", delay_minutes: delayNum, notes })}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40"
              style={{ borderColor: "var(--warn)", color: "var(--warn)", background: "color-mix(in oklab, var(--warn) 10%, transparent)" }}
            >
              {setStatus.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {setStatus.isPending ? "Saving…" : `Delayed by ${delayValid ? delayNum : "??"} min`}
            </button>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)…"
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />

          {setStatus.error && (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/8 px-3 py-2 text-[13px] text-[var(--danger)]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {apiErrorMessage(setStatus.error, "Could not update doctor status.")}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function DoctorsPage() {
  const { data: doctors = [], isLoading, isError } = useQuery({
    queryKey: ["doctors"],
    queryFn: api.doctors,
    refetchInterval: 15_000,
  });

  const byStatus = {
    AVAILABLE: doctors.filter((d) => d.status === "AVAILABLE"),
    DELAYED:   doctors.filter((d) => d.status === "DELAYED"),
    ON_LEAVE:  doctors.filter((d) => d.status === "ON_LEAVE"),
    EMERGENCY: doctors.filter((d) => d.status === "EMERGENCY"),
  };

  const urgentDoctors = [...byStatus.EMERGENCY, ...byStatus.DELAYED, ...byStatus.ON_LEAVE];
  const hasUrgent = urgentDoctors.length > 0;

  return (
    <AppShell title="Doctor Availability" subtitle="Real-time status · delays · leave management">
      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/8 px-4 py-3 text-sm text-[var(--danger)]">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Could not load doctor data — check the queue service.
        </div>
      )}

      {/* Summary strip */}
      <section className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(["AVAILABLE", "DELAYED", "ON_LEAVE", "EMERGENCY"] as DoctorStatus[]).map((s) => {
          const m = STATUS_META[s];
          const count = byStatus[s].length;
          return (
            <div key={s} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                style={{ background: `color-mix(in oklab, ${m.color} 14%, transparent)`, color: m.color }}>
                <m.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums text-foreground">{count}</div>
                <div className="text-[12px] uppercase tracking-widest text-muted-foreground">{m.label}</div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Urgent doctors — shown prominently at top */}
      {hasUrgent && (
        <section className="mb-5">
          <Panel>
            <PanelHeader title="Requires attention" subtitle="Doctors currently unavailable or delayed" accent="warn" />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {urgentDoctors.map((d) => (
                <DoctorCard key={d.id} doctor={d} />
              ))}
            </div>
          </Panel>
        </section>
      )}

      {/* Available doctors — or all doctors if nobody is urgent */}
      <section>
        <Panel>
          <PanelHeader
            title={hasUrgent ? "Available doctors" : "All doctors"}
            subtitle={hasUrgent ? `${byStatus.AVAILABLE.length} available now` : `${doctors.length} registered`}
            accent="cyan"
            action={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
          />
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : doctors.length === 0 && !isError ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No doctors seeded. Run <code className="mx-1 font-mono text-xs">python manage.py seed_data</code> to add them.
            </div>
          ) : byStatus.AVAILABLE.length === 0 && hasUrgent ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No doctors currently available.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {(hasUrgent ? byStatus.AVAILABLE : doctors).map((d) => (
                <DoctorCard key={d.id} doctor={d} />
              ))}
            </div>
          )}
        </Panel>
      </section>
    </AppShell>
  );
}
