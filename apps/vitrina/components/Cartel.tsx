import type { Almacen } from "@/lib/almacen";
import type { VitrinaItem } from "@gym-app/domain/entities/Vitrina";
import type { EstadoTasa } from "@gym-app/domain/utils/estadoTasa";
import { Badges } from "./Badges";
import { Medio } from "./Medio";

interface Props {
  item: VitrinaItem;
  almacen: Almacen;
  tasa: { valor: number; estado: EstadoTasa } | null;
  /** Diapositiva única: el video se repite en vez de avanzar. */
  bucle: boolean;
  alTerminarVideo: (fallo: boolean) => void;
}

export function Cartel({ item, almacen, tasa, bucle, alTerminarVideo }: Props) {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "var(--gx-ground)" }}>
      <Medio
        url={item.mediaUrl}
        tipo={item.mediaTipo}
        posterUrl={item.posterUrl}
        almacen={almacen}
        reproducir
        ajuste="contain"
        sonido={item.sonido}
        bucle={bucle}
        alTerminar={alTerminarVideo}
      />
      <Badges item={item} tasa={tasa} />
    </div>
  );
}
