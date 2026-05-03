/**
 * Fluid Materials Module Index
 * 
 * Procedural fluid materials including water, lava, river water, waterfall,
 * whitewater, smoke, atmosphere haze, blackbody, and other liquid/viscous substances.
 * 
 * @module materials/categories/fluid
 */

export { WaterMaterial } from './WaterMaterial';
export type { WaterParams, WaterPreset } from './WaterMaterial';

export { RiverWaterMaterial } from './RiverWaterMaterial';
export type { RiverWaterParams, RiverWaterPreset } from './RiverWaterMaterial';

export { WaterfallMaterial } from './WaterfallMaterial';
export type { WaterfallParams, WaterfallPreset } from './WaterfallMaterial';

export { WhitewaterMaterial } from './WhitewaterMaterial';
export type { WhitewaterParams, WhitewaterPreset } from './WhitewaterMaterial';

export { SmokeMaterial } from './SmokeMaterial';
export type { SmokeParams, SmokePreset } from './SmokeMaterial';

export { AtmosphereHazeMaterial } from './AtmosphereHazeMaterial';
export type { AtmosphereHazeParams, AtmosphereHazePreset } from './AtmosphereHazeMaterial';

export { BlackbodyMaterial } from './BlackbodyMaterial';
export type { BlackbodyParams, BlackbodyPreset } from './BlackbodyMaterial';

export { LavaMaterial } from '../../nature/LavaMaterial';
export type { LavaMaterialConfig as LavaParams } from '../../nature/LavaMaterial';
export type LavaPreset = 'basaltic' | 'andesitic' | 'rhyolitic' | 'pahoehoe' | 'aa';

export { SlimeMaterial } from '../../nature/SlimeMaterial';
export type { SlimeMaterialConfig as SlimeParams } from '../../nature/SlimeMaterial';
export type SlimePreset = 'toxic' | 'magical' | 'acidic' | 'ghostly' | 'lava';
