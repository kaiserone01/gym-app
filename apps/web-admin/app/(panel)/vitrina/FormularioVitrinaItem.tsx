"use client";

import type { ChangeEvent } from "react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@gym-app/ui/components/Button";
import { Input } from "@gym-app/ui/components/Input";
import { useFeedback } from "@gym-app/ui/components/FeedbackOverlay";
import type { TipoMedio, TipoVitrinaItem, VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import { diaCalendarioCaracas } from "@gym-app/domain/utils/fechaCaracas";
import { guardarItemAction } from "./actions";
import { SelectorMedio } from "./SelectorMedio";

const dia = (fecha: Date | null) => (fecha ? diaCalendarioCaracas(fecha).toISOString().slice(0, 10) : "");

// Con `alCambiar` el interruptor es controlado (conserva la elección mientras el formulario siga montado).
function Interruptor({ nombre, etiqueta, marcado, alCambiar }: { nombre: string; etiqueta: string; marcado: boolean; alCambiar?: (marcado: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--gx-ink)" }}>
      <input
        type="checkbox"
        name={nombre}
        {...(alCambiar ? { checked: marcado, onChange: (e: ChangeEvent<HTMLInputElement>) => alCambiar(e.target.checked) } : { defaultChecked: marcado })}
        className="h-5 w-5"
        style={{ accentColor: "var(--gx-accent)" }}
      />
      {etiqueta}
    </label>
  );
}

// `entrenadores` solo sirve para copiar un nombre al campo (la vitrina no queda vinculada a ningún usuario).
export function FormularioVitrinaItem({
  tipo,
  item,
  entrenadores = [],
}: {
  tipo: TipoVitrinaItem;
  item?: VitrinaItem;
  entrenadores?: { id: string; nombre: string }[];
}) {
  const [estado, enviar, enviando] = useActionState(guardarItemAction, {});
  const { mostrarError } = useFeedback();
  const [nombre, setNombre] = useState(item?.nombre ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const [sonido, setSonido] = useState(item?.sonido ?? false); // se conserva al ir video -> imagen -> video
  const [tipoMedio, setTipoMedio] = useState<TipoMedio | null>(item?.mediaTipo ?? null);
  const formulario = useRef<HTMLFormElement>(null);
  const mensajeError = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!estado.error) return;
    mostrarError(estado.error);
    // El primer campo inválido recibe el foco tras un envío fallido; si no hay, el mensaje de error.
    const primero = formulario.current?.querySelector<HTMLElement>(":invalid") ?? mensajeError.current;
    primero?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe reaccionar a un nuevo estado
  }, [estado]);

  const esEntrenador = tipo === "ENTRENADOR";
  const interruptorSonido = tipoMedio === "VIDEO" && (
    <div>
      <Interruptor nombre="sonido" etiqueta="Con sonido" marcado={sonido} alCambiar={setSonido} />
      <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
        Si está activo, el video se oye en la TV. En una franja de entrenadores solo suena el video que se está reproduciendo.
      </p>
    </div>
  );

  return (
    <form
      ref={formulario}
      // Se envía dentro de una transición (en vez de action=) para que React no reinicie los campos si el servidor rechaza los datos.
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="flex max-w-2xl flex-col gap-5"
    >
      <input type="hidden" name="tipo" value={tipo} />
      {item && <input type="hidden" name="id" value={item.id} />}

      <SelectorMedio
        tipoItem={tipo}
        alOcupar={setSubiendo}
        alCambiarTipo={setTipoMedio}
        inicial={item ? { mediaUrl: item.mediaUrl, mediaTipo: item.mediaTipo, posterUrl: item.posterUrl } : undefined}
      />

      {esEntrenador && entrenadores.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--gx-muted)" }}>
          Copiar el nombre de un entrenador existente (opcional)
          <select
            className="gx-campo min-h-11 rounded-lg border px-3"
            defaultValue=""
            onChange={(e) => e.target.value && setNombre(e.target.value)}
          >
            <option value="">—</option>
            {entrenadores.map((e) => (
              <option key={e.id} value={e.nombre}>
                {e.nombre}
              </option>
            ))}
          </select>
        </label>
      )}

      <Input
        label={esEntrenador ? "Nombre" : "Nombre (solo para identificarlo en el panel)"}
        name="nombre"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        maxLength={60}
        required={esEntrenador}
      />

      {esEntrenador ? (
        <>
          <Input label="Especialidad" name="especialidad" defaultValue={item?.especialidad ?? ""} maxLength={60} />
          <Input label="Frase" name="frase" defaultValue={item?.frase ?? ""} maxLength={120} />
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm" style={{ color: "var(--gx-muted)" }}>Qué se muestra en la TV</legend>
            <Interruptor nombre="mostrarMedio" etiqueta="Foto o video" marcado={item?.mostrarMedio ?? true} />
            <Interruptor nombre="mostrarNombre" etiqueta="Nombre" marcado={item?.mostrarNombre ?? true} />
            <Interruptor nombre="mostrarEspecialidad" etiqueta="Especialidad" marcado={item?.mostrarEspecialidad ?? true} />
            <Interruptor nombre="mostrarFrase" etiqueta="Frase" marcado={item?.mostrarFrase ?? true} />
            {interruptorSonido}
          </fieldset>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Precio (USD)" name="precioUSD" inputMode="decimal" defaultValue={item?.precioUSD ?? ""} />
            <Input label="Oferta (USD)" name="ofertaUSD" inputMode="decimal" defaultValue={item?.ofertaUSD ?? ""} />
            <Input label="Descuento (%)" name="descuentoPct" inputMode="numeric" defaultValue={item?.descuentoPct ?? ""} />
          </div>
          <Input label="Etiqueta (ej. NUEVO, 2x1)" name="etiqueta" defaultValue={item?.etiqueta ?? ""} maxLength={20} />
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm" style={{ color: "var(--gx-muted)" }}>Qué se muestra en la TV</legend>
            <Interruptor nombre="mostrarPrecio" etiqueta="Precio" marcado={item?.mostrarPrecio ?? true} />
            <Interruptor nombre="mostrarOferta" etiqueta="Oferta" marcado={item?.mostrarOferta ?? true} />
            <Interruptor nombre="mostrarDescuento" etiqueta="Descuento" marcado={item?.mostrarDescuento ?? true} />
            <Interruptor nombre="mostrarEtiqueta" etiqueta="Etiqueta" marcado={item?.mostrarEtiqueta ?? true} />
            <Interruptor nombre="mostrarEquivalenteBs" etiqueta="Equivalente en Bs (con la tasa BCV vigente)" marcado={item?.mostrarEquivalenteBs ?? true} />
            {interruptorSonido}
          </fieldset>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Duración (segundos, vacío = la de la sede)" name="duracionSeg" inputMode="numeric" defaultValue={item?.duracionSeg ?? ""} />
        <Input label="Mostrar desde" name="inicio" type="date" defaultValue={dia(item?.inicio ?? null)} />
        <Input label="Mostrar hasta (incluido)" name="fin" type="date" defaultValue={dia(item?.fin ?? null)} />
      </div>

      <div className="flex flex-col gap-2">
        {estado.error && (
          <p ref={mensajeError} tabIndex={-1} role="alert" className="text-sm outline-none" style={{ color: "var(--gx-bad)" }}>
            {estado.error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={enviando || subiendo}>
            {enviando ? "Guardando…" : subiendo ? "Subiendo archivo…" : "Guardar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
