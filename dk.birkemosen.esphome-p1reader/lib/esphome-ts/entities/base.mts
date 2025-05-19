import { EventEmitter } from 'events';
import type { Connection } from '../connection.mts';

interface EntityConfig {
  name: string;
  key: number;
  [key: string]: any;
}

interface EntityState {
  key: number;
  [key: string]: any;
}

interface BaseEntityConstructor {
  new (params: { connection?: Connection; config: EntityConfig; state?: EntityState }): BaseEntity;
  getStateResponseName(): string;
  getListEntitiesResponseName(): string;
}

export abstract class BaseEntity extends EventEmitter {
  protected connection?: Connection;
  protected config: EntityConfig;
  protected state?: EntityState;
  protected type: string;
  protected name: string;
  protected id: number;
  protected destroyed: boolean = false;

  constructor({ connection, config, state }: { connection?: Connection; config: EntityConfig; state?: EntityState }) {
    super();
    this.handleState = this.handleState.bind(this);
    this.handleMessage = this.handleMessage.bind(this);
    
    if (!config) throw new Error('config is required');
    this.config = config;
    this.type = this.constructor.name;
    this.name = config.name;
    this.id = config.key;

    if (connection) this.attachConnection(connection);
    if (state) this.handleState(state);
  }

  // Synchronous methods
  attachConnection(connection: Connection): void {
    if (this.connection) throw new Error('Connection is already attached');
    this.connection = connection;
    const constructor = this.constructor as BaseEntityConstructor;
    this.connection.on(`message.${constructor.getStateResponseName()}`, this.handleMessage);
  }

  detachConnection(): void {
    if (!this.connection) throw new Error('Connection is not attached');
    const constructor = this.constructor as BaseEntityConstructor;
    this.connection.removeListener(`message.${constructor.getStateResponseName()}`, this.handleMessage);
    this.connection = undefined;
  }

  destroy(): void {
    this.detachConnection();
    this.destroyed = true;
    this.emit('destroyed');
  }

  static getStateResponseName(): string {
    return `${this.name}StateResponse`;
  }

  static getListEntitiesResponseName(): string {
    return `ListEntities${this.name}Response`;
  }

  // Handlers
  protected handleState(state: EntityState): void {
    this.state = state;
    this.emit('state', state);
  }

  protected handleMessage(state: EntityState): void {
    if (state.key !== this.id) return;
    this.handleState(state);
  }
} 