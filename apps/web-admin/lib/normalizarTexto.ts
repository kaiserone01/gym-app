// Para búsquedas que no distinguen mayúsculas ni tildes ("jose" encuentra "José", "cafe" a "Café").
export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
