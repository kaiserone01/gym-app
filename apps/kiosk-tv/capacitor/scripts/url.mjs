// URL con la que la APK abre el kiosco. La clave de la sucursal va en el fragmento (#clave=...) de la RAÍZ,
// que no viaja al servidor: la pantalla de check-in la guarda al abrir. No se usa /config porque el servidor
// (`serve -s`) devuelve la página de inicio para esa ruta y el fragmento se perdería.
export function urlInicio(urlBase, clave) {
  const base = urlBase.replace(/\/+$/, "");
  return clave ? `${base}/#clave=${encodeURIComponent(clave)}` : `${base}/`;
}
