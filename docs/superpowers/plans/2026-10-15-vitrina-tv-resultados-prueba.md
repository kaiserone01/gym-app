# Resultados de la prueba del APK en el dispositivo (Task 1, Step 15)

APK de prueba: workflow `apk-vitrina.yml`, modo `prueba`, run 38772525150 (commit `fc03f36`). Instalación por enlace, sin adb.

Dispositivo: **dispositivo de prueba, no la TV real** (pendiente anotar modelo). El gate se cierra con la TV real.

| # | Prueba | Resultado | Fecha |
|---|---|---|---|
| 1 | 3 videos 1080x1920 a la vez | Corren a ~30 fps. Cuadros perdidos ~8 a 12 % (14/132, 13/145, 12/137 tras 4 s; 29/348, 27/351, 43/367 tras 12 s en el run anterior). Justo pero usable; confirma la regla de **un video activo por franja** y póster en los demás. | 2026-10-15 |
| 2 | Arranque en frío sin red | OK: carga desde el APK con los videos corriendo; el sondeo marca `Internet: NO` aunque "red conectada" siga en SÍ (`navigator.onLine` no sirve para saber si hay internet; la app real decide por fallos de descarga). | 2026-10-15 |
| 3 | Reloj tras un corte de luz | Pendiente (desenchufar 10 s y volver a encender sin internet; anotar si aparece "RELOJ ATRASADO" y a qué fecha vuelve). | |
| 4 | Arranque automático | Parcial: **la pantalla del permiso "Mostrar sobre otras aplicaciones" sí apareció** al abrir la app. Falta confirmar que tras activar el permiso la app abre sola al apagar y encender. | |

## Pendiente
- Repetir 1 a 4 en la **TV real** y anotar su modelo.
- Pruebas 3 y 4 (reloj y arranque automático).
