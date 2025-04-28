import type { ComponentType, SensorEntity, SensorStateEvent } from './types.mts';

import { BaseComponent } from './base.mts';

export class SensorComponent extends BaseComponent<SensorEntity, SensorStateEvent> {
  public get deviceClass(): string | undefined {
    return this.listEntity.deviceClass;
  }

  public get icon(): string {
    return this.listEntity.icon;
  }

  public get type(): ComponentType {
    return 'sensor';
  }

  public get unitOfMeasurement(): string {
    return this.listEntity.unitOfMeasurement;
  }

  public get value(): number | undefined {
    const state = this.state?.state;
    return state;
  }
}

export default SensorComponent;
