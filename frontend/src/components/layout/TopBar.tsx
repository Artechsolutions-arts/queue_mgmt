import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { RegisterPatientDialog } from "@/components/dash/RegisterPatientDialog";

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 mb-2 flex items-center gap-6 border-b border-border bg-background/80 px-2 py-4 backdrop-blur-xl">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-[22px] font-semibold tracking-tight text-foreground">{title}</h1>
          <Link
            to="/system"
            className="rounded-full border border-[var(--emerald-glow)]/30 bg-[var(--emerald-glow)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest text-[var(--emerald-glow)] hover:bg-[var(--emerald-glow)]/15"
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--emerald-glow)] pulse-dot align-middle" />
            Live
          </Link>
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        <RegisterPatientDialog />
        <Link
          to="/notifications"
          className="relative grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--danger)] pulse-dot" />
        </Link>
        <Link
          to="/staff"
          className="ml-1 flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 hover:bg-muted/60"
        >
          <div className="grid h-7 w-7 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: "var(--gradient-violet)" }}>DR</div>
          <div className="hidden text-left leading-tight md:block">
            <div className="text-[11px] font-medium text-foreground">Dr. Reyes</div>
            <div className="text-[10px] text-muted-foreground">Chief Ops</div>
          </div>
        </Link>
      </div>
    </header>
  );
}
