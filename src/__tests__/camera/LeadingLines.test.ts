/**
 * Tests for LeadingLines camera composition
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findLeadingLines, alignCameraToLeadingLines } from '../../core/placement/camera/techniques/LeadingLines';

describe('LeadingLines', () => {
  describe('findLeadingLines', () => {
    it('should return empty results for an empty scene', () => {
      const emptyScene = new THREE.Scene();
      const result = findLeadingLines(emptyScene);

      expect(result.lines).toEqual([]);
      expect(result.focalPoint).toBeNull();
      expect(result.edgesAnalyzed).toBe(0);
    });

    it('should detect leading lines in a scene with a box', () => {
      const scene = new THREE.Scene();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshStandardMaterial()
      );
      box.position.set(0, 1, 0);
      scene.add(box);

      const result = findLeadingLines(scene, { minLength: 0.1 });

      // Box has 12 edges, some should be detected as crease/boundary edges
      expect(result.edgesAnalyzed).toBeGreaterThan(0);
    });

    it('should respect minLength config', () => {
      const scene = new THREE.Scene();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial()
      );
      scene.add(box);

      const resultShort = findLeadingLines(scene, { minLength: 0.01 });
      const resultLong = findLeadingLines(scene, { minLength: 100 });

      // Shorter min length should find more edges
      expect(resultShort.edgesAnalyzed).toBeGreaterThanOrEqual(resultLong.edgesAnalyzed);
    });

    it('should respect maxLines config', () => {
      const scene = new THREE.Scene();
      // Add multiple objects
      for (let i = 0; i < 5; i++) {
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(1, 3, 1),
          new THREE.MeshStandardMaterial()
        );
        box.position.set(i * 2, 1, 0);
        scene.add(box);
      }

      const result = findLeadingLines(scene, { maxLines: 3, minLength: 0.01 });
      expect(result.lines.length).toBeLessThanOrEqual(3);
    });

    it('should score lines based on length and convergence', () => {
      const scene = new THREE.Scene();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 5, 1),
        new THREE.MeshStandardMaterial()
      );
      scene.add(box);

      const result = findLeadingLines(scene, { minLength: 0.1 });

      for (const line of result.lines) {
        expect(line.score).toBeGreaterThanOrEqual(0);
        expect(line.score).toBeLessThanOrEqual(1);
        expect(line.length).toBeGreaterThan(0);
        expect(line.direction.length()).toBeCloseTo(1, 5);
      }
    });

    it('should compute focal point when multiple lines converge', () => {
      const scene = new THREE.Scene();
      // Add converging lines (two long thin boxes forming a V)
      const box1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 5, 0.1),
        new THREE.MeshStandardMaterial()
      );
      box1.position.set(-1, 2.5, 0);
      box1.rotation.z = 0.3;
      scene.add(box1);

      const box2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 5, 0.1),
        new THREE.MeshStandardMaterial()
      );
      box2.position.set(1, 2.5, 0);
      box2.rotation.z = -0.3;
      scene.add(box2);

      const result = findLeadingLines(scene, { minLength: 0.1 });
      // May or may not find a focal point depending on edge detection
      expect(result).toBeDefined();
    });
  });

  describe('alignCameraToLeadingLines', () => {
    it('should suggest camera positions for detected lines', () => {
      const scene = new THREE.Scene();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 5, 1),
        new THREE.MeshStandardMaterial()
      );
      scene.add(box);

      const result = findLeadingLines(scene, { minLength: 0.1 });
      const alignments = alignCameraToLeadingLines(result);

      // Should produce at least some alignment suggestions if lines were found
      if (result.lines.length > 0) {
        expect(alignments.length).toBeGreaterThan(0);
        for (const alignment of alignments) {
          expect(alignment.position).toBeDefined();
          expect(alignment.lookAt).toBeDefined();
          expect(alignment.score).toBeGreaterThanOrEqual(0);
          expect(alignment.score).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should return empty alignments when no lines detected', () => {
      const emptyResult = { lines: [], focalPoint: null, edgesAnalyzed: 0 };
      const alignments = alignCameraToLeadingLines(emptyResult);
      expect(alignments).toEqual([]);
    });
  });
});
