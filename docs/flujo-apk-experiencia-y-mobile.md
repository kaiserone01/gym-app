# Flujo de trabajo para apps nativas: experiencia con Capacitor + CI y comparación con Expo Go

Documento general y reutilizable. Resume cómo se construyeron los APK de este proyecto (kiosco y vitrina de Android TV), lo compara con Expo Go y deja una base para un proyecto móvil iOS + Android con documentación para Smart TV.

Las afirmaciones sobre Expo, EAS, Apple y Google son de conocimiento general y pueden haber cambiado: verifícalas en la documentación oficial antes de decidir.

## 1. Experiencia de uso en este proyecto

**Idea central:** la lógica y la interfaz son web (Next.js). Android es una cáscara fina (Capacitor) que se compila en GitHub Actions.

- Kiosco: el APK solo abre una URL remota. Un cambio en la web no requiere APK nuevo.
- Vitrina: la web va empaquetada dentro del APK y funciona sin red. Un cambio de lógica exige APK nuevo; un cambio de contenido no.
- Diseño primero: spec, plan por tareas y ADR antes de escribir código.
- La lógica pura vive en un paquete con tests y las apps la consumen.
- Nada se compila en la PC del desarrollador. Un workflow manual (`workflow_dispatch`) recibe sede y URL, corre tests, compila y publica el artefacto.
- Como el repositorio es público y el APK lleva una clave dentro, el artefacto se cifra (7-Zip AES-256) y una guarda aborta si queda un `.apk` sin cifrar.
- El CI inspecciona el APK (`aapt2` + `jq`: applicationId, versionCode, permisos, ausencia de `server.url`, logging apagado). Los errores de empaquetado fallan en el CI y no en el TV.
- Antes del APK real se hizo uno de prueba para medir rendimiento (3 videos a la vez).
- Cada sesión cierra con un `handoff.md` que incluye "Intentos fallidos" para no repetir errores.

**Lo que funcionó:** compilación reproducible, cero configuración local de Android, iteración rápida en la web, separación entre contenido y binario.

**Lo que duele:** muchos pasos manuales para distribuir (zip, 7z, descifrar, enlace privado, instalar), una clave por sede dentro del APK, dos workflows casi idénticos, y nada probado todavía en un TV real.

## 2. Comparación con Expo Go

| Aspecto | Capacitor + CI (este proyecto) | Expo Go |
|---|---|---|
| Qué es | Web dentro de un WebView nativo; proyecto Android propio | App de sandbox para correr proyectos React Native sin compilar |
| Ciclo de desarrollo | Navegador o `VITRINA_DEV_URL` en el dispositivo | Escanear un QR; recarga instantánea |
| Código nativo propio | Sí, es tu proyecto Android (ArranqueReceiver, permisos, etc.) | No: solo los módulos que ya trae Expo Go |
| Producir el instalable | Workflow propio en Actions | No produce instalables: para eso hay que usar EAS Build o `expo prebuild` |
| Rendimiento y sensación nativa | Limitado por el WebView | Interfaz nativa de React Native |
| Control del entorno | Total y transparente (Gradle, manifiesto) | Más oculto; depende de Expo |
| Smart TV | Sí (leanback, Android TV) | No: Expo Go no existe en TV |

**Por qué probablemente te gustó más esta metodología:** Expo Go es una herramienta de desarrollo, no de entrega. Mientras no necesites módulos nativos propios todo va bien. Cuando los necesitas, o cuando quieres IPA/APK reales, Expo Go se queda corto y hay que pasar a *development builds* y EAS. Aquí, en cambio, el APK real se compila desde el primer día, así que no hay salto entre "lo que pruebo" y "lo que entrego". Esa continuidad es lo que se siente mejor.

Las dos cosas no son rivales: la comparación justa es **Capacitor (web en WebView)** frente a **React Native/Expo (interfaz nativa)**. Elige según el producto, no según la comodidad.

## 3. Proyecto móvil iOS + Android (IPA y APK)

### Qué cambia respecto a Android TV

- **iOS exige macOS para compilar** (Xcode). Opciones: EAS Build (nube de Expo), runners `macos-*` de GitHub Actions, o un Mac propio.
- **Cuenta Apple Developer (de pago, anual)**: certificados, perfiles de aprovisionamiento y firma. Sin ella no hay IPA instalable fuera del simulador.
- **Distribución iOS:** TestFlight para pruebas internas y externas, App Store para producción. No existe el "pasar el APK por enlace" de Android; ad hoc/enterprise tienen restricciones.
- **Android:** el APK sirve para pruebas; Google Play exige AAB para publicar. La firma de release debe guardarse como secreto del CI (no usar la llave de debug pública del proyecto actual).
- **Fastlane** (match, gym, pilot) es el estándar para automatizar firma y subida a TestFlight/Play.

