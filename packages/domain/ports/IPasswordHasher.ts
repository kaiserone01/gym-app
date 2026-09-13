export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  comparar(password: string, hash: string): Promise<boolean>;
}
