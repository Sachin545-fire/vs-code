# Building Windows Installer (.exe) for VS Code

This guide explains how to build a Windows installer executable for your Electron application using electron-builder.

## Prerequisites

- Node.js 16+ and npm
- electron-builder (already installed via `npm install --save-dev electron-builder`)
- Windows Build Tools (for NSIS support)
- Your application must be compiled (run `npm run compile` first)

## Installation Steps

### 1. Install NSIS (required for .exe installer)

The NSIS tool is needed to create the installer. electron-builder will automatically download it, or you can install it manually:

**Option A - Let electron-builder download it (Recommended)**
```bash
# Just run the build command and it will download NSIS automatically
npm run build-exe
```

**Option B - Install NSIS manually**
- Download from: https://nsis.sourceforge.io/Download
- Install to the default location: `C:\Program Files (x86)\NSIS`

### 2. Build Your Application

Before building the installer, ensure your app is compiled:

```bash
npm run compile
```

This creates the `out/` directory with your compiled application.

## Building the Installer

### Build NSIS Installer (.exe with uninstaller)

```bash
npm run build-exe
```

or

```bash
npm run build-exe-nsis
```

This creates:
- `dist/VS Code Setup 1.133.0.exe` - Full installer with uninstaller support
- `dist/VS Code 1.133.0.exe` - Portable version

### Build Portable Executable

For a standalone .exe that doesn't require installation:

```bash
npm run build-exe-portable
```

### Build Both (NSIS + Portable)

```bash
npm run build-exe
```

This builds both installer types by default.

## Output Files

After building, your installers will be in the `dist/` directory:

```
dist/
├── VS Code Setup 1.133.0.exe      # NSIS Installer
├── VS Code 1.133.0.exe            # Portable executable
├── builder-effective-config.yaml  # Build configuration used
└── latest.yml                      # Update metadata
```

## Configuration Details

The build configuration in `package.json` includes:

```json
{
  "build": {
    "appId": "com.vscode.oss",
    "productName": "VS Code",
    "directories": {
      "output": "dist",
      "buildResources": "resources"
    },
    "nsis": {
      "oneClick": false,                         // User chooses install location
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,            // Add desktop icon
      "createStartMenuShortcut": true,          // Add start menu entry
      "shortcutName": "VS Code"
    },
    "win": {
      "target": ["nsis", "portable"],           // Both installer types
      "arch": ["x64"]                           // 64-bit only
    }
  }
}
```

## Customization

### Add Installer Icon

Place your icon at: `resources/icon.ico`

The installer will automatically use it if present.

### Customize Installer Messages

Edit the `nsis` section in `package.json`:

```json
"nsis": {
  "installerIcon": "resources/icon.ico",
  "uninstallerIcon": "resources/icon.ico",
  "installerHeaderIcon": "resources/icon.ico"
}
```

### Support Different Architectures

To build for both x64 and x86:

```json
"win": {
  "target": ["nsis", "portable"],
  "arch": ["x64", "ia32"]
}
```

### Code Signing

To sign the installer:

```json
"win": {
  "certificateFile": "path/to/certificate.pfx",
  "certificatePassword": "your-password"
}
```

## Troubleshooting

### Issue: NSIS not found

**Solution:** electron-builder will automatically download NSIS. If it fails:

```bash
# Clear cache and rebuild
rm -r node_modules/.cache/electron-builder
npm run build-exe
```

### Issue: Long build times

**Why:** First build downloads NSIS (~100MB). Subsequent builds are faster.

### Issue: Application is blank/doesn't start

**Solution:** Ensure your application is properly compiled:

```bash
npm run compile
npm run build-exe
```

## Advanced Options

### Build Only NSIS (Skip Portable)

Modify `package.json` temporarily:

```json
"win": {
  "target": ["nsis"],
  "arch": ["x64"]
}
```

### Build with Debug Information

```bash
DEBUG=electron-builder npm run build-exe
```

### Build for CI/CD

```bash
# Publish never means don't try to upload anywhere
npm run build-exe -- --publish never

# Build in CI without interactive prompts
npm run build-exe -- --publish never --win.certificatePassword=""
```

## Post-Build

### Test the Installer

1. Run the generated `.exe` file
2. Follow the installation wizard
3. Launch the application from Start Menu or Desktop
4. Verify all features work correctly

### Distribute

- Share the `.exe` files from the `dist/` directory
- Users can run them to install your application

## Next Steps

- Add auto-update support using `electron-updater`
- Sign installers with a code signing certificate
- Set up CI/CD to build installers automatically
- Create release notes and documentation

## Reference

- [electron-builder documentation](https://www.electron.build/)
- [NSIS documentation](https://nsis.sourceforge.io/)
- [electron-builder Windows configuration](https://www.electron.build/configuration/win)
