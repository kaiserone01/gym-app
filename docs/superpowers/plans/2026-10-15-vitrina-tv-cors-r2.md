# CORS del bucket de R2 para la vitrina

Los videos se suben directo del navegador al bucket `gym-app` con una URL prefirmada, así que el bucket necesita CORS
con PUT desde el origen de web-admin. Sin esto la subida falla con "¿falta el CORS del bucket de R2?".

Cloudflare → R2 → bucket `gym-app` → Settings → CORS policy → agregar:

    [
      {
        "AllowedOrigins": ["https://<dominio-de-web-admin-de-produccion>", "https://<dominio-de-gym-app-vitrina>"],
        "AllowedMethods": ["PUT"],
        "AllowedHeaders": ["Content-Type", "Cache-Control"],
        "MaxAgeSeconds": 3600
      }
    ]

Las lecturas (`<video>`, `<img>`, y la descarga nativa de la TV) no necesitan CORS.
