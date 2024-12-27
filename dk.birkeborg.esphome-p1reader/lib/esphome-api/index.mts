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
