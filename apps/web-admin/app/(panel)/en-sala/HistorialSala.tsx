"use client";

import { useEffect, useState } from "react";
import { Printer } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@gym-app/ui/components/Button";
import type { EstadoCheckIn } from "@gym-app/domain/entities/CheckIn";

interface FilaHistorial {
  checkInId: string;
  nombre: string;
  planNombre: string | null;
  fechaHora: string;
  salidaAt: string | null;
  estado: EstadoCheckIn;
}

type Rango = "24h" | "hoy";

const ETIQUETA_ESTADO: Record<EstadoCheckIn, string> = {
  activo: "Al día",
  en_gracia: "Vencida — en gracia",
  vencido: "Vencida",
  abono_vencido: "Abono vencido",
  sucursal_incorrecta: "Otra sucursal",
};

const ETIQUETA_RANGO: Record<Rango, string> = { "24h": "Últimas 24 horas", hoy: "Hoy" };

function horaFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Caracas",
  });
}

export function HistorialSala({ sucursalNombre }: { sucursalNombre: string }) {
  const [rango, setRango] = useState<Rango>("24h");
  const [filas, setFilas] = useState<FilaHistorial[] | null>(null);
  const [error, setError] = useState(false);

  function cambiarRango(r: Rango) {
    setFilas(null);
    setError(false);
    setRango(r);
  }

  useEffect(() => {
    let vigente = true;
    fetch(`/api/en-sala/historial?rango=${rango}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const { personas } = (await r.json()) as { personas: FilaHistorial[] };
        if (vigente) setFilas(personas);
      })
      .catch(() => vigente && setError(true));
    return () => {
      vigente = false;
    };
  }, [rango]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex gap-2">
          {(Object.keys(ETIQUETA_RANGO) as Rango[]).map((r) => (
            <Button key={r} type="button" variant={rango === r ? "primario" : "secundario"} onClick={() => cambiarRango(r)}>
              {ETIQUETA_RANGO[r]}
            </Button>
          ))}
        </div>
        <Button type="button" variant="secundario" onClick={() => window.print()} disabled={!filas?.length}>
          <Printer size={18} className="mr-2 inline" />
          Imprimir
        </Button>
      </div>

      <div className="hidden print:block">
        <h2 className="text-xl font-semibold">Historial de sala — {sucursalNombre}</h2>
        <p className="text-sm">
          {ETIQUETA_RANGO[rango]} · impreso el {horaFecha(new Date().toISOString())}
        </p>
      </div>

      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        {error ? "No se pudo cargar el historial." : filas === null ? "Cargando…" : `${filas.length} personas`}
      </p>

      {filas && filas.length > 0 && (
        <table className="w-full text-left text-sm" style={{ color: "var(--gx-ink)" }}>
          <thead>
            <tr className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
              <th className="py-2 pr-3">Nombre</th>
              <th className="py-2 pr-3">Entrada</th>
              <th className="py-2 pr-3">Salida</th>
              <th className="py-2 pr-3">Plan</th>
              <th className="py-2">Estado de pago</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.checkInId} className="border-b" style={{ borderColor: "var(--gx-edge)" }}>
                <td className="py-2 pr-3 font-medium">{f.nombre}</td>
                <td className="py-2 pr-3">{horaFecha(f.fechaHora)}</td>
                <td className="py-2 pr-3">{f.salidaAt ? horaFecha(f.salidaAt) : "—"}</td>
                <td className="py-2 pr-3">{f.planNombre ?? "—"}</td>
                <td className="py-2">{ETIQUETA_ESTADO[f.estado]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
