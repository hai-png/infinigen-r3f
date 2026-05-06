/**
 * Crustacean Generator Module
 *
 * Procedural crustacean generation with three species:
 * crab, lobster, and shrimp. Each species features
 * LatheGeometry body segments, articulated claws,
 * and glossy chitin material from CreatureSkinSystem.
 *
 * @module vegetation/crustacean
 */

export {
  CrustaceanGenerator,
  generateCrustacean,
} from './CrustaceanGenerator';

export type {
  CrustaceanSpecies,
  CrustaceanConfig,
} from './CrustaceanGenerator';
