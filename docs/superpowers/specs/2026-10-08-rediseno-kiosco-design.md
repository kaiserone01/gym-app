# Rediseño del kiosco para Smart TV — diseño

Fecha: 2026-10-08. Estado: **diseño aprobado en conversación; spec pendiente de revisión del usuario**. Sin código ni migraciones todavía.

## 1. Objetivo y alcance
Rediseñar `apps/kiosk` para un Smart TV (Android TV, APK) con un numpad USB; la PC (`apps/kiosk-host`, WebView2 + Raw Input) queda como respaldo con pantalla duplicada.

- La pantalla **nunca** deja a la vista los datos del último miembro. Hoy `DURACION_FICHA_MS = 30_000` en `apps/kiosk/app/page.tsx` la mantiene 30 s.
- En reposo se muestra la ficha de marca con `apps/kiosk/public/branding/placeholder-profile.jpg` (hombre y mujer con camiseta del gym) en el círculo del avatar.
- Al validar una cédula la ficha **gira en 3D** y muestra al miembro unos segundos; luego vuelve al reposo.
- Éxito: se lee bien a 1,5–3 m; la ficha real no se queda pegada; un kiosco con versión vieja no se rompe con el API nuevo.

## 2. Decisiones
**Tomadas con el usuario en la sesión de diseño**
1. APK = **cáscara remota**: Capacitor abre `https://kiosco.zipnegocios.com` y se actualiza con cada deploy web. El service worker (`public/sw.js`) y la cola de pendientes (`lib/colaPendientes.ts`) cubren el modo sin red.
2. Numpad en Android TV = **`keydown` global solo Numpad** (`event.code` Numpad0–9, NumpadEnter, Backspace, Escape), sin `<input>` enfocado. La fila numérica normal se ignora.
3. Rechazos y estados con aviso (gracia, vencido, abono vencido, sede incorrecta) = **como hoy, con todo el detalle** (vencimiento, días de gracia, entrenador, sede). Reemplaza la idea inicial de un mensaje genérico.
4. **Sin protección anti-enumeración** por ahora (riesgo conocido, ver §11).
5. Entrega en **3 fases**, web primero (§10).

**Heredadas del brief inicial (no se reabren)**
- Ficha en reposo neutra: sin verde ni ✓ de "acceso permitido".
- Flip 3D ~700 ms con `ease-out-back`, foto precargada antes de voltear; ficha real 6–8 s con barra de cuenta regresiva.
- Fondo: se mantiene el video (no WebGL, por las GPU de TV); reacciona al estado con `playbackRate` y un destello radial CSS.
- Frases `{m, f, n}` en rotación de "bolsa barajada". La `@` solo aparece en "¡BIENVENID@, ADRENALINER!".
- Campo `genero` (Masculino / Femenino / sin definir) que edita recepción en web-admin; saludo de cumpleaños. **Sin saludos personalizados ni campaña** (frases por género, Campeón/Campeona, "¿Cómo te saludamos?"): el usuario los descartó al iniciar la Fase 2 por no ser pedidos por el cliente final; podrían retomarse más adelante.
- Nombre + primer apellido en el TV (supuesto: en todas las caras).

## 3. Máquina de estados (`apps/kiosk/app/page.tsx`)
Hoy: `esperando | procesando | resultado | pendiente | error`. Pasa a:

```
reposo ──cédula+Enter──▶ procesando ──respuesta──▶ ficha(cara) ──30 s──▶ reposo
                                                       │
                              otra cédula (Enter) ─────┘  voltea directo a la nueva
```

- **reposo:** ficha de marca (avatar = placeholder, frase neutra rotando, hora, tasa, sede). Teclear muestra los dígitos en el campo; la cédula a medias se borra a los 7 s de inactividad (`TIEMPO_INACTIVIDAD_MS`, ya existe).
- **procesando:** "Verificando…" sobre la ficha de reposo; todavía no gira.
- **ficha(cara):** llega la respuesta → se **precarga la foto** (`Image.decode()`, espera máxima ~1,5 s; si falla se usan iniciales) → gira. Dura **30 s** (decisión posterior del usuario; el diseño inicial decía 7 s) con barra de cuenta regresiva; al terminar gira de vuelta al reposo.
- Si entra otra cédula con una ficha visible, voltea **directo** a la nueva y reinicia el conteo (sin pasar por reposo).
- Escribir un dígito con una ficha visible no la cierra; solo la reemplaza una nueva respuesta o el fin del conteo. La cédula a medias se muestra en el campo, no en la ficha.
- Caras: `permitido`, `por_vencer`, `en_gracia`, `vencido`, `abono_vencido`, `sucursal_incorrecta`, `pendiente` (sin red), `error`.

