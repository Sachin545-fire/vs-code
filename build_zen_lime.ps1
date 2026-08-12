# Build Zen Lime V6 Distributable
Write-Host "Starting Zen Lime Packaging Process..." -ForegroundColor Green
Write-Host "This will take several minutes. Please wait..." -ForegroundColor Yellow

npm run gulp -- vscode-win32-x64

Write-Host "Packaging complete! The built application should be available in the parent directory as VSCode-win32-x64." -ForegroundColor Green
