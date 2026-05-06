/**
 * DragonflyGenerator — Procedural dragonfly with elongated body,
 * compound eyes, and wing venation patterns.
 *
 * Features:
 * - Elongated body segments using LatheGeometry (thin cylindrical abdomen, wider thorax, large head)
 * - Large compound eyes: IcosahedronGeometry (low detail) for faceted appearance
 * - Two pairs of wings: ShapeGeometry with proper wing venation (recursive branching from root)
 * - Wing venation: main vein + 4-6 cross veins per wing
 * - Long thin abdomen (6-8 segments), distinct thorax, large head with prominent eyes
 * - Iridescent body material (MeshPhysicalMaterial with metallic + color shift via iridescence)
 *
 * @module vegetation/dragonfly
 */

import {
  Object3D, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, DoubleSide,
  LatheGeometry, CylinderGeometry, IcosahedronGeometry, BoxGeometry,
  Shape, ShapeGeometry, Vector2, Color, Float32BufferAttribute,
} from 'three';
import { SeededRandom } from '@/core/util/MathUtils';

// ── Types ──────────────────────────────────────────────────────────────

export interface DragonflyConfig {
  size: number;
  bodyColor: string;
  wingColor: string;
  wingOpacity: number;
  compoundEyeColor: string;
  abdomenPattern: 'solid' | 'striped' | 'metallic';
  /** Number of abdomen segments (6-8) */
  abdomenSegments: number;
  /** Iridescence intensity for the body material (0 = none, 1 = strong) */
  iridescenceIntensity: number;
  seed: number;
}

const DEFAULT_CONFIG: DragonflyConfig = {
  size: 0.08,
  bodyColor: '#2E8B57',
  wingColor: '#E0F0FF',
  wingOpacity: 0.4,
  compoundEyeColor: '#4169E1',
  abdomenPattern: 'striped',
  abdomenSegments: 8,
  iridescenceIntensity: 0.8,
  seed: 42,
};

// ── DragonflyGenerator ────────────────────────────────────────────────

export class DragonflyGenerator {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a dragonfly mesh group.
   */
  generate(config: Partial<DragonflyConfig> = {}): Group {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    this.rng = new SeededRandom(cfg.seed);

    const group = new Group();
    group.name = 'Dragonfly';

    // Body
    const body = this.generateBody(cfg);
    group.add(body);

    // Head with compound eyes
    const head = this.generateHead(cfg);
    group.add(head);

    // Legs
    this.generateLegs(cfg).forEach(l => group.add(l));

    // Wings with venation
    this.generateWings(cfg).forEach(w => group.add(w));

    // Apply iridescent body material
    this.applyIridescentMaterial(group, cfg);

    return group;
  }

  // ── Body Generation with LatheGeometry Segments ─────────────────────

