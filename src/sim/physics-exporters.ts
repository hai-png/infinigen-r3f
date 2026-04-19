/**
 * Physics Exporters Module
 * 
 * Exports scenes and objects to physics simulation formats:
 * - MJCF (MuJoCo XML)
 * - URDF (Unified Robot Description Format)
 * - USD (Universal Scene Description)
 * 
 * Ported from: infinigen/core/physics/exporters.py
 */

import { Scene, Object3D, Mesh, BoxGeometry, Vector3, Quaternion, Euler } from 'three';

/**
 * Base configuration for physics export
 */
export interface PhysicsExportConfig {
  /** Export path/filename */
  outputPath: string;
  /** Include visual meshes */
  includeVisuals: boolean;
  /** Include collision geometry */
  includeCollisions: boolean;
  /** Simplify collision meshes */
  simplifyCollisions: boolean;
  /** Collision margin */
  collisionMargin: number;
  /** Mass properties */
  massProperties: MassConfig;
}

/**
 * Mass configuration for rigid bodies
 */
export interface MassConfig {
  /** Default mass for objects without specified mass */
  defaultMass: number;
  /** Density for automatic mass calculation */
  density: number;
  /** Use mesh volume for mass calculation */
  useMeshVolume: boolean;
}

const DEFAULT_MASS_CONFIG: MassConfig = {
  defaultMass: 1.0,
  density: 1000.0, // kg/m^3 (water density)
  useMeshVolume: true,
};

const DEFAULT_EXPORT_CONFIG: PhysicsExportConfig = {
  outputPath: './output',
  includeVisuals: true,
  includeCollisions: true,
  simplifyCollisions: true,
  collisionMargin: 0.01,
  massProperties: DEFAULT_MASS_CONFIG,
};

/**
 * Rigid body properties
 */
export interface RigidBodyProps {
  /** Mass in kg */
  mass: number;
  /** Center of mass offset */
  comOffset: Vector3;
  /** Inertia tensor (diagonal) */
  inertia: Vector3;
  /** Friction coefficient */
  friction: number;
  /** Restitution (bounciness) */
  restitution: number;
  /** Whether body is static */
  isStatic: boolean;
}

/**
 * Joint types for articulated bodies
 */
export type JointType = 
  | 'fixed'
  | 'revolute'
  | 'continuous'
  | 'prismatic'
  | 'floating'
  | 'planar'
  | 'ball';

/**
 * Joint properties
 */
export interface JointProps {
  /** Joint type */
  type: JointType;
  /** Parent link name */
  parent: string;
  /** Child link name */
  child: string;
  /** Joint origin offset */
  origin: Vector3;
  /** Joint axis (for revolute/prismatic) */
  axis: Vector3;
  /** Lower limit */
  lowerLimit?: number;
  /** Upper limit */
  upperLimit?: number;
  /** Maximum velocity */
  maxVelocity?: number;
  /** Maximum effort/force */
  maxEffort?: number;
  /** Damping coefficient */
  damping: number;
  /** Friction coefficient */
  friction: number;
}

/**
 * MJCF (MuJoCo XML) Exporter
 * 
 * Exports scenes to MuJoCo's XML format for physics simulation.
 * MuJoCo is widely used for robotics and reinforcement learning.
 */
export class MJCFExporter {
  private config: PhysicsExportConfig;
  
  constructor(config: Partial<PhysicsExportConfig> = {}) {
    this.config = { ...DEFAULT_EXPORT_CONFIG, ...config };
  }
  
  /**
   * Export scene to MJCF format
   */
  export(scene: Scene, filename?: string): string {
    const outputPath = filename || `${this.config.outputPath}/scene.xml`;
    
    let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
    xml += '<mujoco model="infinigen_scene">\n';
    xml += '  <compiler angle="radian" coordinate="local"/>\n';
    xml += '  <option timestep="0.002" gravity="0 0 -9.81"/>\n';
    xml += '\n';
    
    // Add assets (meshes, materials)
    xml += this.exportAssets(scene);
    
    // Add worldbody with all objects
    xml += '  <worldbody>\n';
    xml += this.exportWorldBody(scene);
    xml += '  </worldbody>\n';
    
    // Add actuators if any
    xml += this.exportActuators(scene);
    
    // Add sensors if any
    xml += this.exportSensors(scene);
    
    xml += '</mujoco>\n';
    
    return xml;
  }
  
