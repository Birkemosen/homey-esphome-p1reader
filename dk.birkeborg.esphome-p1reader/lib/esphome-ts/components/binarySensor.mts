import { BaseComponent } from './base.mts';
import { BinarySensorEntity, ComponentType, BinarySensorStateEvent, BinarySensorTypes } from './types.mts';

export class BinarySensorComponent extends BaseComponent<BinarySensorEntity, BinarySensorStateEvent> {
  public get deviceClass(): BinarySensorTypes {
    return (this.listEntity.deviceClass as BinarySensorTypes) ?? BinarySensorTypes.NONE;
  }

  get status(): boolean {
    const state = this.state?.state;
    return !!state;
  }

  public get type(): ComponentType {
    return 'binarySensor';
  }
}

export default BinarySensorComponent;
