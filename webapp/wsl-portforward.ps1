# Caccia al Tesoro -- Port forwarding WSL2 -> Windows
# Esegui in PowerShell come AMMINISTRATORE prima di avviare il server WSL.
#
# Uso:
#   Right-click PowerShell -> "Esegui come amministratore"
#   cd percorso\webapp
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\wsl-portforward.ps1

$Ports = @(8080, 8443)

# --- Trova IP di WSL ---
$WslIP = (wsl hostname -I 2>$null)
if ($WslIP) { $WslIP = $WslIP.Trim().Split()[0] }
if (-not $WslIP) {
    Write-Host "ERRORE: WSL non trovato o non avviato. Apri un terminale WSL prima di eseguire questo script." -ForegroundColor Red
    exit 1
}
Write-Host "WSL IP: $WslIP" -ForegroundColor Cyan

# --- Port forwarding + firewall per ogni porta ---
foreach ($Port in $Ports) {
    netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null | Out-Null
    netsh advfirewall firewall delete rule name="CacciaTestoro-$Port" 2>$null | Out-Null

    netsh interface portproxy add v4tov4 `
        listenport=$Port listenaddress=0.0.0.0 `
        connectport=$Port connectaddress=$WslIP | Out-Null

    netsh advfirewall firewall add rule `
        name="CacciaTestoro-$Port" dir=in action=allow `
        protocol=TCP localport=$Port | Out-Null

    Write-Host "OK  Porta $Port inoltrata (Windows -> ${WslIP}:${Port})" -ForegroundColor Green
}

# --- Trova IP WiFi di Windows ---
$WifiIP = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
        ($_.InterfaceAlias -match 'Wi.?Fi|Wireless|WLAN') -and
        ($_.IPAddress -notlike '169.254.*')
    } | Select-Object -First 1).IPAddress

if (-not $WifiIP) {
    $WifiIP = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -match '^(192\.168\.|10\.)' } |
        Select-Object -First 1).IPAddress
}

Write-Host ""
Write-Host "-------------------------------------------------" -ForegroundColor DarkGray
if ($WifiIP) {
    Write-Host "Sul TELEFONO (stesso WiFi) apri:" -ForegroundColor White
    Write-Host "  Admin  : http://${WifiIP}:8080/admin" -ForegroundColor Yellow
    Write-Host "  Bimbe  : https://${WifiIP}:8443/" -ForegroundColor Yellow
    Write-Host "  QR     : https://${WifiIP}:8443/qrprint" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Prima visita HTTPS: tocca 'Avanzate' -> 'Procedi al sito'" -ForegroundColor Cyan
    Write-Host "(una volta sola per accettare il certificato self-signed)" -ForegroundColor Cyan
} else {
    Write-Host "IP WiFi non trovato automaticamente." -ForegroundColor Yellow
    Write-Host "Controlla con 'ipconfig' (cerca IPv4 sotto Wi-Fi) e usa quello sul telefono." -ForegroundColor Yellow
}
Write-Host "-------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "NOTA: il port forwarding si azzera al riavvio di Windows." -ForegroundColor DarkYellow
Write-Host "      Riesegui questo script dopo ogni riavvio." -ForegroundColor DarkYellow
Write-Host ""
