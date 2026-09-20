"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface TabConfiguracion {
  href: string;
  label: string;
}

export function TabsConfiguraciones({ tabs }: { tabs: TabConfiguracion[] }) {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--gx-edge)" }}>
      {tabs.map((tab) => {
        const activo = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="min-h-11 shrink-0 content-center border-b-2 px-4 text-sm font-medium"
            style={
              activo
                ? { borderColor: "var(--gx-accent)", color: "var(--gx-ink)" }
                : { borderColor: "transparent", color: "var(--gx-muted)" }
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
