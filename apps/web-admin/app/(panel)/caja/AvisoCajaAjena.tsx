import { Card } from "@gym-app/ui/components/Card";

// Se muestra en vez de los formularios de operación (Registrar pago,
// Egreso, Arqueo) cuando la caja abierta de esta sucursal es de OTRO
// usuario — hoy esto le pasa sobre todo a un SOCIO, que ve todas las
// sucursales y antes terminaba operando la caja de otra persona como si
// fuera suya (ver caso de uso: un solo usuario a la vez por caja). Un
// SOCIO sí puede ver el estado/resumen de la caja (bajado en page.tsx),
// pero no registrar pagos, egresos ni cerrarla.
export function AvisoCajaAjena({ usuarioNombre, abiertoEn }: { usuarioNombre: string; abiertoEn: Date }) {
  return (
    // Card no acepta `style` propio (ver packages/ui/components/Card.tsx),
    // así que el color de aviso se aplica en un wrapper alrededor de ella.
    <div style={{ borderRadius: "1rem", background: "color-mix(in srgb, var(--gx-warn) 12%, transparent)" }}>
      <Card className="text-sm">
        <p style={{ color: "var(--gx-ink)" }}>
          Esta caja está abierta por <strong>{usuarioNombre}</strong> desde{" "}
          {abiertoEn.toLocaleString("es-VE")}. Solo podés ver el resumen — para registrar pagos, egresos o cerrarla
          tiene que hacerlo esa persona.
        </p>
      </Card>
    </div>
  );
}
