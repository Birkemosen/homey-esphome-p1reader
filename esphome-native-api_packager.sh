#!/bin/bash

# Exit on error
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BUILD_DIR="$SCRIPT_DIR/build"
TEMP_DIR="$SCRIPT_DIR/temp"
TARGET_LIB_DIR="$SCRIPT_DIR/dk.birkeborg.esphome-p1reader/lib/esphome-api"

# Clean up any existing temp/build directories
rm -rf "$TEMP_DIR"
rm -rf "$BUILD_DIR"
rm -f meta.json

# Create directories
mkdir -p "$BUILD_DIR"
mkdir -p "$TEMP_DIR"

# Clone esphome-native-api
echo "Cloning esphome-native-api..."
git clone https://github.com/twocolors/esphome-native-api.git "$TEMP_DIR/repo"

# Install dependencies
echo "Installing dependencies..."
(cd "$TEMP_DIR/repo" && npm install)

# Create minimal protobuf runtime
echo "Creating minimal protobuf runtime..."
cat > "$TEMP_DIR/repo/lib/minimal-protobuf.js" << 'EOL'
// Minimal protobuf runtime with only what we need
const TYPES = {
    TYPE_DOUBLE: 1,
    TYPE_FLOAT: 2,
    TYPE_INT64: 3,
    TYPE_UINT64: 4,
    TYPE_INT32: 5,
    TYPE_FIXED64: 6,
    TYPE_FIXED32: 7,
    TYPE_BOOL: 8,
    TYPE_STRING: 9,
    TYPE_GROUP: 10,
    TYPE_MESSAGE: 11,
    TYPE_BYTES: 12,
    TYPE_UINT32: 13,
    TYPE_ENUM: 14,
    TYPE_SFIXED32: 15,
    TYPE_SFIXED64: 16,
    TYPE_SINT32: 17,
    TYPE_SINT64: 18
};

class Message {
    constructor() {}
    static initialize(msg, data, messageId, repeatedFields, oneofFields) {
        msg.messageId_ = messageId;
        msg.repeatedFields_ = repeatedFields || [];
        msg.oneofFields_ = oneofFields || [];
        if (data) {
            Object.assign(msg, data);
        }
    }
}

// Export as if we're google-protobuf
module.exports = {
    Message,
    BinaryReader: class {},
    BinaryWriter: class {},
    Map: class {},
    TYPES,
    exportSymbol: function() {},
    inherits: function(childCtor, parentCtor) {
        Object.setPrototypeOf(childCtor.prototype, parentCtor.prototype);
    },
    DEBUG: false,
    GENERATE_TO_OBJECT: true,
};
EOL

# Patch the protobuf files to use our minimal implementation
echo "Patching protobuf files..."
sed -i.bak 's/require(.google-protobuf.)/require(\x27..\/minimal-protobuf\x27)/' "$TEMP_DIR/repo/lib/protoc/api_pb.js"
sed -i.bak 's/require(.google-protobuf.)/require(\x27..\/minimal-protobuf\x27)/' "$TEMP_DIR/repo/lib/protoc/api_options_pb.js"
sed -i.bak 's/require(.google-protobuf\/google\/protobuf\/descriptor_pb.js.)/require(\x27..\/minimal-protobuf\x27)/' "$TEMP_DIR/repo/lib/protoc/api_options_pb.js"

# Create the custom index file
echo "Creating customized index file..."
cat > "$TEMP_DIR/repo/custom-index.js" << 'EOL'
// Generated index file - DO NOT EDIT

// Use pre-compiled protobuf messages
const protobuf = require('./lib/minimal-protobuf');
const api = require('./lib/protoc/api_pb');
const apiOptions = require('./lib/protoc/api_options_pb');

// Base imports
const { Connection } = require('./lib/connection');

// Import all entities
const { BinarySensor } = require('./lib/entities/BinarySensor');
const { Button } = require('./lib/entities/Button');
const { Camera } = require('./lib/entities/Camera');
const { Climate } = require('./lib/entities/Climate');
const { Cover } = require('./lib/entities/Cover');
const { Fan } = require('./lib/entities/Fan');
const { Light } = require('./lib/entities/Light');
const { Lock } = require('./lib/entities/Lock');
const { MediaPlayer } = require('./lib/entities/MediaPlayer');
const { Number } = require('./lib/entities/Number');
const { Select } = require('./lib/entities/Select');
const { Sensor } = require('./lib/entities/Sensor');
const { Siren } = require('./lib/entities/Siren');
const { Switch } = require('./lib/entities/Switch');
const { Text } = require('./lib/entities/Text');
const { TextSensor } = require('./lib/entities/TextSensor');

// Exports
module.exports = {
    Connection,
    api,
    apiOptions,
    BinarySensor,
    Button,
    Camera,
    Climate,
    Cover,
    Fan,
    Light,
    Lock,
    MediaPlayer,
    Number,
    Select,
    Sensor,
    Siren,
    Switch,
    Text,
    TextSensor
};
EOL

# First do a build with metafile to analyze
echo "Analyzing bundle composition..."
npx esbuild "$TEMP_DIR/repo/custom-index.js" \
  --bundle \
  --metafile=meta.json \
  --platform=node \
  --target=node18 \
  --external:@richardhopton/noise-c.wasm \
  --outfile=/dev/null

echo "Bundle composition:"
node -e "
const meta = require('./meta.json');
const inputs = meta.inputs;
const sizes = {};
for (const [file, data] of Object.entries(inputs)) {
    const size = data.bytes;
    const category = file.includes('node_modules') 
        ? 'node_modules/' + file.split('node_modules/')[1].split('/')[0]
        : file.split('/').slice(-2).join('/');
    sizes[category] = (sizes[category] || 0) + size;
}
console.log('\nSize by component:');
Object.entries(sizes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, size]) => {
        console.log(\`\${name}: \${(size/1024).toFixed(1)}KB\`);
    });
"

# Now do the actual build
echo -e "\nBundling library..."
npx esbuild "$TEMP_DIR/repo/custom-index.js" \
  --bundle \
  --minify \
  --platform=node \
  --target=node18 \
  --tree-shaking=true \
  --charset=utf8 \
  --external:@richardhopton/noise-c.wasm \
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
rm -f meta.json

echo "Build complete!" 