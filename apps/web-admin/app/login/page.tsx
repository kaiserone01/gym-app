"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LogoBadge } from "@gym-app/ui/components/LogoBadge";

interface SucursalParaElegir {
  id: string;
  nombre: string;
  cajaAbiertaPor: string | null;
}

export default function LoginPage() {
  const router = useRouter();
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

    router.push("/miembros");
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

    router.push("/miembros");
  }

  return (
    <>
      <main
        className="flex min-h-screen items-center justify-center p-6"
        style={{ background: "var(--gx-ground)", color: "var(--gx-ink)" }}
      >
        <div
          className="grid w-full max-w-3xl overflow-hidden rounded-2xl border md:grid-cols-2"
          style={{ borderColor: "var(--gx-edge)", boxShadow: "0 40px 80px -40px rgba(0,0,0,0.75)" }}
        >
          <div className="flex flex-col items-center justify-center gap-6 p-10" style={{ background: "var(--gx-ground)" }}>
            <LogoBadge src="/branding/logo-adrenalina-gym.jpg" alt="Adrenalina Xtreme Gym" />
            <div className="text-center">
              <div className="text-3xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.04em" }}>
                ADRENALINA <span style={{ color: "var(--gx-accent)" }}>XTREME</span>
              </div>
              <div
                className="mt-1 text-xs uppercase"
                style={{
                  fontFamily: '"Barlow Condensed", sans-serif',
                  fontWeight: 700,
                  letterSpacing: "0.24em",
                  color: "var(--gx-muted-dim)",
                }}
              >
                Gym · Panel de administración
              </div>
            </div>
          </div>

          {sucursalesParaElegir === null ? (
            <form onSubmit={manejarSubmitCredenciales} className="flex flex-col gap-4 p-10" style={{ background: "var(--gx-surface)" }}>
              <h1 className="text-2xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}>
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
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded border px-3 py-2 outline-none"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                />
              </label>

              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--gx-muted)" }}>
                Contraseña
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded border px-3 py-2 outline-none"
                  style={{ background: "var(--gx-surface-2)", borderColor: "var(--gx-edge)", color: "var(--gx-ink)" }}
                />
              </label>

              <button
                type="submit"
                disabled={cargando}
                className="rounded px-5 py-2 font-semibold transition-opacity disabled:opacity-50"
                style={{ background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}
              >
                {cargando ? "Ingresando..." : "Ingresar"}
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-4 p-10" style={{ background: "var(--gx-surface)" }}>
              <h1 className="text-2xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}>
                Elegí una sucursal
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
                    style={{ borderColor: "var(--gx-edge)", background: "var(--gx-surface-2)", color: "var(--gx-ink)" }}
                  >
                    <span className="font-semibold">{sucursal.nombre}</span>
                    {sucursal.cajaAbiertaPor && (
                      <span
                        className="rounded px-2 py-1 text-xs"
                        style={{ background: "color-mix(in srgb, var(--gx-warn) 15%, transparent)", color: "var(--gx-warn)", width: "fit-content" }}
                      >
                        Caja abierta por {sucursal.cajaAbiertaPor}
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
      </main>
    </>
  );
}
