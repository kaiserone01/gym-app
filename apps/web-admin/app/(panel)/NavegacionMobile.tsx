"use client";

import { useState } from "react";
import {
  UsersThree,
  CreditCard,
  Wallet,
  ChartBar,
  DotsThreeCircle,
} from "@phosphor-icons/react/dist/ssr";
import { BottomTabBar, type ItemTab } from "@gym-app/ui/components/BottomTabBar";
import { MasSheet } from "./MasSheet";

export function NavegacionMobile({
  nombre,
  email,
  rol,
}: {
  nombre: string;
  email: string;
  rol: string;
}) {
  const [masAbierto, setMasAbierto] = useState(false);

  const items: ItemTab[] = [
    {
      tipo: "link",
      href: "/miembros",
      label: "Miembros",
      icon: <UsersThree size={24} />,
      iconActivo: <UsersThree size={24} weight="fill" />,
    },
    {
      tipo: "link",
      href: "/caja",
      label: "Caja",
      icon: <Wallet size={24} />,
      iconActivo: <Wallet size={24} weight="fill" />,
    },
    {
      tipo: "link",
      href: "/pagos",
      label: "Pagos",
      icon: <CreditCard size={24} />,
      iconActivo: <CreditCard size={24} weight="fill" />,
    },
    {
      tipo: "link",
      href: "/estadisticas",
      label: "Estadísticas",
      icon: <ChartBar size={24} />,
      iconActivo: <ChartBar size={24} weight="fill" />,
    },
    {
      tipo: "accion",
      label: "Más",
      icon: <DotsThreeCircle size={24} />,
      iconActivo: <DotsThreeCircle size={24} weight="fill" />,
      activo: masAbierto,
      onPress: () => setMasAbierto(true),
    },
  ];

  return (
    <>
      <BottomTabBar items={items} />
      <MasSheet abierto={masAbierto} onCerrar={() => setMasAbierto(false)} nombre={nombre} email={email} rol={rol} />
    </>
  );
}
