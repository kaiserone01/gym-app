// Compartido entre /configuraciones y los layouts de /planes, /sucursales,
// /usuarios, /kiosko y /vitrina — esas rutas viven fuera de /configuraciones
// pero muestran la misma barra de tabs (ver diseño acordado).
export const TABS_CONFIGURACIONES = [
  { href: "/configuraciones/metodos-pago", label: "Métodos de pago" },
  { href: "/configuraciones/reglas-abono", label: "Reglas de abono" },
  { href: "/planes", label: "Planes" },
  { href: "/sucursales", label: "Sucursales" },
  { href: "/usuarios", label: "Usuarios" },
  { href: "/configuraciones/excel", label: "Excel" },
  { href: "/kiosko", label: "Kiosko" },
  { href: "/vitrina", label: "Vitrina" },
];

// El GERENTE solo configura Kiosko y Vitrina; el resto es solo de SOCIO.
export function tabsConfiguracionesPara(rol: string) {
  return rol === "SOCIO"
    ? TABS_CONFIGURACIONES
    : TABS_CONFIGURACIONES.filter((t) => t.href === "/kiosko" || t.href === "/vitrina");
}
