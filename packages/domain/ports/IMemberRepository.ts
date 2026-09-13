import { Miembro } from "../entities/Miembro";

export interface IMemberRepository {
  buscarPorOrganizacionYCedula(organizacionId: string, cedula: string): Promise<Miembro | null>;
}
