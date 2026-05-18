# Agapita Development Environment Launcher

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "    🛋️  Agapita Dev Launcher  🛋️" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Check Ollama
Write-Host "[1/3] Checking Ollama service..." -ForegroundColor Yellow
$ollamaProcess = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
if (-not $ollamaProcess) {
    Write-Host "⚠️ Ollama is not running! Launching Ollama app..." -ForegroundColor Red
    Start-Process "ollama" -WindowStyle Minimized
    Start-Sleep -Seconds 3
} else {
    Write-Host "✅ Ollama is running." -ForegroundColor Green
}

# 2. Start FastAPI Server
Write-Host "[2/3] Launching FastAPI Backend Server..." -ForegroundColor Yellow
if (Test-Path "server\venv") {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host '🛋️ Starting Agapita Server...' -ForegroundColor Cyan; cd server; .\venv\Scripts\activate; python main.py" -WindowStyle Normal
} else {
    Write-Host "⚠️ No local virtual env found inside 'server\venv'! Attempting root virtual env..." -ForegroundColor DarkYellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host '🛋️ Starting Agapita Server...' -ForegroundColor Cyan; cd server; ..\venv\Scripts\activate; python main.py" -WindowStyle Normal
}

# 3. Start Desktop Client
Write-Host "[3/3] Launching React Desktop Client..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host '💻 Starting Agapita Desktop Client...' -ForegroundColor Cyan; cd desktop; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 4
Write-Host "=========================================" -ForegroundColor Green
Write-Host "✅ All processes launched!" -ForegroundColor Green
Write-Host "├─ Backend Server: http://localhost:8000" -ForegroundColor Green
Write-Host "└─ Desktop Client: http://localhost:5173" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
