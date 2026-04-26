import * as THREE from 'three';
/**
 * Camera Trajectory Generator
 *
 * Comprehensive camera path generation system supporting:
 * - Orbit trajectories (circular, elliptical, spiral)
 * - Spline-based paths (Catmull-Rom, Bezier, custom curves)
 * - FPS-style movement (waypoint navigation, free look)
 * - Cinematic shots (dolly, crane, tracking)
 *
 * @module CameraTrajectoryGenerator
 */
/**
 * Trajectory types supported by the generator
 */
export declare enum TrajectoryType {
    /** Circular orbit around a target */
    ORBIT_CIRCULAR = "orbit_circular",
    /** Elliptical orbit with varying radius */
    ORBIT_ELLIPTICAL = "orbit_elliptical",
    /** Spiral orbit moving up/down while rotating */
    ORBIT_SPIRAL = "orbit_spiral",
    /** Smooth spline through control points */
    SPLINE_CATMULLROM = "spline_catmullrom",
    /** Bezier curve trajectory */
    SPLINE_BEZIER = "spline_bezier",
    /** Custom curve defined by function */
    SPLINE_CUSTOM = "spline_custom",
    /** FPS-style waypoint navigation */
    FPS_WAYPOINT = "fps_waypoint",
    /** FPS free-look with movement */
    FPS_FREELOOK = "fps_freelook",
    /** Dolly shot (forward/backward movement) */
    CINEMATIC_DOLLY = "cinematic_dolly",
    /** Crane shot (vertical movement) */
    CINEMATIC_CRANE = "cinematic_crane",
    /** Tracking shot (follow subject) */
    CINEMATIC_TRACKING = "cinematic_tracking"
}
/**
 * Configuration for orbit trajectories
 */
export interface OrbitConfig {
    /** Center point of orbit */
    center: THREE.Vector3;
    /** Initial radius from center */
    radius: number;
    /** Vertical radius for elliptical orbits (optional) */
    verticalRadius?: number;
    /** Starting angle in radians */
    startAngle?: number;
    /** Ending angle in radians */
    endAngle?: number;
    /** Height offset from center */
    height?: number;
    /** Height change per revolution (for spiral) */
    heightChangePerRevolution?: number;
    /** Number of revolutions */
    revolutions?: number;
    /** Tilt angle of orbit plane in radians */
    tiltAngle?: number;
    /** Axis of rotation (default: Y-up) */
    upAxis?: THREE.Vector3;
}
/**
 * Configuration for spline trajectories
 */
export interface SplineConfig {
    /** Control points for the spline */
    controlPoints: THREE.Vector3[];
    /** Look-at targets at each point (optional) */
    targets?: THREE.Vector3[];
    /** Interpolation type */
    interpolation?: 'catmullrom' | 'bezier' | 'custom';
    /** Curve tension (0-1) for Catmull-Rom */
    tension?: number;
    /** Whether the curve is closed/looping */
    closed?: boolean;
    /** Custom curve function (if using custom interpolation) */
    customFunction?: (t: number) => THREE.Vector3;
}
/**
 * Configuration for FPS-style trajectories
 */
export interface FPSConfig {
    /** Waypoints to navigate through */
    waypoints: THREE.Vector3[];
    /** Look directions at each waypoint */
    lookDirections?: THREE.Vector3[];
    /** Time to spend at each waypoint (seconds) */
    waypointDurations?: number[];
    /** Movement speed between waypoints */
    movementSpeed?: number;
    /** Field of view changes at waypoints */
    fovValues?: number[];
    /** Pause duration at waypoints */
    pauseDuration?: number;
    /** Smooth turning enabled */
    smoothTurning?: boolean;
    /** Turn speed in radians per second */
    turnSpeed?: number;
}
/**
 * Configuration for cinematic trajectories
 */