  private generateBody(cfg: DragonflyConfig): Object3D {
    const s = cfg.size;
    const bodyGroup = new Group();
    bodyGroup.name = 'body';

    // Thorax — compact middle section using LatheGeometry (wider than abdomen)
    const thoraxProfile: Vector2[] = [];
    const thoraxSteps = 12;
    for (let i = 0; i <= thoraxSteps; i++) {
      const t = i / thoraxSteps;
      const r = Math.sin(t * Math.PI) * s * 0.04;
      const y = (t - 0.5) * s * 0.12;
      thoraxProfile.push(new Vector2(Math.max(0.001, r), y));
    }
    const thoraxMat = new MeshPhysicalMaterial({
      color: cfg.bodyColor,
      roughness: 0.3,
      metalness: 0.3,
      clearcoat: 0.4,
      clearcoatRoughness: 0.15,
    });
    const thoraxGeo = new LatheGeometry(thoraxProfile, 12);
    const thorax = new Mesh(thoraxGeo, thoraxMat);
    thorax.rotation.x = Math.PI / 2;
    thorax.name = 'thorax';
    bodyGroup.add(thorax);

    // Abdomen — long, slender, segmented using LatheGeometry (6-8 segments)
    const abdomenGroup = new Group();
    abdomenGroup.name = 'abdomen';

    const segmentCount = Math.max(6, Math.min(8, cfg.abdomenSegments));

    for (let i = 0; i < segmentCount; i++) {
      const t = i / (segmentCount - 1);
      const segRadius = s * 0.025 * (1 - t * 0.4); // Tapers toward tail
      const segLen = s * 0.025;

      const segProfile: Vector2[] = [];
      const segSteps = 8;
      for (let j = 0; j <= segSteps; j++) {
        const u = j / segSteps;
        const r = Math.sin(u * Math.PI) * segRadius;
        const y = (u - 0.5) * segLen;
        segProfile.push(new Vector2(Math.max(0.001, r), y));
      }

      const segMat = new MeshPhysicalMaterial({
        color: cfg.bodyColor,
        roughness: 0.3,
        metalness: 0.3,
        clearcoat: 0.4,
        clearcoatRoughness: 0.15,
      });
      // Apply pattern variation
      if (cfg.abdomenPattern === 'striped' && i % 2 === 0) {
        segMat.color = new Color(cfg.bodyColor).multiplyScalar(1.3);
      } else if (cfg.abdomenPattern === 'metallic') {
        segMat.metalness = 0.6;
        segMat.roughness = 0.15;
      }

      const segGeo = new LatheGeometry(segProfile, 10);
      const seg = new Mesh(segGeo, segMat);
      seg.rotation.x = Math.PI / 2;
      seg.position.z = -s * 0.08 - i * segLen;
      abdomenGroup.add(seg);
    }

    // Cerci (tail appendages)
    const cerciMat = new MeshPhysicalMaterial({
      color: cfg.bodyColor, roughness: 0.3, metalness: 0.3,
    });
    for (const side of [-1, 1]) {
      const cerciGeo = new CylinderGeometry(s * 0.003, s * 0.001, s * 0.04);
      const cerci = new Mesh(cerciGeo, cerciMat);
      cerci.rotation.z = side * 0.3;
      cerci.position.set(side * s * 0.01, 0, -s * 0.3);
      abdomenGroup.add(cerci);
    }

    bodyGroup.add(abdomenGroup);
    return bodyGroup;
  }

  // ── Head with Compound Eyes (IcosahedronGeometry) ──────────────────

  private generateHead(cfg: DragonflyConfig): Object3D {
    const s = cfg.size;
    const group = new Group();
    group.name = 'headGroup';

    // Head — large, prominent
    const headMat = new MeshPhysicalMaterial({
      color: cfg.bodyColor, roughness: 0.3, metalness: 0.3,
    });
    const headGeo = new IcosahedronGeometry(s * 0.03, 2);
    headGeo.scale(1, 0.85, 0.9);
    const head = new Mesh(headGeo, headMat);
    head.position.z = s * 0.1;
    group.add(head);

    // Compound eyes — IcosahedronGeometry with low detail for faceted appearance
    const eyeMat = new MeshPhysicalMaterial({
      color: cfg.compoundEyeColor,
      roughness: 0.15,
      metalness: 0.2,
      clearcoat: 0.8,
      clearcoatRoughness: 0.05,
    });

    for (const side of [-1, 1]) {
      // Use IcosahedronGeometry with detail=1 for faceted compound eye look
      const eyeGeo = new IcosahedronGeometry(s * 0.025, 1);

      // Vertex color variation for compound eye facets
      const positions = eyeGeo.attributes.position;
      const colors = new Float32Array(positions.count * 3);
      const eyeRng = new SeededRandom(cfg.seed + side * 100);
      for (let i = 0; i < colors.length; i += 3) {
        const variation = eyeRng.next() * 0.15;
        colors[i] = 0.25 + variation;
        colors[i + 1] = 0.41 + variation;
        colors[i + 2] = 0.88 + variation;
      }
      eyeGeo.setAttribute('color', new Float32BufferAttribute(colors, 3));
      eyeMat.vertexColors = true;

      const eye = new Mesh(eyeGeo, eyeMat.clone());
      eye.scale.set(0.8, 1, 1);
      eye.position.set(side * s * 0.025, s * 0.005, s * 0.11);
      eye.name = `compoundEye_${side === -1 ? 'L' : 'R'}`;
      group.add(eye);
    }

    // Mouthparts (labium)
    const labiumMat = new MeshStandardMaterial({ color: '#3D2B1F' });
    const labiumGeo = new BoxGeometry(s * 0.015, s * 0.005, s * 0.03);
    const labium = new Mesh(labiumGeo, labiumMat);
    labium.position.set(0, -s * 0.02, s * 0.1);
    group.add(labium);

    // Short antennae (bristle-like)
    const antennaMat = new MeshStandardMaterial({ color: '#3D2B1F' });
    for (const side of [-1, 1]) {
      const antennaGeo = new CylinderGeometry(s * 0.002, s * 0.001, s * 0.03);
      const antenna = new Mesh(antennaGeo, antennaMat);
      antenna.rotation.z = side * 0.3;
      antenna.rotation.x = -0.5;
      antenna.position.set(side * s * 0.015, s * 0.02, s * 0.12);
      group.add(antenna);
    }

    return group;
  }

