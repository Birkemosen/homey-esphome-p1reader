import { BaseComponent } from '../components/base.mts';
import { SwitchComponent } from '../components/switch.mts';
import { LightComponent } from '../components/light.mts';

export const isSwitchComponent = (component: BaseComponent): component is SwitchComponent =>
  component.type === 'switch';

export const isLightComponent = (component: BaseComponent): component is LightComponent => component.type === 'light';

export default {
  isSwitchComponent,
  isLightComponent,
};