export interface CinematicConfig {
    /** Subject/target to focus on */
    target: THREE.Vector3;
    /** Starting position */
    startPos: THREE.Vector3;
    /** Ending position */
    endPos: THREE.Vector3;
    /** Duration of the shot in seconds */
    duration?: number;
    /** FOV at start */
    startFOV?: number;
    /** FOV at end */
    endFOV?: number;
    /** Easing function type */
    easing?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
    /** Camera roll during movement */
    roll?: number;
}
/**
 * Sample point along a trajectory
 */
export interface TrajectorySample {
    /** Time in seconds */
    time: number;
    /** Camera position */
    position: THREE.Vector3;
    /** Look-at target */
    target: THREE.Vector3;
    /** Up vector */
    up: THREE.Vector3;
    /** Field of view in degrees */
    fov: number;
    /** Camera roll in radians */
    roll: number;
    /** Velocity vector at this point */
    velocity?: THREE.Vector3;
    /** Distance traveled so far */
    distanceTraveled?: number;
}
/**
 * Generated trajectory data
 */
export interface TrajectoryData {
    /** Type of trajectory */
    type: TrajectoryType;
    /** Array of sample points */
    samples: TrajectorySample[];
    /** Total duration in seconds */
    duration: number;
    /** Total distance in world units */
    totalDistance: number;
    /** Bounding box of the trajectory */
    boundingBox: THREE.Box3;
    /** Metadata about the trajectory */
    metadata: {
        controlPointCount?: number;
        revolutions?: number;
        averageSpeed?: number;
        maxSpeed?: number;
        minSpeed?: number;
    };
}
/**
 * Easing functions for smooth motion
 */
export declare const EasingFunctions: {
    linear: (t: number) => number;
    easeIn: (t: number) => number;
    easeOut: (t: number) => number;
    easeInOut: (t: number) => number;
};
/**
 * Camera Trajectory Generator Class
 *
 * Generates various types of camera paths for automated cinematography,
 * surveillance simulation, and dynamic scene viewing.
 */
export declare class CameraTrajectoryGenerator {
    /** Default samples per second for trajectory discretization */
    private static readonly DEFAULT_SAMPLES_PER_SECOND;
    /** Default movement speed for FPS trajectories */
    private static readonly DEFAULT_FPS_SPEED;
    /** Default FOV */
    private static readonly DEFAULT_FOV;
    /**
     * Generate a complete trajectory based on configuration
     */
    generate(type: TrajectoryType, config: OrbitConfig | SplineConfig | FPSConfig | CinematicConfig, duration?: number, samplesPerSecond?: number): TrajectoryData;
    /**
     * Generate orbit trajectory (circular, elliptical, or spiral)
     */
    private generateOrbit;
    /**
     * Generate spline-based trajectory
     */
    private generateSpline;
    /**
     * Generate FPS-style trajectory
     */
    private generateFPS;
    /**
     * Generate cinematic trajectory
     */
    private generateCinematic;
    /**
     * Helper: Rotate vector towards target direction
     */
    private rotateTowards;
    /**
     * Helper: Calculate cumulative distance traveled
     */
    private calculateDistanceTraveled;
    /**
     * Helper: Calculate total distance of trajectory
     */
    private calculateTotalDistance;
    /**
     * Helper: Calculate bounding box of trajectory
     */
    private calculateBoundingBox;
    /**
     * Helper: Calculate speed statistics
     */
    private calculateSpeeds;
    /**
     * Helper: Get control point count for metadata
     */
    private getControlPointCount;
    /**
     * Create Bezier curve from control points
     */
    private createBezierCurve;
    /**
     * Visualize trajectory as a line mesh
     */
    visualize(data: TrajectoryData, color?: number): THREE.Line;
    /**
     * Export trajectory to JSON
     */
    toJSON(data: TrajectoryData): string;
    /**
     * Import trajectory from JSON
     */
    fromJSON(json: string): TrajectoryData;
}
export default CameraTrajectoryGenerator;
//# sourceMappingURL=CameraTrajectoryGenerator.d.ts.map