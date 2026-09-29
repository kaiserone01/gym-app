"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRinging, SpeakerSlash } from "@phosphor-icons/react/dist/ssr";
import { Avatar } from "@gym-app/ui/components/Avatar";
import { Button } from "@gym-app/ui/components/Button";
import { Card } from "@gym-app/ui/components/Card";
import { Badge } from "@gym-app/ui/components/Badge";
import type { EstadoCheckIn } from "@gym-app/domain/entities/CheckIn";
import { useEnSala, type PersonaEnSalaVista } from "./ContextoEnSala";
import { marcarSalidaAction } from "./actions";

const ETIQUETA_ESTADO: Record<EstadoCheckIn, string> = {
  activo: "Al día",
  en_gracia: "Vencida — en gracia",
  vencido: "Vencida",
  abono_vencido: "Abono vencido",
  sucursal_incorrecta: "Otra sucursal",
};

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Caracas" });
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

export function ListaEnSala({ puedeMarcarSalida }: { puedeMarcarSalida: boolean }) {
  const enSala = useEnSala();
  const [saliendo, setSaliendo] = useState<string | null>(null);

  if (!enSala) return null;
  const { personas, cobros, avisosActivos, activarAvisos, desactivarAvisos, recargar } = enSala;

  async function marcarSalida(persona: PersonaEnSalaVista) {
    setSaliendo(persona.miembroId);
    try {
      await marcarSalidaAction(persona.miembroId);
      await recargar();
    } finally {
      setSaliendo(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          {personas === null
            ? "Cargando…"
            : `${personas.length} en sala${cobros > 0 ? ` · ${cobros} por cobrar` : ""}`}
        </p>
        {avisosActivos ? (
          <Button type="button" variant="secundario" onClick={desactivarAvisos}>
            <SpeakerSlash size={18} className="mr-2 inline" />
            Silenciar avisos
          </Button>
        ) : (
          <Button type="button" onClick={() => void activarAvisos()}>
            <BellRinging size={18} className="mr-2 inline" />
            Activar sonido y avisos
          </Button>
        )}
      </div>

      {personas !== null && personas.length === 0 && (
        <Card>
          <p className="text-center" style={{ color: "var(--gx-muted)" }}>
            Nadie ha hecho check-in hoy en esta sucursal.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {personas?.map((persona) => (
          <Card
            key={persona.checkInId}
            className="flex flex-wrap items-center gap-4"
          >
            <Avatar fotoUrl={persona.fotoUrl} nombre={persona.nombre} tamano={56} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold" style={{ color: "var(--gx-ink)" }}>
                {persona.nombre}
              </p>
              <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
                Entró a las {hora(persona.fechaHora)}
                {persona.planNombre ? ` · ${persona.planNombre}` : ""}
              </p>
              {persona.requiereCobro ? (
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--gx-bad)" }}>
                  {ETIQUETA_ESTADO[persona.estado]}
                  {persona.fechaVencimiento ? ` desde el ${fecha(persona.fechaVencimiento)}` : ""} — cobrar antes de entrenar
                </p>
              ) : (
                <div className="mt-1">
                  <Badge tono={persona.estado === "activo" ? "verde" : "gris"}>{ETIQUETA_ESTADO[persona.estado]}</Badge>
                </div>
              )}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              {persona.requiereCobro && (
                <Link
                  href={`/miembros/${persona.miembroId}`}
                  className="flex min-h-11 flex-1 items-center justify-center rounded-lg px-4 text-sm font-semibold sm:flex-none"
                  style={{ background: "var(--gx-bad)", color: "white" }}
                >
                  Cobrar ahora
                </Link>
              )}
              {puedeMarcarSalida && (
                <Button
                  type="button"
                  variant="secundario"
                  className="flex-1 sm:flex-none"
                  disabled={saliendo === persona.miembroId}
                  onClick={() => void marcarSalida(persona)}
                >
                  Marcar salida
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
