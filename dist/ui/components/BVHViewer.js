import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * BVHViewer - Interactive Bounding Volume Hierarchy Visualization
 *
 * Visualizes the spatial acceleration structure used for collision detection
 * and constraint evaluation. Supports interactive exploration of BVH nodes.
 */
import React, { useMemo, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
/**
 * Individual BVH node mesh representation
 */
function BVHNodeMesh({ node, depth, maxDepth, showLeaves, showInternal, depthColors, opacity, interactive, onNodeSelect }) {
    const [hovered, setHovered] = useState(false);
    const meshRef = React.useRef(null);
    // Extract bounding box from node
    const bbox = node.bbox;
    if (!bbox)
        return null;
    // Skip based on visibility settings
    const isLeaf = !node.left && !node.right;
    if (isLeaf && !showLeaves)
        return null;
    if (!isLeaf && !showInternal)
        return null;
    // Skip if beyond max depth
    if (depth > maxDepth)
        return null;
    // Calculate color based on depth
    const colorIndex = Math.min(depth, depthColors.length - 1);
    const baseColor = depthColors[colorIndex];
    const displayColor = hovered
        ? new THREE.Color().lerpColors(baseColor, new THREE.Color(1, 1, 0), 0.5)
        : baseColor;
    // Create box geometry from bbox
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const handleClick = useCallback(() => {
        if (interactive && onNodeSelect) {
            onNodeSelect(node, depth);
        }
    }, [interactive, onNodeSelect, node, depth]);
    return (_jsxs("group", { position: center, children: [_jsxs("mesh", { ref: meshRef, onClick: handleClick, onPointerOver: () => setHovered(true), onPointerOut: () => setHovered(false), children: [_jsx("boxGeometry", { args: [size.x, size.y, size.z] }), _jsxs("lineSegments", { children: [_jsx("edgesGeometry", { args: [new THREE.BoxGeometry(size.x, size.y, size.z)] }), _jsx("lineBasicMaterial", { color: displayColor, transparent: true, opacity: opacity, linewidth: hovered ? 2 : 1 })] })] }), hovered && (_jsxs("mesh", { children: [_jsx("boxGeometry", { args: [size.x, size.y, size.z] }), _jsx("meshBasicMaterial", { color: displayColor, transparent: true, opacity: 0.1, depthWrite: false })] })), node.left && (_jsx(BVHNodeMesh, { node: node.left, depth: depth + 1, maxDepth: maxDepth, showLeaves: showLeaves, showInternal: showInternal, depthColors: depthColors, opacity: opacity, interactive: interactive, onNodeSelect: onNodeSelect })), node.right && (_jsx(BVHNodeMesh, { node: node.right, depth: depth + 1, maxDepth: maxDepth, showLeaves: showLeaves, showInternal: showInternal, depthColors: depthColors, opacity: opacity, interactive: interactive, onNodeSelect: onNodeSelect }))] }));
}
/**
 * Camera controls for BVH viewer
 */
function BVHCameraControls({ target }) {
    const { camera, controls } = useThree();
    useFrame(() => {
        if (controls) {
            controls.target.copy(target);
            controls.update();
        }
    });
    return null;
}
/**
 * BVH Statistics Panel
 */
function BVHStats({ root }) {
    const stats = useMemo(() => {
        if (!root)
            return null;
        let nodeCount = 0;
        let leafCount = 0;
        let maxDepth = 0;
        let totalPrimitives = 0;
        function traverse(node, depth) {
            nodeCount++;
            maxDepth = Math.max(maxDepth, depth);
            if (!node.left && !node.right) {
                leafCount++;
                totalPrimitives += node.primitiveCount || 0;
            }
            else {
                if (node.left)
                    traverse(node.left, depth + 1);
                if (node.right)
                    traverse(node.right, depth + 1);
            }
        }
        traverse(root, 0);
        return { nodeCount, leafCount, maxDepth, totalPrimitives };
    }, [root]);
    if (!stats)
        return null;
    return (_jsxs("div", { style: {
            position: 'absolute',
            top: 10,
            left: 10,
            background: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '10px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '12px'
        }, children: [_jsx("div", { children: _jsx("strong", { children: "BVH Statistics" }) }), _jsxs("div", { children: ["Nodes: ", stats.nodeCount] }), _jsxs("div", { children: ["Leaves: ", stats.leafCount] }), _jsxs("div", { children: ["Max Depth: ", stats.maxDepth] }), _jsxs("div", { children: ["Primitives: ", stats.totalPrimitives] }), _jsxs("div", { children: ["Avg Leaf Size: ", (stats.totalPrimitives / Math.max(1, stats.leafCount)).toFixed(1)] })] }));
}
/**
 * Main BVH Viewer Component
 */
export const BVHViewer = ({ bvhRoot = null, maxDepth = 10, showLeaves = true, showInternal = true, depthColors = [
    new THREE.Color(1, 0, 0), // Depth 0: Red
    new THREE.Color(1, 0.5, 0), // Depth 1: Orange
    new THREE.Color(1, 1, 0), // Depth 2: Yellow
    new THREE.Color(0, 1, 0), // Depth 3: Green
    new THREE.Color(0, 1, 1), // Depth 4: Cyan
    new THREE.Color(0, 0, 1), // Depth 5: Blue
    new THREE.Color(0.5, 0, 1), // Depth 6: Purple
    new THREE.Color(1, 0, 1), // Depth 7: Magenta
    new THREE.Color(0.5, 0.5, 0.5), // Depth 8+: Gray
], opacity = 0.6, interactive = true, onNodeSelect, }) => {
    const [selectedNode, setSelectedNode] = useState(null);
    const [selectedDepth, setSelectedDepth] = useState(0);
    const handleNodeSelect = useCallback((node, depth) => {
        setSelectedNode(node);
        setSelectedDepth(depth);
        onNodeSelect?.(node, depth);
    }, [onNodeSelect]);
    if (!bvhRoot) {
        return (_jsx("div", { style: {
                width: '100%',
                height: '400px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#1a1a1a',
                color: '#888'
            }, children: "No BVH data to visualize" }));
    }
    // Calculate scene bounds
    const sceneBounds = useMemo(() => {
        const bbox = new THREE.Box3();
        function expandBounds(node) {
            if (node.bbox) {
                bbox.union(node.bbox);
            }
            if (node.left)
                expandBounds(node.left);
            if (node.right)
                expandBounds(node.right);
        }
        expandBounds(bvhRoot);
        return bbox;
    }, [bvhRoot]);
    const center = new THREE.Vector3();
    sceneBounds.getCenter(center);
    return (_jsxs("div", { style: { width: '100%', height: '400px', position: 'relative' }, children: [_jsx(BVHStats, { root: bvhRoot }), selectedNode && (_jsxs("div", { style: {
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    background: 'rgba(0,0,0,0.8)',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '4px',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    maxWidth: '250px'
                }, children: [_jsx("div", { children: _jsx("strong", { children: "Selected Node" }) }), _jsxs("div", { children: ["Depth: ", selectedDepth] }), _jsxs("div", { children: ["Primitives: ", selectedNode.primitiveCount || 0] }), selectedNode.bbox && (_jsxs(_Fragment, { children: [_jsx("div", { children: "Bounds:" }), _jsxs("div", { children: ["Min: [", selectedNode.bbox.min.x.toFixed(2), ", ", selectedNode.bbox.min.y.toFixed(2), ", ", selectedNode.bbox.min.z.toFixed(2), "]"] }), _jsxs("div", { children: ["Max: [", selectedNode.bbox.max.x.toFixed(2), ", ", selectedNode.bbox.max.y.toFixed(2), ", ", selectedNode.bbox.max.z.toFixed(2), "]"] })] }))] })), _jsxs(Canvas, { camera: { position: [center.x + 5, center.y + 5, center.z + 5], fov: 50 }, style: { background: '#1a1a1a' }, children: [_jsx("ambientLight", { intensity: 0.5 }), _jsx("pointLight", { position: [10, 10, 10] }), _jsx(BVHCameraControls, { target: center }), _jsx(BVHNodeMesh, { node: bvhRoot, depth: 0, maxDepth: maxDepth, showLeaves: showLeaves, showInternal: showInternal, depthColors: depthColors, opacity: opacity, interactive: interactive, onNodeSelect: handleNodeSelect }), _jsx("gridHelper", { args: [20, 20, 0x444444, 0x222222] }), _jsx("axesHelper", { args: [2] })] })] }));
};
export default BVHViewer;
//# sourceMappingURL=BVHViewer.js.map