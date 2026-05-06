/**
 * Mesh Primitive Nodes - Blender-style mesh primitive generators
 * Based on infinigen/core/nodes/node_info.py (MeshCube, MeshUVSphere, etc.)
 *
 * These nodes generate base geometry using Three.js geometry constructors
 * with parameter mapping that matches Blender's behavior.
 *
 * The original infinigen relies heavily on mesh primitives as fundamental
 * building blocks for geometry node groups. Without these, no geometry
 * node groups can be ported from the original.
 */

import * as THREE from 'three';
import { NodeTypes } from '../core/node-types';

// ============================================================================
// Type Definitions
// ============================================================================

export interface MeshPrimitiveInputs {
  /** Size in X/Y/Z dimensions */
  size?: [number, number, number];
  /** Vertices in X direction (for grid/cylinder) */
  verticesX?: number;
  /** Vertices in Y/Z direction */
  verticesY?: number;
  verticesZ?: number;
  /** Radius */
  radius?: number;
  /** Radius top (for cone/cylinder) */
  radiusTop?: number;
  /** Radius bottom (for cone/cylinder) */
  radiusBottom?: number;
  /** Depth (for cylinder/cone) */
  depth?: number;
  /** Segments (radial) */
  segments?: number;
  /** Rings (for sphere) */
  rings?: number;
  /** Fill type for circle/cylinder: 'none' | 'n-gon' | 'triangle_fan' */
  fillType?: 'none' | 'n-gon' | 'triangle_fan';
  /** Subdivisions */
  subdivisions?: number;
  /** Count (for line) */
  count?: number;
  /** Start location */
  startLocation?: [number, number, number];
  /** End location */
  endLocation?: [number, number, number];
  /** Resolution X/Y (for grid) */
  resolutionX?: number;
  resolutionY?: number;
}

export interface MeshPrimitiveOutputs {
  /** Generated geometry */
  Geometry: THREE.BufferGeometry;
}

// ============================================================================
// Node Implementations
// ============================================================================

/**
 * Mesh Cube Node
 * Generates a box/cube with configurable dimensions.
 * Matches Blender's MeshCube: size is a 3D vector, not a single float.
 */
export class MeshCubeNode {
  readonly type = NodeTypes.MeshCube;
  readonly name = 'Mesh Cube';

  inputs: MeshPrimitiveInputs = {
    size: [1, 1, 1],
    verticesX: 2,
    verticesY: 2,
    verticesZ: 2,
  };

  outputs: MeshPrimitiveOutputs = {
    Geometry: new THREE.BufferGeometry(),
  };

  execute(inputs?: Partial<MeshPrimitiveInputs>): MeshPrimitiveOutputs {
    const size = inputs?.size || this.inputs.size || [1, 1, 1];
    const width = size[0];
    const height = size[1];
    const depth = size[2];
    // Blender's verticesX/Y/Z maps to widthSegments/heightSegments/depthSegments
    const widthSegments = Math.max(1, (inputs?.verticesX || this.inputs.verticesX || 2) - 1);
    const heightSegments = Math.max(1, (inputs?.verticesY || this.inputs.verticesY || 2) - 1);
    const depthSegments = Math.max(1, (inputs?.verticesZ || this.inputs.verticesZ || 2) - 1);

    const geometry = new THREE.BoxGeometry(width, height, depth, widthSegments, heightSegments, depthSegments);
    this.outputs.Geometry = geometry;
    return this.outputs;
  }
}

/**
 * Mesh UV Sphere Node
 * Generates a UV sphere with configurable segments and rings.
 * Matches Blender's MeshUVSphere.
 */
export class MeshUVSphereNode {
  readonly type = NodeTypes.MeshUVSphere;
  readonly name = 'Mesh UV Sphere';

  inputs: MeshPrimitiveInputs = {
    radius: 1,
    segments: 32,
    rings: 16,
  };

  outputs: MeshPrimitiveOutputs = {
    Geometry: new THREE.BufferGeometry(),
  };

