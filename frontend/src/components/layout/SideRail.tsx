import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutGrid,
  Radio,
  Cctv,
  Bell,
  Users,
  Stethoscope,
  Cpu,
  Settings,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTheme } from "@/lib/theme";

const nav: { to: string; icon: any; label: string }[] = [
  { to: "/", icon: LayoutGrid, label: "Overview" },
  { to: "/queues", icon: Radio, label: "Smart Queue" },
  { to: "/staff", icon: Users, label: "Staff Operations" },
  { to: "/doctors", icon: Stethoscope, label: "Doctor Availability" },
  { to: "/notifications", icon: Bell, label: "Notifications" },
  { to: "/cctv", icon: Cctv, label: "CCTV Analytics" },
  { to: "/system", icon: Cpu, label: "System Health" },
];

export function SideRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isLight } = useTheme();
  return (
    <aside
      className={`fixed left-4 top-4 bottom-4 z-40 flex w-[244px] flex-col rounded-2xl px-3 py-5 overflow-hidden ${!isLight ? "glass-strong" : ""}`}
      style={isLight ? { background: "#0a1045", boxShadow: "0 8px 32px 0 rgba(10,16,69,0.2)", backdropFilter: "blur(16px)" } : undefined}
    >

      <Link to="/" className="relative z-10 mb-6 flex items-center gap-3 px-2">
        <span className="leading-tight">
          <span className="block text-base font-semibold text-white">SmartQueue AI</span>
          <span className={`block text-[12px] uppercase tracking-widest ${!isLight ? "text-white" : "text-white/60"}`}>Healthcare Ops Platform</span>
        </span>
      </Link>

      <nav className="relative z-10 flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {nav.map(({ to, icon: Icon, label }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors hover:text-white hover:bg-white/5 ${!isLight ? "text-white" : "text-white/60"}`}
            >
              {active && (
                <motion.span
                  layoutId="rail-active"
                  className="absolute inset-0 rounded-xl bg-[var(--cyan-glow)]/10 ring-1 ring-[var(--cyan-glow)]/35"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className={`relative z-10 h-[16px] w-[16px] ${active ? "text-[var(--cyan-glow)]" : ""}`} />
              <span className={`relative z-10 flex-1 truncate ${active ? "font-medium text-[var(--cyan-glow)]" : ""}`}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="relative z-10 mt-3 space-y-1 border-t border-white/10 pt-3">
        {[
          { to: "/settings", icon: Settings, label: "Settings" },
        ].map(({ to, icon: Icon, label }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors hover:text-white hover:bg-white/5 ${!isLight ? "text-white" : "text-white/60"}`}
            >
              {active && (
                <motion.span
                  layoutId="rail-active-bottom"
                  className="absolute inset-0 rounded-xl bg-[var(--cyan-glow)]/10 ring-1 ring-[var(--cyan-glow)]/35"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className={`relative z-10 h-[16px] w-[16px] ${active ? "text-[var(--cyan-glow)]" : ""}`} />
              <span className={`relative z-10 flex-1 truncate ${active ? "font-medium text-[var(--cyan-glow)]" : ""}`}>{label}</span>
            </Link>
          );
        })}
        <div className={`flex items-center gap-2 px-3 pt-1 text-[12px] uppercase tracking-widest ${!isLight ? "text-white/40" : "text-white/40"}`}>
          <Cpu className="h-3 w-3" /> v2.4.1
        </div>
      </div>
    </aside>
  );
}
