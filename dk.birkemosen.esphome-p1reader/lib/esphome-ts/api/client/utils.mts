import { create, toBinary } from '@bufbuild/protobuf';

// Simple debug function that only logs in development
export const debug = (logName: string, ...args: any[]) => {
  if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG'] === '1') {
    console.log(`[esphome-p1reader:${logName}]`, ...args);
  }
};

export const buildLogName = (
  name: string | null,
  addresses: string[],
  connectedAddress: string | null,
): string => {
  if (name) {
    return name;
  }
  if (connectedAddress) {
    return connectedAddress;
  }
  return addresses[0] || 'unknown';
};

export const createCommandMessage = (
  type: number,
  schema: any,
  params: Record<string, any>
): { type: number; payload: Uint8Array } => {
  const request = create(schema, params);
  const data = toBinary(schema, request);
  return {
    type,
    payload: data
  };
}; 