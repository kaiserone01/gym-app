import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import type { Tono } from "@/lib/cara";
import { COLOR_TONO } from "@/lib/tonos";
import { MarcoFicha } from "./MarcoFicha";

// Caras sin miembro: "sin conexión" (ámbar) y error del servidor (rojo).
export function FichaAviso({
  tono,
  titulo,
  detalle,
  duracionMs,
}: {
  tono: Tono;
  titulo: string;
  detalle: string;
  duracionMs?: number;
}) {
  const { color, tinta, brillo } = COLOR_TONO[tono];

  return (
    <MarcoFicha color={color} brillo={brillo} duracionMs={duracionMs}>
      <div
        className="flex items-center gap-4 px-10 py-6 text-6xl"
        style={{ background: color, color: tinta, fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}
      >
        <WarningCircle size={56} weight="fill" />
        {titulo}
      </div>
      <p className="p-12 text-4xl" style={{ color: "var(--gx-ink)" }}>
        {detalle}
      </p>
    </MarcoFicha>
  );
}