  /**
   * Export assets section
   */
  private exportAssets(scene: Scene): string {
    let xml = '  <asset>\n';
    
    // Collect unique geometries
    const geometries = new Map<string, Mesh>();
    scene.traverse((obj) => {
      if (obj instanceof Mesh && obj.geometry) {
        const key = obj.uuid;
        if (!geometries.has(key)) {
          geometries.set(key, obj);
        }
      }
    });
    
    // Export meshes
    let meshIndex = 0;
    geometries.forEach((mesh, uuid) => {
      const name = `mesh_${meshIndex++}`;
      
      if (this.config.includeVisuals && mesh.geometry) {
        // In full implementation, would export actual mesh data
        // For now, create placeholder reference
        xml += `    <mesh name="${name}" file="./meshes/${uuid}.obj"/>\n`;
      }
    });
    
    xml += '  </asset>\n\n';
    return xml;
  }
  
  /**
   * Export worldbody section
   */
  private exportWorldBody(scene: Scene): string {
    let xml = '';
    
    // Export ground plane
    xml += '    <body name="ground" pos="0 0 0">\n';
    xml += '      <geom type="plane" size="100 100 0.1" material="ground_mat" friction="1 0.5 0.5"/>\n';
    xml += '    </body>\n';
    
    // Export all objects as bodies
    scene.traverse((obj) => {
      if (obj instanceof Object3D && obj.type === 'Mesh') {
        const mesh = obj as Mesh;
        if (mesh.geometry) {
          xml += this.exportBody(mesh, obj.parent === scene);
        }
      }
    });
    
    return xml;
  }
  
  /**
   * Export a single body
   */
  private exportBody(obj: Object3D, isRoot: boolean): string {
    const name = obj.name || `object_${obj.id}`;
    const pos = obj.position;
    const rot = obj.quaternion;
    
    let xml = `    <body name="${name}" pos="${pos.x.toFixed(4)} ${pos.y.toFixed(4)} ${pos.z.toFixed(4)}"`;
    
    if (!isRoot) {
      // Convert quaternion to Euler angles for MJCF
      const euler = new Euler().setFromQuaternion(rot);
      xml += ` euler="${euler.x.toFixed(4)} ${euler.y.toFixed(4)} ${euler.z.toFixed(4)}"`;
    }
    
    xml += '>\n';
    
    // Calculate rigid body properties
    const rbProps = this.calculateRigidBodyProps(obj);
    
    // Add geometry
    if (this.config.includeCollisions) {
      xml += this.exportCollisionGeom(obj, rbProps);
    }
    
    if (this.config.includeVisuals) {
      xml += this.exportVisualGeom(obj);
    }
    
    // Add joint if not root and has parent
    if (!isRoot && obj.parent) {
      xml += this.exportJoint(obj);
    }
    
    // Recursively add children
    obj.children.forEach((child) => {
      xml += this.exportBody(child, false);
    });
    
    xml += '    </body>\n';
    return xml;
  }
  
  /**
   * Calculate rigid body properties from mesh
   */
  private calculateRigidBodyProps(obj: Object3D): RigidBodyProps {
    const mesh = obj as Mesh;
    const massConfig = this.config.massProperties;
    
    let mass = massConfig.defaultMass;
    let inertia = new Vector3(1, 1, 1);
    
    if (mesh.geometry && massConfig.useMeshVolume) {
      // Simplified mass calculation based on bounding box
      const bbox = mesh.geometry.boundingBox;
      if (bbox) {
        const size = new Vector3();
        bbox.getSize(size);
        const volume = size.x * size.y * size.z;
        mass = volume * massConfig.density;
        
        // Approximate inertia for box
        inertia.set(
          (mass / 12) * (size.y * size.y + size.z * size.z),
          (mass / 12) * (size.x * size.x + size.z * size.z),
          (mass / 12) * (size.x * size.x + size.y * size.y)
        );
      }
    }
    
    return {
      mass,
      comOffset: new Vector3(),
      inertia,
      friction: 0.5,
      restitution: 0.1,
      isStatic: mass < 0.001,
    };
  }
  
