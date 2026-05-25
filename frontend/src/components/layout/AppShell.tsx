import { ReactNode } from "react";
import { SideRail } from "./SideRail";
import { TopBar } from "./TopBar";

export function AppShell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">

      <div className="relative flex min-h-screen">
        <SideRail />
        <div className="flex flex-1 flex-col pl-[260px]">
          <TopBar title={title} subtitle={subtitle} />
          <main className="flex-1 px-8 pb-12 pt-6">{children}</main>
        </div>
      </div>
    </div>
  );
}