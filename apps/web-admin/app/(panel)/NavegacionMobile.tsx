"use client";

import { useState } from "react";
import {
  UsersThree,
  CreditCard,
  Wallet,
  Barbell,
  DotsThreeCircle,
} from "@phosphor-icons/react/dist/ssr";
import { BottomTabBar, type ItemTab } from "@gym-app/ui/components/BottomTabBar";
import { MasSheet } from "./MasSheet";
import { ContadorEnSala } from "./en-sala/ContextoEnSala";

export function NavegacionMobile({
  nombre,
  email,
  rol,
  puedeVerEnSala,
}: {
  nombre: string;
  email: string;
  rol: string;
  puedeVerEnSala: boolean;
}) {
  const [masAbierto, setMasAbierto] = useState(false);

  const iconoEnSala = (peso: "regular" | "fill") => (
    <span className="relative">
      <Barbell size={24} weight={peso} />
      <ContadorEnSala className="absolute -right-3 -top-1" />
    </span>
  );

  const items: ItemTab[] = [
    ...(puedeVerEnSala
      ? [
          {
            tipo: "link" as const,
            href: "/en-sala",
            label: "En sala",
            icon: iconoEnSala("regular"),
            iconActivo: iconoEnSala("fill"),
          },
        ]
      : []),
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
      href: "/miembros",
      label: "Miembros",
      icon: <UsersThree size={24} />,
      iconActivo: <UsersThree size={24} weight="fill" />,
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