  /**
   * Export collision geometry
   */
  private exportCollisionGeom(obj: Object3D, props: RigidBodyProps): string {
    const mesh = obj as Mesh;
    const geomType = this.inferGeomType(mesh);
    
    let xml = '      <geom ';
    
    if (props.isStatic) {
      xml += 'type="mesh" ';
    } else {
      xml += `type="${geomType}" `;
      xml += `mass="${props.mass.toFixed(4)}" `;
      xml += `friction="${props.friction}" `;
      xml += `restitution="${props.restitution}" `;
    }
    
    xml += '/>\n';
    return xml;
  }
  
  /**
   * Export visual geometry
   */
  private exportVisualGeom(obj: Object3D): string {
    const mesh = obj as Mesh;
    const geomType = this.inferGeomType(mesh);
    
    let xml = '      <geom ';
    xml += `type="${geomType}" `;
    xml += 'material="visual_mat" ';
    xml += 'rgba="0.8 0.8 0.8 1" ';
    xml += 'group="1" '; // Visual group
    xml += '/>\n';
    return xml;
  }
  
  /**
   * Infer geometry type from mesh
   */
  private inferGeomType(mesh: Mesh): string {
    const geom = mesh.geometry;
    if (!geom) return 'mesh';
    
    // Check for primitive types
    if (geom.type === 'BoxGeometry') return 'box';
    if (geom.type === 'SphereGeometry') return 'sphere';
    if (geom.type === 'CylinderGeometry') return 'cylinder';
    if (geom.type === 'CapsuleGeometry') return 'capsule';
    
    return 'mesh';
  }
  
  /**
   * Export joint for articulated body
   */
  private exportJoint(obj: Object3D): string {
    // Default to fixed joint
    let xml = '      <joint type="fixed"/>\n';
    return xml;
  }
  
  /**
   * Export actuators section
   */
  private exportActuators(scene: Scene): string {
    // Placeholder for actuator export
    return '  <actuator>\n  </actuator>\n\n';
  }
  
  /**
   * Export sensors section
   */
  private exportSensors(scene: Scene): string {
    // Placeholder for sensor export
    return '  <sensor>\n  </sensor>\n\n';
  }
}

/**
 * URDF (Unified Robot Description Format) Exporter
 * 
 * Exports robots and articulated mechanisms to URDF format.
 * Widely used in ROS (Robot Operating System).
 */
export class URDFExporter {
  private config: PhysicsExportConfig;
  
  constructor(config: Partial<PhysicsExportConfig> = {}) {
    this.config = { ...DEFAULT_EXPORT_CONFIG, ...config };
  }
  
  /**
   * Export robot to URDF format
   */
  export(scene: Scene, robotName: string = 'robot'): string {
    let xml = '<?xml version="1.0"?>\n';
    xml += `<robot name="${robotName}">\n`;
    xml += '\n';
    
    // Export materials
    xml += this.exportMaterials(scene);
    
    // Export links and joints
    const linksAndJoints = this.exportLinksAndJoints(scene);
    xml += linksAndJoints.links;
    xml += linksAndJoints.joints;
    
    xml += '</robot>\n';
    return xml;
  }
  
  /**
   * Export materials section
   */
  private exportMaterials(scene: Scene): string {
    let xml = '  <!-- Materials -->\n';
    
    const materials = new Set<string>();
    scene.traverse((obj) => {
      if (obj instanceof Mesh && obj.material) {
        const matName = obj.material.name || `material_${obj.id}`;
        if (!materials.has(matName)) {
          materials.add(matName);
          xml += `  <material name="${matName}">\n`;
          xml += '    <color rgba="0.7 0.7 0.7 1.0"/>\n';
          xml += '  </material>\n';
        }
      }
    });
    
    xml += '\n';
    return xml;
  }
  
