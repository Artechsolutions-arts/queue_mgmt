import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Hexagon, ArrowLeft } from "lucide-react";
import { ClientClock } from "@/components/ui/client-clock";
import { useCounters, useDashboard } from "@/hooks/use-queue-data";

export const Route = createFileRoute("/display")({
  head: () => ({ meta: [{ title: "Now Serving · Helix OS" }, { name: "description", content: "Cinematic public waiting display." }] }),
  component: DisplayPage,
});

function DisplayPage() {
  const { data: counters } = useCounters();
  const { data: stats } = useDashboard();

  // Pick the busiest active counter to feature on the public board.
  const featured =
    counters
      ?.filter((c) => c.is_active)
      .sort((a, b) => b.queue_depth - a.queue_depth)[0] ?? counters?.[0];

  const now = featured?.current_token ?? "—";
  const next = featured?.next_tokens ?? [];
  const counterLabel = featured?.name ?? "—";
  const etaMin = stats?.avg_wait_minutes ?? null;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[700px] w-[1000px] -translate-x-1/2 rounded-full bg-[var(--cyan-glow)] opacity-[0.12] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-[var(--violet-glow)] opacity-[0.1] blur-3xl" />

      <header className="relative flex items-center justify-between px-12 py-8">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--gradient-primary)] glow-cyan"><Hexagon className="h-6 w-6 text-[var(--primary-foreground)]" /></div>
          <div>
            <div className="text-lg font-semibold text-foreground">St. Aurelia Medical</div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">OPD General · Ground floor</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-[var(--emerald-glow)]/40 bg-[var(--emerald-glow)]/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[var(--emerald-glow)]">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[var(--emerald-glow)] pulse-dot align-middle" /> Live · <ClientClock />
          </div>
          {/* Subtle exit so staff aren't trapped on the fullscreen public board. */}
          <Link
            to="/"
            title="Back to dashboard"
            aria-label="Back to dashboard"
            className="grid h-9 w-9 place-items-center rounded-full border border-border/40 text-muted-foreground/50 transition hover:border-border hover:bg-card hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main className="relative grid grid-cols-12 gap-10 px-12 pb-12">
        <section className="col-span-12 xl:col-span-8">
          <div className="text-sm uppercase tracking-[0.4em] text-muted-foreground">Now Serving</div>
          <div className="relative mt-6 overflow-hidden rounded-3xl glass-strong p-16 text-center">
            <div className="scanline pointer-events-none absolute inset-0" />
            <div className="pointer-events-none absolute -top-20 left-1/2 h-60 w-[480px] -translate-x-1/2 rounded-full bg-[var(--cyan-glow)] opacity-30 blur-3xl" />
            <AnimatePresence mode="wait">
              <motion.div
                key={now}
                initial={{ opacity: 0, scale: 0.92, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.04, y: -24 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <div className="font-mono text-[180px] font-bold leading-none tracking-tight text-foreground" style={{ textShadow: "0 0 60px var(--cyan-glow)" }}>
                  {now}
                </div>
                <div className="mt-4 text-2xl text-muted-foreground">Please proceed to <span className="font-semibold text-gradient-primary">{counterLabel}</span></div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        <section className="col-span-12 xl:col-span-4">
          <div className="text-sm uppercase tracking-[0.4em] text-muted-foreground">Up Next</div>
          <div className="mt-6 space-y-3">
            {next.length === 0 && (
              <div className="rounded-2xl glass px-6 py-5 text-sm text-muted-foreground">No patients waiting</div>
            )}
            {next.map((t, i) => (
              <motion.div
                key={t + i}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center justify-between rounded-2xl glass px-6 py-5"
              >
                <div className="font-mono text-3xl font-semibold text-foreground">{t}</div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Position</div>
                  <div className="text-lg font-semibold text-[var(--cyan-glow)]">#{i + 1}</div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-[var(--violet-glow)]/30 bg-[var(--violet-glow)]/8 p-5">
            <div className="text-[10px] uppercase tracking-widest text-[var(--violet-glow)]">Estimated wait</div>
            <div className="mt-1 font-mono text-4xl font-semibold text-foreground">
              {etaMin != null ? `~ ${Math.round(etaMin)} min` : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Avg over last {stats?.window_hours ?? 24}h</div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-border/40 px-12 py-5 text-center text-xs text-muted-foreground">
        Helix OS · AI Smart Queue · Notifications sent on WhatsApp the moment your token is called
      </footer>
    </div>
  );
}