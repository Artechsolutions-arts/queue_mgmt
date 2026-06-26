import { Bell, Settings, LogOut, ChevronDown, Sun, Moon, AlertTriangle, Clock } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { api, setAuthToken, type EscalationAlert } from "@/lib/api";
import { RegisterPatientDialog } from "@/components/dash/RegisterPatientDialog";
import { useTheme } from "@/lib/theme";

function alertIcon(alert: EscalationAlert) {
  return alert.threshold_type === "QUEUE_DEPTH" ? AlertTriangle : Clock;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigate = useNavigate();
  const { isLight, toggleTheme } = useTheme();
  const queryClient = useQueryClient();

  const { data: alerts = [] } = useQuery({
    queryKey: ["alerts"],
    queryFn: api.alerts,
    refetchInterval: 30_000,
  });

  const acknowledge = useMutation({
    mutationFn: api.acknowledgeAlert,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  const logOut = () => {
    setAuthToken(null);
    navigate({ to: "/login" });
  };

  return (
    <header
      className="fixed top-0 left-[260px] right-0 z-30 flex items-center gap-6 border-b border-border px-8 py-4 backdrop-blur-xl"
      style={{
        background: isLight ? "rgba(238,238,248,0.85)" : "#000e45",
        ...(!isLight && {
          "--foreground": "#ffffff",
          "--muted-foreground": "oklch(0.72 0.02 250)",
        } as React.CSSProperties),
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-[24px] font-semibold tracking-tight text-foreground">{title}</h1>
          <Link
            to="/system"
            className="rounded-full border border-[var(--emerald-glow)]/30 bg-[var(--emerald-glow)]/10 px-2 py-0.5 text-[12px] font-medium uppercase tracking-widest text-[var(--emerald-glow)] hover:bg-[var(--emerald-glow)]/15"
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--emerald-glow)] pulse-dot align-middle" />
            Live
          </Link>
        </div>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        <RegisterPatientDialog />

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isLight ? "Switch to dark theme" : "Switch to light theme"}
          className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:text-foreground"
        >
          {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition hover:text-foreground outline-none"
            >
              <Bell className="h-4 w-4" />
              {alerts.length > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--danger)] pulse-dot" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Escalation Alerts</span>
              {alerts.length > 0 && (
                <span className="rounded-full bg-[var(--danger)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--danger)]">{alerts.length} active</span>
              )}
            </div>
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">All clear — no active alerts</div>
              ) : alerts.map((alert) => {
                const Icon = alertIcon(alert);
                return (
                  <div key={alert.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-500/10">
                      <Icon className="h-3.5 w-3.5 text-orange-500" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-foreground">{alert.rule_name}</div>
                      <div className="text-[12px] text-muted-foreground">{alert.message}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-muted-foreground">{timeAgo(alert.created_at)}</span>
                      <button
                        onClick={() => acknowledge.mutate(alert.id)}
                        className="text-[11px] font-medium text-blue-500 hover:underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border px-4 py-2.5 text-center">
              <DropdownMenuItem asChild>
                <Link to="/notifications" className="text-[12px] font-medium text-blue-500 hover:underline justify-center">
                  View all notifications
                </Link>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 outline-none transition hover:bg-muted/60 data-[state=open]:bg-muted/60"
              aria-label="Account menu"
            >
              <div className="grid h-7 w-7 place-items-center rounded-lg text-[13px] font-bold text-white" style={{ background: "var(--gradient-violet)" }}>HQ</div>
              <div className="hidden text-left leading-tight md:block">
                <div className="text-[13px] font-medium text-foreground">Hospital Queue</div>
                <div className="text-[12px] text-muted-foreground">Staff Console</div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>
              <div className="leading-tight">
                <div className="text-base font-medium text-foreground">Hospital Queue</div>
                <div className="text-[13px] font-normal text-muted-foreground">Staff Console</div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/notifications">
                <Bell className="mr-2 h-4 w-4" />
                Notifications
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={logOut}
              className="text-[var(--danger)] focus:text-[var(--danger)]"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
