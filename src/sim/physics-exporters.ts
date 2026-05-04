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

import { Scene, Object3D, Mesh, BoxGeometry, Vector3, Quaternion, Euler, Group } from 'three';

// Extend the local JointType to include additional types used in articulated objects
// without conflicting with the physics-exporters internal definition.
type ExtendedJointType = JointType | 'hinge' | 'ball_socket';

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
   * Uses mesh name reference when geometry is a mesh type: <geom type="mesh" mesh="name"/>
   */
  private exportCollisionGeom(obj: Object3D, props: RigidBodyProps): string {
    const mesh = obj as Mesh;
    const geomType = this.inferGeomType(mesh);
    const meshName = obj.name || `mesh_${obj.id}`;
    
    let xml = '      <geom ';
    
    if (geomType === 'mesh') {
      xml += `type="mesh" mesh="${meshName}" `;
    } else {
      xml += `type="${geomType}" `;
      // Add size for box, radius for sphere/cylinder
      if (geomType === 'box' && mesh.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        if (bbox) {
          const size = new Vector3();
          bbox.getSize(size);
          xml += `size="${(size.x/2).toFixed(4)} ${(size.y/2).toFixed(4)} ${(size.z/2).toFixed(4)}" `;
        }
      }
    }
    
    if (!props.isStatic) {
      xml += `mass="${props.mass.toFixed(4)}" `;
      xml += `friction="${props.friction}" `;
      xml += `restitution="${props.restitution}" `;
    }
    
    xml += '/>\n';
    return xml;
  }
  
  /**
   * Export visual geometry
   * Uses mesh name reference when geometry is a mesh type: <geom type="mesh" mesh="name"/>
   */
  private exportVisualGeom(obj: Object3D): string {
    const mesh = obj as Mesh;
    const geomType = this.inferGeomType(mesh);
    const meshName = obj.name || `mesh_${obj.id}`;
    
    let xml = '      <geom ';
    
    if (geomType === 'mesh') {
      xml += `type="mesh" mesh="${meshName}" `;
    } else {
      xml += `type="${geomType}" `;
      // Add size for box, radius for sphere/cylinder
      if (geomType === 'box' && mesh.geometry) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bbox = mesh.geometry.boundingBox;
        if (bbox) {
          const size = new Vector3();
          bbox.getSize(size);
          xml += `size="${(size.x/2).toFixed(4)} ${(size.y/2).toFixed(4)} ${(size.z/2).toFixed(4)}" `;
        }
      }
    }
    
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
   * Reads joint metadata from obj.userData.joint to determine the correct type.
   * Supports: hinge → hinge, prismatic → slide, ball_socket → ball, fixed → fixed, continuous → hinge (unlimited)
   */
  private exportJoint(obj: Object3D): string {
    const joint = obj.userData?.joint as (JointProps & { type: ExtendedJointType }) | undefined;

    // If no joint metadata, default to fixed
    if (!joint) {
      return '      <joint type="fixed"/>\n';
    }

    // Map joint type to MJCF type
    let mjcfType: string;
    let limited = true;
    switch (joint.type as ExtendedJointType) {
      case 'revolute':
      case 'hinge':
        mjcfType = 'hinge';
        break;
      case 'continuous':
        mjcfType = 'hinge';
        limited = false;
        break;
      case 'prismatic':
        mjcfType = 'slide';
        break;
      case 'ball':
      case 'ball_socket':
        mjcfType = 'ball';
        break;
      case 'fixed':
      default:
        return '      <joint type="fixed"/>\n';
    }

    const jointName = obj.name || `joint_${obj.id}`;
    const axis = joint.axis || new Vector3(0, 0, 1);
    const origin = joint.origin || new Vector3();

    let xml = `      <joint name="${jointName}" type="${mjcfType}"`;
    xml += ` axis="${axis.x.toFixed(4)} ${axis.y.toFixed(4)} ${axis.z.toFixed(4)}"`;
    xml += ` pos="${origin.x.toFixed(4)} ${origin.y.toFixed(4)} ${origin.z.toFixed(4)}"`;

    // Range (limits)
    if (limited && joint.lowerLimit !== undefined && joint.upperLimit !== undefined) {
      xml += ` range="${joint.lowerLimit.toFixed(4)} ${joint.upperLimit.toFixed(4)}"`;
    } else if (!limited) {
      xml += ` limited="false"`;
    }

    // Damping
    if (joint.damping > 0) {
      xml += ` damping="${joint.damping.toFixed(4)}"`;
    }

    // Friction
    if (joint.friction > 0) {
      xml += ` friction="${joint.friction.toFixed(4)}"`;
    }

    xml += '/>\n';
    return xml;
  }
  
  /**
   * Export actuators section
   * Generates <motor> elements for all actuated joints found in the scene.
   * Looks for obj.userData.joint.actuated or obj.userData.joint.motor config.
   */
  private exportActuators(scene: Scene): string {
    const actuators: { jointName: string; ctrlRange: [number, number]; gearRatio: number }[] = [];

    scene.traverse((obj) => {
      const joint = obj.userData?.joint as JointProps | undefined;
      if (!joint) return;

      // Only add actuators for non-fixed, actuated joints
      if (joint.type === 'fixed') return;

      const isActuated = obj.userData?.actuated ?? obj.userData?.motor !== undefined;
      if (!isActuated) return;

      const jointName = obj.name || `joint_${obj.id}`;
      const motor = obj.userData?.motor as { ctrlRange?: [number, number]; gearRatio?: number } | undefined;

      const ctrlRange: [number, number] = motor?.ctrlRange ?? [
        joint.lowerLimit ?? -1,
        joint.upperLimit ?? 1,
      ];
      const gearRatio = motor?.gearRatio ?? 1;

      actuators.push({ jointName, ctrlRange, gearRatio });
    });

    if (actuators.length === 0) {
      return '  <actuator>\n  </actuator>\n\n';
    }

    let xml = '  <actuator>\n';
    for (const act of actuators) {
      xml += `    <motor name="${act.jointName}_motor" joint="${act.jointName}" `;
      xml += `ctrlrange="${act.ctrlRange[0].toFixed(4)} ${act.ctrlRange[1].toFixed(4)}" `;
      xml += `ctrllimited="true" gear="${act.gearRatio}"/>\n`;
    }
    xml += '  </actuator>\n\n';
    return xml;
  }
  
  /**
   * Export sensors section
   * Generates jointpos and jointvel sensors for all non-fixed joints.
   */
  private exportSensors(scene: Scene): string {
    const sensors: { jointName: string }[] = [];

    scene.traverse((obj) => {
      const joint = obj.userData?.joint as JointProps | undefined;
      if (!joint) return;
      if (joint.type === 'fixed') return;

      const jointName = obj.name || `joint_${obj.id}`;
      sensors.push({ jointName });
    });

    if (sensors.length === 0) {
      return '  <sensor>\n  </sensor>\n\n';
    }

    let xml = '  <sensor>\n';
    for (const sensor of sensors) {
      xml += `    <jointpos joint="${sensor.jointName}"/>\n`;
      xml += `    <jointvel joint="${sensor.jointName}"/>\n`;
    }
    xml += '  </sensor>\n\n';
    return xml;
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
   * Reads joint metadata from obj.userData.joint to determine the correct type.
   * Supports: revolute, continuous, prismatic, fixed, ball/floating
   */
  private exportJointURDF(parent: string, child: string, obj: Object3D): string {
    const jointName = `joint_${parent}_to_${child}`;
    const joint = obj.userData?.joint as (JointProps & { type: ExtendedJointType }) | undefined;

    // Determine URDF joint type
    let urdfType = 'fixed';
    if (joint) {
      switch (joint.type as ExtendedJointType) {
        case 'revolute':
        case 'hinge':
          urdfType = 'revolute';
          break;
        case 'continuous':
          urdfType = 'continuous';
          break;
        case 'prismatic':
          urdfType = 'prismatic';
          break;
        case 'ball':
        case 'ball_socket':
          urdfType = 'floating'; // URDF doesn't have ball, use floating
          break;
        case 'fixed':
        default:
          urdfType = 'fixed';
          break;
      }
    }

    let xml = `  <joint name="${jointName}" type="${urdfType}">\n`;
    xml += `    <parent link="${parent}"/>\n`;
    xml += `    <child link="${child}"/>\n`;
    xml += `    <origin xyz="${obj.position.x.toFixed(4)} ${obj.position.y.toFixed(4)} ${obj.position.z.toFixed(4)}"/>\n`;

    // Add axis for non-fixed, non-ball joints
    if (joint && urdfType !== 'fixed' && urdfType !== 'floating') {
      const axis = joint.axis || new Vector3(0, 0, 1);
      xml += `    <axis xyz="${axis.x.toFixed(4)} ${axis.y.toFixed(4)} ${axis.z.toFixed(4)}"/>\n`;
    }

    // Add limits for revolute and prismatic
    if (joint && (urdfType === 'revolute' || urdfType === 'prismatic')) {
      if (joint.lowerLimit !== undefined && joint.upperLimit !== undefined) {
        xml += `    <limit lower="${joint.lowerLimit.toFixed(4)}" upper="${joint.upperLimit.toFixed(4)}"`;
        if (joint.maxVelocity !== undefined) {
          xml += ` velocity="${joint.maxVelocity.toFixed(4)}"`;
        }
        if (joint.maxEffort !== undefined) {
          xml += ` effort="${joint.maxEffort.toFixed(4)}"`;
        }
        xml += `/>\n`;
      }
    }

    // Add damping/friction
    if (joint && (joint.damping > 0 || joint.friction > 0)) {
      xml += `    <dynamics`;
      if (joint.damping > 0) xml += ` damping="${joint.damping.toFixed(4)}"`;
      if (joint.friction > 0) xml += ` friction="${joint.friction.toFixed(4)}"`;
      xml += `/>\n`;
    }

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
   * Now includes USD Physics schema when includeCollisions is true.
   */
  export(scene: Scene, filename?: string): string {
    const outputPath = filename || `${this.config.outputPath}/scene.usda`;
    
    let usda = '#usda 1.0\n\n';
    usda += `(defaultPrim "scene")\n\n`;
    
    // Add physics schema declarations if collisions are included
    if (this.config.includeCollisions) {
      usda += `class PhysicsRigidBody "PhysicsRigidBody"\n{\n`;
      usda += `  float physics:mass = 0.0\n`;
      usda += `  bool physics:rigidBodyEnabled = true\n`;
      usda += `  float3 physics:velocity = (0.0, 0.0, 0.0)\n`;
      usda += `  float3 physics:angularVelocity = (0.0, 0.0, 0.0)\n`;
      usda += `}\n\n`;
      
      usda += `class PhysicsCollision "PhysicsCollision"\n{\n`;
      usda += `  float physics:collisionMargin = ${this.config.collisionMargin.toFixed(4)}\n`;
      usda += `}\n\n`;
      
      usda += `class PhysicsRevoluteJoint "PhysicsRevoluteJoint"\n{\n`;
      usda += `  float physics:lowerLimit = -3.14159\n`;
      usda += `  float physics:upperLimit = 3.14159\n`;
      usda += `  float physics:damping = 0.0\n`;
      usda += `  float physics:stiffness = 0.0\n`;
      usda += `  float3 physics:axis = (0.0, 0.0, 1.0)\n`;
      usda += `}\n\n`;
      
      usda += `class PhysicsPrismaticJoint "PhysicsPrismaticJoint"\n{\n`;
      usda += `  float physics:lowerLimit = -1.0\n`;
      usda += `  float physics:upperLimit = 1.0\n`;
      usda += `  float physics:damping = 0.0\n`;
      usda += `  float physics:stiffness = 0.0\n`;
      usda += `  float3 physics:axis = (0.0, 0.0, 1.0)\n`;
      usda += `}\n\n`;
      
      usda += `class PhysicsFixedJoint "PhysicsFixedJoint"\n{\n`;
      usda += `}\n\n`;
      
      usda += `class PhysicsBallJoint "PhysicsBallJoint"\n{\n`;
      usda += `  float physics:damping = 0.0\n`;
      usda += `  float physics:stiffness = 0.0\n`;
      usda += `}\n\n`;
    }
    
    usda += `def Xform "scene"\n`;
    usda += `{\n`;
    
    // Export all objects
    scene.children.forEach((obj) => {
      usda += this.exportObject(obj, 1);
    });
    
    // Export joints if collisions included
    if (this.config.includeCollisions) {
      usda += this.exportPhysicsJoints(scene, 1);
    }
    
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
    
    // Add physics schema prims if collisions are included
    if (this.config.includeCollisions) {
      usda += this.exportPhysicsPrims(obj, indentLevel + 1);
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
  
  /**
   * Export USD Physics schema prims for an object.
   * Reads physics metadata from obj.userData.physics and obj.userData.joint.
   * Generates PhysicsRigidBody, PhysicsCollision, and PhysicsMassProperties prims.
   */
  private exportPhysicsPrims(obj: Object3D, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    let usda = '';
    
    // Read physics metadata from userData (set by SimFactory)
    const physicsData = obj.userData?.physics as {
      mass?: number;
      inertia?: { x: number; y: number; z: number };
      friction?: number;
      restitution?: number;
      isStatic?: boolean;
      collisionShape?: string;
      velocity?: { x: number; y: number; z: number };
      angularVelocity?: { x: number; y: number; z: number };
    } | undefined;
    
    // If no physics data, compute from mesh geometry
    const rbProps = this.calculateUSDPhysicsProps(obj, physicsData);
    
    // PhysicsRigidBody prim
    usda += `${indent}def PhysicsRigidBody "physics_rigid_body"\n`;
    usda += `${indent}{\n`;
    usda += `${indent}  float physics:mass = ${rbProps.mass.toFixed(6)}\n`;
    usda += `${indent}  bool physics:rigidBodyEnabled = true\n`;
    if (rbProps.velocity) {
      usda += `${indent}  float3 physics:velocity = (${rbProps.velocity.x.toFixed(4)}, ${rbProps.velocity.y.toFixed(4)}, ${rbProps.velocity.z.toFixed(4)})\n`;
    }
    if (rbProps.angularVelocity) {
      usda += `${indent}  float3 physics:angularVelocity = (${rbProps.angularVelocity.x.toFixed(4)}, ${rbProps.angularVelocity.y.toFixed(4)}, ${rbProps.angularVelocity.z.toFixed(4)})\n`;
    }
    if (rbProps.isStatic) {
      usda += `${indent}  bool physics:kinematicEnabled = true\n`;
    }
    usda += `${indent}}\n`;
    
    // PhysicsMassProperties prim
    usda += `${indent}def PhysicsMassProperties "mass_properties"\n`;
    usda += `${indent}{\n`;
    usda += `${indent}  float3 physics:diagonalInertia = (${rbProps.inertia.x.toFixed(6)}, ${rbProps.inertia.y.toFixed(6)}, ${rbProps.inertia.z.toFixed(6)})\n`;
    usda += `${indent}  float3 physics:centerOfMass = (0.0, 0.0, 0.0)\n`;
    usda += `${indent}  float3 physics:principalAxes = (1.0, 0.0, 0.0)\n`;
    usda += `${indent}}\n`;
    
    // PhysicsCollision prim
    if (obj instanceof Mesh && obj.geometry) {
      usda += `${indent}def PhysicsCollision "collision"\n`;
      usda += `${indent}{\n`;
      usda += `${indent}  float physics:collisionMargin = ${this.config.collisionMargin.toFixed(4)}\n`;
      const collisionShape = physicsData?.collisionShape || this.inferUSDGeomType(obj as Mesh);
      usda += `${indent}  uniform token physics:collisionShape = "${collisionShape}"\n`;
      usda += `${indent}  float physics:friction = ${rbProps.friction.toFixed(4)}\n`;
      usda += `${indent}  float physics:restitution = ${rbProps.restitution.toFixed(4)}\n`;
      usda += `${indent}}\n`;
    }
    
    return usda;
  }
  
  /**
   * Export USD Physics joints for the entire scene.
   * Reads joint metadata from obj.userData.joint.
   */
  private exportPhysicsJoints(scene: Scene, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    let usda = '';
    const joints: {
      name: string;
      type: string;
      parent: string;
      child: string;
      props: JointProps & { type: ExtendedJointType };
    }[] = [];
    
    scene.traverse((obj) => {
      const joint = obj.userData?.joint as (JointProps & { type: ExtendedJointType }) | undefined;
      if (!joint || joint.type === 'fixed') return;
      
      const jointName = obj.name || `joint_${obj.id}`;
      const parentName = obj.parent?.name || 'scene';
      const childName = obj.children[0]?.name || `link_${obj.id}`;
      
      joints.push({
        name: jointName,
        type: joint.type as string,
        parent: parentName,
        child: childName,
        props: joint,
      });
    });
    
    if (joints.length === 0) return '';
    
    usda += `${indent}# Physics Joints\n`;
    
    for (const joint of joints) {
      const origin = joint.props.origin || new Vector3();
      const axis = joint.props.axis || new Vector3(0, 0, 1);
      
      // Determine USD joint type
      let usdJointType: string;
      let jointClass: string;
      switch (joint.type as ExtendedJointType) {
        case 'revolute':
        case 'hinge':
          usdJointType = 'PhysicsRevoluteJoint';
          jointClass = 'PhysicsRevoluteJoint';
          break;
        case 'continuous':
          usdJointType = 'PhysicsRevoluteJoint';
          jointClass = 'PhysicsRevoluteJoint';
          break;
        case 'prismatic':
          usdJointType = 'PhysicsPrismaticJoint';
          jointClass = 'PhysicsPrismaticJoint';
          break;
        case 'ball':
        case 'ball_socket':
          usdJointType = 'PhysicsBallJoint';
          jointClass = 'PhysicsBallJoint';
          break;
        default:
          usdJointType = 'PhysicsFixedJoint';
          jointClass = 'PhysicsFixedJoint';
          break;
      }
      
      usda += `${indent}def ${jointClass} "${joint.name}"\n`;
      usda += `${indent}{\n`;
      usda += `${indent}  rel physics:body0 = </scene/${joint.parent}>\n`;
      usda += `${indent}  rel physics:body1 = </scene/${joint.child}>\n`;
      usda += `${indent}  float3 physics:localPos0 = (${origin.x.toFixed(4)}, ${origin.y.toFixed(4)}, ${origin.z.toFixed(4)})\n`;
      usda += `${indent}  float3 physics:localPos1 = (0.0, 0.0, 0.0)\n`;
      
      // Joint-type-specific properties
      if (usdJointType === 'PhysicsRevoluteJoint') {
        const lower = joint.props.lowerLimit ?? -3.14159;
        const upper = joint.props.upperLimit ?? (joint.type === 'continuous' ? 3.14159 : joint.props.upperLimit ?? 3.14159);
        usda += `${indent}  float physics:lowerLimit = ${lower.toFixed(6)}\n`;
        usda += `${indent}  float physics:upperLimit = ${upper.toFixed(6)}\n`;
        usda += `${indent}  float3 physics:axis = (${axis.x.toFixed(4)}, ${axis.y.toFixed(4)}, ${axis.z.toFixed(4)})\n`;
      } else if (usdJointType === 'PhysicsPrismaticJoint') {
        const lower = joint.props.lowerLimit ?? -1.0;
        const upper = joint.props.upperLimit ?? 1.0;
        usda += `${indent}  float physics:lowerLimit = ${lower.toFixed(6)}\n`;
        usda += `${indent}  float physics:upperLimit = ${upper.toFixed(6)}\n`;
        usda += `${indent}  float3 physics:axis = (${axis.x.toFixed(4)}, ${axis.y.toFixed(4)}, ${axis.z.toFixed(4)})\n`;
      }
      
      // Damping and stiffness
      if (joint.props.damping > 0) {
        usda += `${indent}  float physics:damping = ${joint.props.damping.toFixed(6)}\n`;
      }
      if (joint.props.friction > 0) {
        usda += `${indent}  float physics:stiffness = 0.0\n`;
      }
      
      // Break force
      if (joint.props.maxEffort !== undefined) {
        usda += `${indent}  float physics:breakForce = ${joint.props.maxEffort.toFixed(4)}\n`;
      }
      
      usda += `${indent}}\n\n`;
    }
    
    return usda;
  }
  
  /**
   * Calculate physics properties for USD export.
   * Uses userData.physics if available, otherwise computes from geometry.
   */
  private calculateUSDPhysicsProps(
    obj: Object3D,
    physicsData: {
      mass?: number;
      inertia?: { x: number; y: number; z: number };
      friction?: number;
      restitution?: number;
      isStatic?: boolean;
      collisionShape?: string;
      velocity?: { x: number; y: number; z: number };
      angularVelocity?: { x: number; y: number; z: number };
    } | undefined
  ): {
    mass: number;
    inertia: { x: number; y: number; z: number };
    friction: number;
    restitution: number;
    isStatic: boolean;
    velocity: { x: number; y: number; z: number } | null;
    angularVelocity: { x: number; y: number; z: number } | null;
  } {
    const mesh = obj as Mesh;
    const massConfig = this.config.massProperties;
    
    let mass = physicsData?.mass ?? massConfig.defaultMass;
    let inertia = physicsData?.inertia ?? { x: 1, y: 1, z: 1 };
    
    if (!physicsData?.mass && mesh.geometry && massConfig.useMeshVolume) {
      const bbox = mesh.geometry.boundingBox;
      if (bbox) {
        const size = new Vector3();
        bbox.getSize(size);
        const volume = size.x * size.y * size.z;
        mass = volume * massConfig.density;
        inertia = {
          x: (mass / 12) * (size.y * size.y + size.z * size.z),
          y: (mass / 12) * (size.x * size.x + size.z * size.z),
          z: (mass / 12) * (size.x * size.x + size.y * size.y),
        };
      }
    }
    
    return {
      mass,
      inertia,
      friction: physicsData?.friction ?? 0.5,
      restitution: physicsData?.restitution ?? 0.1,
      isStatic: physicsData?.isStatic ?? (mass < 0.001),
      velocity: physicsData?.velocity ?? null,
      angularVelocity: physicsData?.angularVelocity ?? null,
    };
  }
  
  /**
   * Infer USD collision geometry type from mesh
   */
  private inferUSDGeomType(mesh: Mesh): string {
    const geom = mesh.geometry;
    if (!geom) return 'convexHull';
    if (geom.type === 'BoxGeometry') return 'box';
    if (geom.type === 'SphereGeometry') return 'sphere';
    if (geom.type === 'CylinderGeometry') return 'cylinder';
    if (geom.type === 'CapsuleGeometry') return 'capsule';
    return 'convexHull';
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
