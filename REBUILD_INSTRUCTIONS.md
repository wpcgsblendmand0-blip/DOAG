# DOAG Link Professional Setup Instructions

This document provides specialized instructions for GitHub Copilot to rebuild and deploy your project professionally on **Railway** with full **PWA** support.

## 🤖 Copilot Initialization Prompt
*Copy and paste this into a new chat to resume work:*

"I am providing the DOAG Link codebase. Follow these CRITICAL rules:
1. **NO UI CHANGES**: Do not modify HTML, CSS patterns, animations, or glassmorphism styles.
2. **PWA INTEGRATION**: Keep all manifest.json, service worker (sw.js), and icon logic fully operational.
3. **RAILWAY DEPLOYMENT**: Configure the app for Railway by ensuring Port binding via `process.env.PORT` and using the high-performance `yt-dlp` fetching logic.
4. **LOCAL REBUILD**: Ensure if I drag and drop this folder, you can re-run the `npm install` and `node server.js` logic without any path errors."

## 🚀 Railway Deployment Settings

For **Railway** to work professionally, your `server.js` must be configured for dynamic port binding and the environment must have the necessary binaries.

### 1. Environment Variables (Required in Railway Dashboard)
- `PORT`: `always set automatically by Railway`
- `NODE_ENV`: `production`

### 2. Procfile (Optional but recommended)
Create a file named `Procfile` if Railway doesn't auto-detect:
```
web: node server.js
```

## 📦 Project Structure Checklist
Ensure these professional assets are present before deployment:
- `public/manifest.webmanifest` (PWA Link)
- `public/sw.js` (Offline Cache)
- `public/icons/` (Full branding set)
- `server.js` (The hard logic engine)
- `netlify.toml` (For static UI mirrors)

## 🛠️ Re-Build Script
If starting from scratch, run:
1. `npm install`
2. `node server.js`
3. Access at: `http://localhost:4173`