  /**
   * Export links and joints
   */
  private exportLinksAndJoints(scene: Scene): { links: string; joints: string } {
    let links = '  <!-- Links -->\n';
    let joints = '  <!-- Joints -->\n';
    
    const rootObj = this.findRootObject(scene);
    if (!rootObj) {
      return { links: '', joints: '' };
    }
    
    // Export base link
    links += this.exportLink(rootObj, true);
    
    // Export child links and joints
    this.exportChildren(rootObj, rootObj.name || 'base_link', links, joints);
    
    return { links, joints };
  }
  
  /**
   * Find root object in scene
   */
  private findRootObject(scene: Scene): Object3D | null {
    // Find object with no parent or named 'base'/'root'
    for (const child of scene.children) {
      if (child.name.toLowerCase().includes('base') || 
          child.name.toLowerCase().includes('root')) {
        return child;
      }
    }
    
    // Return first mesh as fallback
    for (const child of scene.children) {
      if (child instanceof Mesh) {
        return child;
      }
    }
    
    return null;
  }
  
  /**
   * Export a single link
   */
  private exportLink(obj: Object3D, isBase: boolean = false): string {
    const linkName = obj.name || `link_${obj.id}`;
    
    let xml = `  <link name="${linkName}">\n`;
    
    // Add visual
    if (this.config.includeVisuals && obj instanceof Mesh) {
      xml += this.exportVisual(obj);
    }
    
    // Add collision
    if (this.config.includeCollisions && obj instanceof Mesh) {
      xml += this.exportCollision(obj);
    }
    
    // Add inertial
    xml += this.exportInertial(obj);
    
    xml += '  </link>\n\n';
    return xml;
  }
  
  /**
   * Export visual element
   */
  private exportVisual(obj: Mesh): string {
    const geomType = this.inferGeomType(obj);
    
    let xml = '    <visual>\n';
    xml += `      <geometry>\n`;
    xml += this.exportGeometry(obj, geomType);
    xml += `      </geometry>\n`;
    xml += '    </visual>\n';
    return xml;
  }
  
  /**
   * Export collision element
   */
  private exportCollision(obj: Mesh): string {
    const geomType = this.inferGeomType(obj);
    
    let xml = '    <collision>\n';
    xml += `      <geometry>\n`;
    xml += this.exportGeometry(obj, geomType);
    xml += `      </geometry>\n`;
    xml += '    </collision>\n';
    return xml;
  }
  
  /**
   * Export geometry element
   */
  private exportGeometry(obj: Mesh, geomType: string): string {
    if (geomType === 'box') {
      const bbox = obj.geometry.boundingBox;
      if (bbox) {
        const size = new Vector3();
        bbox.getSize(size);
        return `        <box size="${size.x.toFixed(4)} ${size.y.toFixed(4)} ${size.z.toFixed(4)}"/>\n`;
      }
    } else if (geomType === 'sphere') {
      // Approximate radius from bounding sphere
      const sphere = obj.geometry.boundingSphere;
      if (sphere) {
        return `        <sphere radius="${sphere.radius.toFixed(4)}"/>\n`;
      }
    } else if (geomType === 'cylinder') {
      const bbox = obj.geometry.boundingBox;
      if (bbox) {
        const size = new Vector3();
        bbox.getSize(size);
        const radius = Math.max(size.x, size.z) / 2;
        return `        <cylinder radius="${radius.toFixed(4)} length="${size.y.toFixed(4)}"/>\n`;
      }
    }
    
    // Fallback to mesh
    return `        <mesh filename="./meshes/${obj.uuid}.obj"/>\n`;
  }
  
