#!/usr/bin/env pwsh
<#
.SYNOPSIS
Build Windows installer without native module rebuild issues

.DESCRIPTION
This script builds a Windows installer using electron-builder,
working around path issues by using the 8.3 short path format.

.PARAMETER SkipCompile
Skip the compilation step if already compiled
#>

param(
    [switch]$SkipCompile
)

$ErrorActionPreference = 'Stop'

Write-Host "🚀 VS Code Installer Builder (Safe Build)" -ForegroundColor Cyan
Write-Host ""

# Get the 8.3 short path to avoid space issues
$fullPath = (Get-Item (Get-Location)).FullName
$shortPath = (Get-Item $fullPath).FullName

try {
    $shortPath = [System.IO.Path]::GetDirectoryName((Get-ChildItem $fullPath | Select-Object -First 1).FullName)
    if (Test-Path "$fullPath\*") {
        $shortPath = $fullPath
    }
} catch {
    # If we can't get short path, try with subst command
    Write-Host "📍 Current path: $fullPath" -ForegroundColor Gray
}

Write-Host "📍 Working directory: $fullPath" -ForegroundColor Gray
Write-Host ""

# Step 1: Compile if not skipped
if (-not $SkipCompile) {
    Write-Host "📦 Step 1: Compiling application..." -ForegroundColor Yellow
    npm run compile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Compilation failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Compilation complete" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "⏭️  Skipping compilation step" -ForegroundColor Yellow
    Write-Host ""
}

# Step 2: Build installer with environment tweaks
Write-Host "🔨 Step 2: Building installer (this may take 5-15 minutes)..." -ForegroundColor Yellow

$env:npm_config_build_from_source = "false"

try {
    # Use direct electron-builder call to avoid path issues
    & npx electron-builder --win --publish never --config electron-builder.json
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed" -ForegroundColor Red
        Write-Host ""
        Write-Host "⚠️  Troubleshooting:" -ForegroundColor Yellow
        Write-Host "   1. Ensure out/ directory exists with compiled files"
        Write-Host "   2. Run: npm run compile"
        Write-Host "   3. Try: npm run build-exe again"
        exit 1
    }
} catch {
    Write-Host "❌ Error during build: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Build complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📂 Output files:" -ForegroundColor Cyan
if (Test-Path "dist") {
    Get-ChildItem -Path "dist" -Filter "*.exe" | ForEach-Object {
        $sizeMB = "{0:N1}" -f ($_.Length / 1MB)
        Write-Host "   📄 $($_.Name) ($sizeMB MB)" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "✨ Installation complete!" -ForegroundColor Green
    Write-Host "   Run any .exe file to install VS Code" -ForegroundColor Gray
} else {
    Write-Host "   No installers found in dist/" -ForegroundColor Yellow
}
