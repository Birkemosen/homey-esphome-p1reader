import { create, toBinary } from '@bufbuild/protobuf';

import { MessageTypes } from '../api/core/protocol.mts';
import { SwitchCommandRequestSchema } from '../protobuf/api_pb.mts';

import type { ComponentType, ListEntity, SwitchStateEvent } from './types.mts';

import { BaseComponent } from './base.mts';

export class SwitchComponent extends BaseComponent<ListEntity, SwitchStateEvent> {
  get status(): boolean {
    return Boolean(this.state?.state);
  }

  public get type(): ComponentType {
    return 'switch';
  }

  public turnOff(): void {
    const request = create(SwitchCommandRequestSchema, {
      key: this.key,
      state: false,
    });
    this.queueCommand(
      MessageTypes.SwitchCommandRequest,
      () => toBinary(SwitchCommandRequestSchema, request),
      true,
    );
  }

  public turnOn(): void {
    const request = create(SwitchCommandRequestSchema, {
      key: this.key,
      state: true,
    });
    this.queueCommand(
      MessageTypes.SwitchCommandRequest,
      () => toBinary(SwitchCommandRequestSchema, request),
      true,
    );
  }
}