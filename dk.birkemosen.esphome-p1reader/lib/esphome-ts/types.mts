import type { Message } from '@bufbuild/protobuf';

export interface DeviceInfoResponse extends Message {
    usesPassword: boolean;
    name: string;
    macAddress: string;
    esphomeVersion: string;
    compilation: string;
    model: string;
    hasDeepSleep: boolean;
    projectName: string;
    projectVersion: string;
    webserverPort: number;
    bluetoothProxyVersion: number;
}

export interface ListEntitiesResponse extends Message {
    key: number;
    name: string;
    uniqueId: string;
    // Add other entity fields as needed
}

export interface SubscribeLogsResponse extends Message {
    level: number;
    tag: string;
    message: string;
}

export interface BluetoothLEAdvertisementResponse extends Message {
    address: string;
    name: string;
    rssi: number;
    serviceUuids: string[];
    serviceData: { [key: string]: Uint8Array };
    manufacturerData: { [key: number]: Uint8Array };
} 