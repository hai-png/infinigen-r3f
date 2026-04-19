/**
 * Tests for Physics Simulation Module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Vector3, Quaternion, Matrix4 } from 'three';
import {
  RigidBodyDynamics,
  KinematicCompiler,
  CollisionDetectionSystem,
  PHYSICS_MATERIALS,
  COLLISION_LAYERS,
  createBoxShape,
  createSphereShape,
  createCapsuleShape,
  createCylinderShape,
  type RigidBodyConfig,
  type KinematicChain,
  type KinematicLink,
  type KinematicJoint,
} from '../physics/RigidBodyDynamics';

describe('Physics Materials', () => {
  it('should have all predefined materials', () => {
    expect(PHYSICS_MATERIALS).toHaveProperty('default');
    expect(PHYSICS_MATERIALS).toHaveProperty('wood');
    expect(PHYSICS_MATERIALS).toHaveProperty('metal');
    expect(PHYSICS_MATERIALS).toHaveProperty('plastic');
    expect(PHYSICS_MATERIALS).toHaveProperty('rubber');
    expect(PHYSICS_MATERIALS).toHaveProperty('glass');
    expect(PHYSICS_MATERIALS).toHaveProperty('fabric');
    expect(PHYSICS_MATERIALS).toHaveProperty('terrain');
    expect(PHYSICS_MATERIALS).toHaveProperty('ice');
    expect(PHYSICS_MATERIALS).toHaveProperty('water');
  });

  it('should have valid material properties', () => {
    const wood = PHYSICS_MATERIALS.wood;
    expect(wood.friction).toBeGreaterThan(0);
    expect(wood.friction).toBeLessThanOrEqual(1);
    expect(wood.restitution).toBeGreaterThanOrEqual(0);
    expect(wood.restitution).toBeLessThanOrEqual(1);
    expect(wood.density).toBeGreaterThan(0);
    expect(wood.linearDamping).toBeGreaterThanOrEqual(0);
    expect(wood.angularDamping).toBeGreaterThanOrEqual(0);
  });
});

describe('RigidBodyDynamics', () => {
  let physics: RigidBodyDynamics;

  beforeEach(() => {
    physics = new RigidBodyDynamics();
  });

  it('should create a rigid body', () => {
    const config: RigidBodyConfig = {
      id: 'box1',
      position: new Vector3(0, 5, 0),
      rotation: new Quaternion(),
      mass: 1.0,
      shape: createBoxShape(1, 1, 1),
      materialId: 'wood',
      isStatic: false,
      isKinematic: false,
      ccdEnabled: false,
    };

    const body = physics.createBody(config);
    
    expect(body).toBeDefined();
    expect(body.position.equals(new Vector3(0, 5, 0))).toBe(true);
    expect(body.linearVelocity.length()).toBe(0);
    expect(body.awake).toBe(true);
  });

  it('should create a static body', () => {
    const config: RigidBodyConfig = {
      id: 'ground',
      position: new Vector3(0, 0, 0),
      rotation: new Quaternion(),
      mass: 0,
      shape: createBoxShape(10, 1, 10),
      materialId: 'terrain',
      isStatic: true,
      isKinematic: false,
      ccdEnabled: false,
    };

    const body = physics.createBody(config);
    
    expect(body.awake).toBe(false);
  });

  it('should apply force to a body', () => {
    const config: RigidBodyConfig = {
      id: 'ball',
      position: new Vector3(0, 5, 0),
      rotation: new Quaternion(),
      mass: 1.0,
      shape: createSphereShape(0.5),
      materialId: 'rubber',
      isStatic: false,
      isKinematic: false,
      ccdEnabled: false,
    };

    physics.createBody(config);
    
    const force = new Vector3(10, 0, 0);
    physics.applyForce('ball', force);
    
    const state = physics.getBodyState('ball');
    expect(state).not.toBeNull();
    expect(state!.linearVelocity.x).toBeGreaterThan(0);
  });

  it('should apply impulse to a body', () => {
    const config: RigidBodyConfig = {
      id: 'ball',
      position: new Vector3(0, 5, 0),
      rotation: new Quaternion(),
      mass: 1.0,
      shape: createSphereShape(0.5),
      materialId: 'rubber',
      isStatic: false,
      isKinematic: false,
      ccdEnabled: false,
    };

    physics.createBody(config);
    
    const impulse = new Vector3(5, 0, 0);
    physics.applyImpulse('ball', impulse);
    
    const state = physics.getBodyState('ball');
    expect(state).not.toBeNull();
    expect(state!.linearVelocity.x).toBeGreaterThan(0);
  });

  it('should step simulation with gravity', () => {
    const config: RigidBodyConfig = {
      id: 'falling',
      position: new Vector3(0, 10, 0),
      rotation: new Quaternion(),
      mass: 1.0,
      shape: createSphereShape(0.5),
      materialId: 'default',
      isStatic: false,
      isKinematic: false,
      ccdEnabled: false,
    };

    physics.createBody(config);
    
    const initialY = physics.getBodyState('falling')!.position.y;
    
    // Step simulation
    physics.step(1/60);
    
    const afterStep = physics.getBodyState('falling')!;
    
    // Should have fallen due to gravity
    expect(afterStep.position.y).toBeLessThan(initialY);
    expect(afterStep.linearVelocity.y).toBeLessThan(0);
  });

  it('should detect and resolve collision', () => {
    // Create ground
    physics.createBody({
      id: 'ground',
      position: new Vector3(0, 0, 0),
      rotation: new Quaternion(),
      mass: 0,
      shape: createBoxShape(10, 1, 10),
      materialId: 'terrain',
      isStatic: true,
      isKinematic: false,
      ccdEnabled: false,
    });

    // Create falling box just above ground
    physics.createBody({
      id: 'box',
      position: new Vector3(0, 0.6, 0),
      rotation: new Quaternion(),
      mass: 1.0,
      shape: createBoxShape(1, 1, 1),
      materialId: 'wood',
      isStatic: false,
      isKinematic: false,
      ccdEnabled: false,
    });

    // Step multiple times until collision
    for (let i = 0; i < 60; i++) {
      physics.step(1/60);
    }

    const boxState = physics.getBodyState('box');
    expect(boxState).not.toBeNull();
    
    // Box should be resting on ground (approximately y = 1.0)
    expect(boxState!.position.y).toBeGreaterThan(0.9);
    expect(boxState!.position.y).toBeLessThan(1.1);
  });

  it('should wake and sleep bodies', () => {
    const config: RigidBodyConfig = {
      id: 'sleeper',
      position: new Vector3(0, 5, 0),
      rotation: new Quaternion(),
      mass: 1.0,
      shape: createSphereShape(0.5),
      materialId: 'default',
      isStatic: false,
      isKinematic: false,
      ccdEnabled: false,
    };

    physics.createBody(config);
    
    expect(physics.getBodyState('sleeper')!.awake).toBe(true);
    
    physics.sleepBody('sleeper');
    expect(physics.getBodyState('sleeper')!.awake).toBe(false);
    
    physics.wakeBody('sleeper');
    expect(physics.getBodyState('sleeper')!.awake).toBe(true);
  });

  it('should remove a body', () => {
    const config: RigidBodyConfig = {
      id: 'removable',
      position: new Vector3(0, 5, 0),
      rotation: new Quaternion(),
      mass: 1.0,
      shape: createSphereShape(0.5),
      materialId: 'default',
      isStatic: false,
      isKinematic: false,
      ccdEnabled: false,
    };

    physics.createBody(config);
    expect(physics.getBodyState('removable')).not.toBeNull();
    
    physics.removeBody('removable');
    expect(physics.getBodyState('removable')).toBeNull();
  });
});

describe('CollisionDetectionSystem', () => {
  let collisionSystem: CollisionDetectionSystem;

  beforeEach(() => {
    collisionSystem = new CollisionDetectionSystem();
  });

  it('should register and unregister colliders', () => {
    collisionSystem.registerCollider({
      id: 'collider1',
      shape: createSphereShape(1),
      layer: COLLISION_LAYERS.DYNAMIC,
      filter: {
        groups: COLLISION_LAYERS.DYNAMIC,
        mask: COLLISION_LAYERS.DEFAULT | COLLISION_LAYERS.DYNAMIC,
      },
      boundingBox: undefined as any,
      boundingSphere: undefined as any,
      isTrigger: false,
    });

    // Broad phase should include the collider
    const pairs = collisionSystem.broadPhase();
    expect(pairs.length).toBe(0); // Only one collider, no pairs
    
    collisionSystem.unregisterCollider('collider1');
    
    const pairsAfter = collisionSystem.broadPhase();
    expect(pairsAfter.length).toBe(0);
  });

  it('should detect sphere-sphere collision', () => {
    collisionSystem.registerCollider({
      id: 'sphere1',
      shape: createSphereShape(1),
      layer: COLLISION_LAYERS.DYNAMIC,
      filter: {
        groups: COLLISION_LAYERS.DYNAMIC,
        mask: COLLISION_LAYERS.DYNAMIC,
      },
      boundingBox: undefined as any,
      boundingSphere: undefined as any,
      isTrigger: false,
    });

    collisionSystem.registerCollider({
      id: 'sphere2',
      shape: createSphereShape(1),
      layer: COLLISION_LAYERS.DYNAMIC,
      filter: {
        groups: COLLISION_LAYERS.DYNAMIC,
        mask: COLLISION_LAYERS.DYNAMIC,
      },
      boundingBox: undefined as any,
      boundingSphere: undefined as any,
      isTrigger: false,
    });

    // Update positions to make them overlap
    collisionSystem.updateColliderTransform('sphere1', new Vector3(0, 0, 0), new Quaternion());
    collisionSystem.updateColliderTransform('sphere2', new Vector3(1.5, 0, 0), new Quaternion());

    const pairs = collisionSystem.broadPhase();
    expect(pairs.length).toBeGreaterThan(0);

    const collisions = collisionSystem.narrowPhase(pairs);
    expect(collisions.length).toBeGreaterThan(0);
    expect(collisions[0].collider1).toBe('sphere1');
    expect(collisions[0].collider2).toBe('sphere2');
  });

  it('should not detect collision when objects are far apart', () => {
    collisionSystem.registerCollider({
      id: 'far1',
      shape: createSphereShape(1),
      layer: COLLISION_LAYERS.DYNAMIC,
      filter: {
        groups: COLLISION_LAYERS.DYNAMIC,
        mask: COLLISION_LAYERS.DYNAMIC,
      },
      boundingBox: undefined as any,
      boundingSphere: undefined as any,
      isTrigger: false,
    });

    collisionSystem.registerCollider({
      id: 'far2',
      shape: createSphereShape(1),
      layer: COLLISION_LAYERS.DYNAMIC,
      filter: {
        groups: COLLISION_LAYERS.DYNAMIC,
        mask: COLLISION_LAYERS.DYNAMIC,
      },
      boundingBox: undefined as any,
      boundingSphere: undefined as any,
      isTrigger: false,
    });

    // Position far apart
    collisionSystem.updateColliderTransform('far1', new Vector3(0, 0, 0), new Quaternion());
    collisionSystem.updateColliderTransform('far2', new Vector3(10, 0, 0), new Quaternion());

    const pairs = collisionSystem.broadPhase();
    expect(pairs.length).toBe(0);
  });

  it('should respect collision layers', () => {
    collisionSystem.registerCollider({
      id: 'static',
      shape: createBoxShape(2, 2, 2),
      layer: COLLISION_LAYERS.STATIC,
      filter: {
        groups: COLLISION_LAYERS.STATIC,
        mask: COLLISION_LAYERS.DEFAULT,
      },
      boundingBox: undefined as any,
      boundingSphere: undefined as any,
      isTrigger: false,
    });

    collisionSystem.registerCollider({
      id: 'dynamic',
      shape: createBoxShape(2, 2, 2),
      layer: COLLISION_LAYERS.DYNAMIC,
      filter: {
        groups: COLLISION_LAYERS.DYNAMIC,
        mask: COLLISION_LAYERS.DEFAULT,
      },
      boundingBox: undefined as any,
      boundingSphere: undefined as any,
      isTrigger: false,
    });

    // Position overlapping
    collisionSystem.updateColliderTransform('static', new Vector3(0, 0, 0), new Quaternion());
    collisionSystem.updateColliderTransform('dynamic', new Vector3(0.5, 0, 0), new Quaternion());

    const pairs = collisionSystem.broadPhase();
    // Should not collide because masks don't match
    expect(pairs.length).toBe(0);
  });
});

describe('KinematicCompiler', () => {
  let compiler: KinematicCompiler;

  beforeEach(() => {
    compiler = new KinematicCompiler();
  });

  it('should register and compile a kinematic chain', () => {
    const chain: KinematicChain = {
      id: 'robot_arm',
      name: 'Robot Arm',
      links: new Map<string, KinematicLink>(),
      joints: new Map<string, KinematicJoint>(),
      rootLink: 'base',
    };

    // Add base link
    chain.links.set('base', {
      id: 'base',
      name: 'Base',
      inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
      mass: 10,
      collision: { geometry: createBoxShape(1, 1, 1) },
    });

    // Add arm link
    chain.links.set('arm', {
      id: 'arm',
      name: 'Arm',
      inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
      mass: 5,
      collision: { geometry: createBoxShape(0.5, 2, 0.5) },
    });

    // Add joint
    chain.joints.set('base_joint', {
      id: 'base_joint',
      type: 'revolute',
      parentLink: 'base',
      childLink: 'arm',
      origin: new Vector3(0, 0.5, 0),
      axis: new Vector3(0, 1, 0),
      limits: { lower: -Math.PI / 2, upper: Math.PI / 2, effort: 100, velocity: 1 },
    });

    compiler.registerChain(chain);
    
    const compiled = compiler.compileChain('robot_arm');
    
    expect(compiled).toBeDefined();
    expect(compiled.id).toBe('robot_arm');
    expect(compiled.name).toBe('Robot Arm');
    expect(compiled.links.size).toBe(2);
    expect(compiled.joints.size).toBe(1);
    expect(compiled.dofCount).toBe(1);
  });

  it('should count degrees of freedom correctly', () => {
    const chain: KinematicChain = {
      id: 'multi_joint',
      name: 'Multi Joint',
      links: new Map<string, KinematicLink>(),
      joints: new Map<string, KinematicJoint>(),
      rootLink: 'root',
    };

    chain.links.set('root', {
      id: 'root',
      name: 'Root',
      inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
      mass: 1,
    });

    chain.links.set('link1', {
      id: 'link1',
      name: 'Link 1',
      inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
      mass: 1,
    });

    chain.links.set('link2', {
      id: 'link2',
      name: 'Link 2',
      inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
      mass: 1,
    });

    chain.links.set('link3', {
      id: 'link3',
      name: 'Link 3',
      inertia: { ixx: 1, ixy: 0, ixz: 0, iyy: 1, iyz: 0, izz: 1 },
      mass: 1,
    });

    // Revolute joint (1 DOF)
    chain.joints.set('joint1', {
      id: 'joint1',
      type: 'revolute',
      parentLink: 'root',
      childLink: 'link1',
      origin: new Vector3(0, 0, 0),
    });

    // Prismatic joint (1 DOF)
    chain.joints.set('joint2', {
      id: 'joint2',
      type: 'prismatic',
      parentLink: 'link1',
      childLink: 'link2',
      origin: new Vector3(0, 0, 0),
    });

    // Spherical joint (3 DOF)
    chain.joints.set('joint3', {
      id: 'joint3',
      type: 'spherical',
      parentLink: 'link2',
      childLink: 'link3',
      origin: new Vector3(0, 0, 0),
    });

    compiler.registerChain(chain);
    const compiled = compiler.compileChain('multi_joint');
    
    // Total: 1 + 1 + 3 = 5 DOF
    expect(compiled.dofCount).toBe(5);
  });

  it('should throw error for non-existent chain', () => {
    expect(() => compiler.compileChain('nonexistent')).toThrow('not found');
  });
});

describe('Shape Creation Utilities', () => {
  it('should create box shape', () => {
    const box = createBoxShape(2, 3, 4);
    expect(box.type).toBe('box');
    expect(box.dimensions).toEqual(new Vector3(2, 3, 4));
  });

  it('should create sphere shape', () => {
    const sphere = createSphereShape(5);
    expect(sphere.type).toBe('sphere');
    expect(sphere.radius).toBe(5);
  });

  it('should create capsule shape', () => {
    const capsule = createCapsuleShape(2, 10);
    expect(capsule.type).toBe('capsule');
    expect(capsule.radius).toBe(2);
    expect(capsule.height).toBe(10);
  });

  it('should create cylinder shape', () => {
    const cylinder = createCylinderShape(3, 8);
    expect(cylinder.type).toBe('cylinder');
    expect(cylinder.radius).toBe(3);
    expect(cylinder.height).toBe(8);
  });

  it('should create convex hull shape', () => {
    const vertices = new Float32Array([
      -1, -1, -1,
       1, -1, -1,
       1,  1, -1,
      -1,  1, -1,
      -1, -1,  1,
       1, -1,  1,
       1,  1,  1,
      -1,  1,  1,
    ]);
    
    const hull = createConvexHullShape(vertices);
    expect(hull.type).toBe('convexHull');
    expect(hull.vertices).toBe(vertices);
  });

  it('should create trimesh shape', () => {
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    
    const mesh = createTrimeshShape(vertices, indices);
    expect(mesh.type).toBe('trimesh');
    expect(mesh.vertices).toBe(vertices);
    expect(mesh.indices).toBe(indices);
  });
});
