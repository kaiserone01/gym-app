# Kiosco AX para Android TV

## 1. Qué es

APK de Android TV (Capacitor 8, `appId` `com.adrenalina.kiosco`, nombre "Kiosco AX") que abre el kiosco remoto `https://kiosco.zipnegocios.com` a pantalla completa. Se compila una APK por sucursal con la API key de la sede dentro: al abrir, la app carga `/#clave=<clave codificada>`, el kiosco guarda la clave y va a `/`. Si no hay red al arrancar, muestra una página local "Sin conexión" y reintenta.

Código: `capacitor/` (proyecto Capacitor, deliberadamente **no** es un workspace de npm) y `.github/workflows/apk-kiosco.yml` (compilación en GitHub Actions; no se compila en local).

## 2. Requisitos del TV

- Android TV / Google TV.
- **Android System WebView 111 o superior.** Si es menor, el kiosco muestra un aviso en pantalla; actualizar "Android System WebView" desde Google Play.
- Numpad USB con **Num Lock encendido**.

## 3. Preparación única

1. Obtener la API key de cada sede: web-admin → Configuraciones → Sucursales → abrir la sede → campo "API Key del kiosco" (botón copiar). Usar la cuenta de la organización dueña de esa sede.
2. Crear los secretos del repositorio (`github.com/kaiserone01/gym-app/settings/secrets/actions` → New repository secret), o con `gh secret set NOMBRE` (pide el valor por consola; nunca usar `--body`):
   - `KIOSCO_APK_PASSWORD`: contraseña del `.7z` (la inventa el usuario).
   - `KIOSCO_CLAVE_<SUCURSAL>`: API key de la sede. Nombre en MAYÚSCULAS, solo letras, números y `_`. Ya creados: `KIOSCO_CLAVE_PRINCIPAL`, `KIOSCO_CLAVE_TIPURO` y `KIOSCO_CLAVE_PRUEBA`.
3. Instalar 7-Zip en la PC.

Nunca pegar claves ni contraseñas en chats, issues, commits ni logs.

## 4. Compilar el APK de una sede

1. GitHub → Actions → "Compilar APK del kiosco" → Run workflow.
2. `sucursal`: nombre en minúsculas (letras, números y `_`), por ejemplo `principal`. Sedes: `principal`, `tipuro` y `prueba` (sucursal de prueba de otra organización). `kiosco_url`: dejar la URL por defecto salvo que se pruebe otro servidor.
3. Esperar a que termine y descargar el artefacto `kiosco-principal.zip` (GitHub lo entrega así); descomprimirlo: contiene `kiosco-principal.7z`.
4. Abrir `kiosco-principal.7z` con 7-Zip y la contraseña `KIOSCO_APK_PASSWORD`: contiene `kiosco-principal.apk`. Borrar el APK descifrado de la PC después de instalarlo.

Cuidado: un error de tipeo en `sucursal` no falla; produce un APK genérico sin clave (ver sección 7).

## 5. Instalar en el TV

Por USB: copiar el APK al TV, abrirlo con una app de archivos y permitir "instalar desde esta fuente".

Por red con adb (viene en Google SDK Platform-Tools, ~10 MB):

1. En el TV: Ajustes → Preferencias del dispositivo → Acerca de → pulsar 7 veces "Compilación" → Opciones de desarrollador → activar depuración USB / por red.
2. En la PC: `adb connect <ip-del-tv>` y luego `adb install -r kiosco-principal.apk`. `-r` actualiza encima: la firma es la misma.

3. Apagar la depuración: en el TV, Opciones de desarrollador → desactivar depuración USB / por red; si el TV quedó conectado a adb, ejecutar `adb disconnect`. Motivo: el APK es de debug y guarda la clave de la sede, por lo que no debe quedar un canal adb abierto.

Abrir la app desde el launcher del TV como "Kiosco AX".

## 6. Rotar una clave

Actualizar el secreto `KIOSCO_CLAVE_<SEDE>`, volver a compilar la sede (sección 4) e instalar con `adb install -r`. Cada arranque de un APK compilado con clave abre `/#clave=...` y sobrescribe la clave guardada: una clave cambiada a mano en `/config` se pierde al reiniciar la app (la rotación se hace recompilando).

## 7. Prueba sin clave

Si no existe un secreto para esa sucursal, el workflow publica un `kiosco-<sucursal>.apk` genérico sin cifrar y sin clave; abre `/config` para pegar la clave a mano. Pegar el UUID requiere el teclado en pantalla del TV o un teclado completo (el numpad no alcanza).

## 8. Lista de verificación en el TV real

Pendiente de verificar (no probado en un TV físico):

- Abre a pantalla completa y la pantalla no se apaga.
- El numpad escribe (con Num Lock) y Enter registra.
- Sin red al arrancar muestra "Sin conexión" y reintenta (comportamiento de `errorPath` sin verificar).
- Escape/Backspace del numpad y el botón Atrás del mando no cierran la app.
- Arrancar con el wifi apagado, luego encenderlo: debe verse «Sin conexión» y entrar solo en ~10 s.
- Con WebView viejo (< 111) aparece el aviso.
- La ficha de reposo y el flip se ven bien y el texto es legible. Si el TV reporta 960x540, ajustar `html { font-size }` en `apps/kiosk/app/globals.css`.
- Tras reiniciar el TV hay que abrir la app a mano: el arranque automático no está implementado (Android 10+ lo limita).

## Cambiar frases, imagen y opacidad del reposo

La APK solo abre la web del kiosco, así que no hay que recompilarla ni reinstalarla para cambiar el reposo: en el panel, menú **Kiosko** (SOCIO y GERENTE), se editan las frases, la imagen del círculo y la opacidad del fondo de la ficha. El TV consulta el servidor cada ~30 s y aplica el cambio solo; sin red conserva la última configuración recibida.

## 9. Seguridad

El repositorio es **público**. Por eso el APK con clave solo se publica cifrado (7-Zip AES-256, nombres de archivo cifrados). Nunca subir un APK descifrado ni pegar la clave en issues, commits o logs. Con acceso físico al TV la clave podría extraerse del APK instalado (riesgo aceptado). El APK se firma con una llave de debug fija y pública (`capacitor/android/app/debug.keystore`, contraseña `android`) solo para que las actualizaciones se instalen encima; no protege nada. Además, quien tenga acceso de instalación al TV puede firmar un APK con el mismo appId e instalarlo encima de este, heredando sus datos guardados (incluida la clave); es el mismo modelo de amenaza de acceso físico, aceptado.

## Desarrollo

En `capacitor/`: `npm test` (pruebas de `scripts/`), `npm run sync` (con `KIOSCO_URL` y `KIOSCO_CLAVE` genera `capacitor.config.json`, `www/index.html` y `www/offline.html`, que están en `.gitignore`, y sincroniza Android). `scripts/generar-banner.ps1` regenera el banner de TV.
