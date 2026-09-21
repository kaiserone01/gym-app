// Se muestra en vez de los formularios de operación (Registrar pago,
// Egreso, Arqueo) cuando la caja abierta de esta sucursal es de OTRO
// usuario — hoy esto le pasa sobre todo a un SOCIO, que ve todas las
// sucursales y antes terminaba operando la caja de otra persona como si
// fuera suya (ver caso de uso: un solo usuario a la vez por caja). Un
// SOCIO sí puede ver el estado/resumen de la caja (bajado en page.tsx),
// pero no registrar pagos, egresos ni cerrarla.
//
// No se reusa `Card` (que ya pinta su propio borde gris vía
// `var(--gx-edge)`) para no terminar con fondo ámbar pero borde gris —
// se replica el mismo patrón de `<div>` propio que usa AvisoCajaCerrada.tsx
// para lograr borde+fondo ámbar coherentes.
export function AvisoCajaAjena({ usuarioNombre, abiertoEn }: { usuarioNombre: string; abiertoEn: Date }) {
  return (
    <div
      className="rounded-2xl border p-5 text-sm"
      style={{ borderColor: "var(--gx-warn)", background: "color-mix(in srgb, var(--gx-warn) 12%, transparent)" }}
    >
      <p style={{ color: "var(--gx-ink)" }}>
        Esta caja está abierta por <strong>{usuarioNombre}</strong> desde{" "}
        {abiertoEn.toLocaleString("es-VE")}. Solo podés ver el resumen — para registrar pagos, egresos o cerrarla
        tiene que hacerlo esa persona.
      </p>
    </div>
  );
}
