#!/bin/bash
set -e

echo "=== [1/3] Instalando dependencias do frontend ==="
cd frontend
npm install

echo "=== [2/3] Buildando React ==="
npm run build

echo "=== [3/3] Copiando build para backend/public ==="
rm -rf ../backend/public
cp -r dist ../backend/public

echo "=== Instalando dependencias do backend ==="
cd ../backend
npm install

echo "=== Build concluido ==="
