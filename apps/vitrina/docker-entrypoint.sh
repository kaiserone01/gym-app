#!/bin/sh
# Escribe vitrina-config.json con la URL de web-admin y SIN clave: la clave de la sede se pasa en el navegador con
# #clave=<API key> (lib/config.ts), para que no quede dentro de la imagen ni en un archivo público.
set -e

case "$VITRINA_API_URL" in
  http://*|https://*) ;;
  *) echo "VITRINA_API_URL es obligatoria y debe empezar por http:// o https://"; exit 1 ;;
esac
URL="${VITRINA_API_URL%/}"
case "$URL" in
  *\"*|*\\*|*" "*) echo "VITRINA_API_URL contiene caracteres no válidos"; exit 1 ;;
esac

printf '{"apiUrl":"%s","clave":""}\n' "$URL" > out/vitrina-config.json
exec serve -s out -l 3000
