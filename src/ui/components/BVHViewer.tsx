/**
 * BVHViewer - Interactive Bounding Volume Hierarchy Visualization
 * 
 * Visualizes the spatial acceleration structure used for collision detection
 * and constraint evaluation. Supports interactive exploration of BVH nodes.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BVHNode, BVHCacheEntry } from '../evaluator/state';

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

interface BVHNodeMeshProps {
  node: BVHNode;
  depth: number;
  maxDepth: number;
  showLeaves: boolean;
  showInternal: boolean;
  depthColors: THREE.Color[];
  opacity: number;
  interactive: boolean;
  onNodeSelect?: (node: BVHNode, depth: number) => void;
}

/**
 * Individual BVH node mesh representation
 */
function BVHNodeMesh({ 
  node, 
  depth, 
  maxDepth, 
  showLeaves, 
  showInternal,
  depthColors,
  opacity,
  interactive,
  onNodeSelect 
}: BVHNodeMeshProps) {
  const [hovered, setHovered] = useState(false);
  const meshRef = React.useRef<THREE.Mesh>(null);
  
  // Extract bounding box from node
  const bbox = node.bbox;
  if (!bbox) return null;
  
  // Skip based on visibility settings
  const isLeaf = !node.left && !node.right;
  if (isLeaf && !showLeaves) return null;
  if (!isLeaf && !showInternal) return null;
  
  // Skip if beyond max depth
  if (depth > maxDepth) return null;
  
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
  
  return (
    <group position={center}>
      {/* Wireframe box */}
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[size.x, size.y, size.z]} />
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
          <lineBasicMaterial 
            color={displayColor} 
            transparent 
            opacity={opacity}
            linewidth={hovered ? 2 : 1}
          />
        </lineSegments>
      </mesh>
      
      {/* Semi-transparent fill for hovered nodes */}
      {hovered && (
        <mesh>
          <boxGeometry args={[size.x, size.y, size.z]} />
          <meshBasicMaterial 
            color={displayColor} 
            transparent 
            opacity={0.1} 
            depthWrite={false}
          />
        </mesh>
      )}
      
      {/* Recursively render children */}
      {node.left && (
        <BVHNodeMesh
          node={node.left}
          depth={depth + 1}
          maxDepth={maxDepth}
          showLeaves={showLeaves}
          showInternal={showInternal}
          depthColors={depthColors}
          opacity={opacity}
          interactive={interactive}
          onNodeSelect={onNodeSelect}
        />
      )}
      {node.right && (
        <BVHNodeMesh
          node={node.right}
          depth={depth + 1}
          maxDepth={maxDepth}
          showLeaves={showLeaves}
          showInternal={showInternal}
          depthColors={depthColors}
          opacity={opacity}
          interactive={interactive}
          onNodeSelect={onNodeSelect}
        />
      )}
    </group>
  );
}

/**
 * Camera controls for BVH viewer
 */
