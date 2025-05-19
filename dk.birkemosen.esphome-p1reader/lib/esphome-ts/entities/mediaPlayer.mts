import { BaseEntity } from './base.mts';
import type { Connection } from '../connection.mts';
import { MediaPlayerCommandRequestSchema, MediaPlayerCommand } from '../protobuf/api_pb.mts';
import { create } from '@bufbuild/protobuf';

interface MediaPlayerConfig {
  name: string;
  key: number;
  icon?: string;
  disabledByDefault?: boolean;
  entityCategory?: number;
  supportsPause?: boolean;
}

interface MediaPlayerState {
  key: number;
  hasCommand?: boolean;
  command?: number;
  hasVolume?: boolean;
  volume?: number;
  hasMediaUrl?: boolean;
  mediaUrl?: string;
}

interface MediaPlayerCommandData {
  key: number;
  command?: number;
  volume?: number;
  mediaUrl?: string;
}

export class MediaPlayer extends BaseEntity {
  constructor({ connection, config, state }: { 
    connection?: Connection; 
    config: MediaPlayerConfig; 
    state?: MediaPlayerState 
  }) {
    super({ connection, config, state });
  }

  static override getStateResponseName(): string {
    return 'MediaPlayerStateResponse';
  }

  static override getListEntitiesResponseName(): string {
    return 'ListEntitiesMediaPlayerResponse';
  }

  static commandService(connection: Connection, data: MediaPlayerCommandData): void {
    if (!connection) throw new Error('connection is not attached');
    
    const message = create(MediaPlayerCommandRequestSchema, {
      key: data.key,
      hasCommand: data.command !== undefined,
      command: data.command,
      hasVolume: data.volume !== undefined,
      volume: data.volume,
      hasMediaUrl: data.mediaUrl !== undefined,
      mediaUrl: data.mediaUrl
    });

    connection.sendMessage(MediaPlayerCommandRequestSchema, message);
  }

  command(data: Partial<MediaPlayerCommandData> = {}): void {
    if (!this.connection) throw new Error('connection is not attached');
    MediaPlayer.commandService(this.connection, { ...data, key: this.config.key });
  }

  setCommand(command: number): void {
    if (command === MediaPlayerCommand.PAUSE && !this.config['supportsPause']) {
      throw new Error('pause is not supported');
    }
    this.command({ command });
  }

  setVolume(volume: number): void {
    this.command({ volume });
  }

  setMediaUrl(mediaUrl: string): void {
    this.command({ mediaUrl });
  }

  override handleState(state: MediaPlayerState): void {
    this.state = state;
    this.emit('state', state);
  }

  override handleMessage(state: MediaPlayerState): void {
    this.handleState(state);
  }
} 