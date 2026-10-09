import { randomUUID } from "node:crypto";

const DOMINIO_INTERNO = "@sinacceso.interno";
const DOMINIO_ESPEJO = "@zipgym.local";

// Correo de un usuario de Adrenalina en el espejo ZIPGYM (UsuarioAdmin.email es único en toda la base).
// Los entrenadores sin acceso reciben un uuid nuevo; el resto pasa a <parte-local>@zipgym.local, con sufijo
// -2, -3… si ya está ocupado. Registra el resultado en `yaUsados`.
export function correoEspejo(email: string, yaUsados: Set<string>, nuevoUuid: () => string = randomUUID): string {
  const arroba = email.lastIndexOf("@");
  if (arroba <= 0) throw new Error(`Correo inválido: "${email}".`);

  if (email.toLowerCase().endsWith(DOMINIO_INTERNO)) {
    let interno: string;
    do interno = `entrenador-${nuevoUuid()}${DOMINIO_INTERNO}`;
    while (yaUsados.has(interno));
    yaUsados.add(interno);
    return interno;
  }

  const local = email.slice(0, arroba).toLowerCase();
  let resultado = `${local}${DOMINIO_ESPEJO}`;
  for (let n = 2; yaUsados.has(resultado); n++) resultado = `${local}-${n}${DOMINIO_ESPEJO}`;
  yaUsados.add(resultado);
  return resultado;
}
