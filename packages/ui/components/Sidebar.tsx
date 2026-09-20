"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ItemNav {
  href: string;
  label: string;
}

export function Sidebar({ items, pie }: { items: ItemNav[]; pie?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex h-screen w-56 shrink-0 flex-col justify-between border-r p-4 print:hidden"
      style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)" }}
    >
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const activo = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block min-h-11 content-center rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150"
                style={
                  activo
                    ? { background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }
                    : { color: "var(--gx-muted)" }
                }
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {pie && (
        <div className="border-t pt-4" style={{ borderColor: "var(--gx-edge)" }}>
          {pie}
        </div>
      )}
    </nav>
  );
}
