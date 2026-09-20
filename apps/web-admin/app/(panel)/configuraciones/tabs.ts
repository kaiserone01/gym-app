// Compartido entre /configuraciones y los layouts de /planes, /sucursales
// y /usuarios — esas tres rutas viven fuera de /configuraciones pero
// muestran la misma barra de tabs (ver diseño acordado).
export const TABS_CONFIGURACIONES = [
  { href: "/configuraciones/metodos-pago", label: "Métodos de pago" },
  { href: "/planes", label: "Planes" },
  { href: "/sucursales", label: "Sucursales" },
  { href: "/usuarios", label: "Usuarios" },
];