  /**
   * Export inertial properties
   */
  private exportInertial(obj: Object3D): string {
    const props = this.calculateRigidBodyProps(obj);
    
    let xml = '    <inertial>\n';
    xml += `      <origin xyz="0 0 0" rpy="0 0 0"/>\n`;
    xml += `      <mass value="${props.mass.toFixed(4)}"/>\n`;
    xml += `      <inertia ixx="${props.inertia.x.toFixed(6)}" ixy="0" ixz="0"\n`;
    xml += `               iyy="${props.inertia.y.toFixed(6)}" iyz="0"\n`;
    xml += `               izz="${props.inertia.z.toFixed(6)}"/>\n`;
    xml += '    </inertial>\n';
    return xml;
  }
  
  /**
   * Calculate rigid body properties
   */
  private calculateRigidBodyProps(obj: Object3D): RigidBodyProps {
    // Same implementation as MJCFExporter
    const mesh = obj as Mesh;
    const massConfig = this.config.massProperties;
    
    let mass = massConfig.defaultMass;
    let inertia = new Vector3(1, 1, 1);
    
    if (mesh.geometry && massConfig.useMeshVolume) {
      const bbox = mesh.geometry.boundingBox;
      if (bbox) {
        const size = new Vector3();
        bbox.getSize(size);
        const volume = size.x * size.y * size.z;
        mass = volume * massConfig.density;
        
        inertia.set(
          (mass / 12) * (size.y * size.y + size.z * size.z),
          (mass / 12) * (size.x * size.x + size.z * size.z),
          (mass / 12) * (size.x * size.x + size.y * size.y)
        );
      }
    }
    
    return {
      mass,
      comOffset: new Vector3(),
      inertia,
      friction: 0.5,
      restitution: 0.1,
      isStatic: mass < 0.001,
    };
  }
  
  /**
   * Infer geometry type
   */
  private inferGeomType(mesh: Mesh): string {
    const geom = mesh.geometry;
    if (!geom) return 'mesh';
    
    if (geom.type === 'BoxGeometry') return 'box';
    if (geom.type === 'SphereGeometry') return 'sphere';
    if (geom.type === 'CylinderGeometry') return 'cylinder';
    if (geom.type === 'CapsuleGeometry') return 'capsule';
    
    return 'mesh';
  }
  
  /**
   * Export children recursively
   */
  private exportChildren(
    obj: Object3D, 
    parentName: string, 
    links: string, 
    joints: string
  ): void {
    obj.children.forEach((child, index) => {
      const childName = child.name || `link_${child.id}`;
      
      // Export joint
      joints += this.exportJointURDF(parentName, childName, child);
      
      // Export link
      links += this.exportLink(child, false);
      
      // Recurse
      this.exportChildren(child, childName, links, joints);
    });
  }
  
  /**
   * Export URDF joint
   */
  private exportJointURDF(parent: string, child: string, obj: Object3D): string {
    const jointName = `joint_${parent}_to_${child}`;
    
    let xml = `  <joint name="${jointName}" type="fixed">\n`;
    xml += `    <parent link="${parent}"/>\n`;
    xml += `    <child link="${child}"/>\n`;
    xml += `    <origin xyz="${obj.position.x.toFixed(4)} ${obj.position.y.toFixed(4)} ${obj.position.z.toFixed(4)}"/>\n`;
    xml += '  </joint>\n\n';
    
    return xml;
  }
}

/**
 * USD (Universal Scene Description) Exporter
 * 
 * Exports scenes to Pixar's USD format.
 * Industry standard for interchange between DCC tools.
 */
export class USDExporter {
  private config: PhysicsExportConfig;
  
  constructor(config: Partial<PhysicsExportConfig> = {}) {
    this.config = { ...DEFAULT_EXPORT_CONFIG, ...config };
  }
  
  /**
   * Export scene to USD format (USDA text format)
   */
  export(scene: Scene, filename?: string): string {
    const outputPath = filename || `${this.config.outputPath}/scene.usda`;
    
    let usda = '#usda 1.0\n\n';
    usda += `(defaultPrim "scene")\n\n`;
    usda += `def Xform "scene"\n`;
    usda += `{\n`;
    
    // Export all objects
    scene.children.forEach((obj) => {
      usda += this.exportObject(obj, 1);
    });
    
    usda += '}\n';
    return usda;
  }
  
