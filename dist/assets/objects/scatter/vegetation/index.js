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
export { GrassGenerator } from '../../vegetation/plants/GrassGenerator';
export { FlowerGenerator } from '../../vegetation/plants/FlowerGenerator';
export { ShrubGenerator, ShrubSpeciesPresets } from '../../vegetation/plants/ShrubGenerator';
export { FernGenerator } from '../../vegetation/plants/FernGenerator';
export { IvyGenerator } from '../../vegetation/climbing/IvyGenerator';
export { MossGenerator } from '../../vegetation/plants/MossGenerator';
export { MushroomGenerator } from '../../vegetation/plants/MushroomGenerator';
export { PalmGenerator } from '../../vegetation/trees/PalmGenerator';
export { ConiferGenerator } from '../../vegetation/trees/ConiferGenerator';
export { DeciduousGenerator } from '../../vegetation/trees/DeciduousGenerator';
export { FruitTreeGenerator } from '../../vegetation/trees/FruitTreeGenerator';
export { DeadWoodGenerator } from './DeadWoodGenerator';
//# sourceMappingURL=index.js.map