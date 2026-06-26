import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Camera, VideoOff } from "lucide-react";

export const Route = createFileRoute("/cctv")({
  head: () => ({ meta: [{ title: "CCTV Analytics · SmartQueue" }, { name: "description", content: "Multi-camera crowd analytics." }] }),
  component: CctvPage,
});

const CAM_SLOTS = [
  "Main Entrance",
  "OPD Corridor",
  "Radiology Hall",
  "ER Waiting",
  "Surgical Wing",
  "Billing Counter",
];

const TOTAL = CAM_SLOTS.length;

function camId(index: number) {
  return `CAM-${String(index + 1).padStart(2, "0")}`;
}

function CctvPage() {
  return (
    <AppShell title="CCTV Analytics" subtitle="YOLOv8 person detection · camera feed integration pending">
      <section className="grid grid-cols-12 gap-5">
        <Panel className="col-span-12 xl:col-span-9">
          <PanelHeader title="Camera grid" subtitle={`${TOTAL} configured locations`} accent="cyan" />
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {CAM_SLOTS.map((name, i) => (
              <div
                key={name}
                aria-label={`${name} — ${camId(i)} offline`}
                className="overflow-hidden rounded-xl border border-border/60 bg-card"
              >
                <div className="flex aspect-video items-center justify-center bg-muted/30">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <VideoOff className="h-8 w-8 opacity-40" />
                    <span className="text-xs">Feed unavailable</span>
                  </div>
                </div>
                <div className="px-3 py-2.5">
                  <div className="text-sm font-semibold text-foreground">{name}</div>
                  <div className="text-[12px] uppercase tracking-widest text-muted-foreground">
                    {camId(i)} · Not connected
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="col-span-12 xl:col-span-3">
          <PanelHeader
            title="Camera health"
            subtitle={`0 online · ${TOTAL} offline`}
            accent="emerald"
            action={<Camera className="h-3.5 w-3.5 text-muted-foreground" />}
          />
          <div className="grid grid-cols-2 gap-3 p-5">
            {[
              { k: "Online",        v: `0 / ${TOTAL}` },
              { k: "FPS",           v: "—" },
              { k: "Bandwidth",     v: "—" },
              { k: "Detections /s", v: "—" },
            ].map((m) => (
              <div key={m.k} className="rounded-lg border border-border/50 bg-muted/50 p-3">
                <div className="text-[12px] uppercase tracking-widest text-muted-foreground">{m.k}</div>
                <div className="mt-1 font-mono text-xl font-semibold text-muted-foreground">{m.v}</div>
              </div>
            ))}
          </div>
          <div className="px-5 pb-5 text-[13px] text-muted-foreground leading-relaxed">
            Connect a camera feed source to the <code className="font-mono text-xs">vision-service</code> to enable live detection.
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}
