# Vitrina AX para Android TV

## 1. Qué es

APK Capacitor 8 (`appId` `com.adrenalina.vitrina`, nombre "Vitrina AX") con la app web de la vitrina empaquetada dentro. No usa `server.url` (salvo `VITRINA_DEV_URL` en desarrollo). El proyecto Capacitor está en `apps/vitrina-tv/capacitor/` (no es workspace npm); `apps/vitrina-tv/prueba/` es una página descartable para probar el TV real.

## 2. Requisitos del TV

- Android TV oficial.
- Android System WebView 111 o superior. **WebView ≥ 111; un cambio de diseño o de lógica de la app exige un APK nuevo, un cambio de contenido no.**

## 3. Compilar

GitHub Actions, workflow "Compilar APK de la vitrina" (`apk-vitrina.yml`). El artefacto descargado es un `.zip`; dentro viene el `.7z` cifrado, que hay que descomprimir también.

Secretos:

| Secreto | Para qué |
| --- | --- |
| `VITRINA_CLAVE_<SEDE>` | API key de la sede (nombre de la sede en mayúsculas, p. ej. `VITRINA_CLAVE_ZIPGYM`). Va dentro del APK. |
| `KIOSCO_APK_PASSWORD` | Contraseña del cifrado 7-Zip del artefacto. |

Inputs del workflow:

- `sucursal`: nombre corto de la sede (minúsculas, números y `_`).
- `api_url`: URL base de web-admin, sin `/` final (la app pide ahí `/api/kiosco/vitrina`). Se guarda en `vitrina-config.json` del APK, no es de build.
- `modo`: `vitrina` (app real) o `prueba` (página de rendimiento de `prueba/`, sin clave).

El workflow inspecciona el APK (applicationId, versionCode, permisos, `leanback`, `capacitor.config.json` y `vitrina-config.json`) y falla si algo no cuadra.

## 4. Instalar

Por enlace (lo habitual): abrir el enlace de descarga del APK en el TV (navegador o app Downloader), permitir "Instalar apps desconocidas" a esa app y abrirlo. **El APK real lleva la clave de la sede dentro** (que también sirve para registrar check-ins): el enlace no puede ser público; el artefacto del workflow va cifrado y hay que descifrarlo antes de subirlo a un sitio con acceso restringido. El APK de prueba no lleva clave.

Por USB, o por red: `adb connect <ip>` y luego `adb install -r vitrina-<sede>.apk`.

## 5. Arranque automático (la instalación es por enlace, sin adb)

Android 10+ solo deja abrir una app al encender el TV si tiene el permiso "Mostrar sobre otras aplicaciones". Con instalación por enlace no hay adb, así que la app lo pide sola al abrirse: muestra un aviso y abre la pantalla de ese permiso del sistema (activar "Vitrina AX"). Si ese TV no trae la pantalla, queda el ajuste de "autoinicio" del fabricante, o fijar la app como launcher; anótalo aquí al probar cada modelo.

Con adb (solo para depurar, opcional):

```text
adb shell appops set com.adrenalina.vitrina SYSTEM_ALERT_WINDOW allow
adb shell appops set com.adrenalina.vitrina RUN_IN_BACKGROUND allow
adb shell dumpsys deviceidle whitelist +com.adrenalina.vitrina
adb shell appops get com.adrenalina.vitrina SYSTEM_ALERT_WINDOW
```

## 6. Al terminar

Desactivar la depuración USB/por red en Opciones de desarrollador y ejecutar `adb disconnect`: el APK es de debug y lleva la clave de la sede.

## 7. Rotar la clave

Actualizar el secreto `VITRINA_CLAVE_<SEDE>`, recompilar y `adb install -r`.

## 8. Desarrollar en el TV

Para ver cambios sin recompilar el APK, preparar el proyecto con `VITRINA_DEV_URL=http://<ip-del-PC>:3002` (servidor `npm run dev` de `apps/vitrina`) antes de `npm run sync`; así el APK carga esa URL en vez del contenido empaquetado. Nunca publicar un APK compilado con `VITRINA_DEV_URL`.

## 9. Lista de verificación en el TV real

Con el panel y la vitrina apuntando al mismo web-admin (producción):

1. Cifrado: el artefacto es un `.7z` cifrado; no hay `.apk` suelto.
2. Ícono y nombre: el launcher muestra "Vitrina AX" con el escudo; también el banner de Android TV.
3. Contenido: promo, franja de 3 entrenadores y producto con oferta + Bs se ven bien a 1080p; el video de la franja reproduce de a uno.
4. Cambios en vivo: activar, ordenar o eliminar en el panel se refleja en segundos; sustituir una pieza descarga solo la nueva y borra el archivo viejo.
5. Sin red: sin internet, apagar y encender el TV: abre solo, muestra el último contenido y respeta `inicio`/`fin`.
6. Reloj tras un corte de luz: enchufar el TV sin internet: un ítem vencido no reaparece y la tasa no cambia de estado por la hora.
7. Arranque automático: apagar y encender: la app abre sola.
8. Actualización encima: otro `run_number`, `adb install -r`: se conservan archivos descargados y permisos.
9. Tasa desactualizada: con la tasa de ayer desaparece el equivalente en Bs y se mantiene el USD.
10. Depuración apagada: desactivar la depuración USB/por red y `adb disconnect`.
