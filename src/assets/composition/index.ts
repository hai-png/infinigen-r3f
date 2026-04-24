/**
 * Composition System Module for Infinigen R3F Port
 * 
 * Provides automated scene composition through rules, constraints, and templates.
 */

// Core engine
export {
  CompositionEngine,
  compositionEngine,
  SpatialRelation,
  AestheticPrinciple,
} from './CompositionEngine';

// Types
export type {
  CompositionRule,
  CompositionConstraint,
  CompositionTemplate,
  TemplateObject,
  TemplateVariable,
  CompositionContext,
  CompositionResult,
  CompositionMetrics,
} from './CompositionEngine';

// Basic rules
export {
  basicRules,
  centerObjectRule,
  alignObjectsRule,
  gridDistributionRule,
  radialArrangementRule,
  separationRule,
  symmetryRule,
} from './rules/BasicRules';

// Interior templates
export {
  interiorTemplates,
  livingRoomTemplate,
  bedroomTemplate,
  kitchenTemplate,
  officeTemplate,
} from './templates/InteriorTemplates';
