Set-Location "client/android"
$ErrorActionPreference = 'Stop'

Write-Host "Downloading JDK 17..."
$url = "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/adoptium?project=jdk"
Invoke-WebRequest -Uri $url -OutFile "jdk17.zip"

Write-Host "Extracting..."
if (Test-Path "jdk17_temp") { Remove-Item -Recurse -Force "jdk17_temp" }
Expand-Archive -Path "jdk17.zip" -DestinationPath "jdk17_temp"

Write-Host "Moving to final destination..."
$subDir = Get-ChildItem -Path "jdk17_temp" -Directory | Select-Object -First 1
if ($subDir) {
    if (Test-Path "jdk17") { Remove-Item -Recurse -Force "jdk17" }
    Move-Item -Path $subDir.FullName -Destination "jdk17"
    Write-Host "JDK 17 installed in client/android/jdk17"
}

Write-Host "Cleaning up..."
Remove-Item "jdk17.zip"
Remove-Item -Recurse -Force "jdk17_temp"

Write-Host "Done."
