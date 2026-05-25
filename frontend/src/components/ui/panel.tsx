import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

type PanelProps = HTMLMotionProps<"div"> & {
  glow?: "cyan" | "violet" | "emerald" | "none";
  variant?: "glass" | "solid";
};

export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { className, glow = "none", variant = "glass", children, ...props },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "relative rounded-2xl",
        variant === "glass" ? "glass" : "glass-strong",
        glow === "cyan" && "glow-cyan",
        glow === "violet" && "glow-violet",
        glow === "emerald" && "glow-emerald",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
});

export function PanelHeader({
  title,
  subtitle,
  action,
  accent,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  accent?: "cyan" | "violet" | "emerald";
}) {
  const color =
    accent === "violet" ? "var(--violet-glow)" : accent === "emerald" ? "var(--emerald-glow)" : "var(--cyan-glow)";
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 px-5 py-4">
      <div className="flex items-center gap-3">
        {accent && (
          <span
            className="grid h-2 w-2 rounded-full"
            style={{ background: color, boxShadow: `0 0 12px ${color}` }}
          />
        )}
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}