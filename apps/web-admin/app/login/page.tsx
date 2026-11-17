"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Envelope, Eye, EyeSlash, Lock, SignIn } from "@phosphor-icons/react";

interface SucursalParaElegir {
  id: string;
  nombre: string;
  cajaAbiertaPor: string | null;
  cajaAbiertaPorMi: boolean;
}

// Título con la rayita verde debajo (mismo en credenciales y en elegir sucursal).
const ESTILO_TITULO = "text-4xl after:mt-2 after:block after:h-[3px] after:w-11 after:rounded-sm after:bg-[var(--gx-accent)]";
const ESTILO_TITULO_FUENTE = { fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em", fontWeight: 400 } as const;

export default function LoginPage() {
  const router = useRouter();
  const [verPassword, setVerPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  // null = todavía en el paso 1 (credenciales); un array = paso 2 (elegir
  // sucursal) — las credenciales ya están validadas en ese punto, se
  // guardan acá mismo para reenviarlas al elegir botón (ver
  // /api/auth/login/sucursal: no hay sesión/token intermedio entre los
  // dos pasos, ver diseño acordado).
  const [sucursalesParaElegir, setSucursalesParaElegir] = useState<SucursalParaElegir[] | null>(null);

  async function manejarSubmitCredenciales(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    setCargando(false);

    if (!res.ok) {
      setError(data.error ?? "Error al iniciar sesión.");
      return;
    }

    if (data.requiereSeleccion) {
      setSucursalesParaElegir(data.sucursales);
      return;
    }

    router.push("/");
  }

  async function elegirSucursal(sucursalId: string) {
    setError(null);
    setCargando(true);

    const res = await fetch("/api/auth/login/sucursal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, sucursalId }),
    });

    setCargando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Error al iniciar sesión.");
      return;
    }

    router.push("/");
  }

  return (
    <>
      <main
        className="relative grid min-h-screen place-items-center overflow-hidden p-4 pb-36 sm:p-6 sm:pb-6"
        style={{
          color: "var(--gx-ink)",
          background:
            "linear-gradient(90deg, rgba(10,13,7,.82) 0%, rgba(10,13,7,.45) 45%, rgba(10,13,7,.7) 100%), url('/branding/login-fondo.jpg') center / cover no-repeat, var(--gx-ground)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(60% 70% at 70% 40%, color-mix(in srgb, var(--gx-accent) 14%, transparent), transparent 70%)" }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 h-[min(22vw,300px)] w-[min(36vw,520px)]"
          style={{ background: "var(--gx-accent)", clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
          aria-hidden="true"
        />

        <div
          className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-[22px] border md:grid-cols-2"
          style={{
            borderColor: "color-mix(in srgb, var(--gx-accent) 35%, transparent)",
            background: "rgba(10,13,7,.58)",
            backdropFilter: "blur(14px)",
            boxShadow: "0 40px 90px -30px rgba(0,0,0,.85), 0 0 40px -10px color-mix(in srgb, var(--gx-accent) 35%, transparent)",
          }}
        >
          <div
            className="flex flex-col items-center justify-center gap-3.5 border-b px-5 py-7 text-center md:border-b-0 md:border-r md:px-7 md:py-12"
            style={{ borderColor: "color-mix(in srgb, var(--gx-accent) 22%, transparent)" }}
          >
            <img
              src="/branding/adrenalina-icono-login.png"
              alt="Adrenalina Xtreme Gym"
              className="h-24 w-24 md:h-36 md:w-36"
              style={{ filter: "drop-shadow(0 0 18px color-mix(in srgb, var(--gx-accent) 45%, transparent))" }}
            />
            <div className="text-4xl leading-none md:text-5xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.04em" }}>
              ADRENALINA <span style={{ color: "var(--gx-accent)" }}>XTREME</span>
            </div>
            <div
              className="text-[11px] uppercase"
              style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, letterSpacing: "0.3em", color: "var(--gx-muted)" }}
            >
              Gym · Panel de administración
            </div>
            <div
              className="mt-1 h-px w-24"
              style={{ background: "linear-gradient(90deg, transparent, var(--gx-accent), transparent)" }}
              aria-hidden="true"
            />
          </div>

          {sucursalesParaElegir === null ? (
            <form onSubmit={manejarSubmitCredenciales} className="flex flex-col justify-center gap-4 px-6 py-8 md:px-10 md:py-12">
              <h1 className={ESTILO_TITULO} style={ESTILO_TITULO_FUENTE}>
                Iniciar sesión
              </h1>

              {error && (
                <p
                  className="rounded px-3 py-2 text-sm"
                  style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
                >
                  {error}
                </p>
              )}

              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
                Email
                <div className="relative">
                  <Envelope size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--gx-muted)" }} />
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="min-h-12 w-full rounded-xl border pl-11 pr-3 gx-campo"
                  />
                </div>
              </label>

              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
                Contraseña
                <div className="relative">
                  <Lock size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--gx-muted)" }} />
                  <input
                    type={verPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="min-h-12 w-full rounded-xl border pl-11 pr-11 gx-campo"
                  />
                  <button
                    type="button"
                    onClick={() => setVerPassword((v) => !v)}
                    aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md transition-colors duration-150 hover:text-[var(--gx-accent)]"
                    style={{ color: "var(--gx-muted)" }}
                  >
                    {verPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={cargando}
                className="mt-1 flex min-h-[52px] cursor-pointer items-center justify-center gap-2.5 rounded-xl px-5 text-lg font-bold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: "var(--gx-accent)",
                  color: "var(--gx-accent-ink)",
                  boxShadow: "0 10px 28px -8px color-mix(in srgb, var(--gx-accent) 55%, transparent)",
                }}
              >
                <SignIn size={22} weight="bold" />
                {cargando ? "Ingresando..." : "Ingresar"}
              </button>
            </form>
          ) : (
            <div className="flex flex-col justify-center gap-4 px-6 py-8 md:px-10 md:py-12">
              <h1 className={ESTILO_TITULO} style={ESTILO_TITULO_FUENTE}>
                Elige una sucursal
              </h1>

              {error && (
                <p
                  className="rounded px-3 py-2 text-sm"
                  style={{ background: "color-mix(in srgb, var(--gx-bad) 15%, transparent)", color: "var(--gx-bad)" }}
                >
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-3">
                {sucursalesParaElegir.map((sucursal) => (
                  <button
                    key={sucursal.id}
                    type="button"
                    disabled={cargando}
                    onClick={() => elegirSucursal(sucursal.id)}
                    className="flex flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-opacity disabled:opacity-50"
                    style={{ borderColor: "var(--gx-field-edge)", background: "color-mix(in srgb, var(--gx-surface-2) 72%, transparent)", color: "var(--gx-ink)" }}
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-semibold">{sucursal.nombre}</span>
                      {sucursal.cajaAbiertaPorMi && (
                        <span
                          className="text-xs font-semibold uppercase tracking-wide"
                          style={{ color: "var(--gx-good)" }}
                        >
                          Entrar para continuar
                        </span>
                      )}
                    </span>
                    {sucursal.cajaAbiertaPor && (
                      <span
                        className="flex items-center gap-2 rounded px-2 py-1 text-xs"
                        style={{
                          background: sucursal.cajaAbiertaPorMi
                            ? "color-mix(in srgb, var(--gx-good) 15%, transparent)"
                            : "color-mix(in srgb, var(--gx-warn) 15%, transparent)",
                          color: sucursal.cajaAbiertaPorMi ? "var(--gx-good)" : "var(--gx-warn)",
                          width: "fit-content",
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="3" y="10" width="18" height="10" rx="1" />
                          <path d="M7 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3" />
                          <path d="M3 14h18" />
                          <path d="M9 14v2" />
                          <path d="M15 14v2" />
                        </svg>
                        {sucursal.cajaAbiertaPorMi
                          ? "Ya tienes una caja abierta y activa"
                          : `Caja abierta por ${sucursal.cajaAbiertaPor}`}
                        {sucursal.cajaAbiertaPorMi && (
                          <span
                            className="ml-auto inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: "var(--gx-good)" }}
                            aria-hidden="true"
                          />
                        )}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSucursalesParaElegir(null);
                  setError(null);
                }}
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--gx-muted)" }}
              >
                ← Volver
              </button>
            </div>
          )}
        </div>

        <div className="absolute bottom-20 left-5 z-10 sm:bottom-8 sm:left-8">
          <div className="text-base font-medium uppercase tracking-[0.28em] sm:text-2xl">Disciplina hoy,</div>
          <div className="mt-1 text-lg font-bold uppercase italic tracking-[0.22em] sm:text-3xl" style={{ color: "var(--gx-accent)" }}>
            Resultados siempre.
          </div>
          <div className="mt-1.5 h-0.5 w-72 max-w-[70vw]" style={{ background: "linear-gradient(90deg, var(--gx-accent), transparent)" }} aria-hidden="true" />
        </div>
        <div
          className="absolute bottom-4 right-5 z-10 rounded-full border px-4 py-2 text-sm font-semibold sm:bottom-6 sm:right-8"
          style={{ background: "rgba(10,13,7,.82)", borderColor: "color-mix(in srgb, var(--gx-accent) 30%, transparent)" }}
        >
          by zipnegocios
        </div>
      </main>
    </>
  );
}
