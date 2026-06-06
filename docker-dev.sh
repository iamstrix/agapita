#!/bin/bash

# Fetch the active Wi-Fi or Ethernet IP address on macOS
export HOST_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)

if [ -z "$HOST_IP" ]; then
    echo "⚠️ Could not detect a local Wi-Fi IP address. Are you connected to a network?"
else
    echo "🌐 Detected Host IP: $HOST_IP"
fi

echo "🚀 Starting Docker Compose..."
docker-compose up --build
