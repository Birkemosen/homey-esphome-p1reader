import { BaseComponent } from './base.mts';
import { ComponentType, ListEntity, SwitchStateEvent } from './types.mts';
import { MessageTypes } from '../api/messages.mts';
import { SwitchCommandRequest, SwitchCommandRequestSchema } from '../api/protobuf/api_pb.ts';
import { create, toBinary } from '@bufbuild/protobuf';

export class SwitchComponent extends BaseComponent<ListEntity, SwitchStateEvent> {
  get status(): boolean {
    return !!this.state?.state;
  }

  public turnOn(): void {
    const request = create(SwitchCommandRequestSchema, {
      state: true,
      key: this.key,
    });
    this.queueCommand(
      MessageTypes.SwitchCommandRequest,
      () => toBinary(SwitchCommandRequestSchema, request),
      true,
    );
  }

  public turnOff(): void {
    const request = create(SwitchCommandRequestSchema, {
      state: false,
      key: this.key,
    });
    this.queueCommand(
      MessageTypes.SwitchCommandRequest,
      () => toBinary(SwitchCommandRequestSchema, request),
      true,
    );
  }

  public get type(): ComponentType {
    return 'switch';
  }
}

export default SwitchComponent;
