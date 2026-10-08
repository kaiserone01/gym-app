"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Warning } from "@phosphor-icons/react/dist/ssr";
import type { EstadoCheckIn } from "@gym-app/domain/entities/CheckIn";

export interface PersonaEnSalaVista {
  checkInId: string;
  miembroId: string;
  nombre: string;
  fotoUrl: string | null;
  planNombre: string | null;
  fechaHora: string;
  fechaVencimiento: string | null;
  estado: EstadoCheckIn;
  requiereCobro: boolean;
  porRegularizar: boolean;
}

interface ValorContexto {
  personas: PersonaEnSalaVista[] | null; // null = todavía cargando
  cobros: number;
  avisosActivos: boolean;
  recargar: () => Promise<void>;
  activarAvisos: () => Promise<void>;
  desactivarAvisos: () => void;
}

const INTERVALO_MS = 5000;
const CLAVE_AVISOS = "enSala.avisos";

const Contexto = createContext<ValorContexto | null>(null);

// Devuelve null fuera del ProveedorEnSala (usuarios sin permiso EN_SALA).
export function useEnSala() {
  return useContext(Contexto);
}

// Preferencia "avisos activos" en localStorage, expuesta como store externo para poder leerla sin
// setState en un efecto. Todo va en try/catch: el storage puede no estar disponible.
const oyentes = new Set<() => void>();
function suscribirAvisos(cb: () => void) {
  oyentes.add(cb);
  return () => void oyentes.delete(cb);
}
function leerAvisos(): boolean {
  try {
    return localStorage.getItem(CLAVE_AVISOS) === "1";
  } catch {
    return false;
  }
}
function guardarAvisos(activos: boolean) {
  try {
    localStorage.setItem(CLAVE_AVISOS, activos ? "1" : "0");
  } catch {}
  oyentes.forEach((cb) => cb());
}

// Doble pitido sin archivo de audio (Web Audio).
function sonar(ctx: AudioContext) {
  [660, 880, 660, 880].forEach((frecuencia, i) => {
    const inicio = ctx.currentTime + i * 0.22;
    const oscilador = ctx.createOscillator();
    const ganancia = ctx.createGain();
    oscilador.type = "square";
    oscilador.frequency.value = frecuencia;
    ganancia.gain.setValueAtTime(0.0001, inicio);
    ganancia.gain.exponentialRampToValueAtTime(0.25, inicio + 0.02);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.18);
    oscilador.connect(ganancia).connect(ctx.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.2);
  });
}

export function ProveedorEnSala({ children }: { children: React.ReactNode }) {
  const [personas, setPersonas] = useState<PersonaEnSalaVista[] | null>(null);
  const avisosActivos = useSyncExternalStore(suscribirAvisos, leerAvisos, () => false);

  const avisosRef = useRef(avisosActivos);
  const audioRef = useRef<AudioContext | null>(null);
  const cobrosConocidosRef = useRef<Set<string> | null>(null); // null = primera carga, no avisa

  useEffect(() => {
    avisosRef.current = avisosActivos;
  }, [avisosActivos]);

  const obtenerAudio = useCallback(() => {
    audioRef.current ??= new AudioContext();
    return audioRef.current;
  }, []);

  // Tras recargar la página el navegador vuelve a bloquear el audio hasta un gesto del usuario.
  useEffect(() => {
    if (!avisosActivos) return;
    const desbloquear = () => void obtenerAudio().resume();
    window.addEventListener("pointerdown", desbloquear, { once: true });
    window.addEventListener("keydown", desbloquear, { once: true });
    return () => {
      window.removeEventListener("pointerdown", desbloquear);
      window.removeEventListener("keydown", desbloquear);
    };
  }, [avisosActivos, obtenerAudio]);

  const recargar = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/en-sala", { cache: "no-store" });
      if (!respuesta.ok) return;
      const { personas: nuevas } = (await respuesta.json()) as { personas: PersonaEnSalaVista[] };
      setPersonas(nuevas);

      const cobrosActuales = new Set(nuevas.filter((p) => p.requiereCobro).map((p) => p.checkInId));
      const anteriores = cobrosConocidosRef.current;
      cobrosConocidosRef.current = cobrosActuales;
      if (!anteriores || !avisosRef.current) return;

      const nuevos = nuevas.filter((p) => cobrosActuales.has(p.checkInId) && !anteriores.has(p.checkInId));
      if (nuevos.length === 0) return;

      const audio = obtenerAudio();
      void audio.resume().then(() => sonar(audio));
      if (document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const [primero] = nuevos;
        new Notification("Cobro pendiente en sala", {
          body: `${primero.nombre}${nuevos.length > 1 ? ` y ${nuevos.length - 1} más` : ""} entró sin membresía al día.`,
          tag: "en-sala-cobro",
        });
      }
    } catch {
      // Sin red: se reintenta en el próximo ciclo.
    }
  }, [obtenerAudio]);

  useEffect(() => {
    const inicial = setTimeout(() => void recargar(), 0);
    const intervalo = setInterval(() => void recargar(), INTERVALO_MS);
    return () => {
      clearTimeout(inicial);
      clearInterval(intervalo);
    };
  }, [recargar]);

  const activarAvisos = useCallback(async () => {
    const audio = obtenerAudio();
    await audio.resume();
    sonar(audio); // prueba: confirma que el sonido funciona
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    guardarAvisos(true);
  }, [obtenerAudio]);

  const cobros = personas?.filter((p) => p.requiereCobro).length ?? 0;

  return (
    <Contexto.Provider
      value={{ personas, cobros, avisosActivos, recargar, activarAvisos, desactivarAvisos: () => guardarAvisos(false) }}
    >
      {children}
    </Contexto.Provider>
  );
}

// Contador rojo para el menú (sidebar y barra móvil); no renderiza nada si no hay cobros.
export function ContadorEnSala({ className = "" }: { className?: string }) {
  const cobros = useEnSala()?.cobros ?? 0;
  if (cobros === 0) return null;
  return (
    <span
      className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${className}`}
      style={{ background: "var(--gx-bad)", color: "white" }}
    >
      {cobros}
    </span>
  );
}

// Aviso visible desde cualquier página del panel; en /en-sala ya está la lista, no se repite.
// Va en la franja superior que el layout reserva (pt-16), a la izquierda del reloj, y se monta dentro
// del contenedor de la página (ver layout): así los modales (z-50) lo cubren y nunca tapa sus botones.
export function AvisoCobros() {
  const pathname = usePathname();
  const cobros = useEnSala()?.cobros ?? 0;
  if (cobros === 0 || pathname.startsWith("/en-sala")) return null;

  const texto = cobros === 1 ? "1 persona en sala debe pagar" : `${cobros} personas en sala deben pagar`;
  return (
    <Link
      href="/en-sala"
      aria-label={texto}
      className="fixed left-4 top-4 z-40 flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold shadow-lg print:hidden lg:left-[15rem]"
      style={{ background: "var(--gx-bad)", color: "white" }}
    >
      <Warning size={18} weight="fill" />
      <span className="sm:hidden">{cobros}</span>
      <span className="hidden sm:inline">{texto}</span>
    </Link>
  );
}
