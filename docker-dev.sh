#!/bin/bash

# Fetch the active Wi-Fi or Ethernet IP address cross-platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    export HOST_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
elif command -v powershell.exe &> /dev/null; then
    # Windows (Git Bash / MSYS / Command Prompt / WSL with access to powershell.exe)
    # We query IPv4 addresses, filtering out loopback, APIPA, and virtual switch adapters (like vEthernet/WSL)
    export HOST_IP=$(powershell.exe -Command "
        \$addr = Get-NetIPAddress -AddressFamily IPv4 | 
            Where-Object { 
                \$_.IPAddress -notlike '127*' -and 
                \$_.InterfaceAlias -notlike '*Loopback*' -and 
                \$_.IPAddress -notlike '169.254*' -and 
                \$_.InterfaceAlias -notlike '*vEthernet*' -and 
                \$_.InterfaceAlias -notlike '*WSL*'
            } | Select-Object -First 1
        if (\$addr) { Write-Output \$addr.IPAddress }
    " 2>/dev/null | tr -d '\r')
fi

# Fallback for Linux or if the above failed
if [ -z "$HOST_IP" ] && command -v hostname &> /dev/null; then
    export HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi

if [ -z "$HOST_IP" ]; then
    echo "⚠️ Could not detect a local host IP address. Falling back to localhost."
    export HOST_IP="localhost"
else
    echo "🌐 Detected Host IP: $HOST_IP"
fi

echo "🚀 Starting Docker Compose..."
docker-compose up --build
