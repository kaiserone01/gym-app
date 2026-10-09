import { fechaDesdeTextoPadron } from "./padronExcel";

// Lo que se ve en una celda del espejo del Excel: una fecha aaaa-mm-dd real como dd/mm/aaaa;
// cualquier otro texto tal cual (la edición trabaja siempre con el valor crudo).
export function formatearCeldaPadron(valor: string | null): string {
  if (valor === null) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  return iso && fechaDesdeTextoPadron(valor) ? `${iso[3]}/${iso[2]}/${iso[1]}` : valor;
}
