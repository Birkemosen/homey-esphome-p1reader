import type { Connection } from '../connection.mts';
import { BinarySensor } from './binarySensor.mts';
import { Button } from './button.mts';
import { Camera } from './camera.mts';
import { Climate } from './climate.mts';
import { Cover } from './cover.mts';
import { Fan } from './fan.mts';
import { Light } from './light.mts';
import { Lock } from './lock.mts';
import { MediaPlayer } from './mediaPlayer.mts';
import { Number } from './number.mts';
import { Select } from './select.mts';
import { Sensor } from './sensor.mts';
import { Switch } from './switch.mts';
import { TextSensor } from './textSensor.mts';
import { Text } from './text.mts';

const EntitiesList = [
    BinarySensor,
    Button,
    Camera,
    Climate,
    Cover,
    Fan,
    Light,
    Lock,
    MediaPlayer,
    Number,
    Select,
    Sensor,
    Switch,
    TextSensor,
    Text
];

const Entities = Object.fromEntries(EntitiesList.map(v => [v.name, v]));

export function create(entityClassName: string, data: { connection?: Connection; config: any; state?: any }) {
    const EntityClass = Entities[entityClassName];
    if (!EntityClass) throw new Error(`entity ${entityClassName} not supported`);
    return new EntityClass(data);
}

export { Entities }; 