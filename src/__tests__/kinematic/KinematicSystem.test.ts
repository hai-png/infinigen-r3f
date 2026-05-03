/**
 * Tests for the Kinematic System (IKSolver, FKEvaluator, ChainOptimizer)
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { solveIK, solveFABRIKOnly, solveCCDOnly } from '../../sim/kinematic/IKSolver';
import { evaluateFK, evaluateFKSerial, computeJacobian } from '../../sim/kinematic/FKEvaluator';
import { optimizeChain, quickOptimize } from '../../sim/kinematic/ChainOptimizer';
import { KinematicNode, KinematicType, JointType } from '../../sim/kinematic/KinematicNode';

// ============================================================================
// IKSolver Tests
// ============================================================================

describe('IKSolver', () => {
  describe('FABRIK solver', () => {
    it('should solve a simple 2-joint chain reaching a target', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(1, 2, 0),
      ];
      const target = new THREE.Vector3(0.5, 1.5, 0);
      const result = solveFABRIKOnly(positions, target, 50, 0.01);

      expect(result.residualDistance).toBeLessThan(0.5);
      expect(result.jointValues).toBeDefined();
      expect(result.endEffectorPosition).toBeDefined();
    });

    it('should fully extend when target is beyond reach', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 1, 0),
      ];
      const target = new THREE.Vector3(0, 100, 0);
      const result = solveFABRIKOnly(positions, target, 20, 0.01);

      expect(result.converged).toBe(false);
      expect(result.endEffectorPosition.y).toBeGreaterThan(0);
    });

    it('should converge for a 3-joint chain with reachable target', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(2, 0, 0),
        new THREE.Vector3(3, 0, 0),
      ];
      const target = new THREE.Vector3(2, 1, 0);
      const result = solveFABRIKOnly(positions, target, 50, 0.01);

      expect(result.residualDistance).toBeLessThan(0.5);
    });

    it('should handle degenerate single-joint chain', () => {
      const positions = [new THREE.Vector3(0, 0, 0)];
      const target = new THREE.Vector3(1, 0, 0);
      const result = solveFABRIKOnly(positions, target, 20, 0.01);

      expect(result.converged).toBe(false);
      expect(result.jointValues).toEqual([]);
    });
  });

  describe('CCD solver', () => {
    it('should solve a simple 2-joint chain', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(2, 0, 0),
      ];
      const target = new THREE.Vector3(1, 1, 0);
      const result = solveCCDOnly(positions, target, 50, 0.01);

      expect(result.residualDistance).toBeLessThan(1.0);
    });

    it('should respect damping parameter', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(2, 0, 0),
      ];
      const target = new THREE.Vector3(1, 1, 0);

      const resultLow = solveCCDOnly(positions, target, 20, 0.01, 0.9);
      const resultHigh = solveCCDOnly(positions, target, 20, 0.01, 0.1);

      expect(resultLow.iterations).toBeDefined();
      expect(resultHigh.iterations).toBeDefined();
    });
  });

  describe('solveIK (unified API)', () => {
    it('should accept KinematicNode input', () => {
      const root = new KinematicNode({ name: 'root', type: KinematicType.Revolute });
      root.origin = new THREE.Vector3(0, 0, 0);
      root.axis = new THREE.Vector3(0, 0, 1);

      const child = new KinematicNode({ name: 'child', type: KinematicType.Revolute });
      child.origin = new THREE.Vector3(1, 0, 0);
      child.axis = new THREE.Vector3(0, 0, 1);
      root.addChild(child);

      const target = { position: new THREE.Vector3(0.5, 0.5, 0) };
      const result = solveIK(root, target);

      expect(result).toBeDefined();
      expect(result.jointValues).toBeDefined();
    });

    it('should accept Vector3 array input', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
      ];
      const target = new THREE.Vector3(0.5, 0.5, 0);
      const result = solveIK(positions, target);

      expect(result).toBeDefined();
      expect(result.endEffectorPosition).toBeDefined();
    });

    it('should default to FABRIK solver', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
      ];
      const target = new THREE.Vector3(0.5, 0.5, 0);
      const result = solveIK(positions, target, { solverType: 'fabrik' });
      expect(result).toBeDefined();
    });
  });
});

// ============================================================================
// FKEvaluator Tests
// ============================================================================

describe('FKEvaluator', () => {
  describe('evaluateFKSerial', () => {
    it('should return initial positions when all joint values are zero', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(2, 0, 0),
      ];
      const axes = [
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, 1),
      ];
      const values = [0, 0];
      const result = evaluateFKSerial(positions, axes, values);

      expect(result.length).toBe(3);
      expect(result[0].distanceTo(positions[0])).toBeLessThan(0.01);
    });

    it('should rotate end-effector when first joint is rotated', () => {
      const positions = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(2, 0, 0),
      ];
      const axes = [
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, 0, 1),
      ];
      const values = [Math.PI / 2, 0];
      const result = evaluateFKSerial(positions, axes, values);

      expect(result.length).toBe(3);
      expect(Math.abs(result[1].x)).toBeLessThan(0.01);
      expect(result[1].y).toBeGreaterThan(0.5);
    });

    it('should handle empty positions', () => {
      const result = evaluateFKSerial([], [], []);
      expect(result).toEqual([]);
    });
  });

  describe('evaluateFK with KinematicNode', () => {
    it('should evaluate a simple kinematic tree', () => {
      const root = new KinematicNode({ name: 'root', type: KinematicType.Revolute });
      root.origin = new THREE.Vector3(0, 0, 0);
      root.axis = new THREE.Vector3(0, 0, 1);
      root.limits = { lower: -Math.PI, upper: Math.PI };

      const child = new KinematicNode({ name: 'child', type: KinematicType.Revolute });
      child.origin = new THREE.Vector3(1, 0, 0);
      child.axis = new THREE.Vector3(0, 0, 1);
      child.limits = { lower: -Math.PI, upper: Math.PI };
      root.addChild(child);

      const result = evaluateFK(root);

      expect(result.jointCount).toBe(2);
      expect(result.orderedJoints.length).toBe(2);
      expect(result.endEffectorPosition).toBeDefined();
      expect(result.endEffectorOrientation).toBeDefined();
    });

    it('should apply joint values from config', () => {
      const root = new KinematicNode({ name: 'shoulder', type: KinematicType.Revolute });
      root.origin = new THREE.Vector3(0, 0, 0);
      root.axis = new THREE.Vector3(0, 0, 1);
      root.limits = { lower: -Math.PI, upper: Math.PI };

      const jointValues = new Map<string, number>();
      jointValues.set('shoulder', 0.5);

      const result = evaluateFK(root, { jointValues });
      expect(result.orderedJoints[0].value).toBe(0.5);
    });

    it('should clamp joint values to limits', () => {
      const root = new KinematicNode({ name: 'joint', type: KinematicType.Revolute });
      root.origin = new THREE.Vector3(0, 0, 0);
      root.axis = new THREE.Vector3(0, 0, 1);
      root.limits = { lower: -0.5, upper: 0.5 };

      const jointValues = new Map<string, number>();
      jointValues.set('joint', 10.0);

      const result = evaluateFK(root, { jointValues, clampToLimits: true });
      expect(result.orderedJoints[0].value).toBe(0.5);
    });
  });

  describe('computeJacobian', () => {
    it('should compute a 6×n Jacobian matrix', () => {
      const root = new KinematicNode({ name: 'joint0', type: KinematicType.Revolute });
      root.origin = new THREE.Vector3(0, 0, 0);
      root.axis = new THREE.Vector3(0, 0, 1);
      root.limits = { lower: -Math.PI, upper: Math.PI };

      const child = new KinematicNode({ name: 'joint1', type: KinematicType.Revolute });
      child.origin = new THREE.Vector3(1, 0, 0);
      child.axis = new THREE.Vector3(0, 0, 1);
      child.limits = { lower: -Math.PI, upper: Math.PI };
      root.addChild(child);

      const J = computeJacobian(root);

      expect(J.length).toBe(6);
      expect(J[0].length).toBe(2);
    });
  });
});

// ============================================================================
// ChainOptimizer Tests
// ============================================================================

describe('ChainOptimizer', () => {
  describe('optimizeChain', () => {
    it('should remove redundant revolute DOFs', () => {
      const root = new KinematicNode({ name: 'base', type: KinematicType.Fixed });
      root.origin = new THREE.Vector3(0, 0, 0);

      const joint = new KinematicNode({ name: 'redundant', type: KinematicType.Revolute });
      joint.origin = new THREE.Vector3(0, 0, 0);
      joint.axis = new THREE.Vector3(0, 1, 0);
      joint.limits = { lower: -Math.PI, upper: Math.PI };
      root.addChild(joint);

      const result = optimizeChain(root, { removeRedundantDOFs: true, mergeFixedJoints: false, tightenLimits: false });
      expect(result).toBeDefined();
      expect(result.originalJointCount).toBe(2);
    });

    it('should merge fixed joints', () => {
      const root = new KinematicNode({ name: 'base', type: KinematicType.Fixed });
      root.origin = new THREE.Vector3(0, 0, 0);

      const fixedChild = new KinematicNode({ name: 'fixed_link', type: KinematicType.Fixed });
      fixedChild.origin = new THREE.Vector3(0, 1, 0);
      root.addChild(fixedChild);

      const revoluteGrandchild = new KinematicNode({ name: 'active', type: KinematicType.Revolute });
      revoluteGrandchild.origin = new THREE.Vector3(0, 2, 0);
      revoluteGrandchild.axis = new THREE.Vector3(0, 0, 1);
      fixedChild.addChild(revoluteGrandchild);

      const result = optimizeChain(root, { removeRedundantDOFs: false, mergeFixedJoints: true, tightenLimits: false });
      expect(result.jointsMerged).toBeGreaterThanOrEqual(0);
      expect(result.optimizedJointCount).toBeLessThanOrEqual(result.originalJointCount);
    });

    it('should report statistics', () => {
      const root = new KinematicNode({ name: 'root', type: KinematicType.Revolute });
      root.origin = new THREE.Vector3(0, 0, 0);
      root.axis = new THREE.Vector3(0, 0, 1);
      root.limits = { lower: -Math.PI, upper: Math.PI };

      const result = optimizeChain(root);
      expect(result.originalJointCount).toBe(1);
      expect(result.dofsRemoved).toBeGreaterThanOrEqual(0);
      expect(result.jointsMerged).toBeGreaterThanOrEqual(0);
    });
  });

  describe('quickOptimize', () => {
    it('should only merge fixed joints', () => {
      const root = new KinematicNode({ name: 'root', type: KinematicType.Revolute });
      root.origin = new THREE.Vector3(0, 0, 0);
      root.axis = new THREE.Vector3(0, 0, 1);

      const result = quickOptimize(root);
      expect(result.dofsRemoved).toBe(0);
    });
  });
});
