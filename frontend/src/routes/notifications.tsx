import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { KpiCard } from "@/components/dash/KpiCard";
import { ThroughputChart } from "@/components/dash/ThroughputChart";
import { EventFeed } from "@/components/dash/EventFeed";
import { MessageCircle, Send, CheckCheck, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMemo } from "react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Patient Comms · SmartQueue" }, { name: "description", content: "WhatsApp + SMS patient notifications." }] }),
  component: NotificationsPage,
});

const todayPrefix = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

function NotificationsPage() {
  const { data: tokens = [], isError } = useQuery({
    queryKey: ["tokens-all"],
    queryFn: () => api.tokens(),
    refetchInterval: 30_000,
  });

  const stats = useMemo(() => {
    const today = tokens.filter((t) => t.created_at.startsWith(todayPrefix));
    const total = today.length;
    const completed = today.filter((t) => t.status === "COMPLETED").length;
    const noShow = today.filter((t) => t.status === "NO_SHOW").length;
    const waiting = today.filter((t) => t.status === "WAITING").length;
    return { total, completed, noShow, waiting };
  }, [tokens]);

  return (
    <AppShell title="Patient Notification Center" subtitle="WhatsApp · SMS · per-token delivery log">
      {isError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/8 px-4 py-3 text-sm text-[var(--danger)]">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Backend unreachable — notification data unavailable.
        </div>
      )}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard to="/queues" label="Tokens today" value={String(stats.total)} tone="cyan" icon={Send} status="Registered since midnight" />
        <KpiCard to="/staff" label="Completed" value={String(stats.completed)} tone="emerald" icon={CheckCheck} status={stats.total ? `${Math.round((stats.completed / stats.total) * 100)}% completion rate` : "No data yet"} />
        <KpiCard to="/queues" label="Waiting" value={String(stats.waiting)} tone="violet" icon={MessageCircle} status="Currently in queue" />
        <KpiCard to="/staff" label="No-shows" value={String(stats.noShow)} tone="warn" icon={AlertTriangle} status={stats.total ? `${Math.round((stats.noShow / stats.total) * 100)}% no-show rate` : "No data yet"} />
      </section>

      <section className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-12 xl:col-span-8">
          <PanelHeader title="Token volume · by hour" subtitle="Registrations vs completions" accent="cyan" />
          <ThroughputChart />
        </Panel>
        <Panel className="col-span-12 xl:col-span-4">
          <PanelHeader title="Recent activity" subtitle="Latest token events" accent="emerald" />
          <EventFeed />
        </Panel>
      </section>
    </AppShell>
  );
}
