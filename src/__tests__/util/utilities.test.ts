/**
 * Utility Module Tests
 * 
 * Comprehensive tests for MathUtils, GeometryUtils, and PipelineUtils.
 */

import * as THREE from 'three';
import {
  SeededRandom,
  eulerToQuaternion,
  quaternionToEuler,
  signedAngle,
  projectPointOnSegment,
  distancePointToSegment,
  randomPointInSphere,
  randomPointOnSphere,
  makeInterval,
  isEmptyInterval,
  unionIntervals,
  intersectIntervals,
  addScalarToInterval,
  multiplyIntervalByScalar,
  isInInterval,
  intervalWidth,
  intervalMidpoint,
  rgbToHex,
  hexToRgb,
  rgbToHsv,
  hsvToRgb,
  randomPleasantColor,
  lerpColor
} from '../MathUtils';
import {
  bevelMesh,
  createRoundedBox,
  laplacianSmooth,
  calculateSurfaceArea,
  calculateVolume,
  mirrorGeometry,
  scaleGeometry,
  approximateConvexHull
} from '../GeometryUtils';
import {
  organizeSceneByTags,
  SceneLayerManager,
  generateUniquePath,
  joinPath,
  getDirectory,
  getFilename,
  getExtension,
  changeExtension,
  IMUSimulator
} from '../PipelineUtils';

