#!/bin/bash

# Exit on error
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILD_DIR="$SCRIPT_DIR/build"
TEMP_DIR="$SCRIPT_DIR/temp"
TARGET_LIB_DIR="$SCRIPT_DIR/dk.birkeborg.esphome-p1reader/lib/esphome-api"

# Create directories
mkdir -p "$BUILD_DIR"
mkdir -p "$TEMP_DIR"

# Clone esphome-native-api
echo "Cloning esphome-native-api..."
git clone https://github.com/twocolors/esphome-native-api.git "$TEMP_DIR/repo"

# Install dependencies
echo "Installing dependencies..."
(cd "$TEMP_DIR/repo" && npm install)

# Bundle the library
echo "Bundling library..."
npx esbuild "$TEMP_DIR/repo/index.js" \
  --bundle \
  --minify \
  --platform=node \
  --target=node18 \
  --outfile="$BUILD_DIR/esphome-api.js"

# Create wrapper
echo "Creating wrapper..."
cat > "$BUILD_DIR/index.mts" << 'EOL'
// Local wrapper around @2colors/esphome-native-api with additional functionality
import type { ConnectionConfig } from '@2colors/esphome-native-api';
import { Connection as ESPHomeConnection } from '@2colors/esphome-native-api';

export interface ConnectionOptions extends ConnectionConfig {
    features?: {
        deviceInfo?: boolean;
        listEntities?: boolean;
        subscribeStates?: boolean;
        subscribeLogs?: boolean;
        sensors?: boolean;
    };
}

export class Connection extends ESPHomeConnection {
    isConnected(): boolean {
        return this.connected;
    }

    hasEncryptionError(): boolean {
        return false;
    }
}
EOL

# Clean and create target directory
echo "Preparing target directory..."
rm -rf "$TARGET_LIB_DIR"
mkdir -p "$TARGET_LIB_DIR"

# Copy built files to target
echo "Copying files to target..."
cp "$BUILD_DIR/esphome-api.js" "$TARGET_LIB_DIR/"
cp "$BUILD_DIR/index.mts" "$TARGET_LIB_DIR/index.mts"
cp "$TEMP_DIR/repo/index.d.ts" "$TARGET_LIB_DIR/esphome-api.d.ts"

# Clean up
rm -rf "$TEMP_DIR"
rm -rf "$BUILD_DIR"

echo "Build complete!" 