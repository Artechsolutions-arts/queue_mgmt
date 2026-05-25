import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { KpiCard } from "@/components/dash/KpiCard";
import { ThroughputChart } from "@/components/dash/ThroughputChart";
import { EventFeed } from "@/components/dash/EventFeed";
import { MessageCircle, Send, CheckCheck, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Patient Comms · Helix OS" }, { name: "description", content: "WhatsApp + omnichannel patient notifications." }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <AppShell title="Patient Notification Center" subtitle="WhatsApp · SMS · IVR · automated retries & delivery intelligence">
      <div className="mb-4 rounded-md border border-[var(--warn)]/40 bg-[var(--warn)]/10 px-3 py-2 text-xs text-[var(--warn)]">
        Mock data — backend has a <code className="font-mono">NotificationLog</code> model but no REST endpoint exposing it. Add a serializer + viewset in <code className="font-mono">services/queue/core/</code> to wire this page.
      </div>
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard to="/notifications" label="Sent today" value="3,917" delta={7} tone="cyan" icon={Send} status="Delivery on track" />
        <KpiCard to="/notifications" label="Delivered" value="99.2" unit="%" delta={1} tone="emerald" icon={CheckCheck} status="All channels healthy" />
        <KpiCard to="/notifications" label="Read rate" value="86" unit="%" delta={4} tone="violet" icon={MessageCircle} status="Above target" />
        <KpiCard to="/notifications" label="Retry queue" value="12" delta={-22} tone="warn" icon={AlertTriangle} status="Backlog shrinking" />
      </section>

      <section className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-12 xl:col-span-8">
          <PanelHeader title="Delivery volume · last 24h" subtitle="WhatsApp · SMS · IVR fallback" accent="cyan" />
          <ThroughputChart />
        </Panel>
        <Panel className="col-span-12 xl:col-span-4">
          <PanelHeader title="Live delivery stream" subtitle="Realtime · per-message events" accent="emerald" />
          <EventFeed />
        </Panel>
      </section>

      <section className="mt-5 grid grid-cols-12 gap-5">
        <Panel className="col-span-12 xl:col-span-7">
          <PanelHeader title="Channel performance" subtitle="Delivery · read · response by channel" accent="violet" />
          <div className="space-y-4 p-5">
            {[
              { name: "WhatsApp Business", d: 99.2, r: 86, c: "var(--emerald-glow)" },
              { name: "SMS Fallback", d: 96.4, r: 71, c: "var(--cyan-glow)" },
              { name: "Voice IVR", d: 88.1, r: 62, c: "var(--violet-glow)" },
              { name: "In-app push", d: 94.8, r: 78, c: "var(--warn)" },
            ].map((c) => (
              <div key={c.name} className="rounded-xl border border-border/50 bg-muted/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{c.d}% delivered · {c.r}% read</span>
                </div>
                <div className="flex gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${c.d}%`, background: c.c, boxShadow: `0 0 10px ${c.c}` }} /></div>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${c.r}%`, background: c.c, opacity: 0.6 }} /></div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="col-span-12 xl:col-span-5">
          <PanelHeader title="Template performance" subtitle="Top message templates this week" accent="cyan" />
          <div className="divide-y divide-border/40">
            {[
              { t: "queue_position_update", n: 1284, d: 99, r: 91 },
              { t: "appointment_reminder_24h", n: 892, d: 99, r: 88 },
              { t: "now_serving_token", n: 712, d: 99, r: 94 },
              { t: "reschedule_offer", n: 318, d: 98, r: 79 },
              { t: "feedback_post_visit", n: 244, d: 96, r: 62 },
            ].map((tpl) => (
              <div key={tpl.t} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="font-mono text-xs text-foreground">{tpl.t}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{tpl.n} sends</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-[var(--emerald-glow)]">{tpl.d}% delivered</div>
                  <div className="text-[10px] text-[var(--cyan-glow)]">{tpl.r}% read</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}