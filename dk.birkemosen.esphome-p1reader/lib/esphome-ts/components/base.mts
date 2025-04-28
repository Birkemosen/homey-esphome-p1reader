import type { EventEmitter } from 'events';
import { MessageTypes } from '../api/core/protocol.mts';
import type { CommandInterface, ComponentType, ListEntity, StateEvent } from './types.mts';

export abstract class BaseComponent<L extends ListEntity = ListEntity, S extends StateEvent = StateEvent> {
  protected state?: S;

  constructor(
    protected readonly listEntity: L,
    protected readonly eventEmitter: EventEmitter,
    protected readonly commandInterface: CommandInterface,
  ) {
    this.eventEmitter.on('stateEvent', (state: S) => {
      if (state.key === this.key) {
        this.state = state;
        this.eventEmitter.emit(`state:${this.key}`, state);
      }
    });
  }

  public get key(): number {
    return this.listEntity.key;
  }

  public get name(): string {
    return this.listEntity.name;
  }

  public get ready(): boolean {
    return this.state !== undefined;
  }

  public abstract get type(): ComponentType;

  public terminate(): void {
    this.eventEmitter.removeAllListeners(`state:${this.key}`);
  }

  public toString(): string {
    return this.listEntity.name;
  }

  protected queueCommand(type: MessageTypes, dataFn: () => Uint8Array, disableSerialise = false): void {
    if (this.state && !disableSerialise) {
      this.commandInterface.sendEspMessage(type, dataFn());
    }
  }
}

export default BaseComponent;