### Tres caminos posibles

1. **Expo con development builds + EAS Build (recomendado si ya estás en Expo).**
   - Usa Expo Go solo mientras no necesites módulos nativos; luego pasa a `expo-dev-client`.
   - EAS compila IPA y APK/AAB en la nube y administra credenciales; EAS Submit sube a las tiendas.
   - Ventaja: no tocas Xcode ni Gradle. Costo: dependes de EAS (hay plan gratuito con límites; verifica precios).
2. **Expo con `prebuild` y tu propio CI en GitHub Actions.**
   - Genera `ios/` y `android/` con `npx expo prebuild` y compílalos con tus workflows (macOS runner para iOS, Linux para Android).
   - Es lo más parecido a lo que hiciste aquí. Más control, más mantenimiento y la firma de iOS corre por tu cuenta.
3. **Capacitor con la web que ya tienes.**
   - Reutiliza el workflow actual para Android y añade un job macOS para iOS.
   - Ideal si el producto es una app de gestión/formularios; menos ideal si necesita animaciones o rendimiento nativo.

### Estructura de CI sugerida (monorepo)

- Un workflow reutilizable (`workflow_call`) con inputs `plataforma` (android | ios | ambas), `app`, `entorno` y `modo`.
- Job Android en `ubuntu-24.04`; job iOS en `macos-*`.
- Pasos comunes: validar inputs, enmascarar secretos, tests, build, **inspección del artefacto** (`aapt2` para Android; para iOS, revisar `Info.plist` y entitlements), publicar.
- Secretos: keystore y contraseñas de Android; certificado, perfil y llave de App Store Connect para iOS.
- Versionado: `versionCode` / `CFBundleVersion` = `run_number`; `versionName` / `CFBundleShortVersionString` semántico.
- Aprovisionamiento por código de emparejamiento en lugar de claves dentro del binario: un solo build para todos los clientes y sin secretos en el artefacto.

## 4. Documentación para Smart TV (segunda etapa)

Lo aprendido en este proyecto, listo para reutilizar:

**Android TV**
- Manifiesto: `LEANBACK_LAUNCHER`, `android.software.leanback`, `touchscreen` no obligatorio, banner 320x180.
- Pantalla encendida e inmersiva; orientación `sensorLandscape`.
- Control remoto/numpad: eventos `keydown`, cuidar Num Lock y el botón Atrás.
- WebView mínimo (en el proyecto: ≥ 111); mostrar un aviso si es menor.
- Arranque automático al encender: en Android 10+ requiere "Mostrar sobre otras aplicaciones"; pedirlo desde la propia app. Depende del fabricante: probar en cada modelo.
- Sin red al arrancar: página local "Sin conexión" o contenido en caché; no confiar en `navigator.onLine`, sondear con `fetch`.
- Reloj tras un corte de luz sin internet: no confiar en la hora del equipo.
- Rendimiento de video: limitar a un video activo por zona y usar póster en el resto; medir en un dispositivo parecido antes de comprometer el diseño.
- Instalación: enlace privado, USB o `adb install -r`; apagar la depuración al terminar.

**Con React Native / Expo:** existe soporte para TV mediante el fork `react-native-tvos` y un plugin de configuración, pero requiere development build/prebuild (no funciona con Expo Go) y sus versiones van por detrás de las de React Native estándar. Verifica la compatibilidad con tu versión de Expo antes de comprometerte.

**Apple TV (tvOS):** posible con el mismo fork, pero con cuenta Apple, Xcode y proceso de revisión propios. Dejarlo como fase posterior.

## 5. Recomendación y siguientes pasos

1. Para el proyecto móvil: si ya usas Expo, **no abandones Expo por Expo Go**. Pasa a development builds + EAS Build y compara una semana contra el camino 2 (prebuild + tu CI). Decide con datos: tiempo de compilación, esfuerzo de firma de iOS y costo.
2. Valida pronto la parte más arriesgada: **un IPA instalable en un iPhone real vía TestFlight**. En el proyecto actual el riesgo equivalente fue no probar en un TV real hasta el final.
3. Convierte este flujo en plantilla: workflow reutilizable único, checklist de dispositivo real, `handoff.md` con "Intentos fallidos" y, si quieres, un skill de Claude Code que lo aplique en proyectos nuevos.
4. Deja la sección de TV de este documento como guía para la segunda etapa y amplíala con lo que aprendas en el primer TV real.
