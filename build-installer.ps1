#!/usr/bin/env pwsh
<#
.SYNOPSIS
Build Windows installer (.exe) for VS Code using electron-builder

.DESCRIPTION
This script provides a simple interface to build Windows installers.
It handles compilation and installer generation in one step.

.PARAMETER Type
Type of installer to build: 'nsis', 'portable', or 'both' (default)

.PARAMETER NoCompile
Skip compilation step (use pre-built files from out/ directory)

.EXAMPLE
./build-installer.ps1                    # Build both NSIS and portable
./build-installer.ps1 -Type nsis         # Build only NSIS installer
./build-installer.ps1 -Type portable     # Build only portable
./build-installer.ps1 -NoCompile         # Skip compilation
#>

param(
    [ValidateSet('nsis', 'portable', 'both')]
    [string]$Type = 'both',
    
    [switch]$NoCompile
)

$ErrorActionPreference = 'Stop'

Write-Host "🚀 VS Code Installer Builder" -ForegroundColor Cyan
Write-Host ""

# Step 1: Compile if not skipped
if (-not $NoCompile) {
    Write-Host "📦 Step 1: Compiling application..." -ForegroundColor Yellow
    npm run compile
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Compilation failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Compilation complete" -ForegroundColor Green
    Write-Host ""
}

# Step 2: Build installer
Write-Host "🔨 Step 2: Building installer..." -ForegroundColor Yellow
Write-Host "   Type: $Type" -ForegroundColor Gray

try {
    switch ($Type) {
        'nsis' {
            npm run build-exe-nsis
        }
        'portable' {
            npm run build-exe-portable
        }
        'both' {
            npm run build-exe
        }
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed" -ForegroundColor Red
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
Get-ChildItem -Path "dist" -Filter "*.exe" | ForEach-Object {
    Write-Host "   📄 $($_.Name) ($('{0:N1}' -f ($_.Length / 1MB)) MB)" -ForegroundColor Gray
}
Write-Host ""
Write-Host "💡 Tip: Run the .exe files to install the application" -ForegroundColor Cyan
