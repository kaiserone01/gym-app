// Mapa id viejo (origen) → id nuevo (destino) de una entidad. Falla en vez de soltar una relación rota.
export class MapaIds {
  private readonly ids = new Map<string, string>();

  constructor(private readonly etiqueta: string) {}

  set(viejo: string, nuevo: string): void {
    if (this.ids.has(viejo)) throw new Error(`[${this.etiqueta}] id de origen duplicado: ${viejo}`);
    this.ids.set(viejo, nuevo);
  }

  get(viejo: string): string {
    const nuevo = this.ids.get(viejo);
    if (nuevo === undefined) throw new Error(`[${this.etiqueta}] no hay id nuevo para el id de origen ${viejo}: la relación quedaría rota.`);
    return nuevo;
  }

  getONull(viejo: string | null | undefined): string | null {
    return viejo === null || viejo === undefined ? null : this.get(viejo);
  }

  get tamano(): number {
    return this.ids.size;
  }
}