  execute(inputs?: Partial<MeshPrimitiveInputs>): MeshPrimitiveOutputs {
    const radius = inputs?.radius || this.inputs.radius || 1;
    const widthSegments = inputs?.segments || this.inputs.segments || 32;
    const heightSegments = inputs?.rings || this.inputs.rings || 16;

    const geometry = new THREE.SphereGeometry(
      radius,
      widthSegments,
      heightSegments,
      0, Math.PI * 2, // full phi range
      0, Math.PI       // full theta range
    );
    this.outputs.Geometry = geometry;
    return this.outputs;
  }
}

/**
 * Mesh Ico Sphere Node
 * Generates an icosphere with configurable subdivisions.
 * Matches Blender's MeshIcoSphere.
 */
export class MeshIcoSphereNode {
  readonly type = NodeTypes.MeshIcoSphere;
  readonly name = 'Mesh Ico Sphere';

  inputs: MeshPrimitiveInputs = {
    radius: 1,
    subdivisions: 2,
  };

  outputs: MeshPrimitiveOutputs = {
    Geometry: new THREE.BufferGeometry(),
  };

  execute(inputs?: Partial<MeshPrimitiveInputs>): MeshPrimitiveOutputs {
    const radius = inputs?.radius || this.inputs.radius || 1;
    const detail = inputs?.subdivisions || this.inputs.subdivisions || 2;

    const geometry = new THREE.IcosahedronGeometry(radius, detail);
    this.outputs.Geometry = geometry;
    return this.outputs;
  }
}

/**
 * Mesh Circle Node
 * Generates a circle disc (filled or ring).
 * Matches Blender's MeshCircle.
 */
export class MeshCircleNode {
  readonly type = NodeTypes.MeshCircle;
  readonly name = 'Mesh Circle';

  inputs: MeshPrimitiveInputs = {
    radius: 1,
    verticesX: 32, // vertex count
    fillType: 'n-gon',
  };

  outputs: MeshPrimitiveOutputs = {
    Geometry: new THREE.BufferGeometry(),
  };

  execute(inputs?: Partial<MeshPrimitiveInputs>): MeshPrimitiveOutputs {
    const radius = inputs?.radius || this.inputs.radius || 1;
    const segments = inputs?.verticesX || this.inputs.verticesX || 32;
    const fillType = inputs?.fillType || this.inputs.fillType || 'n-gon';

    const geometry = new THREE.CircleGeometry(radius, segments);
    if (fillType === 'none') {
      // For ring-only, remove the center vertex and create a line loop
      // This creates a disc without the filled center triangle fan
      const posAttr = geometry.getAttribute('position');
      const newPositions = new Float32Array((segments + 1) * 3);
      // Skip the center vertex (index 0), keep only the ring
      for (let i = 1; i <= segments; i++) {
        newPositions[(i - 1) * 3] = posAttr.getX(i);
        newPositions[(i - 1) * 3 + 1] = posAttr.getY(i);
        newPositions[(i - 1) * 3 + 2] = posAttr.getZ(i);
      }
      const ringGeo = new THREE.BufferGeometry();
      ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
      this.outputs.Geometry = ringGeo;
    } else {
      this.outputs.Geometry = geometry;
    }
    return this.outputs;
  }
}

/**
 * Mesh Cylinder Node
 * Generates a cylinder with configurable radii and depth.
 * Matches Blender's MeshCylinder.
 */
export class MeshCylinderNode {
  readonly type = NodeTypes.MeshCylinder;
  readonly name = 'Mesh Cylinder';

  inputs: MeshPrimitiveInputs = {
    radiusTop: 1,
    radiusBottom: 1,
    depth: 2,
    verticesX: 32, // radial segments
    fillType: 'n-gon',
  };

  outputs: MeshPrimitiveOutputs = {
    Geometry: new THREE.BufferGeometry(),
  };

  execute(inputs?: Partial<MeshPrimitiveInputs>): MeshPrimitiveOutputs {
    const radiusTop = inputs?.radiusTop || this.inputs.radiusTop || 1;
    const radiusBottom = inputs?.radiusBottom || this.inputs.radiusBottom || 1;
    const height = inputs?.depth || this.inputs.depth || 2;
    const radialSegments = inputs?.verticesX || this.inputs.verticesX || 32;
    const fillType = inputs?.fillType || this.inputs.fillType || 'n-gon';
    const openEnded = fillType === 'none';

    const geometry = new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      height,
      radialSegments,
      1,      // height segments
      openEnded
    );
    this.outputs.Geometry = geometry;
    return this.outputs;
  }
}

