#!/bin/bash

# Exit on error
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILD_DIR="$SCRIPT_DIR/build"
TEMP_DIR="$SCRIPT_DIR/temp"
TARGET_LIB_DIR="$SCRIPT_DIR/dk.birkeborg.esphome-p1reader/lib/esphome-api"

# Clean up any existing temp/build directories
rm -rf "$BUILD_DIR"
rm -f meta.json

# Create directories
mkdir -p "$BUILD_DIR"
mkdir -p "$TEMP_DIR"

# Clone esphome-native-api if it doesn't exist
if [ ! -d "$TEMP_DIR/repo" ]; then
    echo "Cloning esphome-native-api..."
    git clone https://github.com/twocolors/esphome-native-api.git "$TEMP_DIR/repo"
else
    echo "Repository already exists, skipping clone..."
    # Hard reset to the latest commit
    (cd "$TEMP_DIR/repo" && git reset --hard HEAD)
fi

# Install dependencies
echo "Installing dependencies..."
(cd "$TEMP_DIR/repo" && npm install)

# Install protobuf.js in the repo directory
echo "Installing protobuf.js..."
(cd "$TEMP_DIR/repo" && npm install protobufjs@7.2.6)

# Install cjstoesm globally
echo "Installing cjstoesm..."
npm install -g cjstoesm

# Create minimal entry point
echo "Creating minimal entry point..."
cat > "$TEMP_DIR/repo/minimal-entry.js" << 'EOL'
// Shim for Node.js environment
if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
}

// Import protobuf.js
const protobuf = require('./node_modules/protobufjs/light');

// Use pre-compiled protobuf messages
const api = require('./lib/protoc/api_pb');
const apiOptions = require('./lib/protoc/api_options_pb');

// Base imports
const { Connection } = require('./lib/connection');

// Import all entities (Uncomment to include)
//const { BinarySensor } = require('./lib/entities/BinarySensor');
//const { Button } = require('./lib/entities/Button');
//const { Camera } = require('./lib/entities/Camera');
//const { Climate } = require('./lib/entities/Climate');
//const { Cover } = require('./lib/entities/Cover');
//const { Fan } = require('./lib/entities/Fan');
//const { Light } = require('./lib/entities/Light');
//const { Lock } = require('./lib/entities/Lock');
//const { MediaPlayer } = require('./lib/entities/MediaPlayer');
//const { Number } = require('./lib/entities/Number');
//const { Select } = require('./lib/entities/Select');
const { Sensor } = require('./lib/entities/Sensor');
//const { Siren } = require('./lib/entities/Siren');
//const { Switch } = require('./lib/entities/Switch');
//const { Text } = require('./lib/entities/Text');
//const { TextSensor } = require('./lib/entities/TextSensor');

// Export only what we need
module.exports = {
    Connection,
    api,
    apiOptions,
    //BinarySensor,
    //Button,
    //Camera,
    //Climate,
    //Cover,
    //Fan,
    //Light,
    //Lock,
    //MediaPlayer,
    //Number,
    //Select,
    Sensor
    //Siren,
    //Switch,
    //Text,
    //TextSensor
};
EOL

# Convert to ESM using cjstoesm
#echo "Converting to ESM..."
#cjstoesm "$TEMP_DIR/repo/**/*.js" "$TEMP_DIR/repo"

# Now do the actual build
echo -e "\nBundling library..."
npx esbuild "$TEMP_DIR/repo/minimal-entry.js" \
  --bundle \
  --minify \
  --platform=node \
  --target=node18 \
  --format=cjs \
  --tree-shaking=true \
  --charset=utf8 \
  --external:events \
  --external:@richardhopton/noise-c.wasm \
  --outfile="$BUILD_DIR/esphome-api.js"

# Create the wrapper
echo "Creating wrapper..."
cat > "$BUILD_DIR/index.mts" << 'EOL'
// Local wrapper around esphome-api with additional functionality
import type { ConnectionConfig } from './esphome-api.mjs';
import { Connection as ESPHomeConnection } from './esphome-api.mjs';

// Declare the module to fix TypeScript errors
declare module './esphome-api.mjs' {
    export interface ConnectionConfig {
        host: string;
        port: number;
        clientInfo?: string;
        clearSession?: boolean;
        initializeDeviceInfo?: boolean;
        initializeListEntities?: boolean;
        initializeSubscribeStates?: boolean;
        initializeSubscribeLogs?: boolean;
        initializeSubscribeBLEAdvertisements?: boolean;
        reconnect?: boolean;
        reconnectInterval?: number;
        pingInterval?: number;
        pingAttempts?: number;
        encryptionKey?: string;
        password?: string;
    }

    export class Connection {
        constructor(config: ConnectionConfig);
        connect(): Promise<void>;
        disconnect(): Promise<void>;
        isConnected(): boolean;
        on(event: string, listener: (...args: any[]) => void): void;
        off(event: string, listener: (...args: any[]) => void): void;
        listEntitiesService(): Promise<any[]>;
        subscribeStatesService(): Promise<void>;
    }
}

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
    private _connected: boolean = false;

    constructor(config: ConnectionOptions) {
        super(config);
        this.on('connected', () => this._connected = true);
        this.on('disconnected', () => this._connected = false);
    }

    isConnected(): boolean {
        return this._connected;
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

# Create a package.json file
echo "Creating package.json..."
cat > "$TARGET_LIB_DIR/package.json" << 'EOL'
{
  "name": "esphome-api",
  "version": "1.0.0",
  "description": "Bundled ESPHome Native API client",
  "type": "module",
  "main": "./index.mts",
  "types": "./esphome-api.d.mts",
  "files": [
    "index.mts",
    "esphome-api.mjs",
    "esphome-api.d.mts"
  ]
}
EOL

# Copy built files to target
echo "Copying files to target..."
cp "$BUILD_DIR/esphome-api.js" "$TARGET_LIB_DIR/"
cp "$BUILD_DIR/index.mts" "$TARGET_LIB_DIR/"
cp "$TEMP_DIR/repo/index.d.ts" "$TARGET_LIB_DIR/esphome-api.d.mts"

# Remove the first line
sed -i '1d' "$TARGET_LIB_DIR/esphome-api.d.mts"
# Add "declare module "esphome-api" {" to the first line
sed -i '1s/^/declare module "esphome-api" {\n/' "$TARGET_LIB_DIR/esphome-api.d.mts"

# Clean up
#rm -rf "$TEMP_DIR"
rm -rf "$BUILD_DIR"
rm -f meta.json

echo "Build complete!" 