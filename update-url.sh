#!/bin/bash

# Auto-detect current Cloudflare tunnel URL and rebuild APK
set -e

APP_DIR="/Users/romitaggarwal/Desktop/AI/sales_app"
ENV_FILE="$APP_DIR/.env"
APK_OUTPUT="$APP_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

echo "🔍 Detecting current tunnel URL..."

# Extract URL from PM2 logs
NEW_URL=$(pm2 logs sales-srs-tunnel --nostream --lines 100 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)

if [ -z "$NEW_URL" ]; then
  echo "❌ Could not detect tunnel URL. Is PM2 running?"
  echo "   Run: pm2 start $APP_DIR/ecosystem.config.cjs --only sales-srs-tunnel"
  exit 1
fi

echo "✅ Tunnel URL: $NEW_URL"

# nginx on :8080 (the tunnel's target) routes /sales/ -> localhost:4000,
# so the API URL must keep the /sales suffix or requests 404 against the wrong app.
sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$NEW_URL/sales|" "$ENV_FILE"
echo "✅ .env updated"

# Rebuild frontend
cd "$APP_DIR"
echo "🔨 Building frontend..."
npm run build --silent

# Sync Capacitor
echo "📱 Syncing Capacitor..."
npx cap sync android

# Build APK
echo "📦 Building APK..."
cd "$APP_DIR/android"
./gradlew assembleDebug --quiet 2>/dev/null

echo ""
echo "✅ Done! APK ready at:"
echo "   $APK_OUTPUT"
echo ""
echo "📡 Active URL: $NEW_URL"