/**
 * Mesh Cone Node
 * Generates a cone (cylinder with top radius = 0).
 * Matches Blender's MeshCone.
 */
export class MeshConeNode {
  readonly type = NodeTypes.MeshCone;
  readonly name = 'Mesh Cone';

  inputs: MeshPrimitiveInputs = {
    radiusBottom: 1,
    depth: 2,
    verticesX: 32,
    fillType: 'n-gon',
  };

  outputs: MeshPrimitiveOutputs = {
    Geometry: new THREE.BufferGeometry(),
  };

  execute(inputs?: Partial<MeshPrimitiveInputs>): MeshPrimitiveOutputs {
    const radiusBottom = inputs?.radiusBottom || this.inputs.radiusBottom || 1;
    const height = inputs?.depth || this.inputs.depth || 2;
    const radialSegments = inputs?.verticesX || this.inputs.verticesX || 32;
    const fillType = inputs?.fillType || this.inputs.fillType || 'n-gon';
    const openEnded = fillType === 'none';

    const geometry = new THREE.ConeGeometry(
      radiusBottom,
      height,
      radialSegments,
      1,      // height segments
      openEnded
    );
    this.outputs.Geometry = geometry;
    return this.outputs;
  }
}

/**
 * Mesh Grid Node
 * Generates a flat grid with configurable subdivisions.
 * Matches Blender's MeshGrid.
 */
export class MeshGridNode {
  readonly type = NodeTypes.MeshGrid;
  readonly name = 'Mesh Grid';

  inputs: MeshPrimitiveInputs = {
    size: [10, 10, 1], // [width, height, 1]
    verticesX: 10,
    verticesY: 10,
  };

  outputs: MeshPrimitiveOutputs = {
    Geometry: new THREE.BufferGeometry(),
  };

  execute(inputs?: Partial<MeshPrimitiveInputs>): MeshPrimitiveOutputs {
    const size = inputs?.size || this.inputs.size || [10, 10, 1];
    const width = size[0];
    const height = size[1];
    const widthSegments = Math.max(1, (inputs?.verticesX || this.inputs.verticesX || 10) - 1);
    const heightSegments = Math.max(1, (inputs?.verticesY || this.inputs.verticesY || 10) - 1);

    const geometry = new THREE.PlaneGeometry(width, height, widthSegments, heightSegments);
    // Rotate to match Blender's default grid orientation (XZ plane)
    geometry.rotateX(-Math.PI / 2);
    this.outputs.Geometry = geometry;
    return this.outputs;
  }
}

/**
 * Mesh Line Node
 * Generates a line with configurable count and start/end positions.
 * Matches Blender's MeshLine.
 */
export class MeshLineNode {
  readonly type = NodeTypes.MeshLine;
  readonly name = 'Mesh Line';

  inputs: MeshPrimitiveInputs = {
    count: 2,
    startLocation: [0, 0, 0],
    endLocation: [0, 1, 0],
  };

  outputs: MeshPrimitiveOutputs = {
    Geometry: new THREE.BufferGeometry(),
  };

  execute(inputs?: Partial<MeshPrimitiveInputs>): MeshPrimitiveOutputs {
    const count = inputs?.count || this.inputs.count || 2;
    const start = inputs?.startLocation || this.inputs.startLocation || [0, 0, 0];
    const end = inputs?.endLocation || this.inputs.endLocation || [0, 1, 0];

    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0;
      positions[i * 3] = start[0] + t * (end[0] - start[0]);
      positions[i * 3 + 1] = start[1] + t * (end[1] - start[1]);
      positions[i * 3 + 2] = start[2] + t * (end[2] - start[2]);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.outputs.Geometry = geometry;
    return this.outputs;
  }
}

/**
 * Mesh Torus Node
 * Generates a torus with configurable radii and segments.
 * Matches Blender's MeshTorus.
 */
export class MeshTorusNode {
  readonly type = NodeTypes.MeshTorus;
  readonly name = 'Mesh Torus';

