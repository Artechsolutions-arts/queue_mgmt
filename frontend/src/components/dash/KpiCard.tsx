import { motion } from "framer-motion";
import { Check, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

export type KpiTone = "cyan" | "violet" | "emerald" | "warn" | "danger";
export type DeltaTone = "good" | "bad" | "warn" | "violet" | "muted";

const TONE: Record<KpiTone, { gradient: string; solid: string; tint: string }> = {
  cyan: {
    gradient: "linear-gradient(135deg, oklch(0.62 0.18 252), oklch(0.7 0.16 230))",
    solid: "oklch(0.56 0.18 252)",
    tint: "oklch(0.56 0.18 252 / 0.08)",
  },
  violet: {
    gradient: "linear-gradient(135deg, oklch(0.58 0.22 295), oklch(0.7 0.2 330))",
    solid: "oklch(0.55 0.2 290)",
    tint: "oklch(0.55 0.2 290 / 0.08)",
  },
  emerald: {
    gradient: "linear-gradient(135deg, oklch(0.65 0.16 160), oklch(0.72 0.14 190))",
    solid: "oklch(0.55 0.14 160)",
    tint: "oklch(0.6 0.14 160 / 0.1)",
  },
  warn: {
    gradient: "linear-gradient(135deg, oklch(0.72 0.16 60), oklch(0.78 0.16 40))",
    solid: "oklch(0.62 0.16 55)",
    tint: "oklch(0.7 0.16 60 / 0.1)",
  },
  danger: {
    gradient: "linear-gradient(135deg, oklch(0.62 0.22 25), oklch(0.68 0.22 15))",
    solid: "oklch(0.6 0.22 25)",
    tint: "oklch(0.6 0.22 25 / 0.1)",
  },
};

const DELTA_COLOR: Record<DeltaTone, string> = {
  good: "oklch(0.55 0.14 160)",
  bad: "oklch(0.6 0.22 25)",
  warn: "oklch(0.62 0.16 55)",
  violet: "oklch(0.55 0.2 290)",
  muted: "oklch(0.48 0.02 250)",
};

export function KpiCard({
  tone = "cyan",
  icon: Icon,
  label,
  value,
  unit,
  delta,
  deltaTone,
  status,
  to,
}: {
  tone?: KpiTone;
  icon: any;
  label: string;
  value: string;
  unit?: string;
  delta?: string | number | null;
  deltaTone?: DeltaTone;
  status?: string | null;
  to?: string;
}) {
  const t = TONE[tone];

  // Auto-pick delta tone + arrow when delta is a numeric percentage
  const numericDelta = typeof delta === "number" ? delta : null;
  const resolvedDeltaTone: DeltaTone =
    deltaTone ?? (numericDelta != null ? (numericDelta >= 0 ? "good" : "bad") : "muted");
  const deltaColor = DELTA_COLOR[resolvedDeltaTone];
  const Arrow =
    numericDelta != null
      ? numericDelta >= 0
        ? ArrowUpRight
        : ArrowDownRight
      : resolvedDeltaTone === "good"
        ? ArrowDownRight
        : resolvedDeltaTone === "bad" || resolvedDeltaTone === "warn"
          ? ArrowUpRight
          : null;
  const deltaLabel =
    numericDelta != null
      ? `${numericDelta >= 0 ? "+" : ""}${numericDelta}% vs yesterday`
      : typeof delta === "string"
        ? delta
        : null;

  const body = (
    <>
      <div className="flex items-start justify-between">
        <span
          className="grid h-11 w-11 place-items-center rounded-xl text-white shadow-md"
          style={{ background: t.gradient, boxShadow: `0 8px 18px -8px ${t.solid}` }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span
          className="grid h-7 w-7 place-items-center rounded-full"
          style={{ background: t.tint, color: t.solid }}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </div>

      <div className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className="text-[32px] font-bold leading-none tracking-tight tabular-nums"
          style={{ color: t.solid }}
        >
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </div>

      {deltaLabel && (
        <div className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color: deltaColor }}>
          {Arrow && <Arrow className="h-3.5 w-3.5" />}
          {deltaLabel}
        </div>
      )}

      {status && (
        <div
          className="mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
          style={{ background: t.tint, color: t.solid }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.solid }} />
          {status}
        </div>
      )}
    </>
  );

  const sharedClass =
    "group relative flex flex-col rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-[0_2px_6px_0_oklch(0.2_0.02_250/0.06),0_18px_36px_-18px_oklch(0.2_0.02_250/0.16)]";
  const motionProps = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
    whileHover: { y: -2 },
  };

  if (to) {
    return (
      <Link to={to} className="block">
        <motion.div {...motionProps} className={sharedClass}>
          {body}
        </motion.div>
      </Link>
    );
  }
  return (
    <motion.div {...motionProps} className={sharedClass}>
      {body}
    </motion.div>
  );
}
