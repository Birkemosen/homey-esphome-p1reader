# ESPHome TypeScript Library

This library provides TypeScript wrappers around the ESPHome native API.

## Working with Protobuf-ES

This library now includes improved support for the `@bufbuild/protobuf` library. Here's how to use it:

### Option 1: Use the ProtobufNoiseFrameHelper

The library includes a drop-in replacement for `NoiseFrameHelper` that correctly works with the `@bufbuild/protobuf` library:

```typescript
import { create } from '@bufbuild/protobuf';
import { 
  ProtobufNoiseFrameHelper, 
  // other imports...
} from './utils/index.mts';
import { HelloRequestSchema } from './protobuf/api_pb.mts';

// Create the protobuf-es compatible noise helper
const client = new ProtobufNoiseFrameHelper('esphome-device.local', 6053, 'YOUR_ENCRYPTION_KEY');

client.on('connect', () => {
  console.log('Connected to ESPHome device');
  
  // Create a message using protobuf-es's create method
  const helloRequest = create(HelloRequestSchema, {
    clientInfo: 'My ESPHome Client',
    apiVersionMajor: 1,
    apiVersionMinor: 5
  });
  
  // Send the message - the library handles serialization correctly
  client.sendMessage(helloRequest);
});

client.connect();
```

### Option 2: Use the Utility Functions

You can also use the utility functions directly to work with protobuf-es messages:

```typescript
import { create, toBinary } from '@bufbuild/protobuf';
import { serializeProtoMessage, createMessageFrame } from './utils/protobufHelpers.mts';
import { HelloRequestSchema } from './protobuf/api_pb.mts';

// Create a message
const helloRequest = create(HelloRequestSchema, {
  clientInfo: 'My ESPHome Client',
  apiVersionMajor: 1,
  apiVersionMinor: 5
});

// Serialize using our helper
const { messageId, encodedMessage } = serializeProtoMessage(helloRequest);

// Create a full message frame
const frame = createMessageFrame(messageId, encodedMessage);

// Now you can use this with any transport
```

### Notes on Compatibility

- The original `NoiseFrameHelper` class remains unchanged for backward compatibility
- The new `ProtobufNoiseFrameHelper` class is a drop-in replacement with improved protobuf-es integration 