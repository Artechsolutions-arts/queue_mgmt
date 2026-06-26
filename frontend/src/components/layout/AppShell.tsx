import { ReactNode } from "react";
import { SideRail } from "./SideRail";
import { TopBar } from "./TopBar";
import { useTheme } from "@/lib/theme";

export function AppShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const { isLight } = useTheme();

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Full-screen background illustration */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: isLight ? "url(/lighttheme.png)" : "url(/darktheme.png)",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "top center",
          backgroundSize: "cover",
          opacity: isLight ? 0.3 : 1,
        }}
      />
      
      <div className="relative z-10 flex min-h-screen">
        <SideRail />
        <div className="flex flex-1 flex-col pl-[260px]">
          <TopBar title={title} subtitle={subtitle} />
          {/* Spacer to push content below the fixed header (~92px) */}
          <div className="h-[92px] flex-shrink-0" />
          <main className="flex-1 px-8 pb-12 pt-8">{children}</main>
        </div>
      </div>
    </div>
  );
}