import Link from "next/link";
import { ArrowDown, ArrowUp } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@gym-app/ui/components/Button";
import { Card } from "@gym-app/ui/components/Card";
import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import { estadoVisibilidad } from "@gym-app/domain/services/secuenciaVitrina";
import { alternarActivoAction, moverItemAction } from "./actions";
import { SLUG_DE_TIPO, TITULO_DE_TIPO } from "./slugs";

const ESTADO: Record<ReturnType<typeof estadoVisibilidad>, { texto: string; color: string }> = {
  EN_PANTALLA: { texto: "En la TV", color: "var(--gx-good)" },
  PROGRAMADO: { texto: "Programado", color: "var(--gx-warn)" },
  VENCIDO: { texto: "Vencido", color: "var(--gx-bad)" },
  INACTIVO: { texto: "Inactivo", color: "var(--gx-muted)" },
};

export function FilaVitrina({
  item,
  ahora,
  numeroDiapositiva,
  mover,
}: {
  item: VitrinaItem;
  ahora: Date;
  numeroDiapositiva?: number;
  mover?: { puedeSubir: boolean; puedeBajar: boolean };
}) {
  const estado = ESTADO[estadoVisibilidad(item, ahora)];
  const titulo = item.nombre || item.etiqueta || TITULO_DE_TIPO[item.tipo];
  const miniatura = item.mediaTipo === "VIDEO" ? item.posterUrl : item.mediaUrl;

  return (
    <Card className="flex flex-wrap items-center gap-4">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg" style={{ background: "var(--gx-surface-2)" }}>
        {miniatura && (
          // eslint-disable-next-line @next/next/no-img-element -- imagen en R2 (dominio externo)
          <img src={miniatura} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold" style={{ color: "var(--gx-ink)" }}>
          {titulo}
        </p>
        <p className="text-sm" style={{ color: "var(--gx-muted)" }}>
          {TITULO_DE_TIPO[item.tipo]} · {item.mediaTipo === "VIDEO" ? (item.sonido ? "Video · Con sonido" : "Video") : "Imagen"}
          {numeroDiapositiva ? ` · Diapositiva ${numeroDiapositiva}` : ""}
        </p>
        <p className="text-sm font-medium" style={{ color: estado.color }}>
          {estado.texto}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {mover && (
          <>
            <form action={moverItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="direccion" value="SUBIR" />
              <Button type="submit" variant="secundario" disabled={!mover.puedeSubir} aria-label="Subir en la secuencia">
                <ArrowUp size={20} aria-hidden="true" />
              </Button>
            </form>
            <form action={moverItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="direccion" value="BAJAR" />
              <Button type="submit" variant="secundario" disabled={!mover.puedeBajar} aria-label="Bajar en la secuencia">
                <ArrowDown size={20} aria-hidden="true" />
              </Button>
            </form>
          </>
        )}
        <form action={alternarActivoAction}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="activo" value={item.activo ? "false" : "true"} />
          <Button type="submit" variant={item.activo ? "secundario" : "primario"}>
            {item.activo ? "Quitar de la TV" : "Mostrar en la TV"}
          </Button>
        </form>
        <Link
          href={`/vitrina/${SLUG_DE_TIPO[item.tipo]}/${item.id}`}
          className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-4 text-sm font-semibold"
          style={{ borderColor: "var(--gx-field-edge)", color: "var(--gx-ink)" }}
        >
          Editar
        </Link>
      </div>
    </Card>
  );
}
