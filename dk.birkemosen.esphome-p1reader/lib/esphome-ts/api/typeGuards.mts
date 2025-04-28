import type { BaseComponent } from '../components/base.mts';
import type { LightComponent } from '../components/light.mts';
import type { SwitchComponent } from '../components/switch.mts';

export const isSwitchComponent = (component: BaseComponent): component is SwitchComponent =>
  component.type === 'switch';

export const isLightComponent = (component: BaseComponent): component is LightComponent => component.type === 'light';

export default {
  isLightComponent,
  isSwitchComponent,
};
