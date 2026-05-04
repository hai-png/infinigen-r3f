/**
 * SimulationExporter — Export scene to simulation formats
 *
 * Supports:
 * - MJCF (MuJoCo XML) export for articulated objects with joint definitions
 * - URDF (Unified Robot Description Format) for ROS simulation
 * - Both use Python bridge (HybridBridge) for XML generation with JS fallback
 */

import * as THREE from 'three';
import { HybridBridge } from '@/integration/bridge/hybrid-bridge';
import type { PhysicsConfig, MeshData } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArticulatedBody {
  id: string;
  name: string;
  meshes: THREE.Mesh[];
  joints: JointDefinition[];
  mass: number;
  centerOfMass: THREE.Vector3;
}

export interface JointDefinition {
  name: string;
  type: 'hinge' | 'slider' | 'ball' | 'fixed';
  axis: THREE.Vector3;
  limits?: { min: number; max: number };
  damping?: number;
  parentLink: string;
  childLink: string;
  origin: THREE.Vector3;
}

export interface SimulationExportOptions {
  format: 'mjcf' | 'urdf';
  simplifyCollisionMeshes: boolean;
  collisionSimplificationRatio: number;
  estimateInertia: boolean;
  includeVisualMeshes: boolean;
  includeCollisionMeshes: boolean;
  gravity: [number, number, number];
  timestep: number;
}

export interface SimulationExportResult {
  success: boolean;
  xml: string;
  filename: string;
  warnings: string[];
  errors: string[];
}

const DEFAULT_OPTIONS: SimulationExportOptions = {
  format: 'mjcf',
  simplifyCollisionMeshes: true,
  collisionSimplificationRatio: 0.25,
  estimateInertia: true,
  includeVisualMeshes: true,
  includeCollisionMeshes: true,
  gravity: [0, -9.81, 0],
  timestep: 0.002,
};

// ---------------------------------------------------------------------------
// SimulationExporter class
// ---------------------------------------------------------------------------

export class SimulationExporter {
  private bridge: HybridBridge;

  constructor() {
    this.bridge = HybridBridge.getInstance();
  }

