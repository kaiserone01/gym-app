import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { IArchivoStorageService } from "@gym-app/domain/ports/IArchivoStorageService";

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  // URL pública del bucket (R2.dev subdomain o dominio propio), sin slash final.
  publicUrl: string;
}

// Adapter sobre Cloudflare R2 usando su API compatible con S3. La subida
// ocurre en el servidor (Server Actions ya reciben el archivo por FormData),
// así que no hace falta URL prefirmada ni CORS para el PUT — solo se sirve
// la foto después vía el dominio público del bucket.
export class R2StorageService implements IArchivoStorageService {
  private readonly cliente: S3Client;

  constructor(private readonly config: R2StorageConfig) {
    this.cliente = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async subir(carpeta: string, nombreArchivo: string, contenido: Buffer, contentType: string): Promise<string> {
    const key = `${carpeta}/${nombreArchivo}`;

    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: contenido,
        ContentType: contentType,
      })
    );

    return `${this.config.publicUrl}/${key}`;
  }
}
