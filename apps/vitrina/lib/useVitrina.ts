"use client";

import { useEffect, useRef, useState } from "react";
import type { ManifiestoVitrina } from "@gym-app/domain/entities/Vitrina";
import { instanteEfectivo } from "@gym-app/domain/utils/relojEfectivo";
import { crearAlmacen, type Almacen } from "./almacen";
import { abrirEventos, pedirManifiesto } from "./api";
import { cargarConfig, type ConfigVitrina } from "./config";
import { esperar } from "./esperar";
import { crearSerializador } from "./serializar";
import { contarIntentos, debeOmitirFallidas, sincronizar, type IntentosFallidos } from "./sincronizar";

const CLAVE_MANIFIESTO = "vitrina_manifiesto";
const CLAVE_SERVIDOR_AHORA = "vitrina_servidor_ahora";
const SONDEO_MS = 10 * 60_000; // red de seguridad: siempre aplica el manifiesto completo
const REINTENTO_MS = 60_000; // tras una sincronización incompleta o fallida
const CONEXION_ESTABLE_MS = 10_000; // una conexión SSE que vive esto reinicia la espera de reconexión
const ESPERA_MIN_MS = 2_000;
const ESPERA_MAX_MS = 60_000;
const RELOJ_MS = 15_000;

function leer<T>(clave: string): T | null {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as T) : null;
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // sin almacenamiento persistente la vitrina funciona igual, solo que sin respaldo del último manifiesto
  }
}

export interface EstadoVitrina {
  manifiesto: ManifiestoVitrina | null;
  almacen: Almacen | null;
  ahora: Date; // instante efectivo: nunca anterior al último servidorAhora conocido
}

export function useVitrina(): EstadoVitrina {
  const [manifiesto, setManifiesto] = useState<ManifiestoVitrina | null>(null);
  const [almacen, setAlmacen] = useState<Almacen | null>(null);
  const servidorAhora = useRef<Date | null>(null);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    let cancelado = false;
    const controlador = new AbortController();
    let reintento: ReturnType<typeof setTimeout> | undefined;
    let sondeoId: ReturnType<typeof setInterval> | undefined;

    const recordarServidorAhora = (iso: string) => {
      guardar(CLAVE_SERVIDOR_AHORA, iso);
      servidorAhora.current = new Date(iso);
    };

    // Un ciclo a la vez, sin perder avisos (ver crearSerializador). El manifiesto nuevo se adopta cuando TODAS sus
    // piezas están en disco, o cuando las que fallan llevan 3 intentos seguidos (se omiten y el Reproductor las
    // excluye hasta que bajen); mientras tanto la TV sigue mostrando el anterior con sus archivos intactos.
    // El manifiesto nuevo se adopta y persiste ANTES de que `sincronizar` borre las piezas obsoletas.
    const crearSincronizador = (config: ConfigVitrina, alm: Almacen) => {
      let intentos: IntentosFallidos = new Map(); // intentos consecutivos fallidos por URL
      const programarReintento = () => {
        if (cancelado) return;
        clearTimeout(reintento);
        reintento = setTimeout(() => void sincronizarTodo(), REINTENTO_MS);
      };
      const sincronizarTodo = crearSerializador(async () => {
        try {
          const nuevo = await pedirManifiesto(config, controlador.signal);
          if (cancelado) return;
          recordarServidorAhora(nuevo.servidorAhora);
          const resultado = await sincronizar(
            nuevo,
            alm,
            (adoptado) => {
              // Tras desmontar no se adopta ni se borra nada: el manifiesto guardado sigue siendo el anterior.
              if (cancelado) throw new Error("vitrina desmontada");
              guardar(CLAVE_MANIFIESTO, adoptado);
              setManifiesto(adoptado);
            },
            (fallidas) => {
              // Una pieza que falla 3 veces seguidas no puede congelar la TV: se adopta el manifiesto sin ella.
              intentos = contarIntentos(intentos, fallidas);
              return debeOmitirFallidas(intentos, fallidas);
            }
          );
          if (resultado.fallidas.length === 0) intentos = new Map(); // todo bajó: se reinician los contadores
          if (!resultado.completo) programarReintento(); // las piezas omitidas se siguen reintentando
        } catch (error) {
          if (cancelado) return;
          console.warn("[vitrina] no se pudo sincronizar:", error);
          programarReintento();
        }
      });
      return sincronizarTodo;
    };

    const escuchar = async (sincronizarTodo: () => Promise<void>, config: ConfigVitrina) => {
      let espera = ESPERA_MIN_MS;
      while (!cancelado) {
        const conexion = { abiertoEn: null as number | null }; // objeto: TS no estrecha lo que cambia un callback
        try {
          await abrirEventos(
            config,
            {
              alAbrir: () => {
                conexion.abiertoEn = Date.now();
                void sincronizarTodo(); // al (re)conectar se pone al día
              },
              alEvento: () => void sincronizarTodo(),
            },
            controlador.signal
          );
        } catch {
          // sin red o conexión cortada: se reintenta con espera creciente
        }
        if (cancelado) return;
        // La espera solo vuelve al mínimo si la conexión vivió un rato: un proxy que acepta y cierra al instante no
        // debe provocar reconexiones a martillazos.
        if (conexion.abiertoEn !== null && Date.now() - conexion.abiertoEn >= CONEXION_ESTABLE_MS) espera = ESPERA_MIN_MS;
        await esperar(espera, controlador.signal);
        espera = Math.min(espera * 2, ESPERA_MAX_MS);
      }
    };

    const iniciarAlmacenYReloj = async () => {
      const guardado = leer<string>(CLAVE_SERVIDOR_AHORA);
      if (guardado) servidorAhora.current = new Date(guardado);
      setAhora(instanteEfectivo(new Date(), servidorAhora.current));

      const alm = crearAlmacen();
      await alm.iniciar();
      if (cancelado) return null;
      setAlmacen(alm);
      const anterior = leer<ManifiestoVitrina>(CLAVE_MANIFIESTO);
      if (anterior) setManifiesto(anterior); // sin red: se arranca con lo último que se mostró
      return alm;
    };

    const relojId = setInterval(() => setAhora(instanteEfectivo(new Date(), servidorAhora.current)), RELOJ_MS);

    void (async () => {
      try {
        const alm = await iniciarAlmacenYReloj();
        if (!alm || cancelado) return;
        const config = await cargarConfig();
        if (cancelado) return;
        const sincronizarTodo = crearSincronizador(config, alm);
        void sincronizarTodo();
        sondeoId = setInterval(() => void sincronizarTodo(), SONDEO_MS);
        void escuchar(sincronizarTodo, config);
      } catch (error) {
        console.error("[vitrina] no se pudo iniciar:", error);
      }
    })();

    return () => {
      cancelado = true;
      controlador.abort();
      clearInterval(relojId);
      clearInterval(sondeoId);
      clearTimeout(reintento);
    };
  }, []);

  return { manifiesto, almacen, ahora };
}