## 4. Diseño de cada cara (base: `components/AccessCard.tsx`)
| Cara | Color y cabecera | Contenido |
|---|---|---|
| reposo | neutro (borde `--gx-edge`, sin ✓) | ilustración, frase neutra, hora, tasa, sede |
| permitido | verde, ✓, "Acceso permitido" | foto, nombre corto, saludo, Entrada · Vence · Entrenador |
| por_vencer | verde + chip ámbar "vence en N días" | igual a permitido; umbral inicial **5 días** (constante) |
| en_gracia | ámbar | días de gracia restantes + "acércate a recepción" |
| vencido / abono_vencido | rojo, ✕ | mensajes actuales de `AccessCard` |
| sucursal_incorrecta | rojo, ✕ | "Tu sede asignada es…" + dirección |
| pendiente | ámbar | "Sin conexión: tu entrada se guardó y se enviará sola" |
| error | rojo | mensaje del servidor |

- `por_vencer` no es un estado nuevo del servidor: el kiosco lo deriva de `estado = "activo"` y `fechaVencimiento` (días restantes ≤ umbral).
- Saludo y cumpleaños solo en caras con acceso (`permitido`, `por_vencer`, `en_gracia`).
- Nombre corto: primera palabra + primer apellido (con 4 o más palabras, la tercera; si no, la segunda). Es heurístico; los nombres compuestos pueden quedar imperfectos (§11).
- **Escala TV (1080p, 1,5–3 m):** título ≥ 64 px, nombre ≥ 96 px, datos ≥ 36 px, etiquetas ≥ 24 px. Overscan: 5 % de padding en los cuatro bordes. La ficha sigue siendo una tarjeta centrada (~60 % del ancho), no pantalla completa.
- Se elimina `color-mix()` de `AccessCard` (hoy en `boxShadow`) y se sustituye por tokens rgba precalculados (p. ej. `--gx-accent-glow`) por compatibilidad con WebView antiguo.

## 5. Coreografía de animaciones
- **Flip:** contenedor con `perspective`; la tarjeta rota `rotateY(0 → 180°)` ~700 ms con `cubic-bezier` tipo ease-out-back; `backface-visibility: hidden`. Dos caras en el DOM (reposo / ficha). Solo se animan `transform` y `opacity`.
- **Frases:** cada 4–5 s, salida con fundido + desplazamiento vertical corto y entrada igual (~300 ms). Rotación de bolsa barajada: se sortea sin repetir hasta agotar la lista y se vuelve a barajar (sin repetir la última como primera).
- **Cuenta regresiva:** barra bajo la ficha que se vacía en 30 s (`transform: scaleX`).
- **Video (`components/FondoVideo.tsx`):** al validar, `playbackRate` 1 → 1,8 y de regreso a 1 en ~1,5 s. Capa de destello radial por CSS: verde (permitido), ámbar (gracia / por vencer), rojo (rechazos), con keyframes de opacidad. Sin `backdrop-filter` ni blur.
- **Recodificación del video** (la corre el usuario; en esta máquina no hay ffmpeg):
  `ffmpeg -i backgound1.mp4 -an -c:v libx264 -profile:v main -b:v 1800k -maxrate 2000k -bufsize 4000k -movflags +faststart backgound1.mp4`
  (hoy 1280×720, 24 fps, 10 s, 8,1 Mbps, con pista AAC innecesaria; perfil Main por los decodificadores de TV).

## 6. Frases del reposo y saludo de la ficha
**Reposo** (solo `n`; el kiosco no sabe quién está enfrente): ESTA HORA ES TUYA · CADA REPETICIÓN CUENTA · SUDA HOY, SONRÍE MAÑANA · LA DISCIPLINA VENCE AL TALENTO · NO TE COMPARES, SUPÉRATE · TU ÚNICO RIVAL ERES TÚ · UNA REPETICIÓN MÁS · EL DOLOR DE HOY ES LA FUERZA DE MAÑANA · CONSTANCIA ANTES QUE MOTIVACIÓN · AQUÍ SE VIENE A DARLO TODO.

**Saludo de la ficha real** (Fase 2, simplificado; sin lista de frases ni bolsa):
- `genero = MASCULINO` → **"¡BIENVENIDO, ADRENALINER!"**
- `genero = FEMENINO` → **"¡BIENVENIDA, ADRENALINER!"**
- `genero = null` (no definido) → **"¡BIENVENID@, ADRENALINER!"**, única frase con `@`. Verificar el glifo `@` en Bebas Neue a tamaño grande antes de fijarla.
- Cumpleaños (`esCumpleanos`): **"¡FELIZ CUMPLEAÑOS, ADRENALINER!"** para todos, sin variante por género (la ficha sigue mostrando el resto de sus datos).

## 7. Schema y contrato del API
Todo lo nuevo es **opcional**: un kiosco viejo ignora los campos añadidos y trata el género como no definido; un API viejo no manda `genero`, y el kiosco nuevo usa el fallback.

