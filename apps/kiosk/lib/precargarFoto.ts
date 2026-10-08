// Descarga la foto antes de voltear la ficha para que no aparezca a medio cargar. Nunca rechaza:
// si la foto falla o tarda más de `esperaMaxMs`, la ficha gira igual (AccessCard cae a iniciales).
export function precargarFoto(url: string, esperaMaxMs: number): Promise<void> {
  return new Promise((resolver) => {
    const imagen = new Image();
    const tope = setTimeout(resolver, esperaMaxMs);
    const terminar = () => {
      clearTimeout(tope);
      resolver();
    };
    imagen.onload = terminar;
    imagen.onerror = terminar;
    imagen.src = url;
  });
}