function BVHCameraControls({ target }: { target: THREE.Vector3 }) {
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
function BVHStats({ root }: { root: BVHNode | null }) {
  const stats = useMemo(() => {
    if (!root) return null;
    
    let nodeCount = 0;
    let leafCount = 0;
    let maxDepth = 0;
    let totalPrimitives = 0;
    
    function traverse(node: BVHNode, depth: number) {
      nodeCount++;
      maxDepth = Math.max(maxDepth, depth);
      
      if (!node.left && !node.right) {
        leafCount++;
        totalPrimitives += node.primitiveCount || 0;
      } else {
        if (node.left) traverse(node.left, depth + 1);
        if (node.right) traverse(node.right, depth + 1);
      }
    }
    
    traverse(root, 0);
    
    return { nodeCount, leafCount, maxDepth, totalPrimitives };
  }, [root]);
  
  if (!stats) return null;
  
  return (
    <div style={{
      position: 'absolute',
      top: 10,
      left: 10,
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '4px',
      fontFamily: 'monospace',
      fontSize: '12px'
    }}>
      <div><strong>BVH Statistics</strong></div>
      <div>Nodes: {stats.nodeCount}</div>
      <div>Leaves: {stats.leafCount}</div>
      <div>Max Depth: {stats.maxDepth}</div>
      <div>Primitives: {stats.totalPrimitives}</div>
      <div>Avg Leaf Size: {(stats.totalPrimitives / Math.max(1, stats.leafCount)).toFixed(1)}</div>
    </div>
  );
}

/**
 * Main BVH Viewer Component
 */
export const BVHViewer: React.FC<BVHViewerProps> = ({
  bvhRoot = null,
  maxDepth = 10,
  showLeaves = true,
  showInternal = true,
  depthColors = [
    new THREE.Color(1, 0, 0),      // Depth 0: Red
    new THREE.Color(1, 0.5, 0),    // Depth 1: Orange
    new THREE.Color(1, 1, 0),      // Depth 2: Yellow
    new THREE.Color(0, 1, 0),      // Depth 3: Green
    new THREE.Color(0, 1, 1),      // Depth 4: Cyan
    new THREE.Color(0, 0, 1),      // Depth 5: Blue
    new THREE.Color(0.5, 0, 1),    // Depth 6: Purple
    new THREE.Color(1, 0, 1),      // Depth 7: Magenta
    new THREE.Color(0.5, 0.5, 0.5),// Depth 8+: Gray
  ],
  opacity = 0.6,
  interactive = true,
  onNodeSelect,
}) => {
  const [selectedNode, setSelectedNode] = useState<BVHNode | null>(null);
  const [selectedDepth, setSelectedDepth] = useState(0);
  
  const handleNodeSelect = useCallback((node: BVHNode, depth: number) => {
    setSelectedNode(node);
    setSelectedDepth(depth);
    onNodeSelect?.(node, depth);
  }, [onNodeSelect]);
  
  if (!bvhRoot) {
    return (
      <div style={{
        width: '100%',
        height: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a1a',
        color: '#888'
      }}>
        No BVH data to visualize
      </div>
    );
  }
  
  // Calculate scene bounds
  const sceneBounds = useMemo(() => {
    const bbox = new THREE.Box3();
    
    function expandBounds(node: BVHNode) {
      if (node.bbox) {
        bbox.union(node.bbox);
      }
      if (node.left) expandBounds(node.left);
      if (node.right) expandBounds(node.right);
    }
    
    expandBounds(bvhRoot);
    return bbox;
  }, [bvhRoot]);
  
  const center = new THREE.Vector3();
  sceneBounds.getCenter(center);
  
  return (
    <div style={{ width: '100%', height: '400px', position: 'relative' }}>
      <BVHStats root={bvhRoot} />
      
      {/* Selected node info */}
      {selectedNode && (
        <div style={{
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
        }}>
          <div><strong>Selected Node</strong></div>
          <div>Depth: {selectedDepth}</div>
          <div>Primitives: {selectedNode.primitiveCount || 0}</div>
          {selectedNode.bbox && (
            <>
              <div>Bounds:</div>
              <div>Min: [{selectedNode.bbox.min.x.toFixed(2)}, {selectedNode.bbox.min.y.toFixed(2)}, {selectedNode.bbox.min.z.toFixed(2)}]</div>
              <div>Max: [{selectedNode.bbox.max.x.toFixed(2)}, {selectedNode.bbox.max.y.toFixed(2)}, {selectedNode.bbox.max.z.toFixed(2)}]</div>
            </>
          )}
        </div>
      )}
      
      <Canvas
        camera={{ position: [center.x + 5, center.y + 5, center.z + 5], fov: 50 }}
        style={{ background: '#1a1a1a' }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} />
        
        <BVHCameraControls target={center} />
        
        <BVHNodeMesh
          node={bvhRoot}
          depth={0}
          maxDepth={maxDepth}
          showLeaves={showLeaves}
          showInternal={showInternal}
          depthColors={depthColors}
          opacity={opacity}
          interactive={interactive}
          onNodeSelect={handleNodeSelect}
        />
        
        {/* Grid helper */}
        <gridHelper args={[20, 20, 0x444444, 0x222222]} />
        
        {/* Axes helper */}
        <axesHelper args={[2]} />
      </Canvas>
    </div>
  );
};

export default BVHViewer;
