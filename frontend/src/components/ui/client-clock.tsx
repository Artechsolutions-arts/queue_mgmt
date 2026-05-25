import { useEffect, useState } from "react";

/**
 * Renders a live clock that is empty during SSR and the first client render,
 * then hydrates safely on mount. Prevents hydration mismatches caused by
 * locale-formatted timestamps differing between server and browser.
 */
export function ClientClock({ className }: { className?: string }) {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      setNow(`${hh}:${mm}:${ss}`);
    };
    fmt();
    const t = setInterval(fmt, 1000);
    return () => clearInterval(t);
  }, []);
  return <span className={className} suppressHydrationWarning>{now || "--:--:--"}</span>;
}