/**
 * BVHViewer - Interactive Bounding Volume Hierarchy Visualization
 *
 * Visualizes the spatial acceleration structure used for collision detection
 * and constraint evaluation. Supports interactive exploration of BVH nodes.
 */
import React from 'react';
import * as THREE from 'three';
import type { BVHNode } from '../constraints/evaluator/state';
export interface BVHViewerProps {
    /** BVH root node to visualize */
    bvhRoot?: BVHNode | null;
    /** Maximum depth to visualize */
    maxDepth?: number;
    /** Show leaf nodes */
    showLeaves?: boolean;
    /** Show internal nodes */
    showInternal?: boolean;
    /** Node colors by depth */
    depthColors?: THREE.Color[];
    /** Opacity for wireframes */
    opacity?: number;
    /** Enable interactive selection */
    interactive?: boolean;
    /** Callback when node is selected */
    onNodeSelect?: (node: BVHNode, depth: number) => void;
}
/**
 * Main BVH Viewer Component
 */
export declare const BVHViewer: React.FC<BVHViewerProps>;
export default BVHViewer;
//# sourceMappingURL=BVHViewer.d.ts.map