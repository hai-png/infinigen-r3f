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
import { Scene, Vector3 } from 'three';
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
export type JointType = 'fixed' | 'revolute' | 'continuous' | 'prismatic' | 'floating' | 'planar' | 'ball';
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
export declare class MJCFExporter {
    private config;
    constructor(config?: Partial<PhysicsExportConfig>);
    /**
     * Export scene to MJCF format
     */
    export(scene: Scene, filename?: string): string;
    /**
     * Export assets section
     */
    private exportAssets;
    /**
     * Export worldbody section
     */
    private exportWorldBody;
    /**
     * Export a single body
     */
    private exportBody;
    /**
     * Calculate rigid body properties from mesh
     */
    private calculateRigidBodyProps;
    /**
     * Export collision geometry
     */
    private exportCollisionGeom;
    /**
     * Export visual geometry
     */
    private exportVisualGeom;
    /**
     * Infer geometry type from mesh
     */
    private inferGeomType;
    /**
     * Export joint for articulated body
     */
    private exportJoint;
    /**
     * Export actuators section
     */
    private exportActuators;
    /**
     * Export sensors section
     */
    private exportSensors;
}
/**
 * URDF (Unified Robot Description Format) Exporter
 *
 * Exports robots and articulated mechanisms to URDF format.
 * Widely used in ROS (Robot Operating System).
 */
export declare class URDFExporter {
    private config;
    constructor(config?: Partial<PhysicsExportConfig>);
    /**
     * Export robot to URDF format
     */
    export(scene: Scene, robotName?: string): string;
    /**
     * Export materials section
     */
    private exportMaterials;
    /**
     * Export links and joints
     */
    private exportLinksAndJoints;
    /**
     * Find root object in scene
     */
    private findRootObject;
    /**
     * Export a single link
     */
    private exportLink;
    /**
     * Export visual element
     */
    private exportVisual;
    /**
     * Export collision element
     */
    private exportCollision;
    /**
     * Export geometry element
     */
    private exportGeometry;
    /**
     * Export inertial properties
     */
    private exportInertial;
    /**
     * Calculate rigid body properties
     */
    private calculateRigidBodyProps;
    /**
     * Infer geometry type
     */
    private inferGeomType;
    /**
     * Export children recursively
     */
    private exportChildren;
    /**
     * Export URDF joint
     */
    private exportJointURDF;
}
/**
 * USD (Universal Scene Description) Exporter
 *
 * Exports scenes to Pixar's USD format.
 * Industry standard for interchange between DCC tools.
 */
export declare class USDExporter {
    private config;
    constructor(config?: Partial<PhysicsExportConfig>);
    /**
     * Export scene to USD format (USDA text format)
     */
    export(scene: Scene, filename?: string): string;
    /**
     * Export a single object
     */
    private exportObject;
    /**
     * Export mesh data
     */
    private exportMeshData;
}
/**
 * Unified physics exporter factory
 */
export declare class PhysicsExporterFactory {
    /**
     * Create exporter for specified format
     */
    static createExporter(format: 'mjcf' | 'urdf' | 'usd', config?: Partial<PhysicsExportConfig>): MJCFExporter | URDFExporter | USDExporter;
    /**
     * Export scene to multiple formats
     */
    static exportAllFormats(scene: Scene, basePath: string, config?: Partial<PhysicsExportConfig>): Map<string, string>;
}
//# sourceMappingURL=physics-exporters.d.ts.map