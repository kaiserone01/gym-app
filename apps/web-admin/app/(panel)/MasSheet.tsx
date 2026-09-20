"use client";

import Link from "next/link";
import { Sheet } from "@gym-app/ui/components/Sheet";
import { BarraUsuario } from "./BarraUsuario";

const ENLACES = [
  { href: "/usuarios", label: "Usuarios" },
  { href: "/sucursales", label: "Sucursales" },
  { href: "/planes", label: "Planes" },
];

export function MasSheet({
  abierto,
  onCerrar,
  nombre,
  email,
  rol,
}: {
  abierto: boolean;
  onCerrar: () => void;
  nombre: string;
  email: string;
  rol: string;
}) {
  const enlaces = rol === "SOCIO" ? [...ENLACES, { href: "/configuraciones", label: "Configuraciones" }] : ENLACES;

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
