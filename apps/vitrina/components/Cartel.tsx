import type { Almacen } from "@/lib/almacen";
import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import type { EstadoTasa } from "@gym-app/domain/utils/estadoTasa";
import { Badges } from "./Badges";
import { Medio } from "./Medio";

export function Cartel({ item, almacen, tasa }: { item: VitrinaItem; almacen: Almacen; tasa: { valor: number; estado: EstadoTasa } | null }) {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "var(--gx-ground)" }}>
      <Medio url={item.mediaUrl} tipo={item.mediaTipo} posterUrl={item.posterUrl} almacen={almacen} reproducir ajuste="contain" />
      <Badges item={item} tasa={tasa} />
    </div>
  );
}
