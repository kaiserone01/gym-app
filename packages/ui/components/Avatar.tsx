function iniciales(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join("");
}

export function Avatar({
  fotoUrl,
  nombre,
  tamano = 40,
}: {
  fotoUrl: string | null | undefined;
  nombre: string;
  tamano?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
      style={{
        width: tamano,
        height: tamano,
        fontSize: tamano / 3.5,
        background: "var(--gx-surface-2)",
        color: "var(--gx-muted)",
      }}
    >
      {fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto servida desde R2, dominio externo
        <img src={fotoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        iniciales(nombre || "?")
      )}
    </div>
  );
}
