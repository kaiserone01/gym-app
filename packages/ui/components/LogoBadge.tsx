// Opción B del mockup aprobado: recorte circular del logo + halo suave
// detrás, sin animación (la versión con radar giratorio se descartó por
// exceso de verde saturado).
export function LogoBadge({
  src,
  alt,
  size = 148,
}: {
  src: string;
  alt: string;
  size?: number;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute rounded-full opacity-50 blur-sm"
        style={{
          inset: -size * 0.25,
          background: "radial-gradient(circle, var(--gx-accent) 0%, transparent 68%)",
        }}
      />
      <img
        src={src}
        alt={alt}
        className="relative h-full w-full rounded-full object-cover"
        style={{ border: "1px solid color-mix(in srgb, var(--gx-accent) 25%, transparent)" }}
      />
    </div>
  );
}
