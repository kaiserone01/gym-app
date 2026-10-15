import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { IArchivoStorageService, SubidaPrefirmada } from "@gym-app/domain/ports/IArchivoStorageService";

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  // URL pública del bucket (R2.dev subdomain o dominio propio), sin slash final.
  publicUrl: string;
}

const EXPIRA_SUBIDA_SEG = 600;

// Adapter sobre Cloudflare R2 usando su API compatible con S3. Las fotos pequeñas se suben desde el servidor
// (`subir`); los videos grandes los sube el navegador directo con una URL prefirmada (`urlPrefirmada`), lo que
// exige CORS (PUT) en el bucket. Todo se sirve después por el dominio público del bucket.
export class R2StorageService implements IArchivoStorageService {
  private readonly cliente: S3Client;

  constructor(private readonly config: R2StorageConfig) {
    this.cliente = new S3Client({
      region: "auto",
      // Sin esto el SDK reciente agrega x-amz-checksum-* a las URLs prefirmadas y R2 las rechaza.
      requestChecksumCalculation: "WHEN_REQUIRED",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async subir(carpeta: string, nombreArchivo: string, contenido: Buffer, contentType: string, cacheControl?: string): Promise<string> {
    const key = `${carpeta}/${nombreArchivo}`;

    await this.cliente.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: contenido,
        ContentType: contentType,
        CacheControl: cacheControl,
      })
    );

    return `${this.config.publicUrl}/${key}`;
  }

  async urlPrefirmada(carpeta: string, nombreArchivo: string, contentType: string, cacheControl: string): Promise<SubidaPrefirmada> {
    const clave = `${carpeta}/${nombreArchivo}`;
    const urlSubida = await getSignedUrl(
      this.cliente,
      new PutObjectCommand({ Bucket: this.config.bucket, Key: clave, ContentType: contentType, CacheControl: cacheControl }),
      { expiresIn: EXPIRA_SUBIDA_SEG }
    );
    return {
      urlSubida,
      urlPublica: `${this.config.publicUrl}/${clave}`,
      clave,
      cabeceras: { "Content-Type": contentType, "Cache-Control": cacheControl },
    };
  }

  async inspeccionar(urlPublica: string): Promise<{ bytes: number; contentType: string } | null> {
    try {
      const respuesta = await this.cliente.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.claveDe(urlPublica) }));
      return { bytes: respuesta.ContentLength ?? 0, contentType: respuesta.ContentType ?? "" };
    } catch (error) {
      if ((error as { name?: string }).name === "NotFound") return null;
      throw error;
    }
  }

  async eliminar(urlPublica: string): Promise<void> {
    await this.cliente.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.claveDe(urlPublica) }));
  }

  private claveDe(urlPublica: string): string {
    const prefijo = `${this.config.publicUrl}/`;
    if (!urlPublica.startsWith(prefijo)) throw new Error("La URL no pertenece al bucket de R2.");
    return urlPublica.slice(prefijo.length);
  }
}
