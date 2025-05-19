import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { CameraImageRequestSchema } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface CameraConfig {
  name: string;
  key: number;
  deviceClass?: string;
  icon?: string;
  disabledByDefault?: boolean;
  entityCategory?: number;
}

interface CameraState {
  key: number;
  data?: Uint8Array;
}

export class Camera extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: CameraConfig; 
    state?: CameraState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'CameraImageResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesCameraResponse';
  }

  async requestImage(): Promise<void> {
    if (!this.connection) throw new Error('connection is not attached');
    await this.connection.sendMessage(CameraImageRequestSchema, create(CameraImageRequestSchema, {}));
  }

  override handleState(state: CameraState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: CameraState): void {
    this.handleState(state);
  }
} 