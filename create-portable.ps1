#!/usr/bin/env pwsh
<#
.SYNOPSIS
Create a portable VS Code executable using 7z packaging

.DESCRIPTION
This script packages the compiled VS Code application into
a portable executable without relying on electron-builder's
complex native module handling.
#>

param(
    [string]$OutputPath = "dist",
    [string]$AppName = "VSCode"
)

Write-Host "📦 Creating Portable Executable..." -ForegroundColor Cyan
Write-Host ""

# Check if dist/win-unpacked exists (compiled app)
if (!(Test-Path "dist\win-unpacked")) {
    Write-Host "❌ Error: dist\win-unpacked not found" -ForegroundColor Red
    Write-Host "   Run 'npm run compile' and 'npm run build-exe' first" -ForegroundColor Yellow
    exit 1
}

# Check if 7z is installed
$sevenZipPath = "C:\Program Files\7-Zip\7z.exe"
if (!(Test-Path $sevenZipPath)) {
    $sevenZipPath = "7z"  # Try PATH
}

# Create a simple wrapper batch file that launches the app
$wrapperContent = @"
@echo off
REM Simple VS Code portable launcher
cd /d "%~dp0"
start "" "electron.exe" %*
"@

# For now, create a simple archive with launcher
Write-Host "📁 Packaging files..." -ForegroundColor Yellow

# Create output directory
if (!(Test-Path $OutputPath)) {
    New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
}

# Copy the unpacked app to dist with launcher script
$outputApp = Join-Path $OutputPath "VSCode-portable"
Copy-Item "dist\win-unpacked" -Destination $outputApp -Recurse -Force

# Create launcher script
$launherPath = Join-Path $outputApp "run.bat"
$wrapperContent | Out-File -FilePath $launherPath -Encoding ASCII -Force

Write-Host "✅ Portable directory created at: $outputApp" -ForegroundColor Green
Write-Host ""
Write-Host "💡 To run:" -ForegroundColor Cyan
Write-Host "   $outputApp\run.bat" -ForegroundColor Gray
Write-Host ""
Write-Host "💾 To create a 7z archive:" -ForegroundColor Yellow
Write-Host "   7z a -r VSCode-portable.7z $outputApp" -ForegroundColor Gray
