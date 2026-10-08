// Quién puede configurar la ficha en reposo del kiosco (menú Kiosko).
export function puedeEditarKiosko(rol: string): boolean {
  return rol === "SOCIO" || rol === "GERENTE";
}
