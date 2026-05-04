/**
 * Weather System Module for Infinigen R3F
 *
 * Dynamic weather simulation including rain, snow, fog,
 * wind, storms, atmospheric effects, and time-of-day presets.
 *
 * @module weather
 */

import { WeatherSystem } from './WeatherSystem';
export { WeatherSystem };
export type { WeatherType, WeatherParams, WeatherState } from './WeatherSystem';
export { RainSystem } from './RainSystem';
export type { RainParams } from './RainSystem';
export { SnowSystem } from './SnowSystem';
export type { SnowParams } from './SnowSystem';
export { FogSystem } from './FogSystem';
export type { FogParams } from './FogSystem';
export { WeatherTransitionManager } from './WeatherTransitionManager';
export type { WeatherStateType, WeatherStateValues, WeatherEventType, WeatherEvent } from './WeatherTransitionManager';
export { LightningSystem } from './LightningSystem';
export type { LightningParams } from './LightningSystem';
export { TIME_OF_DAY_PRESETS, getInterpolatedPreset } from './TimeOfDayPresets';
export type { TimeOfDayPreset } from './TimeOfDayPresets';
export { DustSystem } from './DustSystem';
export type { DustParams } from './DustSystem';
export { FallingLeavesSystem } from './LeavesSystem';
export type { LeavesParams } from './LeavesSystem';
export { MarineSnowSystem } from './MarineSnowSystem';
export type { MarineSnowParams } from './MarineSnowSystem';
export { WeatherOrchestrator } from './WeatherOrchestrator';
export type { WeatherOrchestratorConfig } from './WeatherOrchestrator';
export default WeatherSystem;
