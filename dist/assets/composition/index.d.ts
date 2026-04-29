/**
 * Composition System Module for Infinigen R3F Port
 *
 * Provides automated scene composition through rules, constraints, and templates.
 */
export { CompositionEngine, compositionEngine, SpatialRelation, AestheticPrinciple, } from './CompositionEngine';
export type { CompositionRule, CompositionConstraint, CompositionTemplate, TemplateObject, TemplateVariable, CompositionContext, CompositionResult, CompositionMetrics, } from './CompositionEngine';
export { basicRules, centerObjectRule, alignObjectsRule, gridDistributionRule, radialArrangementRule, separationRule, symmetryRule, } from './rules/BasicRules';
export { interiorTemplates, livingRoomTemplate, bedroomTemplate, kitchenTemplate, officeTemplate, } from './templates/InteriorTemplates';
//# sourceMappingURL=index.d.ts.map