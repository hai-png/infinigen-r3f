/**
 * Weather System Module for Infinigen R3F
 * 
 * Dynamic weather simulation including rain, snow, fog,
 * wind, storms, and atmospheric effects.
 * 
 * @module weather
 */

export { WeatherSystem } from './WeatherSystem';
export type { WeatherType, WeatherParams, WeatherState } from './WeatherSystem';
export { RainSystem } from './RainSystem';
export type { RainParams } from './RainSystem';
export { SnowSystem } from './SnowSystem';
export type { SnowParams } from './SnowSystem';
export { FogSystem } from './FogSystem';
export type { FogParams } from './FogSystem';
export default WeatherSystem;
