/**
 * Boolean Nodes - Mesh boolean operations (CSG)
 * Based on Blender's Boolean geometry nodes
 *
 * @module nodes/boolean
 */
import { BufferGeometry } from 'three';
import { Node, NodeSocket } from '../types.js';
import { NodeTypes } from '../core/node-types.js';
/**
 * BooleanUnion Node
 * Performs union operation on two meshes
 */
export interface BooleanUnionNode extends Node {
    type: NodeTypes.BooleanUnion;
    inputs: {
        Mesh1: NodeSocket<BufferGeometry>;
        Mesh2: NodeSocket<BufferGeometry>;
    };
    outputs: {
        Mesh: NodeSocket<BufferGeometry>;
    };
    params: {
        solver: 'exact' | 'fast';
        overlapThreshold: number;
    };
}
export declare const BooleanUnionDefinition: {
    type: any;
    label: string;
    category: string;
    inputs: {
        name: string;
        type: string;
        required: boolean;
    }[];
    outputs: {
        name: string;
        type: string;
    }[];
    params: {
        solver: {
            type: string;
            options: string[];
            default: string;
        };
        overlapThreshold: {
            type: string;
            default: number;
            min: number;
            max: number;
        };
    };
};
/**
 * BooleanIntersect Node
 * Performs intersection operation on two meshes
 */
export interface BooleanIntersectNode extends Node {
    type: NodeTypes.BooleanIntersect;
    inputs: {
        Mesh1: NodeSocket<BufferGeometry>;
        Mesh2: NodeSocket<BufferGeometry>;
    };
    outputs: {
        Mesh: NodeSocket<BufferGeometry>;
    };
    params: {
        solver: 'exact' | 'fast';
    };
}
export declare const BooleanIntersectDefinition: {
    type: any;
    label: string;
    category: string;
    inputs: {
        name: string;
        type: string;
        required: boolean;
    }[];
    outputs: {
        name: string;
        type: string;
    }[];
    params: {
        solver: {
            type: string;
            options: string[];
            default: string;
        };
    };
};
/**
 * BooleanDifference Node
 * Performs difference operation (Mesh1 - Mesh2)
 */
export interface BooleanDifferenceNode extends Node {
    type: NodeTypes.BooleanDifference;
    inputs: {
        Mesh1: NodeSocket<BufferGeometry>;
        Mesh2: NodeSocket<BufferGeometry>;
    };
    outputs: {
        Mesh: NodeSocket<BufferGeometry>;
    };
    params: {
        solver: 'exact' | 'fast';
        holeTolerant: boolean;
    };
}
export declare const BooleanDifferenceDefinition: {
    type: any;
    label: string;
    category: string;
    inputs: {
        name: string;
        type: string;
        required: boolean;
    }[];
    outputs: {
        name: string;
        type: string;
    }[];
    params: {
        solver: {
            type: string;
            options: string[];
            default: string;
        };
        holeTolerant: {
            type: string;
            default: boolean;
        };
    };
};
/**
 * Simple voxel-based boolean union (placeholder for production CSG library)
 * In production, use a library like manifold-3d or csg.js
 */
export declare function booleanUnion(geom1: BufferGeometry, geom2: BufferGeometry, solver?: 'exact' | 'fast', overlapThreshold?: number): BufferGeometry;
/**
 * Simple voxel-based boolean intersection
 */
export declare function booleanIntersect(geom1: BufferGeometry, geom2: BufferGeometry, solver?: 'exact' | 'fast'): BufferGeometry;
/**
 * Simple voxel-based boolean difference
 */
export declare function booleanDifference(geom1: BufferGeometry, geom2: BufferGeometry, solver?: 'exact' | 'fast', holeTolerant?: boolean): BufferGeometry;
export declare const BooleanNodes: {
    BooleanUnion: {
        type: any;
        label: string;
        category: string;
        inputs: {
            name: string;
            type: string;
            required: boolean;
        }[];
        outputs: {
            name: string;
            type: string;
        }[];
        params: {
            solver: {
                type: string;
                options: string[];
                default: string;
            };
            overlapThreshold: {
                type: string;
                default: number;
                min: number;
                max: number;
            };
        };
    };
    BooleanIntersect: {
        type: any;
        label: string;
        category: string;
        inputs: {
            name: string;
            type: string;
            required: boolean;
        }[];
        outputs: {
            name: string;
            type: string;
        }[];
        params: {
            solver: {
                type: string;
                options: string[];
                default: string;
            };
        };
    };
    BooleanDifference: {
        type: any;
        label: string;
        category: string;
        inputs: {
            name: string;
            type: string;
            required: boolean;
        }[];
        outputs: {
            name: string;
            type: string;
        }[];
        params: {
            solver: {
                type: string;
                options: string[];
                default: string;
            };
            holeTolerant: {
                type: string;
                default: boolean;
            };
        };
    };
};
export declare const BooleanFunctions: {
    booleanUnion: typeof booleanUnion;
    booleanIntersect: typeof booleanIntersect;
    booleanDifference: typeof booleanDifference;
};
//# sourceMappingURL=BooleanNodes.d.ts.map