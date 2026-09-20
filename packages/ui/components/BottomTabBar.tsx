"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type ItemTab =
  | { tipo: "link"; href: string; label: string; icon: ReactNode; iconActivo: ReactNode }
  | { tipo: "accion"; label: string; icon: ReactNode; iconActivo: ReactNode; onPress: () => void; activo?: boolean };

export function BottomTabBar({ items }: { items: ItemTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t lg:hidden"
      style={{
        background: "var(--gx-surface)",
        borderColor: "var(--gx-edge)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {items.map((item) => {
        if (item.tipo === "link") {
          const activo = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150 active:scale-95"
              style={{ color: activo ? "var(--gx-accent)" : "var(--gx-muted)" }}
            >
              {activo ? item.iconActivo : item.icon}
              {item.label}
            </Link>
          );
        }

        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onPress}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150 active:scale-95"
            style={{ color: item.activo ? "var(--gx-accent)" : "var(--gx-muted)" }}
          >
            {item.activo ? item.iconActivo : item.icon}
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
