/**
 * Scatter Vegetation Module (Legacy)
 * @deprecated Use '@assets/objects/vegetation' instead.
 * 
 * This module provided vegetation generators for scatter systems.
 * All generators have been consolidated into the unified vegetation module.
 * 
 * Migration Guide:
 * - GrassGenerator, FlowerGenerator, ShrubGenerator → @assets/objects/vegetation
 * - FernGenerator, MossGenerator, MushroomGenerator → @assets/objects/vegetation/plants
 * - Tree generators (Conifer, Deciduous, Palm, FruitTree) → @assets/objects/vegetation/trees
 * - IvyGenerator → @assets/objects/vegetation/climbing
 * - DeadWoodGenerator → No direct replacement (unique to scatter module)
 */

// Re-export from canonical vegetation location for backward compatibility
export { GrassGenerator, type GrassConfig } from '../../vegetation/plants/GrassGenerator';
export { FlowerGenerator, type FlowerConfig } from '../../vegetation/plants/FlowerGenerator';
export { ShrubGenerator, type ShrubConfig, ShrubSpeciesPresets, type ShrubSpeciesConfig } from '../../vegetation/plants/ShrubGenerator';
export { FernGenerator, type FernConfig, type FernSpecies } from '../../vegetation/plants/FernGenerator';
export { IvyGenerator, type IvyConfig } from '../../vegetation/climbing/IvyGenerator';
export { MossGenerator, type MossConfig } from '../../vegetation/plants/MossGenerator';
export { MushroomGenerator, type MushroomConfig } from '../../vegetation/plants/MushroomGenerator';
export { PalmGenerator, type PalmConfig } from '../../vegetation/trees/PalmGenerator';
export { ConiferGenerator, type ConiferConfig } from '../../vegetation/trees/ConiferGenerator';
export { DeciduousGenerator, type DeciduousConfig } from '../../vegetation/trees/DeciduousGenerator';
export { FruitTreeGenerator, type FruitTreeConfig } from '../../vegetation/trees/FruitTreeGenerator';
export { DeadWoodGenerator, type DeadWoodConfig } from './DeadWoodGenerator';
