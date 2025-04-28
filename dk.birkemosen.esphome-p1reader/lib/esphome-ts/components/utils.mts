export interface Hsv {
  hue: number;
  saturation: number;
  value: number;
}

export interface Rgb {
  blue: number;
  green: number;
  red: number;
}

export const convertNumbers = (num: number, max = 255, fromEsp = false): number => {
  if (fromEsp) {
    return Math.floor(num * max);
  } 
    return Math.min(Math.max(num, 0), max) / max;
  
};

export default convertNumbers;