  /**
   * Export scene to MJCF (MuJoCo) format
   */
  async exportMJCF(
    scene: THREE.Scene,
    options: Partial<SimulationExportOptions> = {}
  ): Promise<SimulationExportResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options, format: 'mjcf' as const };
    return this.exportSimulation(scene, opts);
  }

  /**
   * Export scene to URDF format
   */
  async exportURDF(
    scene: THREE.Scene,
    options: Partial<SimulationExportOptions> = {}
  ): Promise<SimulationExportResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options, format: 'urdf' as const };
    return this.exportSimulation(scene, opts);
  }

  // -----------------------------------------------------------------------
  // Core export logic
  // -----------------------------------------------------------------------

  private async exportSimulation(
    scene: THREE.Scene,
    opts: SimulationExportOptions
  ): Promise<SimulationExportResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Extract articulated bodies from scene
      const bodies = this.extractArticulatedBodies(scene, warnings);

      // Build physics config
      const config = this.buildPhysicsConfig(bodies, opts);

      // Try Python bridge first
      let xml: string | null = null;

      if (HybridBridge.isConnected()) {
        try {
          xml = await this.bridge.exportMjcf(config);
        } catch (err) {
          // Silently fall back - Python bridge failed, using JS fallback
          if (process.env.NODE_ENV === 'development') console.debug('[SimulationExporter] Python bridge MJCF fallback:', err);
          warnings.push('Python bridge failed, using JS fallback');
        }
      }

      // Fallback to JS generation
      if (!xml) {
        xml = opts.format === 'mjcf'
          ? this.generateMJCF(config, opts, warnings)
          : this.generateURDF(config, opts, warnings);
      }

      return {
        success: true,
        xml,
        filename: opts.format === 'mjcf' ? 'scene.xml' : 'scene.urdf',
        warnings,
        errors,
      };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return {
        success: false,
        xml: '',
        filename: '',
        warnings,
        errors,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Scene analysis
  // -----------------------------------------------------------------------

  private extractArticulatedBodies(scene: THREE.Scene, warnings: string[]): ArticulatedBody[] {
    const bodies: ArticulatedBody[] = [];

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const userData = child.userData;
      const isArticulated = userData?.articulated || userData?.jointType || userData?.joints;

      if (isArticulated) {
        const body = this.parseArticulatedBody(child, warnings);
        if (body) bodies.push(body);
      }
    });

    // If no articulated bodies found, treat all meshes as rigid bodies
    if (bodies.length === 0) {
      const rigidBodies = this.extractRigidBodies(scene);
      bodies.push(...rigidBodies);
    }

    return bodies;
  }

  private parseArticulatedBody(mesh: THREE.Mesh, warnings: string[]): ArticulatedBody | null {
    const userData = mesh.userData;
    const joints: JointDefinition[] = [];

    // Parse joint data from userData
    if (userData.joints && Array.isArray(userData.joints)) {
      for (const j of userData.joints) {
        joints.push({
          name: j.name || `joint_${joints.length}`,
          type: j.type || 'hinge',
          axis: j.axis ? new THREE.Vector3(j.axis[0], j.axis[1], j.axis[2]) : new THREE.Vector3(0, 0, 1),
          limits: j.limits,
          damping: j.damping,
          parentLink: j.parentLink || 'base',
          childLink: j.childLink || mesh.name || `link_${joints.length}`,
          origin: j.origin ? new THREE.Vector3(j.origin[0], j.origin[1], j.origin[2]) : new THREE.Vector3(),
        });
      }
    } else if (userData.jointType) {
      joints.push({
        name: `joint_0`,
        type: userData.jointType,
        axis: userData.jointAxis
          ? new THREE.Vector3(userData.jointAxis[0], userData.jointAxis[1], userData.jointAxis[2])
          : new THREE.Vector3(0, 0, 1),
        limits: userData.jointLimits,
        parentLink: 'base',
        childLink: mesh.name || 'link_0',
        origin: new THREE.Vector3(),
      });
    }

    if (joints.length === 0) {
      warnings.push(`Mesh '${mesh.name}' marked as articulated but has no joints`);
      return null;
    }

    return {
      id: mesh.uuid,
      name: mesh.name || 'articulated_body',
      meshes: [mesh],
      joints,
      mass: userData.mass || 1.0,
      centerOfMass: new THREE.Vector3(),
    };
  }

  private extractRigidBodies(scene: THREE.Scene): ArticulatedBody[] {
    const bodies: ArticulatedBody[] = [];
    let index = 0;

    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.userData?.articulated) return;

      const mesh = child as THREE.Mesh;
      bodies.push({
        id: mesh.uuid,
        name: mesh.name || `body_${index++}`,
        meshes: [mesh],
        joints: [],
        mass: mesh.userData?.mass || this.estimateMass(mesh),
        centerOfMass: new THREE.Vector3(),
      });
    });

    return bodies;
  }

  private estimateMass(mesh: THREE.Mesh): number {
    // Rough mass estimation based on bounding volume
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (!box) return 1.0;

    const size = new THREE.Vector3();
    box.getSize(size);
    // Assume density of 1000 kg/m³ (water-like)
    return size.x * size.y * size.z * 1000 * 0.001; // Scaled down for reasonable values
  }

  // -----------------------------------------------------------------------
  // Physics config builder
  // -----------------------------------------------------------------------

  private buildPhysicsConfig(bodies: ArticulatedBody[], opts: SimulationExportOptions): PhysicsConfig {
    return {
      sceneId: 'infinigen_scene',
      objects: bodies.map((body) => ({
        id: body.id,
        name: body.name,
        mesh: this.meshToMeshData(body.meshes[0]),
        mass: body.mass,
        friction: 0.5,
        restitution: 0.1,
        pose: {
          position: [
            body.meshes[0].position.x,
            body.meshes[0].position.y,
            body.meshes[0].position.z,
          ] as [number, number, number],
          rotation: [0, 0, 0, 1] as [number, number, number, number],
        },
        joints: body.joints.map((j) => ({
          name: j.name,
          type: j.type,
          axis: [j.axis.x, j.axis.y, j.axis.z] as [number, number, number],
          limits: j.limits,
          damping: j.damping,
          parentLink: j.parentLink,
          childLink: j.childLink,
        })),
      })),
      gravity: opts.gravity,
      timestep: opts.timestep,
      solverIterations: 50,
    };
  }

  private meshToMeshData(mesh: THREE.Mesh): MeshData {
    const geo = mesh.geometry;
    const positions = geo.attributes.position;
    const normals = geo.attributes.normal;
    const uvs = geo.attributes.uv;
    const indices = geo.index;

    const vertices: number[] = [];
    const faces: number[] = [];
    const normalData: number[] = [];
    const uvData: number[] = [];

    if (positions) {
      for (let i = 0; i < positions.count; i++) {
        vertices.push(positions.getX(i), positions.getY(i), positions.getZ(i));
      }
    }

    if (normals) {
      for (let i = 0; i < normals.count; i++) {
        normalData.push(normals.getX(i), normals.getY(i), normals.getZ(i));
      }
    }

    if (uvs) {
      for (let i = 0; i < uvs.count; i++) {
        uvData.push(uvs.getX(i), uvs.getY(i));
      }
    }

    if (indices) {
      for (let i = 0; i < indices.count; i++) {
        faces.push(indices.getX(i));
      }
    }

    return {
      vertices,
      faces,
      normals: normalData.length > 0 ? normalData : undefined,
      uvs: uvData.length > 0 ? uvData : undefined,
    };
  }

  // -----------------------------------------------------------------------
  // MJCF generation (JS fallback)
  // -----------------------------------------------------------------------

  private generateMJCF(
    config: PhysicsConfig,
    opts: SimulationExportOptions,
    warnings: string[]
  ): string {
    const lines: string[] = [];
    const selfClose = ' />';

    lines.push('<mujoco model="' + config.sceneId + '">');
    lines.push('  <compiler angle="radian" coordinate="local"' + selfClose);
    lines.push('  <option gravity="' + config.gravity.join(' ') + '" timestep="' + config.timestep + '"' + selfClose);
    lines.push('');
    lines.push('  <default>');
    lines.push('    <geom friction="0.5 0.005 0.005" condim="4"' + selfClose);
    lines.push('    <joint damping="0.1" armature="0.01"' + selfClose);
    lines.push('  </default>');
    lines.push('');
    lines.push('  <worldbody>');

    for (const obj of config.objects) {
      const posStr = obj.pose.position.join(' ');
      const objName = obj.name || obj.id;
      lines.push('    <body name="' + objName + '" pos="' + posStr + '">');

      if (opts.includeVisualMeshes || opts.includeCollisionMeshes) {
        const geomType = this.inferGeomType(obj.mesh);
        const sizeStr = this.inferGeomSize(obj.mesh);
        lines.push('      <geom type="' + geomType + '" size="' + sizeStr + '" mass="' + obj.mass + '"' + selfClose);
      }

      if (obj.joints && obj.joints.length > 0) {
        for (const joint of obj.joints) {
          const axisStr = (joint.axis || [0, 0, 1]).join(' ');
          const jName = joint.name || 'joint';
          let jointDef = '      <joint name="' + jName + '" type="' + joint.type + '" axis="' + axisStr + '"';
          if (joint.limits) {
            jointDef += ' range="' + joint.limits.min + ' ' + joint.limits.max + '"';
          }
          if (joint.damping) {
            jointDef += ' damping="' + joint.damping + '"';
          }
          jointDef += selfClose;
          lines.push(jointDef);
        }
      }

      lines.push('    </body>');
    }

    lines.push('  </worldbody>');
    lines.push('');
    lines.push('  <actuator>');
    for (const obj of config.objects) {
      if (obj.joints) {
        for (const joint of obj.joints) {
          const jName = joint.name || 'joint';
          lines.push('    <motor name="' + jName + '_motor" joint="' + jName + '"' + selfClose);
        }
      }
    }
    lines.push('  </actuator>');
    lines.push('</mujoco>');

    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // URDF generation (JS fallback)
  // -----------------------------------------------------------------------

  private generateURDF(
    config: PhysicsConfig,
    opts: SimulationExportOptions,
    warnings: string[]
  ): string {
    const lines: string[] = [];
    const selfClose = ' />';

    lines.push('<?xml version="1.0"?>');
    lines.push('  <robot name="' + config.sceneId + '">');

    for (const obj of config.objects) {
      const posStr = obj.pose.position.join(' ');
      const rotStr = obj.pose.rotation.join(' ');
      const objName = obj.name || obj.id;

      lines.push('  <link name="' + objName + '">');

      if (opts.includeVisualMeshes) {
        lines.push('    <visual>');
        lines.push('      <origin xyz="' + posStr + '" rpy="' + rotStr + '"' + selfClose);
        lines.push('      <geometry>');
        lines.push('        <mesh filename="' + objName + '.obj"' + selfClose);
        lines.push('      </geometry>');
        lines.push('    </visual>');
      }

      if (opts.includeCollisionMeshes) {
        lines.push('    <collision>');
        lines.push('      <origin xyz="' + posStr + '" rpy="' + rotStr + '"' + selfClose);
        if (opts.simplifyCollisionMeshes) {
          lines.push('      <geometry>');
          lines.push('        <mesh filename="' + objName + '_collision.obj"' + selfClose);
          lines.push('      </geometry>');
        } else {
          lines.push('      <geometry>');
          lines.push('        <mesh filename="' + objName + '.obj"' + selfClose);
          lines.push('      </geometry>');
        }
        lines.push('    </collision>');
      }

      if (opts.estimateInertia) {
        const ixx = obj.mass * 0.01;
        const iyy = obj.mass * 0.01;
        const izz = obj.mass * 0.01;
        lines.push('    <inertial>');
        lines.push('      <mass value="' + obj.mass + '"' + selfClose);
        lines.push('      <inertia ixx="' + ixx + '" ixy="0" ixz="0" iyy="' + iyy + '" iyz="0" izz="' + izz + '"' + selfClose);
        lines.push('    </inertial>');
      }

      lines.push('  </link>');

      if (obj.joints && obj.joints.length > 0) {
        for (const joint of obj.joints) {
          const jointType = joint.type === 'hinge' ? 'revolute' :
                           joint.type === 'slider' ? 'prismatic' :
                           joint.type === 'ball' ? 'continuous' : 'fixed';
          const jName = joint.name || 'joint';

          lines.push('  <joint name="' + jName + '" type="' + jointType + '">');
          const axisStr = (joint.axis || [0, 0, 1]).join(' ');
          lines.push('    <axis xyz="' + axisStr + '"' + selfClose);
          lines.push('    <parent link="' + (joint.parentLink || 'base') + '"' + selfClose);
          lines.push('    <child link="' + (joint.childLink || objName) + '"' + selfClose);
          if (joint.limits) {
            lines.push('    <limit lower="' + joint.limits.min + '" upper="' + joint.limits.max + '" effort="100" velocity="1"' + selfClose);
          }
          if (joint.damping) {
            lines.push('    <dynamics damping="' + joint.damping + '"' + selfClose);
          }
          lines.push('  </joint>');
        }
      }
    }

    lines.push('</robot>');

    return lines.join('\n');
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private inferGeomType(mesh: MeshData): string {
    // Simple heuristic: if it has many vertices, use mesh; otherwise use primitive
    if (mesh.vertices.length > 100) return 'mesh';
    return 'box';
  }

  private inferGeomSize(mesh: MeshData): string {
    // Compute bounding box from vertices
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < mesh.vertices.length; i += 3) {
      minX = Math.min(minX, mesh.vertices[i]);
      maxX = Math.max(maxX, mesh.vertices[i]);
      minY = Math.min(minY, mesh.vertices[i + 1]);
      maxY = Math.max(maxY, mesh.vertices[i + 1]);
      minZ = Math.min(minZ, mesh.vertices[i + 2]);
      maxZ = Math.max(maxZ, mesh.vertices[i + 2]);
    }

    const sx = ((maxX - minX) / 2).toFixed(4);
    const sy = ((maxY - minY) / 2).toFixed(4);
    const sz = ((maxZ - minZ) / 2).toFixed(4);

    return `${sx} ${sy} ${sz}`;
  }
}
