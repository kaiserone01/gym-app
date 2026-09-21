"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface ItemNav {
  href: string;
  label: string;
}

export function Sidebar({
  items,
  pie,
  encabezado,
}: {
  items: ItemNav[];
  pie?: React.ReactNode;
  // Contenido fijo arriba del menú (logo, nombre del gym, sucursal activa)
  // — opcional para no romper otros consumidores del Sidebar.
  encabezado?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <nav
      // sticky (no fixed) para que quede clavado al hacer scroll de una
      // página larga, sin sacarlo del flujo del flex row del layout del
      // panel — antes usaba h-screen dentro de un contenedor sin scroll
      // propio, así que el sidebar se desplazaba junto con el contenido.
      className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col justify-between overflow-y-auto border-r p-4 print:hidden"
      style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)" }}
    >
      <div className="flex flex-col gap-1">
        {encabezado && (
          <div className="mb-4 border-b pb-4" style={{ borderColor: "var(--gx-edge)" }}>
            {encabezado}
          </div>
        )}
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
      </div>
      {pie && (
        <div className="border-t pt-4" style={{ borderColor: "var(--gx-edge)" }}>
          {pie}
        </div>
      )}
    </nav>
  );
}
