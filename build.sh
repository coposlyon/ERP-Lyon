#!/bin/bash

echo "=== [1/3] Instalando deps do backend ==="
(cd backend && npm install) || { echo "ERRO: backend npm install falhou"; exit 1; }

echo "=== [2/3] Instalando deps do frontend e buildando ==="
if (cd frontend && npm install && npm run build); then
  rm -rf backend/public
  cp -r frontend/dist backend/public
  echo "=== [3/3] Frontend copiado para backend/public ==="
else
  echo "=== AVISO: build do frontend falhou, backend vai subir sem arquivos estaticos ==="
fi

echo "=== Build finalizado ==="
