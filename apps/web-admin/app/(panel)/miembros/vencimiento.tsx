// Días entre hoy y fechaVencimiento, redondeado a días completos — positivo
// si falta para vencer, negativo si ya venció.
export function diasHastaVencimiento(fechaVencimiento: Date): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencimiento = new Date(fechaVencimiento);
  vencimiento.setHours(0, 0, 0, 0);
  return Math.round((vencimiento.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000));
}

export function DiasDisponibles({ fechaVencimiento }: { fechaVencimiento: Date | null }) {
  if (!fechaVencimiento) {
    return <span style={{ color: "var(--gx-muted)" }}>Sin pagos registrados</span>;
  }

  const dias = diasHastaVencimiento(fechaVencimiento);

  if (dias < 0) {
    return (
      <span style={{ color: "var(--gx-bad)" }}>
        Vencido hace {Math.abs(dias)} {Math.abs(dias) === 1 ? "día" : "días"}
      </span>
    );
  }

  return (
    <span style={{ color: "var(--gx-ink)" }}>
      {dias} {dias === 1 ? "día" : "días"}
    </span>
  );
}
