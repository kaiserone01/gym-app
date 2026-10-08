// Silueta única (cabeza + hombros) en viewBox 0 0 100 100: cabeza de 32%×35% centrada en X
// con el borde superior en Y=15%, y hombros que se abren desde el cuello hasta X 10%–90%.
// Baja hasta Y=102 para que el trazo inferior quede fuera del cuadro.
const SILUETA =
  "M57 48.2 C58 54 72 55 82 60 C88 63 90 70 90 102 L10 102 C10 70 12 63 18 60 C28 55 42 54 43 48.2 A16 17.5 0 1 1 57 48.2 Z";

// Cubre todo el cuadro con un velo oscuro y deja la silueta transparente (fill-rule evenodd).
export function GuiaSilueta({ isValidPosition = true }: { isValidPosition?: boolean }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={`M0 0H100V100H0Z ${SILUETA}`} fill="rgba(0,0,0,0.55)" fillRule="evenodd" />
      <path
        d={SILUETA}
        fill="none"
        stroke={isValidPosition ? "#84cc16" : "#facc15"}
        strokeWidth={3}
        strokeDasharray={isValidPosition ? undefined : "8 6"}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