**Fase 2 — `packages/db/prisma/schema.prisma`, modelo `Miembro`** (hoy tiene `fechaNacimiento` y no tiene género; se agrega `genero`):
- `genero Genero?` con `enum Genero { MASCULINO FEMENINO }`; `null` = no definido.
- Migración fechada y con nombre en español. Editable en `apps/web-admin` (`FormularioMiembro`, alta y edición) junto con **`fechaNacimiento`** (la columna ya existe pero ningún formulario la capturaba): sin ese campo el cumpleaños nunca se activaría.

**`POST /api/checkin`** (`apps/web-admin/app/api/checkin/route.ts`, hoy devuelve nombre, fotoUrl, entrenador, fechaVencimiento, estado, sede asignada, diasGraciaRestantes, tieneGraciaConfigurada) agrega:
- `genero` (`"MASCULINO" | "FEMENINO" | null`)
- `esCumpleanos` (calculado en servidor con `utils/fechaCaracas.ts`; **no** se envía `fechaNacimiento`)

`ResultadoCheckIn` en `apps/kiosk/lib/api.ts` suma esos campos como opcionales.

**Nuevo `GET /api/kiosco/estado`** (Fase 1; clave de sucursal en `X-Kiosk-Api-Key`, mismos CORS que `checkin`, método GET): `{ sucursalNombre, tasaBcv: { valor, fecha } | null }`, con `ITasaCambioRepository.obtenerUltima()` (la tasa la actualiza el script `actualizar-tasa` de `apps/worker`). El kiosco la guarda en localStorage (funciona sin red) y la refresca cada ~10 min.

## 8. Entrada del numpad (`apps/kiosk/lib/useEntradaCedula.ts`)
Hoy: mensajes de WebView2 (`chrome.webview`) o `<input>` enfocado en navegador. Se añade una tercera fuente para la APK: un `keydown` global (Capacitor/Android) que acepta solo `Numpad0`–`Numpad9`, `NumpadEnter`, `Backspace` y `Escape`, con `preventDefault`, y **sin `<input>` en el DOM** para que Android TV no abra el teclado en pantalla. El orden de preferencia es: host nativo (WebView2) → APK (keydown global) → navegador (`<input>`). Los tres comparten `alEscribir`, `alEnviar`, el espejo síncrono de la cédula y el borrado por inactividad.

Riesgo: con Num Lock apagado Android envía teclas de navegación en vez de dígitos; probar con el modelo real de numpad y dejar Num Lock encendido.

## 9. APK (Fase 3)
- Proyecto Capacitor (Android) con `server.url = https://kiosco.zipnegocios.com` y tráfico en claro desactivado.
- Manifest para Android TV: categoría `LEANBACK_LAUNCHER`, `android.software.leanback` con `required=false`, pantalla siempre encendida, modo inmersivo.
- `offline.html` local por si el primer arranque no tiene red.
- Clave de sucursal: `/config` acepta `#clave=…` en el fragmento de la URL (no viaja al servidor) para cargarla con `adb` sin teclado.
- Compatibilidad: objetivo Chromium 90+ (sin `color-mix()`, `:has` ni `backdrop-filter`); verificar la versión de Android System WebView del TV.
- Arranque al encender el TV: Android 10+ limita lanzar actividades desde segundo plano; queda como prueba pendiente en el aparato real.

## 10. Fases de entrega
- **F1 — sin migración:** reposo con ilustración, sede y tasa (`GET /api/kiosco/estado`); ficha real de 30 s con cuenta regresiva; logo fijo arriba a la derecha; tamaños proporcionales a la pantalla (rem con `html { font-size }` fluido); flip 3D; todas las caras (incluida `por_vencer`); video recodificado con reacción al estado; frases neutras; entrada de numpad por `keydown`; tokens sin `color-mix()`. Empieza por la ficha visible en reposo con `placeholder-profile.jpg`.
- **F2:** `Miembro.genero` (migración) + `genero`/`esCumpleanos` en `/api/checkin` + selector de género y fecha de nacimiento en web-admin; saludo de la ficha según género y de cumpleaños. **Sin campaña ni saludos personalizados** (descartados). Plan: `docs/superpowers/plans/2026-10-08-rediseno-kiosco-fase2.md`.
- **F3:** APK Capacitor para el TV.

## 11. Riesgos conocidos
- **Enumeración de cédulas:** sin límite de intentos, cualquiera puede teclear números y ver nombre y foto de otros en un TV de uso público. Decisión del usuario: se pospone; opciones futuras: límite en servidor por clave de sucursal con pausa, o PIN.
- Nombre corto heurístico con nombres compuestos.
- La recodificación del video depende de que el usuario ejecute ffmpeg.
- Num Lock y arranque automático dependen del TV y del numpad reales.
- Los rechazos muestran vencimiento y días de gracia en pantalla visible para todos (decisión del usuario).