  /**
   * Export a single object
   */
  private exportObject(obj: Object3D, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    const name = obj.name || `object_${obj.id}`;
    
    let usda = `${indent}def Xform "${name}"\n`;
    usda += `${indent}{\n`;
    
    // Transform
    const pos = obj.position;
    const rot = obj.quaternion;
    const scale = obj.scale;
    
    usda += `${indent}  xformOp:translate = (${pos.x.toFixed(4)}, ${pos.y.toFixed(4)}, ${pos.z.toFixed(4)})\n`;
    usda += `${indent}  xformOp:rotateXYZ = (0, 0, 0)\n`; // Simplified
    usda += `${indent}  xformOp:scale = (${scale.x.toFixed(4)}, ${scale.y.toFixed(4)}, ${scale.z.toFixed(4)})\n`;
    usda += `${indent}  xformOpOrder = ["xformOp:translate", "xformOp:rotateXYZ", "xformOp:scale"]\n`;
    
    // Add mesh if applicable
    if (obj instanceof Mesh && obj.geometry) {
      usda += this.exportMeshData(obj, indentLevel + 1);
    }
    
    // Export children
    obj.children.forEach((child) => {
      usda += this.exportObject(child, indentLevel + 1);
    });
    
    usda += `${indent}}\n\n`;
    return usda;
  }
  
  /**
   * Export mesh data
   */
  private exportMeshData(mesh: Mesh, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    const geom = mesh.geometry;
    
    if (!geom) return '';
    
    let usda = `${indent}def Mesh "mesh"\n`;
    usda += `${indent}{\n`;
    
    // Extract vertices
    const positions = geom.attributes.position.array as Float32Array;
    const vertexCount = positions.length / 3;
    
    usda += `${indent}  int[] faceVertexCounts = [${[...Array(vertexCount / 3)].map(() => '3').join(', ')}]\n`;
    usda += `${indent}  int[] faceVertexIndices = [`;
    
    const indices: number[] = [];
    for (let i = 0; i < vertexCount; i++) {
      indices.push(i);
    }
    usda += indices.join(', ');
    usda += ']\n';
    
    usda += `${indent}  point3f[] points = [`;
    const points: string[] = [];
    for (let i = 0; i < vertexCount; i++) {
      points.push(`(${positions[i * 3].toFixed(4)}, ${positions[i * 3 + 1].toFixed(4)}, ${positions[i * 3 + 2].toFixed(4)})`);
    }
    usda += points.join(', ');
    usda += ']\n';
    
    usda += `${indent}}\n`;
    return usda;
  }
}

/**
 * Unified physics exporter factory
 */
export class PhysicsExporterFactory {
  /**
   * Create exporter for specified format
   */
  static createExporter(
    format: 'mjcf' | 'urdf' | 'usd',
    config?: Partial<PhysicsExportConfig>
  ): MJCFExporter | URDFExporter | USDExporter {
    switch (format) {
      case 'mjcf':
        return new MJCFExporter(config);
      case 'urdf':
        return new URDFExporter(config);
      case 'usd':
        return new USDExporter(config);
      default:
        throw new Error(`Unknown format: ${format}`);
    }
  }
  
  /**
   * Export scene to multiple formats
   */
  static exportAllFormats(
    scene: Scene,
    basePath: string,
    config?: Partial<PhysicsExportConfig>
  ): Map<string, string> {
    const results = new Map<string, string>();
    
    const mjcf = new MJCFExporter(config);
    results.set('mjcf', mjcf.export(scene, `${basePath}/scene.xml`));
    
    const urdf = new URDFExporter(config);
    results.set('urdf', urdf.export(scene, 'robot'));
    
    const usd = new USDExporter(config);
    results.set('usd', usd.export(scene, `${basePath}/scene.usda`));
    
    return results;
  }
}
