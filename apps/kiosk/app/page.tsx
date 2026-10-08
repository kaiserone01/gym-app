"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarClaveDelFragmento, obtenerApiKey } from "@/lib/config";
import { registrarCheckIn, ErrorCheckIn } from "@/lib/api";
import { encolar, listarPendientes } from "@/lib/colaPendientes";
import { reintentarPendientes } from "@/lib/reintentarPendientes";
import { useEntradaCedula } from "@/lib/useEntradaCedula";
import { estadoInicial, reducirPantalla, type Ficha, type FichaActiva } from "@/lib/estadoPantalla";
import { caraDeResultado, tonoDeCara, type Tono } from "@/lib/cara";
import { precargarFoto } from "@/lib/precargarFoto";
import { textoSaludo } from "@/lib/saludo";
import { useFraseRotativa } from "@/lib/useFraseRotativa";
import { useFrasesReposo } from "@/lib/useFrasesReposo";
import { useHoraActual } from "@/lib/useHoraActual";
import { useInfoKiosco } from "@/lib/useInfoKiosco";
import { AccessCard } from "@/components/AccessCard";
import { FichaAviso } from "@/components/FichaAviso";
import { FichaGiratoria } from "@/components/FichaGiratoria";
import { FichaReposo } from "@/components/FichaReposo";
import { FondoVideo, type Reaccion } from "@/components/FondoVideo";

// Cuánto tiempo se queda la ficha real en pantalla antes de volver al reposo.
const DURACION_FICHA_MS = 30_000;
// Tope de espera por la foto antes de voltear la ficha (si falla, sale con iniciales).
const ESPERA_FOTO_MS = 1_500;

// Recuadro del campo de cédula, igual con y sin host nativo.
const CLASES_CAMPO_CEDULA = "w-full max-w-2xl text-center text-6xl tracking-widest rounded-xl border-2 px-6 py-4";
const ESTILO_CAMPO_CEDULA = { borderColor: "var(--gx-accent)", color: "var(--gx-ink)" };

function contenidoFicha(ficha: FichaActiva) {
  switch (ficha.tipo) {
    case "resultado":
      return (
        <AccessCard
          resultado={ficha.resultado}
          hora={ficha.hora}
          cara={ficha.cara}
          diasParaVencer={ficha.diasParaVencer}
          fotoOk={ficha.fotoOk}
          saludo={ficha.saludo}
          duracionMs={DURACION_FICHA_MS}
        />
      );
    case "pendiente":
      return (
        <FichaAviso
          tono="ambar"
          titulo="Sin conexión"
          detalle="Tu entrada se guardó y se enviará sola cuando vuelva la red."
          duracionMs={DURACION_FICHA_MS}
        />
      );
    case "error":
      return <FichaAviso tono="rojo" titulo="No se pudo registrar" detalle={ficha.mensaje} duracionMs={DURACION_FICHA_MS} />;
  }
}

