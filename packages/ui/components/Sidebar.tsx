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
    <nav className="flex h-screen w-56 shrink-0 flex-col justify-between border-r border-neutral-200 bg-neutral-50 p-4 print:hidden">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const activo = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded px-3 py-2 text-sm font-medium ${
                  activo ? "bg-blue-600 text-white" : "text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {pie && <div className="border-t border-neutral-200 pt-4">{pie}</div>}
    </nav>
  );
}
