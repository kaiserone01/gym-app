"use client";

import { useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { es } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { Button } from "./Button";

// OJO: nunca usar fecha.toISOString() para comparar días — convierte a
// UTC primero, y de noche (pasadas las 8pm en Venezuela, UTC-4) eso salta
// al día siguiente. Se compara con los componentes locales de la fecha.
function mismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inicioDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function finDelDia(fecha: Date): Date {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d;
}

function inicioDeSemana(fecha: Date): Date {
  const d = inicioDelDia(fecha);
  const dia = d.getDay();
  const diff = dia === 0 ? 6 : dia - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function finDeSemana(fecha: Date): Date {
  const d = inicioDeSemana(fecha);
  d.setDate(d.getDate() + 6);
  return finDelDia(d);
}

function inicioDeMes(fecha: Date): Date {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function finDeMes(fecha: Date): Date {
  return finDelDia(new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0));
}

export interface SelectorRangoFechasProps {
  desde: Date;
  hasta: Date;
  // Días en que hubo al menos un turno — cualquier otro día queda
  // deshabilitado en el calendario (ver Task 5, obtenerDiasConActividad).
  diasConActividad: Date[];
  onCambiar: (desde: Date, hasta: Date) => void;
}

export function SelectorRangoFechas({ desde, hasta, diasConActividad, onCambiar }: SelectorRangoFechasProps) {
  const [abierto, setAbierto] = useState(false);

  const rango: DateRange = { from: desde, to: hasta };

  function estaDeshabilitado(fecha: Date): boolean {
    return !diasConActividad.some((dia) => mismoDia(dia, fecha));
  }

  function manejarSeleccion(nuevoRango: DateRange | undefined) {
    if (!nuevoRango?.from) return;
    const nuevoDesde = inicioDelDia(nuevoRango.from);
    const nuevoHasta = nuevoRango.to ? finDelDia(nuevoRango.to) : finDelDia(nuevoRango.from);
    onCambiar(nuevoDesde, nuevoHasta);
  }

  function aplicarAtajo(nuevoDesde: Date, nuevoHasta: Date) {
    onCambiar(nuevoDesde, nuevoHasta);
    setAbierto(false);
  }

  const hoy = new Date();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secundario" onClick={() => aplicarAtajo(inicioDelDia(hoy), finDelDia(hoy))}>
        Hoy
      </Button>
      <Button
        type="button"
        variant="secundario"
        onClick={() => aplicarAtajo(inicioDeSemana(hoy), finDeSemana(hoy))}
      >
        Esta semana
      </Button>
      <Button type="button" variant="secundario" onClick={() => aplicarAtajo(inicioDeMes(hoy), finDeMes(hoy))}>
        Este mes
      </Button>

      <div className="relative">
        <Button type="button" variant="secundario" onClick={() => setAbierto((v) => !v)}>
          {desde.toLocaleDateString("es-VE")} — {hasta.toLocaleDateString("es-VE")}
        </Button>

        {abierto && (
          <div
            className="absolute z-50 mt-2 rounded-2xl border p-3 shadow-lg"
            style={{ background: "var(--gx-surface)", borderColor: "var(--gx-edge)" }}
          >
            <DayPicker
              mode="range"
              locale={es}
              selected={rango}
              onSelect={manejarSeleccion}
              disabled={estaDeshabilitado}
              defaultMonth={hasta}
            />
          </div>
        )}
      </div>
    </div>
  );
}
