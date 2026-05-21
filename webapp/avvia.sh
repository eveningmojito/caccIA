#!/bin/bash
# Avvia il server della Caccia al Tesoro
# Uso: ./avvia.sh   oppure: bash avvia.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if ! command -v node &> /dev/null; then
  echo "❌ Node.js non trovato. Scaricalo da https://nodejs.org"
  exit 1
fi

echo "🏴‍☠️  Avvio Caccia al Tesoro..."
node server.js
