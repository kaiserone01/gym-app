import type { InfoKiosco } from "@/lib/api";
import { MarcoFicha } from "./MarcoFicha";

function formatearTasa(tasa: InfoKiosco["tasaBcv"]): string {
  if (!tasa) return "—";
  return `Bs. ${tasa.valor.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Ficha en reposo: nunca muestra datos de una persona. Sin verde ni ✓ de "acceso permitido".
export function FichaReposo({
  frase,
  saliendo,
  hora,
  tasa,
  sede,
}: {
  frase: string;
  saliendo: boolean;
  hora: string;
  tasa: InfoKiosco["tasaBcv"];
  sede: string | null;
}) {
  const datos: { etiqueta: string; valor: string }[] = [
    { etiqueta: "Hora", valor: hora || "—" },
    { etiqueta: "Tasa BCV", valor: formatearTasa(tasa) },
    { etiqueta: "Sede", valor: sede ?? "—" },
  ];

  return (
    <MarcoFicha color="var(--gx-edge)">
      <div className="grid grid-cols-[auto_1fr] items-center gap-12 p-12">
        <div
          className="h-56 w-56 overflow-hidden rounded-full"
          style={{ border: "4px solid var(--gx-edge)", background: "var(--gx-surface-2)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image */}
          <img src="/branding/placeholder-profile.jpg" alt="" className="h-full w-full object-cover" />
        </div>

        <div className="flex flex-col gap-8">
          <p
            key={frase}
            className={`min-h-[8rem] text-7xl leading-none ${saliendo ? "frase-salida" : "frase-entrada"}`}
            style={{ fontFamily: '"Bebas Neue", sans-serif', color: "var(--gx-ink)" }}
          >
            {frase}
          </p>

          <div className="grid grid-cols-3 gap-6 border-t pt-6" style={{ borderColor: "var(--gx-edge)" }}>
            {datos.map(({ etiqueta, valor }) => (
              <div key={etiqueta} className="flex flex-col gap-1">
                <span className="text-2xl font-bold uppercase" style={{ letterSpacing: "0.1em", color: "var(--gx-muted-dim)" }}>
                  {etiqueta}
                </span>
                <span className="text-4xl font-semibold" style={{ color: "var(--gx-ink)" }}>
                  {valor}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MarcoFicha>
  );
}
