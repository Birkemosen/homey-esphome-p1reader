import { BaseComponent } from './base.mts';
import { ComponentType, SensorEntity, SensorStateEvent } from './types.mts';

export class SensorComponent extends BaseComponent<SensorEntity, SensorStateEvent> {
  public get value(): number | undefined {
    const state = this.state?.state;
    return state;
  }

  public get type(): ComponentType {
    return 'sensor';
  }

  public get deviceClass(): string | undefined {
    return this.listEntity.deviceClass;
  }

  public get unitOfMeasurement(): string {
    return this.listEntity.unitOfMeasurement;
  }

  public get icon(): string {
    return this.listEntity.icon;
  }
}

export default SensorComponent;
