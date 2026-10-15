# Vitrina AX para Android TV

## 1. Qué es

APK Capacitor 8 (`appId` `com.adrenalina.vitrina`, nombre "Vitrina AX") con la app web de la vitrina empaquetada dentro. No usa `server.url` (salvo `VITRINA_DEV_URL` en desarrollo). El proyecto Capacitor está en `apps/vitrina-tv/capacitor/` (no es workspace npm); `apps/vitrina-tv/prueba/` es una página descartable para probar el TV real.

## 2. Requisitos del TV

- Android TV oficial.
- Android System WebView 111 o superior.

## 3. Compilar

GitHub Actions, workflow "Compilar APK de la vitrina" (`apk-vitrina.yml`). Secretos: `VITRINA_CLAVE_<SEDE>` (clave de la sede, en mayúsculas) y `KIOSCO_APK_PASSWORD` (clave del cifrado 7-Zip). El artefacto descargado es un `.zip`; dentro viene el `.7z` cifrado, que hay que descomprimir también.

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
