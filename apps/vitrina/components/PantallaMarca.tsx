// Lo que se ve cuando no hay nada que mostrar (arranque, sin ítems activos): la marca, nunca una pantalla en negro.
export function PantallaMarca() {
  return (
    <main className="flex h-full w-full items-center justify-center" style={{ background: "var(--gx-ground)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- recurso local empaquetado */}
      <img src="/branding/escudo.png" alt="Adrenalina Xtreme Gym" className="h-[70vh] w-auto object-contain" />
    </main>
  );
}
