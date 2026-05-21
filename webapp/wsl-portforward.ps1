# Caccia al Tesoro — Port forwarding WSL2 → Windows
# Esegui questo script in PowerShell come AMMINISTRATORE una volta sola
# prima di avviare il server in WSL.
#
# Uso: Right-click su PowerShell → "Esegui come amministratore"
#      cd percorso\webapp
#      Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#      .\wsl-portforward.ps1

$Ports = @(8080, 8443)

# Trova l'IP di WSL
$WslIP = (wsl hostname -I 2>$null).Trim().Split()[0]
if (-not $WslIP) {
    Write-Host "❌ WSL non trovato o non avviato. Avvia prima 'wsl' dal terminale." -ForegroundColor Red
    exit 1
}
Write-Host "🐧 WSL IP rilevato: $WslIP" -ForegroundColor Cyan

# Configura port proxy e firewall per ogni porta
foreach ($Port in $Ports) {
    # Rimuovi regola precedente (ignora errori)
    netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null | Out-Null
    netsh advfirewall firewall delete rule name="CacciaTestoro-$Port" 2>$null | Out-Null

    # Aggiungi port forwarding
    netsh interface portproxy add v4tov4 `
        listenport=$Port listenaddress=0.0.0.0 `
        connectport=$Port connectaddress=$WslIP | Out-Null

    # Apri porta nel firewall Windows
    netsh advfirewall firewall add rule `
        name="CacciaTestoro-$Port" dir=in action=allow `
        protocol=TCP localport=$Port | Out-Null

    Write-Host "✅ Porta $Port inoltrata ($WslIP:$Port)" -ForegroundColor Green
}

# Trova l'IP WiFi di Windows
$WifiIP = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        ($_.InterfaceAlias -match 'Wi.?Fi|Wireless|WLAN') -and
        ($_.IPAddress -notlike '169.254.*')
    } |
    Select-Object -First 1).IPAddress

if (-not $WifiIP) {
    # Fallback: primo IP 192.168.x o 10.x
    $WifiIP = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -match '^(192\.168\.|10\.)' } |
        Select-Object -First 1).IPAddress
}

if (-not $WifiIP) {
    Write-Host "`n⚠️  IP WiFi non trovato. Controlla con 'ipconfig' e usa quell'IP sul telefono." -ForegroundColor Yellow
} else {
    Write-Host "`n─────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "📱  Sul TELEFONO (stesso WiFi) apri:" -ForegroundColor White
    Write-Host "    Admin : http://${WifiIP}:8080/admin" -ForegroundColor Yellow
    Write-Host "    Bimbe : https://${WifiIP}:8443/" -ForegroundColor Yellow
    Write-Host "    QR    : https://${WifiIP}:8443/qrprint" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────" -ForegroundColor DarkGray
    Write-Host "`n💡  Prima visita HTTPS: tocca 'Avanzate' → 'Procedi al sito'" -ForegroundColor Cyan
    Write-Host "    (una volta sola per accettare il certificato self-signed)`n" -ForegroundColor Cyan
}

Write-Host "⚠️  Nota: il port forwarding si azzera al riavvio di Windows." -ForegroundColor DarkYellow
Write-Host "    Riesegui questo script dopo ogni riavvio.`n" -ForegroundColor DarkYellow
