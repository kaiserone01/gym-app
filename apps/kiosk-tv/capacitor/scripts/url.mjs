// URL con la que la APK abre el kiosco. La clave de la sucursal va en el fragmento (#clave=...), que no
// viaja al servidor: la página /config del kiosco la guarda y pasa a la pantalla de check-in.
export function urlInicio(urlBase, clave) {
  const base = urlBase.replace(/\/+$/, "");
  return clave ? `${base}/config#clave=${encodeURIComponent(clave)}` : `${base}/`;
}
