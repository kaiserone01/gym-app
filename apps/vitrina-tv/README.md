# Vitrina AX para Android TV

## 1. Qué es

APK Capacitor 8 (`appId` `com.adrenalina.vitrina`, nombre "Vitrina AX") con la app web de la vitrina empaquetada dentro. No usa `server.url` (salvo `VITRINA_DEV_URL` en desarrollo). El proyecto Capacitor está en `apps/vitrina-tv/capacitor/` (no es workspace npm); `apps/vitrina-tv/prueba/` es una página descartable para probar el TV real.

## 2. Requisitos del TV

- Android TV oficial.
- Android System WebView 111 o superior.

## 3. Compilar

GitHub Actions, workflow "Compilar APK de la vitrina" (`apk-vitrina.yml`). Secretos: `VITRINA_CLAVE_<SEDE>` (clave de la sede, en mayúsculas) y `KIOSCO_APK_PASSWORD` (clave del cifrado 7-Zip). El artefacto descargado es un `.zip`; dentro viene el `.7z` cifrado, que hay que descomprimir también.

## 4. Instalar

Por USB, o por red: `adb connect <ip>` y luego `adb install -r vitrina-<sede>.apk`.

## 5. Arranque automático

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
