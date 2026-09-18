"use client";

import { Button } from "@gym-app/ui/components/Button";
import type { ModuloPermiso, AccionPermiso, Permiso } from "@gym-app/domain/entities/Permiso";

const MODULOS: { valor: ModuloPermiso; etiqueta: string }[] = [
  { valor: "MIEMBROS", etiqueta: "Miembros" },
  { valor: "PAGOS", etiqueta: "Pagos" },
  { valor: "PLANES", etiqueta: "Planes" },
  { valor: "CAJA", etiqueta: "Caja" },
  { valor: "USUARIOS", etiqueta: "Usuarios" },
  { valor: "SUCURSALES", etiqueta: "Sucursales" },
];

const ACCIONES: { valor: AccionPermiso; etiqueta: string }[] = [
  { valor: "VER", etiqueta: "Ver" },
  { valor: "CREAR", etiqueta: "Crear" },
  { valor: "EDITAR", etiqueta: "Editar" },
  { valor: "ELIMINAR", etiqueta: "Eliminar" },
];

export function FormularioPermisos({
  accion,
  permisosActuales,
}: {
  accion: (formData: FormData) => Promise<void>;
  permisosActuales: Permiso[];
}) {
  const tiene = (modulo: ModuloPermiso, acc: AccionPermiso) =>
    permisosActuales.some((p) => p.modulo === modulo && p.accion === acc);

  return (
    <form action={accion} className="flex flex-col gap-4">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b text-neutral-500">
            <th className="py-2">Módulo</th>
            {ACCIONES.map((a) => (
              <th key={a.valor} className="py-2 text-center">
                {a.etiqueta}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MODULOS.map((m) => (
            <tr key={m.valor} className="border-b">
              <td className="py-2">{m.etiqueta}</td>
              {ACCIONES.map((a) => (
                <td key={a.valor} className="py-2 text-center">
                  <input
                    type="checkbox"
                    name={`permiso_${m.valor}_${a.valor}`}
                    defaultChecked={tiene(m.valor, a.valor)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <Button type="submit">Guardar permisos</Button>
    </form>
  );
}
