// De las variables de entorno al contenido de capacitor.config.json y de vitrina-config.json.
// La app web va empaquetada en el APK: sin server.url salvo en desarrollo (VITRINA_DEV_URL).
export function construirConfiguracion(env) {
  const apiUrl = (env.VITRINA_API_URL || "").replace(/\/+$/, "");
  const clave = env.VITRINA_CLAVE || "";
  const devUrl = env.VITRINA_DEV_URL || "";
  if (!devUrl && !apiUrl) throw new Error("Falta VITRINA_API_URL (URL base de web-admin).");

  const capacitor = {
    appId: "com.adrenalina.vitrina",
    appName: "Vitrina AX",
    webDir: "www",
    // El APK es de debug y lleva la clave de la sede en el bundle: sin logs y sin WebView inspeccionable.
    loggingBehavior: "none",
    android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  };
  if (devUrl) capacitor.server = { url: devUrl, cleartext: devUrl.startsWith("http://") };

  return { capacitor, vitrina: { apiUrl, clave } };
}
