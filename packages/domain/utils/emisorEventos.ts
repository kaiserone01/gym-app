export type Oyente = (evento: string) => void;

// Pub/sub en memoria por clave (la sede). Sirve mientras web-admin corra en un solo contenedor; con varias
// instancias se reemplaza por LISTEN/NOTIFY de Postgres sin tocar a la TV.
export function crearEmisor() {
  const oyentes = new Map<string, Set<Oyente>>();
  return {
    suscribir(clave: string, oyente: Oyente): () => void {
      const conjunto = oyentes.get(clave) ?? new Set<Oyente>();
      conjunto.add(oyente);
      oyentes.set(clave, conjunto);
      return () => {
        conjunto.delete(oyente);
        // Solo borra su propio conjunto: una baja repetida no debe llevarse el de otro cliente.
        if (conjunto.size === 0 && oyentes.get(clave) === conjunto) oyentes.delete(clave);
      };
    },
    // Devuelve a cuántos oyentes llegó el evento; uno que lanza (conexión ya cerrada) no afecta a los demás.
    emitir(clave: string, evento: string): number {
      let entregados = 0;
      for (const oyente of [...(oyentes.get(clave) ?? [])]) {
        try {
          oyente(evento);
          entregados += 1;
        } catch {
          // el oyente se limpia solo al cerrarse su conexión
        }
      }
      return entregados;
    },
  };
}
