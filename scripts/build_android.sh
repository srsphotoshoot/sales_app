#!/bin/bash

# Move to the project root regardless of where script is called from
cd "$(dirname "$0")/.." || exit 1

# Configuration

# Path to Android Studio's bundled JDK (Required for Java 21 compatibility)
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$JAVA_HOME/bin"

# Load NVM (Node Version Manager)
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Ensure we are using a compatible Node version
nvm use default || echo "Using system node..."

# Ensure clean state and fix corrupted Gradle cache
echo "🧹 Performing Deep Clean to fix Gradle corruption..."
rm -rf android/app/build
rm -rf android/.gradle

echo "Using Java 21 from: $JAVA_HOME"
java -version

echo "🚀 Starting Android Build Process for Sales SRS..."

# Check if JDK exists at expected path
if [ ! -d "$JAVA_HOME" ]; then
    echo "⚠️ Warning: Expected JDK not found at $JAVA_HOME"
    echo "Attempting to find default Java..."
    export JAVA_HOME=$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home 2>/dev/null)
    echo "Using fallback JAVA_HOME: $JAVA_HOME"
fi

# 1. Build React App
echo "📦 Building React frontend..."
npm run build

# 2. Sync with Capacitor
echo "🔄 Syncing assets to Capacitor Android project..."
npx cap sync android

# 3. Build APK
echo "🏗️ Building APK using Gradle..."
cd android || { echo "❌ Could not enter android directory"; exit 1; }
chmod +x gradlew
./gradlew assembleDebug --stacktrace

if [ $? -eq 0 ]; then
    echo "✅ Build Complete!"
    echo "📍 Your APK is located at: android/app/build/outputs/apk/debug/app-debug.apk"
else
    echo "❌ Build Failed. Please check the errors above."
    exit 1
fi
