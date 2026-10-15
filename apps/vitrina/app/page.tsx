"use client";

import { PantallaMarca } from "@/components/PantallaMarca";
import { Reproductor } from "@/components/Reproductor";
import { useVitrina } from "@/lib/useVitrina";

export default function PaginaVitrina() {
  const { manifiesto, almacen, ahora } = useVitrina();
  if (!manifiesto || !almacen) return <PantallaMarca />;
  return <Reproductor manifiesto={manifiesto} almacen={almacen} ahora={ahora} />;
}
