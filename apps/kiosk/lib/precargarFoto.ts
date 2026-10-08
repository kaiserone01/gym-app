// Descarga la foto antes de voltear la ficha para que no aparezca a medio cargar. Nunca rechaza:
// resuelve true si la foto cargó y false si falló o tardó más de `esperaMaxMs` (AccessCard cae a iniciales).
export function precargarFoto(url: string, esperaMaxMs: number): Promise<boolean> {
  return new Promise((resolver) => {
    const imagen = new Image();
    const terminar = (cargo: boolean) => {
      clearTimeout(tope);
      resolver(cargo);
    };
    const tope = setTimeout(() => terminar(false), esperaMaxMs);
    imagen.onload = () => terminar(true);
    imagen.onerror = () => terminar(false);
    imagen.src = url;
  });
}
