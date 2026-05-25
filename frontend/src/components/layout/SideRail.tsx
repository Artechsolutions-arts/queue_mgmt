import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Radio,
  Cctv,
  Bell,
  Users,
  MonitorPlay,
  Cpu,
} from "lucide-react";
import { motion } from "framer-motion";

const nav: { to: string; icon: any; label: string }[] = [
  { to: "/", icon: LayoutGrid, label: "Overview" },
  { to: "/queues", icon: Radio, label: "Smart Queue" },
  { to: "/staff", icon: Users, label: "Staff Operations" },
  { to: "/display", icon: MonitorPlay, label: "Public Display" },
  { to: "/notifications", icon: Bell, label: "Notifications" },
  { to: "/cctv", icon: Cctv, label: "CCTV Analytics" },
  { to: "/system", icon: Cpu, label: "System Health" },
];

export function SideRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="fixed left-4 top-4 bottom-4 z-40 flex w-[244px] flex-col rounded-2xl glass-strong px-3 py-5">
      <Link to="/" className="mb-6 flex items-center gap-3 px-2">
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-foreground">SmartQueue AI</span>
          <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">Healthcare Ops Platform</span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {nav.map(({ to, icon: Icon, label }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {active && (
                <motion.span
                  layoutId="rail-active"
                  className="absolute inset-0 rounded-xl bg-[var(--cyan-glow)]/10 ring-1 ring-[var(--cyan-glow)]/35"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className={`relative z-10 h-[16px] w-[16px] ${active ? "text-[var(--cyan-glow)]" : ""}`} />
              <span className={`relative z-10 flex-1 truncate ${active ? "font-medium text-foreground" : ""}`}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 space-y-2">
        <Link
          to="/system"
          className="flex items-center gap-2 rounded-xl border border-[var(--emerald-glow)]/25 bg-[var(--emerald-glow)]/8 px-3 py-2.5 hover:bg-[var(--emerald-glow)]/12"
        >
          <span className="h-2 w-2 rounded-full bg-[var(--emerald-glow)] pulse-dot" />
          <div className="leading-tight">
            <div className="text-[11px] font-semibold text-foreground">System Status</div>
            <div className="text-[10px] text-muted-foreground">All systems operational</div>
          </div>
        </Link>
        <div className="flex items-center gap-2 px-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Cpu className="h-3 w-3" /> v2.4.1 Enterprise
        </div>
      </div>
    </aside>
  );
}