  inputs: {
    majorRadius?: number;
    minorRadius?: number;
    majorSegments?: number;
    minorSegments?: number;
  } = {
    majorRadius: 1,
    minorRadius: 0.25,
    majorSegments: 48,
    minorSegments: 12,
  };

  outputs: MeshPrimitiveOutputs = {
    Geometry: new THREE.BufferGeometry(),
  };

  execute(inputs?: { majorRadius?: number; minorRadius?: number; majorSegments?: number; minorSegments?: number }): MeshPrimitiveOutputs {
    const majorRadius = inputs?.majorRadius || this.inputs.majorRadius || 1;
    const minorRadius = inputs?.minorRadius || this.inputs.minorRadius || 0.25;
    const majorSegments = inputs?.majorSegments || this.inputs.majorSegments || 48;
    const minorSegments = inputs?.minorSegments || this.inputs.minorSegments || 12;

    const geometry = new THREE.TorusGeometry(majorRadius, minorRadius, minorSegments, majorSegments);
    this.outputs.Geometry = geometry;
    return this.outputs;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createMeshCubeNode(inputs?: Partial<MeshPrimitiveInputs>): MeshCubeNode {
  const node = new MeshCubeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMeshUVSphereNode(inputs?: Partial<MeshPrimitiveInputs>): MeshUVSphereNode {
  const node = new MeshUVSphereNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMeshIcoSphereNode(inputs?: Partial<MeshPrimitiveInputs>): MeshIcoSphereNode {
  const node = new MeshIcoSphereNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMeshCircleNode(inputs?: Partial<MeshPrimitiveInputs>): MeshCircleNode {
  const node = new MeshCircleNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMeshCylinderNode(inputs?: Partial<MeshPrimitiveInputs>): MeshCylinderNode {
  const node = new MeshCylinderNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMeshConeNode(inputs?: Partial<MeshPrimitiveInputs>): MeshConeNode {
  const node = new MeshConeNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMeshGridNode(inputs?: Partial<MeshPrimitiveInputs>): MeshGridNode {
  const node = new MeshGridNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMeshLineNode(inputs?: Partial<MeshPrimitiveInputs>): MeshLineNode {
  const node = new MeshLineNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

export function createMeshTorusNode(inputs?: { majorRadius?: number; minorRadius?: number; majorSegments?: number; minorSegments?: number }): MeshTorusNode {
  const node = new MeshTorusNode();
  if (inputs) Object.assign(node.inputs, inputs);
  return node;
}

/**
 * Node executor registration for mesh primitives.
 * These executor functions allow the mesh primitives to work
 * within the NodeWrangler's evaluate() system.
 */
export function registerMeshPrimitiveExecutors(nwClass: typeof import('../core/node-wrangler').NodeWrangler): void {
  nwClass.executors.set(String(NodeTypes.MeshCube), (inputs) => {
    const node = new MeshCubeNode();
    return node.execute(inputs);
  });

  nwClass.executors.set(String(NodeTypes.MeshUVSphere), (inputs) => {
    const node = new MeshUVSphereNode();
    return node.execute(inputs);
  });

  nwClass.executors.set(String(NodeTypes.MeshIcoSphere), (inputs) => {
    const node = new MeshIcoSphereNode();
    return node.execute(inputs);
  });

  nwClass.executors.set(String(NodeTypes.MeshCircle), (inputs) => {
    const node = new MeshCircleNode();
    return node.execute(inputs);
  });

  nwClass.executors.set(String(NodeTypes.MeshCylinder), (inputs) => {
    const node = new MeshCylinderNode();
    return node.execute(inputs);
  });

  nwClass.executors.set(String(NodeTypes.MeshCone), (inputs) => {
    const node = new MeshConeNode();
    return node.execute(inputs);
  });

  nwClass.executors.set(String(NodeTypes.MeshGrid), (inputs) => {
    const node = new MeshGridNode();
    return node.execute(inputs);
  });

  nwClass.executors.set(String(NodeTypes.MeshLine), (inputs) => {
    const node = new MeshLineNode();
    return node.execute(inputs);
  });

  nwClass.executors.set(String(NodeTypes.MeshTorus), (inputs) => {
    const node = new MeshTorusNode();
    return node.execute(inputs);
  });
}
