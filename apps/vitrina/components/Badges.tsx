import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import type { EstadoTasa } from "@gym-app/domain/utils/estadoTasa";
import { formatearBs } from "@gym-app/domain/utils/formatearBs";
import { descuentoMostrado, equivalenteBs } from "@gym-app/domain/utils/vitrinaBadges";

const usd = (monto: number) => `$${monto.toFixed(2)}`;
const PASTILLA = "rgba(10, 13, 7, 0.78)";

// Etiqueta, descuento, precio (tachado si hay oferta), oferta y equivalente en Bs, cada uno según sus banderas.
// El Bs se oculta solo si la tasa está DESACTUALIZADA o no hay tasa (equivalenteBs lo decide). Descuento y etiqueta
// llevan texto ("-20 %", "NUEVO"), no solo color.
export function Badges({ item, tasa }: { item: VitrinaItem; tasa: { valor: number; estado: EstadoTasa } | null }) {
  const etiqueta = item.mostrarEtiqueta ? item.etiqueta : null;
  const descuentoCalculado = descuentoMostrado(item);
  const descuento = descuentoCalculado !== null && Number.isFinite(descuentoCalculado) && descuentoCalculado > 0 ? descuentoCalculado : null;
  const oferta = item.mostrarOferta ? item.ofertaUSD : null;
  const precio = item.mostrarPrecio ? item.precioUSD : null;
  const bs = equivalenteBs(item, tasa);
  if (!etiqueta && descuento === null && oferta === null && precio === null) return null;

  return (
    <div className="absolute bottom-[3rem] left-[3rem] flex flex-col items-start gap-[0.6rem] tabular-nums max-w-[calc(100%-6rem)]">
      <div className="flex flex-wrap gap-[0.6rem]">
        {etiqueta && (
          <span className="titulo rounded-[0.5rem] px-[1.2rem] py-[0.3rem] text-[2.4rem]" style={{ background: "var(--gx-accent)", color: "var(--gx-accent-ink)" }}>
            {etiqueta}
          </span>
        )}
        {descuento !== null && (
          <span className="titulo rounded-[0.5rem] px-[1.2rem] py-[0.3rem] text-[2.4rem]" style={{ background: "var(--gx-warn)", color: "var(--gx-warn-ink)" }}>
            -{descuento} %
          </span>
        )}
      </div>
      {(oferta !== null || precio !== null) && (
        <div className="flex items-baseline gap-[1.2rem] rounded-[0.8rem] px-[1.6rem] py-[0.6rem]" style={{ background: PASTILLA }}>
          {oferta !== null ? (
            <>
              {precio !== null && (
                <span className="text-[2.2rem] line-through" style={{ color: "var(--gx-muted)" }}>
                  {usd(precio)}
                </span>
              )}
              <span className="titulo text-[5rem]" style={{ color: "var(--gx-accent)" }}>
                {usd(oferta)}
              </span>
            </>
          ) : (
            <span className="titulo text-[5rem]" style={{ color: "var(--gx-ink)" }}>
              {usd(precio as number)}
            </span>
          )}
        </div>
      )}
      {bs !== null && (
        <span className="rounded-[0.6rem] px-[1.2rem] py-[0.3rem] text-[2.2rem] font-semibold" style={{ background: PASTILLA, color: "var(--gx-ink)" }}>
          Bs. {formatearBs(bs)}
        </span>
      )}
    </div>
  );
}
