# Fetch the active Wi-Fi or Ethernet IP address on Windows
$addr = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.IPAddress -notlike '127*' -and 
    $_.InterfaceAlias -notlike '*Loopback*' -and 
    $_.IPAddress -notlike '169.254*' -and 
    $_.InterfaceAlias -notlike '*vEthernet*' -and 
    $_.InterfaceAlias -notlike '*WSL*'
} | Select-Object -First 1

if ($addr) {
    $env:HOST_IP = $addr.IPAddress
    Write-Host "🌐 Detected Host IP: $env:HOST_IP" -ForegroundColor Green
} else {
    Write-Host "⚠️ Could not detect a local host IP address. Falling back to localhost." -ForegroundColor Yellow
    $env:HOST_IP = "localhost"
}

Write-Host "🚀 Starting Docker Compose..." -ForegroundColor Cyan
docker-compose up --build
