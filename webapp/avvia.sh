#!/bin/bash
# Avvia il server della Caccia al Tesoro
# Uso: ./avvia.sh   oppure: bash avvia.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if ! command -v node &> /dev/null; then
  echo "❌ Node.js non trovato. Scaricalo da https://nodejs.org"
  exit 1
fi

# Rileva se siamo dentro WSL
if grep -qi microsoft /proc/version 2>/dev/null; then
  echo ""
  echo "ATTENZIONE: stai girando dentro WSL2."
  echo "La rete WSL non e' raggiungibile dal WiFi."
  echo "Avvia il server direttamente su Windows:"
  echo "  avvia.bat   oppure:   node server.js"
  echo ""
fi

echo "🏴‍☠️  Avvio Caccia al Tesoro..."
node server.js
