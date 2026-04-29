/**
 * Constraint Types for Infinigen R3F
 * Core constraint definitions ported from original Infinigen
 */
import { Object3D } from 'three';
export declare enum ConstraintType {
    ABOVE = "above",
    BELOW = "below",
    LEFT_OF = "left_of",
    RIGHT_OF = "right_of",
    IN_FRONT_OF = "in_front_of",
    BEHIND = "behind",
    NEAR = "near",
    FAR = "far",
    INSIDE = "inside",
    OUTSIDE = "outside",
    ON_TOP_OF = "on_top_of",
    ATTACHED_TO = "attached_to",
    SAME_ROOM = "same_room",
    DIFFERENT_ROOM = "different_room",
    VISIBLE_FROM = "visible_from",
    OCCLUDED_FROM = "occluded_from",
    SUPPORTED_BY = "supported_by",
    HANGING_FROM = "hanging_from",
    STABLE = "stable",
    BALANCED = "balanced",
    ALIGNED_WITH = "aligned_with",
    SYMMETRIC_TO = "symmetric_to",
    GROUPED_WITH = "grouped_with",
    DISTRIBUTE_ALONG = "distribute_along"
}
export type ConstraintOperator = '==' | '!=' | '===' | '!==' | '<' | '>' | '<=' | '>=' | '+' | '-' | '*' | '/' | '%' | '&&' | '||' | '=' | '+=' | '-=' | '*=' | '/=' | '%=';
export type DomainType = 'point' | 'edge' | 'face' | 'face_corner' | 'spline' | 'instance';
export interface Constraint {
    id: string;
    type: ConstraintType;
    subject: string;
    object?: string;
    value?: number | string | any;
    weight: number;
    isHard: boolean;
    isActive: boolean;
    isSatisfied?: boolean;
    violationAmount?: number;
    lastEvaluated?: number;
}
export interface ConstraintDomain {
    id: string;
    objects: Map<string, Object3D>;
    rooms: Map<string, Room>;
    relationships: Map<string, Constraint[]>;
}
export interface Room {
    id: string;
    name: string;
    bounds: {
        min: [number, number, number];
        max: [number, number, number];
    };
    objects: Set<string>;
    adjacencies: Set<string>;
}
export type ConstraintViolation = {
    constraint: Constraint;
    severity: number;
    message: string;
    suggestion?: string;
};
export type ConstraintEvaluationResult = {
    isSatisfied: boolean;
    totalViolations: number;
    violations: ConstraintViolation[];
    energy: number;
};
//# sourceMappingURL=ConstraintTypes.d.ts.map