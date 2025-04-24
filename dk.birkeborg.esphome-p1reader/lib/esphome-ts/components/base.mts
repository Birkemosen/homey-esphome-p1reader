import { ComponentType, ListEntity, StateEvent, CommandInterface } from './types.mts';
import { EventEmitter } from 'events';
import { MessageTypes } from '../api/messages.mts';
import { isTrue } from '../api/helpers.mts';

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

  public terminate(): void {
    this.eventEmitter.removeAllListeners(`state:${this.key}`);
  }

  public get ready(): boolean {
    return this.state !== undefined;
  }

  public get name(): string {
    return this.listEntity.name;
  }

  public toString(): string {
    return this.listEntity.name;
  }

  protected queueCommand(type: MessageTypes, dataFn: () => Uint8Array, disableSerialise: boolean = false): void {
    if (this.state && !disableSerialise) {
      this.commandInterface.sendEspMessage(type, dataFn());
    }
  }

  public abstract get type(): ComponentType;
}

export default BaseComponent;