export default function PaginaCheckIn() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [pantalla, despachar] = useReducer(reducirPantalla, estadoInicial);
  const [reaccion, setReaccion] = useState<Reaccion | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const { cedula, limpiar, sinInput, propsInput } = useEntradaCedula({ alEnviar: enviar });
  const info = useInfoKiosco(apiKey);
  const { frase, saliendo } = useFraseRotativa(useFrasesReposo(info?.reposo));
  const hora = useHoraActual();

  useEffect(() => {
    guardarClaveDelFragmento();
    const clave = obtenerApiKey();
    if (!clave) {
      router.replace("/config");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lee localStorage tras el montaje (SSR-safe, ver ADR de output: "export")
    setApiKey(clave);
  }, [router]);

  const actualizarPendientes = useCallback(() => {
    listarPendientes().then((lista) => setPendientes(lista.length));
  }, []);

  useEffect(() => {
    if (!apiKey) return;

    actualizarPendientes();
    reintentarPendientes(apiKey).then(actualizarPendientes);

    const alReconectar = () => {
      reintentarPendientes(apiKey).then(actualizarPendientes);
    };
    window.addEventListener("online", alReconectar);
    return () => window.removeEventListener("online", alReconectar);
  }, [apiKey, actualizarPendientes]);

  // La ficha real vuelve sola al reposo a los 30 s; una respuesta nueva la reemplaza antes y su id
  // distinto reinicia el conteo (el temporizador de la anterior se cancela al cambiar el id).
  const fichaId = pantalla.ficha?.id;
  useEffect(() => {
    if (fichaId === undefined) return;
    const temporizador = setTimeout(() => despachar({ tipo: "vencio", id: fichaId }), DURACION_FICHA_MS);
    return () => clearTimeout(temporizador);
  }, [fichaId]);

  async function mostrar(ficha: Ficha, tono: Tono) {
    // La foto se baja ANTES de voltear para que la ficha no aparezca a medio cargar.
    if (ficha.tipo === "resultado") {
      ficha = { ...ficha, fotoOk: ficha.resultado.fotoUrl ? await precargarFoto(ficha.resultado.fotoUrl, ESPERA_FOTO_MS) : false };
    }
    despachar({ tipo: "respuesta", ficha });
    setReaccion((previa) => ({ id: (previa?.id ?? 0) + 1, tono }));
  }

  async function enviar(cedula: string) {
    if (!apiKey || !cedula || pantalla.procesando) return;

    despachar({ tipo: "enviar" });

    // Primero se resuelve qué mostrar y recién después se muestra: un fallo al mostrar no debe
    // confundirse con una red caída (que encolaría la cédula por error).
    let salida: { ficha: Ficha; tono: Tono };
    try {
      const resultado = await registrarCheckIn(apiKey, cedula);
      const ahora = new Date();
      const { cara, diasParaVencer } = caraDeResultado(resultado, ahora);
      salida = {
        ficha: {
          tipo: "resultado",
          resultado,
          hora: ahora.toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" }),
          cara,
          diasParaVencer,
          fotoOk: false,
          saludo: textoSaludo(resultado.genero, resultado.esCumpleanos),
        },
        tono: tonoDeCara(cara),
      };
    } catch (error) {
      if (error instanceof ErrorCheckIn) {
        salida = { ficha: { tipo: "error", mensaje: error.message }, tono: "rojo" };
      } else {
        try {
          await encolar(cedula);
          actualizarPendientes();
          salida = { ficha: { tipo: "pendiente" }, tono: "ambar" };
        } catch {
          salida = { ficha: { tipo: "error", mensaje: "No se pudo guardar tu entrada. Acércate a recepción." }, tono: "rojo" };
        }
      }
    }

    try {
      await mostrar(salida.ficha, salida.tono);
    } finally {
      limpiar();
    }
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center gap-[4vmin] p-[5vmin]"
      style={{ color: "var(--gx-ink)" }}
    >
      <FondoVideo reaccion={reaccion} />

      {/* Logo fijo arriba a la derecha, dentro del margen de overscan. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- output: "export" no soporta el optimizador de next/image */}
      <img
        src="/branding/adrenalina-gym-bg.png"
        alt=""
        aria-hidden
        className="pointer-events-none fixed right-[5vmin] top-[5vmin] h-64 w-64 object-contain"
      />

      {pendientes > 0 && (
        <div
          className="fixed left-[5vmin] top-[5vmin] rounded px-3 py-1 text-xl"
          style={{ background: "var(--gx-bad)", color: "var(--gx-bad-ink)" }}
        >
          {pendientes} pendiente{pendientes === 1 ? "" : "s"} por sincronizar
        </div>
      )}

      <div className="flex w-full flex-col items-center gap-2">
        <h1 className="text-7xl" style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}>
          Ingresa tu cédula
        </h1>

        {sinInput ? (
          // Dentro de apps/kiosk-host o de la APK la cédula llega por teclas del numpad: no hace falta foco.
          <div className={`${CLASES_CAMPO_CEDULA} min-h-[5.5rem]`} style={ESTILO_CAMPO_CEDULA}>
            {cedula}
          </div>
        ) : (
          <input {...propsInput} className={`${CLASES_CAMPO_CEDULA} bg-transparent outline-none`} style={ESTILO_CAMPO_CEDULA} />
        )}

        <p className="min-h-[2.5rem] text-3xl" style={{ color: "var(--gx-muted)" }}>
          {pantalla.procesando ? "Verificando…" : ""}
        </p>
      </div>

      <div className="flex w-full flex-1 items-center justify-center">
        <FichaGiratoria
          ficha={pantalla.ficha}
          renderReposo={() => (
            <FichaReposo
              frase={frase}
              saliendo={saliendo}
              hora={hora}
              tasa={info?.tasaBcv ?? null}
              sede={info?.sucursalNombre ?? null}
            />
          )}
          renderFicha={contenidoFicha}
        />
      </div>
    </main>
  );
}