describe('MathUtils', () => {
  describe('SeededRandom', () => {
    it('should produce reproducible sequences', () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);

      for (let i = 0; i < 100; i++) {
        expect(rng1.next()).toBe(rng2.next());
      }
    });

    it('should generate integers in range', () => {
      const rng = new SeededRandom(123);
      for (let i = 0; i < 100; i++) {
        const val = rng.nextInt(5, 10);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThanOrEqual(10);
      }
    });

    it('should generate floats in range', () => {
      const rng = new SeededRandom(456);
      for (let i = 0; i < 100; i++) {
        const val = rng.nextFloat(0.0, 1.0);
        expect(val).toBeGreaterThanOrEqual(0.0);
        expect(val).toBeLessThan(1.0);
      }
    });

    it('should generate gaussian values', () => {
      const rng = new SeededRandom(789);
      const values: number[] = [];
      
      for (let i = 0; i < 1000; i++) {
        values.push(rng.gaussian(0, 1));
      }

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(Math.abs(mean)).toBeLessThan(0.2); // Should be close to 0
    });

    it('should shuffle arrays', () => {
      const rng = new SeededRandom(321);
      const original = [1, 2, 3, 4, 5];
      const shuffled = rng.shuffle([...original]);
      
      expect(shuffled.length).toBe(original.length);
      expect(shuffled.sort()).toEqual(original.sort());
    });
  });

  describe('Euler/Quaternion conversion', () => {
    it('should convert euler to quaternion and back', () => {
      const euler: [number, number, number] = [Math.PI / 4, Math.PI / 3, Math.PI / 6];
      const q = eulerToQuaternion(euler);
      const back = quaternionToEuler(q);

      expect(Math.abs(back[0] - euler[0])).toBeLessThan(0.01);
      expect(Math.abs(back[1] - euler[1])).toBeLessThan(0.01);
      expect(Math.abs(back[2] - euler[2])).toBeLessThan(0.01);
    });
  });

  describe('signedAngle', () => {
    it('should calculate signed angle between vectors', () => {
      const v1 = new THREE.Vector3(1, 0, 0);
      const v2 = new THREE.Vector3(0, 1, 0);
      const axis = new THREE.Vector3(0, 0, 1);

      const angle = signedAngle(v1, v2, axis);
      expect(angle).toBeCloseTo(Math.PI / 2, 5);
    });

    it('should return negative angle for opposite direction', () => {
      const v1 = new THREE.Vector3(0, 1, 0);
      const v2 = new THREE.Vector3(1, 0, 0);
      const axis = new THREE.Vector3(0, 0, 1);

      const angle = signedAngle(v1, v2, axis);
      expect(angle).toBeCloseTo(-Math.PI / 2, 5);
    });
  });

  describe('projectPointOnSegment', () => {
    it('should project point onto segment', () => {
      const p1 = new THREE.Vector3(0, 0, 0);
      const p2 = new THREE.Vector3(10, 0, 0);
      const point = new THREE.Vector3(5, 5, 0);

      const proj = projectPointOnSegment(point, p1, p2);
      expect(proj.x).toBeCloseTo(5, 5);
      expect(proj.y).toBeCloseTo(0, 5);
    });

    it('should clamp projection to segment endpoints', () => {
      const p1 = new THREE.Vector3(0, 0, 0);
      const p2 = new THREE.Vector3(10, 0, 0);
      const point = new THREE.Vector3(15, 5, 0);

      const proj = projectPointOnSegment(point, p1, p2);
      expect(proj.x).toBeCloseTo(10, 5);
      expect(proj.y).toBeCloseTo(0, 5);
    });
  });

  describe('distancePointToSegment', () => {
    it('should calculate correct distance', () => {
      const p1 = new THREE.Vector3(0, 0, 0);
      const p2 = new THREE.Vector3(10, 0, 0);
      const point = new THREE.Vector3(5, 3, 0);

      const dist = distancePointToSegment(point, p1, p2);
      expect(dist).toBeCloseTo(3, 5);
    });
  });

  describe('randomPointInSphere', () => {
    it('should generate points inside sphere', () => {
      for (let i = 0; i < 100; i++) {
        const point = randomPointInSphere(5);
        expect(point.length()).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('randomPointOnSphere', () => {
    it('should generate points on sphere surface', () => {
      for (let i = 0; i < 100; i++) {
        const point = randomPointOnSphere(5);
        expect(Math.abs(point.length() - 5)).toBeLessThan(0.01);
      }
    });
  });

  describe('Interval arithmetic', () => {
    it('should create intervals', () => {
      const i = makeInterval(3, 7);
      expect(i).toEqual([3, 7]);
    });

    it('should detect empty intervals', () => {
      expect(isEmptyInterval([5, 3])).toBe(true);
      expect(isEmptyInterval([3, 5])).toBe(false);
    });

    it('should union intervals', () => {
      const result = unionIntervals([1, 5], [3, 8]);
      expect(result).toEqual([1, 8]);
    });

    it('should intersect intervals', () => {
      const result = intersectIntervals([1, 5], [3, 8]);
      expect(result).toEqual([3, 5]);
    });

    it('should add scalar to interval', () => {
      const result = addScalarToInterval([2, 5], 3);
      expect(result).toEqual([5, 8]);
    });

    it('should multiply interval by scalar', () => {
      const result = multiplyIntervalByScalar([2, 5], 3);
      expect(result).toEqual([6, 15]);
    });

    it('should check if value is in interval', () => {
      expect(isInInterval(4, [2, 6])).toBe(true);
      expect(isInInterval(7, [2, 6])).toBe(false);
    });

    it('should calculate interval width', () => {
      expect(intervalWidth([2, 7])).toBe(5);
    });

    it('should calculate interval midpoint', () => {
      expect(intervalMidpoint([2, 8])).toBe(5);
    });
  });

  describe('Color utilities', () => {
    it('should convert RGB to hex', () => {
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
      expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
      expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
    });

    it('should convert hex to RGB', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should convert RGB to HSV', () => {
      const hsv = rgbToHsv(1, 0, 0);
      expect(hsv.h).toBe(0);
      expect(hsv.s).toBe(1);
      expect(hsv.v).toBe(1);
    });

    it('should convert HSV to RGB', () => {
      const rgb = hsvToRgb(0, 1, 1);
      expect(rgb.r).toBe(1);
      expect(rgb.g).toBe(0);
      expect(rgb.b).toBe(0);
    });

    it('should generate pleasant colors', () => {
      const color = randomPleasantColor(new SeededRandom(42));
      expect(color.r).toBeGreaterThanOrEqual(0);
      expect(color.r).toBeLessThanOrEqual(1);
      expect(color.g).toBeGreaterThanOrEqual(0);
      expect(color.g).toBeLessThanOrEqual(1);
      expect(color.b).toBeGreaterThanOrEqual(0);
      expect(color.b).toBeLessThanOrEqual(1);
    });

    it('should lerp colors', () => {
      const c1 = { r: 0, g: 0, b: 0 };
      const c2 = { r: 1, g: 1, b: 1 };
      
      const mid = lerpColor(c1, c2, 0.5);
      expect(mid.r).toBe(0.5);
      expect(mid.g).toBe(0.5);
      expect(mid.b).toBe(0.5);
    });
  });
});

describe('GeometryUtils', () => {
  describe('createRoundedBox', () => {
    it('should create a rounded box geometry', () => {
      const geom = createRoundedBox(2, 2, 2, 0.2, 4);
      expect(geom.attributes.position.count).toBeGreaterThan(0);
    });
  });

  describe('calculateSurfaceArea', () => {
    it('should calculate cube surface area', () => {
      const geom = new THREE.BoxGeometry(2, 2, 2);
      const area = calculateSurfaceArea(geom);
      expect(area).toBeCloseTo(24, 1); // 6 faces * 4 = 24
    });
  });

  describe('calculateVolume', () => {
    it('should calculate cube volume', () => {
      const geom = new THREE.BoxGeometry(2, 2, 2);
      const vol = calculateVolume(geom);
      expect(vol).toBeCloseTo(8, 1); // 2^3 = 8
    });
  });

  describe('mirrorGeometry', () => {
    it('should mirror geometry across X axis', () => {
      const geom = new THREE.BoxGeometry(2, 2, 2);
      geom.translate(5, 0, 0); // Move to x=5
      
      const mirrored = mirrorGeometry(geom, 'x');
      const positions = mirrored.attributes.position.array as Float32Array;
      
      // All x coordinates should be negative now
      for (let i = 0; i < positions.length; i += 3) {
        expect(positions[i]).toBeLessThan(0);
      }
    });
  });

  describe('scaleGeometry', () => {
    it('should scale geometry non-uniformly', () => {
      const geom = new THREE.BoxGeometry(2, 2, 2);
      const scaled = scaleGeometry(geom, 2, 0.5, 1);
      
      const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(scaled));
      const size = new THREE.Vector3();
      bbox.getSize(size);
      
      expect(size.x).toBeCloseTo(4, 1);
      expect(size.y).toBeCloseTo(1, 1);
      expect(size.z).toBeCloseTo(2, 1);
    });
  });
});

describe('PipelineUtils', () => {
  describe('SceneLayerManager', () => {
    it('should manage layers', () => {
      const manager = new SceneLayerManager();
      const obj1 = new THREE.Object3D();
      const obj2 = new THREE.Object3D();

      manager.addToLayer(obj1, 'layer1');
      manager.addToLayer(obj2, 'layer1');
      manager.addToLayer(obj1, 'layer2');

      expect(manager.getLayer('layer1').length).toBe(2);
      expect(manager.getLayer('layer2').length).toBe(1);
      expect(manager.getObjectLayers(obj1)).toContain('layer1');
      expect(manager.getObjectLayers(obj1)).toContain('layer2');
    });

    it('should toggle layer visibility', () => {
      const manager = new SceneLayerManager();
      const obj = new THREE.Object3D();
      obj.visible = true;

      manager.addToLayer(obj, 'test');
      manager.setLayerVisibility('test', false);
      expect(obj.visible).toBe(false);

      manager.setLayerVisibility('test', true);
      expect(obj.visible).toBe(true);
    });
  });

  describe('organizeSceneByTags', () => {
    it('should organize scene by tags', () => {
      const scene = new THREE.Scene();
      const obj1 = new THREE.Mesh();
      const obj2 = new THREE.Mesh();
      
      obj1.userData.tags = ['furniture', 'chair'];
      obj2.userData.tags = ['furniture', 'table'];
      
      scene.add(obj1);
      scene.add(obj2);

      const hierarchy = organizeSceneByTags(scene);
      expect(hierarchy.children.length).toBeGreaterThan(0);
    });
  });

  describe('Path utilities', () => {
    it('should generate unique paths', () => {
      const existing = new Set(['obj', 'obj_1', 'obj_2']);
      expect(generateUniquePath('obj', existing)).toBe('obj_3');
      expect(generateUniquePath('new', existing)).toBe('new');
    });

    it('should join paths', () => {
      expect(joinPath('a', 'b', 'c')).toBe('a/b/c');
      expect(joinPath('a/', '/b/', 'c')).toBe('a/b/c');
    });

    it('should extract directory', () => {
      expect(getDirectory('/path/to/file.txt')).toBe('/path/to');
      expect(getDirectory('file.txt')).toBe('');
    });

    it('should extract filename', () => {
      expect(getFilename('/path/to/file.txt')).toBe('file.txt');
      expect(getFilename('file.txt')).toBe('file.txt');
    });

    it('should extract extension', () => {
      expect(getExtension('file.txt')).toBe('txt');
      expect(getExtension('file.tar.gz')).toBe('gz');
    });

    it('should change extension', () => {
      expect(changeExtension('file.txt', 'pdf')).toBe('file.pdf');
      expect(changeExtension('file.txt', '.pdf')).toBe('file.pdf');
    });
  });

  describe('IMUSimulator', () => {
    it('should simulate IMU data', () => {
      const sim = new IMUSimulator(42);
      const pos = new THREE.Vector3(0, 0, 0);
      const vel = new THREE.Vector3(1, 0, 0);
      const acc = new THREE.Vector3(0, 0, 0);
      const orient = new THREE.Quaternion();
      const angVel = new THREE.Vector3(0, 0, 0);

      const data = sim.simulate(pos, vel, acc, orient, angVel);

      expect(data.accelerometer.length).toBe(3);
      expect(data.gyroscope.length).toBe(3);
      expect(data.magnetometer.length).toBe(3);
      expect(data.timestamp).toBeGreaterThan(0);
    });
  });
});
