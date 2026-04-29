/**
 * Composition Engine for Infinigen R3F Port
 *
 * Manages scene composition through rules, constraints, and templates.
 * Handles spatial relationships, aesthetic principles, and automated placement.
 */
import { Vector3, Quaternion, Box3, Sphere } from 'three';
import type { Object3D } from 'three';
import type { SceneGraphNode } from '../nodes/types';
/**
 * Spatial relationship types between objects
 */
export declare enum SpatialRelation {
    ADJACENT = "adjacent",
    ALIGNED = "aligned",
    CENTERED = "centered",
    DISTRIBUTED = "distributed",
    HIERARCHICAL = "hierarchical",
    SYMMETRICAL = "symmetrical",
    RADIAL = "radial",
    GRID = "grid",
    FOLLOW_PATH = "follow_path"
}
/**
 * Aesthetic principle types
 */
export declare enum AestheticPrinciple {
    BALANCE = "balance",
    RHYTHM = "rhythm",
    EMPHASIS = "emphasis",
    PROPORTION = "proportion",
    HARMONY = "harmony",
    VARIETY = "variety",
    UNITY = "unity"
}
/**
 * Composition rule definition
 */
export interface CompositionRule {
    id: string;
    name: string;
    description: string;
    relation: SpatialRelation;
    principles: AestheticPrinciple[];
    priority: number;
    parameters: Record<string, any>;
    validator: (context: CompositionContext) => boolean;
    applier: (context: CompositionContext) => CompositionResult;
}
/**
 * Constraint definition for object placement
 */
export interface CompositionConstraint {
    id: string;
    type: 'distance' | 'angle' | 'visibility' | 'collision' | 'semantic';
    source?: string;
    target?: string;
    parameters: {
        min?: number;
        max?: number;
        axis?: 'x' | 'y' | 'z' | 'any';
        required?: boolean;
        semantic?: string;
    };
}
/**
 * Composition template for reusable layouts
 */
export interface CompositionTemplate {
    id: string;
    name: string;
    description: string;
    tags: string[];
    objects: TemplateObject[];
    rules: string[];
    constraints: CompositionConstraint[];
    variables: TemplateVariable[];
}
/**
 * Object definition within a template
 */
export interface TemplateObject {
    id: string;
    category: string;
    variant?: string;
    position: Vector3;
    rotation: Quaternion;
    scale: Vector3;
    parent?: string;
    metadata?: Record<string, any>;
}
/**
 * Variable for template customization
 */
export interface TemplateVariable {
    name: string;
    type: 'number' | 'vector3' | 'quaternion' | 'string' | 'boolean';
    defaultValue: any;
    min?: number;
    max?: number;
    options?: string[];
}
/**
 * Context for composition evaluation
 */
export interface CompositionContext {
    nodes: Map<string, SceneGraphNode>;
    rootNode: Object3D;
    bounds: Box3;
    center: Vector3;
    up: Vector3;
    forward: Vector3;
    cameraPosition?: Vector3;
    lightDirections?: Vector3[];
    groundLevel: number;
    existingObjects: Array<{
        nodeId: string;
        bounds: Box3;
        center: Vector3;
        category: string;
    }>;
    variables?: Record<string, any>;
}
/**
 * Result of applying a composition rule
 */
export interface CompositionResult {
    success: boolean;
    transformations: Array<{
        nodeId: string;
        position?: Vector3;
        rotation?: Quaternion;
        scale?: Vector3;
    }>;
    conflicts: Array<{
        ruleId: string;
        constraintId: string;
        description: string;
        severity: 'error' | 'warning' | 'info';
    }>;
    score: number;
    metrics: CompositionMetrics;
}
/**
 * Metrics for evaluating composition quality
 */
export interface CompositionMetrics {
    balanceScore: number;
    rhythmScore: number;
    proportionScore: number;
    harmonyScore: number;
    overallScore: number;
    details: {
        centerOfMass: Vector3;
        boundingVolume: Sphere;
        densityDistribution: number[];
        symmetryAxis?: Vector3;
        goldenRatioDeviations: number[];
    };
}
/**
 * Main Composition Engine class
 */
export declare class CompositionEngine {
    private rules;
    private constraints;
    private templates;
    private activeRules;
    private activeConstraints;
    /**
     * Register a composition rule
     */
    registerRule(rule: CompositionRule): void;
    /**
     * Register a constraint
     */
    registerConstraint(constraint: CompositionConstraint): void;
    /**
     * Register a template
     */
    registerTemplate(template: CompositionTemplate): void;
    /**
     * Activate rules by ID
     */
    activateRules(ruleIds: string[]): void;
    /**
     * Activate constraints by ID
     */
    activateConstraints(constraintIds: string[]): void;
    /**
     * Apply a template to the scene
     */
    applyTemplate(templateId: string, context: CompositionContext, variables?: Record<string, any>): CompositionResult;
    /**
     * Apply all active rules to the context
     */
    applyRules(context: CompositionContext): CompositionResult;
    /**
     * Validate all active constraints
     */
    validateConstraints(context: CompositionContext): Array<{
        ruleId: string;
        constraintId: string;
        description: string;
        severity: 'error' | 'warning' | 'info';
    }>;
    /**
     * Calculate composition quality metrics
     */
    calculateMetrics(context: CompositionContext): CompositionMetrics;
    /**
     * Merge template variables with defaults
     */
    private mergeTemplateVariables;
    /**
     * Instantiate a template object with variable substitution
     */
    private instantiateTemplateObject;
    /**
     * Substitute variables in a Vector3
     */
    private substituteVector3;
    /**
     * Check if a constraint is violated
     */
    private checkConstraintViolation;
    private checkDistanceConstraint;
    private checkAngleConstraint;
    private checkCollisionConstraint;
    private checkVisibilityConstraint;
    private checkSemanticConstraint;
    /**
     * Calculate density distribution across 8 octants
     */
    private calculateDensityDistribution;
    /**
     * Calculate balance score based on symmetry
     */
    private calculateBalanceScore;
    /**
     * Calculate rhythm score based on spacing patterns
     */
    private calculateRhythmScore;
    /**
     * Calculate proportion score based on golden ratio
     */
    private calculateProportionScore;
    /**
     * Calculate overall score from metrics and conflicts
     */
    private calculateOverallScore;
    /**
     * Get a rule by ID
     */
    getRule(id: string): CompositionRule | undefined;
    /**
     * Get a template by ID
     */
    getTemplate(id: string): CompositionTemplate | undefined;
    /**
     * List all registered rules
     */
    listRules(): CompositionRule[];
    /**
     * List all registered templates
     */
    listTemplates(): CompositionTemplate[];
}
export declare const compositionEngine: CompositionEngine;
//# sourceMappingURL=CompositionEngine.d.ts.map