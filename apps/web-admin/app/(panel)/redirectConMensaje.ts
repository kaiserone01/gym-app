// Agrega ?ok=<mensaje> a la ruta de destino de un redirect exitoso, así el
// layout del panel (FeedbackDesdeUrl) puede mostrar el overlay de éxito
// aunque el componente que llamó a la Server Action ya no esté montado
// tras la navegación.
export function conMensajeOk(ruta: string, mensaje: string): string {
  const separador = ruta.includes("?") ? "&" : "?";
  return `${ruta}${separador}ok=${encodeURIComponent(mensaje)}`;
}
