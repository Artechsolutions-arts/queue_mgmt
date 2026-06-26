import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useState } from "react";
import { Sun, Moon, Bell, ShieldAlert, Building2, Stethoscope, Save, CheckCircle2, AlertTriangle, Activity } from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · SmartQueue" }] }),
  component: SettingsPage,
});

function Section({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: any; children: React.ReactNode }) {
  return (
    <Panel>
      <PanelHeader title={title} subtitle={subtitle} accent="cyan" action={<Icon className="h-4 w-4 text-muted-foreground" />} />
      <div className="p-5">{children}</div>
    </Panel>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 border-b border-border/40 last:border-0">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && <div className="mt-0.5 text-[12px] text-muted-foreground">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-[var(--cyan-glow)]" : "bg-muted"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : ""}`} />
    </button>
  );
}

function ls(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

function SettingsPage() {
  const { isLight, setTheme } = useTheme();

  // Notification prefs — persisted to localStorage
  const [whatsapp, setWhatsappRaw] = useState(() => ls("helix.settings.whatsapp", "true") === "true");
  const [sms, setSmsRaw] = useState(() => ls("helix.settings.sms", "true") === "true");
  const [alertBanner, setAlertBannerRaw] = useState(() => ls("helix.settings.alertBanner", "true") === "true");

  const setWhatsapp = (v: boolean) => { setWhatsappRaw(v); localStorage.setItem("helix.settings.whatsapp", String(v)); };
  const setSms = (v: boolean) => { setSmsRaw(v); localStorage.setItem("helix.settings.sms", String(v)); };
  const setAlertBanner = (v: boolean) => { setAlertBannerRaw(v); localStorage.setItem("helix.settings.alertBanner", String(v)); };

  // Hospital info — persisted to localStorage
  const [hospitalName, setHospitalNameRaw] = useState(() => ls("helix.settings.hospitalName", "City General Hospital"));
  const [morningShift, setMorningShiftRaw] = useState(() => ls("helix.settings.morningShift", "08:00"));
  const [eveningShift, setEveningShiftRaw] = useState(() => ls("helix.settings.eveningShift", "20:00"));
  const [saved, setSaved] = useState(false);

  const { data: doctors = [] } = useQuery({ queryKey: ["doctors"], queryFn: api.doctors });
  const { data: alerts = [] } = useQuery({ queryKey: ["alerts"], queryFn: api.alerts, refetchInterval: 30_000 });

  function handleSave() {
    localStorage.setItem("helix.settings.hospitalName", hospitalName);
    localStorage.setItem("helix.settings.morningShift", morningShift);
    localStorage.setItem("helix.settings.eveningShift", eveningShift);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <AppShell title="Settings" subtitle="Appearance · notifications · queue rules · hospital info">
      <div className="space-y-5 max-w-3xl">

        {/* Appearance */}
        <Section title="Appearance" subtitle="Theme and display preferences" icon={Sun}>
          <Row label="Theme" description="Switch between light and dark mode">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 p-1">
              <button
                onClick={() => setTheme("light")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${isLight ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Sun className="h-3.5 w-3.5" /> Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${!isLight ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Moon className="h-3.5 w-3.5" /> Dark
              </button>
            </div>
          </Row>
          <Row label="Alert banners on dashboard" description="Show escalation alerts at the top of the overview page">
            <Toggle value={alertBanner} onChange={setAlertBanner} />
          </Row>
        </Section>

        {/* Notifications */}
        <Section title="Notification Channels" subtitle="Control how patients receive queue updates" icon={Bell}>
          <Row label="WhatsApp notifications" description="Send token number and counter directions via WhatsApp">
            <Toggle value={whatsapp} onChange={setWhatsapp} />
          </Row>
          <Row label="SMS fallback" description="Send SMS when WhatsApp delivery fails">
            <Toggle value={sms} onChange={setSms} />
          </Row>
          <Row label="No-show re-call" description="Always enabled — patients are re-called once before marking no-show">
            <span className="rounded-full bg-[var(--emerald-glow)]/12 px-2.5 py-0.5 text-[12px] font-semibold text-[var(--emerald-glow)]">Always on</span>
          </Row>
        </Section>

        {/* Active Escalation Alerts */}
        <Section title="Escalation Alerts" subtitle="Live alerts — rules are configured in Django admin" icon={ShieldAlert}>
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <Activity className="h-4 w-4 text-[var(--emerald-glow)]" />
              All queues within normal thresholds — no active alerts.
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn)]/8 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warn)]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground">{alert.rule_name}</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">{alert.message}</div>
                  </div>
                  <span className="shrink-0 rounded-md bg-[var(--warn)]/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--warn)]">
                    {alert.triggered_value.toFixed(1)}
                  </span>
                </div>
              ))}
              <p className="mt-1 text-[12px] text-muted-foreground">Dismiss alerts from the bell menu · edit thresholds in Django admin.</p>
            </div>
          )}
        </Section>

        {/* Doctor Registry summary */}
        <Section title="Doctor Registry" subtitle="Registered doctors across all departments" icon={Stethoscope}>
          <Row label="Total registered doctors" description="Managed under Doctor Availability">
            <span className="font-mono text-lg font-bold text-foreground">{doctors.length}</span>
          </Row>
          <Row label="Currently available" description="Status = Available">
            <span className="font-mono text-lg font-bold text-[var(--emerald-glow)]">
              {doctors.filter(d => d.status === "AVAILABLE").length}
            </span>
          </Row>
          <Row label="Delayed / On leave / Emergency" description="Requires attention">
            <span className="font-mono text-lg font-bold text-[var(--warn)]">
              {doctors.filter(d => d.status !== "AVAILABLE").length}
            </span>
          </Row>
        </Section>

        {/* Hospital Info */}
        <Section title="Hospital Information" subtitle="Basic configuration for this deployment" icon={Building2}>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-foreground">Hospital name</label>
              <input
                value={hospitalName}
                onChange={(e) => setHospitalNameRaw(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-foreground">Morning shift start</label>
                <input
                  type="time"
                  value={morningShift}
                  onChange={(e) => setMorningShiftRaw(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-foreground">Evening shift end</label>
                <input
                  type="time"
                  value={eveningShift}
                  onChange={(e) => setEveningShiftRaw(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
                />
              </div>
            </div>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
              style={{ background: "var(--gradient-violet)", color: "#fff" }}
            >
              {saved ? <><CheckCircle2 className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save changes</>}
            </button>
          </div>
        </Section>

      </div>
    </AppShell>
  );
}
