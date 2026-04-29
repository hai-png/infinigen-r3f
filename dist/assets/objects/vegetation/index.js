/**
 * Unified Vegetation Module
 *
 * Consolidated vegetation generators - single canonical source for all plant life generation.
 * Replaces fragmented implementations across /plants/, /scatter/vegetation/, /climbing/, and /procedural/
 */
// Core types and base classes
export { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
// Trees
export { TreeGenerator, TreeSpeciesPresets } from './trees/TreeGenerator';
export { ConiferGenerator } from './trees/ConiferGenerator';
export { DeciduousGenerator } from './trees/DeciduousGenerator';
export { PalmGenerator } from './trees/PalmGenerator';
export { FruitTreeGenerator } from './trees/FruitTreeGenerator';
// Plants (ground vegetation)
export { GrassGenerator } from './plants/GrassGenerator';
export { FlowerGenerator } from './plants/FlowerGenerator';
export { ShrubGenerator, ShrubSpeciesPresets } from './plants/ShrubGenerator';
export { FernGenerator } from './plants/FernGenerator';
export { MossGenerator } from './plants/MossGenerator';
export { MushroomGenerator } from './plants/MushroomGenerator';
export { MonocotGenerator, MonocotSpeciesPresets } from './plants/MonocotGenerator';
export { SmallPlantGenerator } from './plants/SmallPlantGenerator';
export { TropicPlantGenerator, TropicSpeciesPresets } from './plants/TropicPlantGenerator';
// Climbing plants
export { VineGenerator, VineSpeciesPresets } from './climbing/VineGenerator';
export { IvyGenerator } from './climbing/IvyGenerator';
//# sourceMappingURL=index.js.map