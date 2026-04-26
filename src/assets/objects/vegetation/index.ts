/**
 * Unified Vegetation Module
 * 
 * Consolidated vegetation generators - single canonical source for all plant life generation.
 * Replaces fragmented implementations across /plants/, /scatter/vegetation/, /climbing/, and /procedural/
 */

// Core types and base classes
export { BaseObjectGenerator, type BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

// Trees
export { TreeGenerator, TreeSpeciesPresets, type TreeSpeciesConfig, type TreeInstance } from './trees/TreeGenerator';
export { ConiferGenerator, type ConiferConfig } from './trees/ConiferGenerator';
export { DeciduousGenerator, type DeciduousConfig } from './trees/DeciduousGenerator';
export { PalmGenerator, type PalmConfig } from './trees/PalmGenerator';
export { FruitTreeGenerator, type FruitTreeConfig } from './trees/FruitTreeGenerator';

// Plants (ground vegetation)
export { GrassGenerator, type GrassConfig } from './plants/GrassGenerator';
export { FlowerGenerator, type FlowerConfig } from './plants/FlowerGenerator';
export { ShrubGenerator, ShrubSpeciesPresets, type ShrubSpeciesConfig } from './plants/ShrubGenerator';
export { FernGenerator, type FernConfig, type FernSpecies } from './plants/FernGenerator';
export { MossGenerator, type MossConfig } from './plants/MossGenerator';
export { MushroomGenerator, type MushroomConfig } from './plants/MushroomGenerator';
export { MonocotGenerator, MonocotSpeciesPresets, type MonocotConfig } from './plants/MonocotGenerator';
export { SmallPlantGenerator, type SmallPlantConfig } from './plants/SmallPlantGenerator';
export { TropicPlantGenerator, TropicSpeciesPresets, type TropicPlantConfig } from './plants/TropicPlantGenerator';

// Climbing plants
export { VineGenerator, VineSpeciesPresets, type VineSpeciesConfig } from './climbing/VineGenerator';
export { IvyGenerator, type IvyConfig } from './climbing/IvyGenerator';
