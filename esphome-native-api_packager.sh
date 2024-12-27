#!/bin/bash

# Exit on error
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILD_DIR="$SCRIPT_DIR/build"
TEMP_DIR="$SCRIPT_DIR/temp"
TARGET_LIB_DIR="$SCRIPT_DIR/dk.birkeborg.esphome-p1reader/lib/esphome-api"
CONFIG_FILE="$SCRIPT_DIR/esphome-api.config.yaml"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: Configuration file $CONFIG_FILE not found!"
    exit 1
fi

# Create directories
mkdir -p "$BUILD_DIR"
mkdir -p "$TEMP_DIR"

# Clone esphome-native-api
echo "Cloning esphome-native-api..."
git clone https://github.com/twocolors/esphome-native-api.git "$TEMP_DIR/repo"

# Install dependencies
echo "Installing dependencies..."
(cd "$TEMP_DIR/repo" && npm install)

# Create a temporary entry point based on config
echo "Creating filtered entry point..."
node -e "
const yaml = require('js-yaml');
const fs = require('fs');
const config = yaml.load(fs.readFileSync('$CONFIG_FILE', 'utf8'));

const imports = [];
const exports = [];

// Core functionality is always included
imports.push(\`import { Connection as ESPHomeConnection, ConnectionConfig } from './lib/connection';\`);
imports.push(\`import { Client } from './lib/client';\`);
exports.push('Client', 'ConnectionConfig');

if (config.features.deviceInfo) {
    imports.push(\`import { DeviceInfo } from './lib/api';\`);
    exports.push('DeviceInfo');
}

// Add entity types based on config
const entityMap = {
    binary_sensor: 'BinarySensor',
    climate: 'Climate',
    cover: 'Cover',
    fan: 'Fan',
    light: 'Light',
    switch: 'Switch',
    text_sensor: 'TextSensor',
    number: 'Number'
};

Object.entries(entityMap).forEach(([key, className]) => {
    if (config.features[key]) {
        imports.push(\`import { ${className} } from './lib/entities/${className}';\`);
        exports.push(className);
    }
});

const content = \`
\${imports.join('\\n')}

export {
    \${exports.join(',\\n    ')}
};

export class Connection extends ESPHomeConnection {
    isConnected(): boolean {
        return this.connected;
    }

    hasEncryptionError(): boolean {
        return false;
    }
}
\`;

fs.writeFileSync('$TEMP_DIR/filtered-entry.js', content);
"

# Bundle the library with the filtered entry point
echo "Bundling library..."
npx esbuild "$TEMP_DIR/filtered-entry.js" \
  --bundle \
  --minify \
  --platform=node \
  --target=node18 \
  --tree-shaking=true \
  --minify-whitespace \
  --minify-identifiers \
  --minify-syntax \
  --outfile="$BUILD_DIR/esphome-api.js"

# Generate TypeScript definitions based on config
echo "Generating TypeScript definitions..."
node -e "
const yaml = require('js-yaml');
const fs = require('fs');
const config = yaml.load(fs.readFileSync('$CONFIG_FILE', 'utf8'));

const baseTypes = fs.readFileSync('$TEMP_DIR/repo/index.d.ts', 'utf8');
const filteredTypes = baseTypes
    .split('\\n')
    .filter(line => {
        // Keep all type definitions and interfaces
        if (line.includes('type ') || line.includes('interface ')) return true;
        
        // Filter out entity imports based on config
        const entityMap = {
            binary_sensor: 'BinarySensor',
            climate: 'Climate',
            cover: 'Cover',
            fan: 'Fan',
            light: 'Light',
            switch: 'Switch',
            text_sensor: 'TextSensor',
            number: 'Number'
        };
        
        for (const [key, className] of Object.entries(entityMap)) {
            if (!config.features[key] && line.includes(\`export { \${className}\`)) {
                return false;
            }
        }
        
        return true;
    })
    .join('\\n');

fs.writeFileSync('$BUILD_DIR/esphome-api.d.ts', filteredTypes);
"

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
cp "$BUILD_DIR/esphome-api.d.ts" "$TARGET_LIB_DIR/"
cp "$BUILD_DIR/index.mts" "$TARGET_LIB_DIR/"

# Clean up
rm -rf "$TEMP_DIR"
rm -rf "$BUILD_DIR"

echo "Build complete!" 