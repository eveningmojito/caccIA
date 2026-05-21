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
  WSL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
  echo ""
  echo "⚠️  Rilevato WSL2 — la rete virtuale WSL non è raggiungibile dal WiFi."
  echo ""
  echo "   Esegui questo comando in PowerShell come AMMINISTRATORE su Windows,"
  echo "   UNA VOLTA prima di usare il server:"
  echo ""
  echo "   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass"
  echo "   .\\wsl-portforward.ps1"
  echo ""
  echo "   (Lo script è nella cartella webapp\\ del progetto)"
  echo "   Poi usa l'IP WiFi di Windows (da 'ipconfig'), NON $WSL_IP"
  echo ""
fi

echo "🏴‍☠️  Avvio Caccia al Tesoro..."
node server.js