  // ── Legs ─────────────────────────────────────────────────────────────

  private generateLegs(cfg: DragonflyConfig): Object3D[] {
    const s = cfg.size;
    const legMat = new MeshStandardMaterial({ color: '#3D2B1F', roughness: 0.7 });
    const limbs: Object3D[] = [];

    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const legGroup = new Group();
        legGroup.name = `leg_${side === -1 ? 'L' : 'R'}${i}`;
        const z = s * 0.03 - i * s * 0.025;

        const femurGeo = new CylinderGeometry(s * 0.004, s * 0.003, s * 0.03);
        const femur = new Mesh(femurGeo, legMat);
        femur.rotation.z = side * -0.8;
        femur.position.set(side * s * 0.05, -s * 0.02, z);
        legGroup.add(femur);

        const tibiaGeo = new CylinderGeometry(s * 0.003, s * 0.001, s * 0.04);
        const tibia = new Mesh(tibiaGeo, legMat);
        tibia.position.set(side * s * 0.07, -s * 0.05, z);
        legGroup.add(tibia);

        limbs.push(legGroup);
      }
    }

    return limbs;
  }

  // ── Wings with Venation ─────────────────────────────────────────────

  private generateWings(cfg: DragonflyConfig): Object3D[] {
    const s = cfg.size;
    const appendages: Object3D[] = [];
    const wingGroup = new Group();
    wingGroup.name = 'wings';

    for (let wingIdx = 0; wingIdx < 4; wingIdx++) {
      const isForewing = wingIdx < 2;
      const side = wingIdx % 2 === 0 ? -1 : 1;

      const wing = this.createWing(s, isForewing, side, cfg);
      wing.position.set(side * s * 0.03, s * 0.03, isForewing ? s * 0.02 : -s * 0.02);
      wing.rotation.x = 0.1;
      wing.name = `${isForewing ? 'fore' : 'hind'}Wing_${side === -1 ? 'L' : 'R'}`;
      wingGroup.add(wing);
    }

    appendages.push(wingGroup);
    return appendages;
  }

  /** Create a single dragonfly wing with recursive branching venation */
  private createWing(
    s: number, isForewing: boolean, side: number, cfg: DragonflyConfig,
  ): Group {
    const wingGroup = new Group();

    // Wing shape
    const wingLength = isForewing ? s * 0.25 : s * 0.22;
    const wingWidth = isForewing ? s * 0.04 : s * 0.035;

    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(
      wingLength * 0.3, wingWidth * 1.2,
      wingLength * 0.7, wingWidth * 0.8,
      wingLength, wingWidth * 0.1,
    );
    shape.bezierCurveTo(
      wingLength * 1.02, -wingWidth * 0.05,
      wingLength * 0.98, -wingWidth * 0.15,
      wingLength * 0.95, -wingWidth * 0.2,
    );
    shape.bezierCurveTo(
      wingLength * 0.6, -wingWidth * 0.5,
      wingLength * 0.2, -wingWidth * 0.3,
      0, 0,
    );

    const wingMat = new MeshPhysicalMaterial({
      color: cfg.wingColor,
      transparent: true,
      opacity: cfg.wingOpacity,
      roughness: 0.05,
      metalness: 0.0,
      side: DoubleSide,
      depthWrite: false,
      transmission: 0.3,
      ior: 1.3,
      thickness: 0.01,
    });

    const wingGeo = new ShapeGeometry(shape);
    const wing = new Mesh(wingGeo, wingMat);
    wing.rotation.y = side * Math.PI * 0.5;
    wing.rotation.z = -Math.PI * 0.5;
    wingGroup.add(wing);

    // Main vein — recursive branching from root
    const veinMat = new MeshStandardMaterial({
      color: 0x444444,
      transparent: true,
      opacity: 0.5,
    });
    this.addVeinBranch(wingGroup, veinMat, 0, 0, wingLength, wingWidth * 0.3, 2, `vein_root_${side}`, side);

    // Cross-veins: 4-6 per wing (randomized per wing)
    const crossVeinCount = Math.round(4 + this.rng.next() * 2); // 4-6
    for (let c = 0; c < crossVeinCount; c++) {
      const t = (c + 1) / (crossVeinCount + 1);
      const crossLen = wingWidth * 0.6 * (1 - t * 0.3);
      const crossGeo = new CylinderGeometry(s * 0.0003, s * 0.0002, crossLen, 3);
      const cross = new Mesh(crossGeo, veinMat);
      cross.position.set(-wingLength * t, 0, 0);
      cross.name = `crossVein_${c}`;
      wingGroup.add(cross);
    }

    // Pterostigma (dark spot near wing tip)
    const stigMat = new MeshStandardMaterial({
      color: 0x333333, transparent: true, opacity: 0.6, side: DoubleSide,
    });
    const stigShape = new Shape();
    stigShape.moveTo(wingLength * 0.8, -wingWidth * 0.1);
    stigShape.lineTo(wingLength * 0.85, wingWidth * 0.2);
    stigShape.lineTo(wingLength * 0.9, wingWidth * 0.15);
    stigShape.lineTo(wingLength * 0.87, -wingWidth * 0.05);
    stigShape.lineTo(wingLength * 0.8, -wingWidth * 0.1);
    const stigGeo = new ShapeGeometry(stigShape);
    const stig = new Mesh(stigGeo, stigMat);
    stig.rotation.y = side * Math.PI * 0.5;
    stig.rotation.z = -Math.PI * 0.5;
    wingGroup.add(stig);

    return wingGroup;
  }

  /** Recursively add branching veins to a wing group */
  private addVeinBranch(
    group: Group, mat: MeshStandardMaterial,
    x0: number, y0: number, x1: number, y1: number,
    depth: number, name: string, side: number,
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 0.001) return;

    const veinGeo = new CylinderGeometry(
      Math.max(0.0001, length * 0.008),
      Math.max(0.0001, length * 0.015),
      length, 3,
    );
    const vein = new Mesh(veinGeo, mat);
    vein.position.set(side * (x0 + dx * 0.5), y0 + dy * 0.5, 0);
    const angle = Math.atan2(dy, dx);
    vein.rotation.z = side * (-Math.PI / 2 + angle * side);
    vein.name = name;
    group.add(vein);

    if (depth > 0 && length > 0.01) {
      const branchAngle1 = angle + 0.3;
      const branchAngle2 = angle - 0.3;
      const branchLength = length * 0.45;
      this.addVeinBranch(group, mat, x1, y1,
        x1 + Math.cos(branchAngle1) * branchLength,
        y1 + Math.sin(branchAngle1) * branchLength,
        depth - 1, `${name}_a`, side,
      );
      this.addVeinBranch(group, mat, x1, y1,
        x1 + Math.cos(branchAngle2) * branchLength,
        y1 + Math.sin(branchAngle2) * branchLength,
        depth - 1, `${name}_b`, side,
      );
    }
  }

  // ── Iridescent Body Material Application ────────────────────────────

  private applyIridescentMaterial(group: Group, cfg: DragonflyConfig): void {
    group.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshPhysicalMaterial) {
        const name = child.name.toLowerCase();
        // Skip eyes, wings, veins, and other special parts
        const isSpecialPart = name.includes('eye') || name.includes('wing') ||
          name.includes('vein') || name.includes('ptero') ||
          name.includes('mouth') || name.includes('antenna') ||
          (child.material as MeshPhysicalMaterial).vertexColors;
        if (!isSpecialPart) {
          const mat = child.material as MeshPhysicalMaterial;
          // Apply iridescent properties: metallic + color shift
          mat.iridescence = cfg.iridescenceIntensity;
          mat.iridescenceIOR = 1.3;
          mat.iridescenceThicknessRange = [100, 400];
          mat.metalness = Math.max(mat.metalness, 0.3);
          mat.roughness = Math.min(mat.roughness, 0.35);
          mat.clearcoat = 0.4;
          mat.clearcoatRoughness = 0.15;
        }
      }
    });
  }
}

// ── Convenience function ───────────────────────────────────────────────

export function generateDragonfly(config: Partial<DragonflyConfig> = {}): Group {
  const generator = new DragonflyGenerator(config.seed ?? 42);
  return generator.generate(config);
}
