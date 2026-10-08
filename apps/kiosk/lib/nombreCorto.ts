// Nombre + primer apellido para la pantalla pública: con 4 o más palabras se asume
// "Nombre Segundo Apellido1 Apellido2" y se toma la tercera; si no, la segunda.
export function nombreCorto(nombre: string): string {
  const partes = nombre.split(/\s+/).filter(Boolean);
  if (partes.length <= 2) return partes.join(" ");
  const apellido = partes.length >= 4 ? partes[2] : partes[1];
  return `${partes[0]} ${apellido}`;
}
