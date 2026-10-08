"use client";

import Link from "next/link";
import { Sheet } from "@gym-app/ui/components/Sheet";
import { BarraUsuario } from "./BarraUsuario";
import { puedeEditarKiosko } from "@/lib/permisoKiosko";

export function MasSheet({
  abierto,
  onCerrar,
  nombre,
  email,
  rol,
  puedeVerExcel,
}: {
  abierto: boolean;
  onCerrar: () => void;
  nombre: string;
  email: string;
  rol: string;
  puedeVerExcel: boolean;
}) {
  // Usuarios, Sucursales y Planes se administran desde las tabs de
  // Configuraciones (ver diseño acordado) — solo SOCIO llega a ellos, igual
  // que en el sidebar de escritorio.
  const enlaces = [
    { href: "/productos", label: "Productos" },
    ...(puedeVerExcel ? [{ href: "/excel", label: "Excel" }] : []),
    ...(puedeEditarKiosko(rol) ? [{ href: "/kiosko", label: "Kiosko" }] : []),
    ...(rol === "SOCIO" ? [{ href: "/configuraciones", label: "Configuraciones" }] : []),
  ];

  return (
    <Sheet abierto={abierto} onCerrar={onCerrar} titulo="Más">
      <ul className="flex flex-col gap-1">
        {enlaces.map((enlace) => (
          <li key={enlace.href}>
            <Link
              href={enlace.href}
              onClick={onCerrar}
              className="block min-h-11 content-center rounded-lg px-3 text-sm font-medium"
              style={{ color: "var(--gx-ink)" }}
            >
              {enlace.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--gx-edge)" }}>
        <BarraUsuario nombre={nombre} email={email} />
      </div>
    </Sheet>
  );
}
