export interface ESPHomeDevice {
  status: 'ONLINE' | 'OFFLINE';
  name: string;
  address: string;
  mac: string;
  version: string;
  platform: string;
  board: string;
}

export interface ESPHomeServiceProperties {
  mac?: string;
  version?: string;
  platform?: string;
  board?: string;
}

// Helper function to format device information for display
export function formatDeviceInfo(device: ESPHomeDevice): string {
  const status = device.status.padEnd(7);
  const name = device.name.padEnd(32);
  const address = device.address.padEnd(15);
  const mac = device.mac.padEnd(12);
  const version = device.version.padEnd(16);
  const platform = device.platform.padEnd(10);
  const board = device.board.padEnd(32);
  
  return `${status}|${name}|${address}|${mac}|${version}|${platform}|${board}`;
} 