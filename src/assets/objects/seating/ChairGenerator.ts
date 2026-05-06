/**
 * ChairGenerator - Procedural chair generator with 3 variants
 *
 * Generates dining chairs, office chairs, and bar stools using LatheGeometry
 * for turned/tapered legs. Each variant has distinct proportions, materials,
 * and construction style.
 *
 * Variants:
 *   1. dining  — Classic dining chair with wooden frame, backrest, optional arms
 *   2. office  — Ergonomic office chair with padded seat, mesh/solid back, gas lift
 *   3. bar_stool — Tall bar stool with footrest, backless or low back
 */

import * as THREE from 'three';
import {
  BaseIndoorObjectFactory,
  IndoorBBox,
  IndoorMaterialDescriptor,
  IndoorObjectConfig,
} from '../IndoorObjectRegistry';
import { SeededRandom } from '../../../core/util/math/index';

// ============================================================================
// Configuration Types
// ============================================================================

export type ChairVariant = 'dining' | 'office' | 'bar_stool';
export type BackStyle = 'solid' | 'slatted' | 'ladder' | 'mesh' | 'none';
export type LegTurnProfile = 'straight' | 'tapered' | 'cabriole' | 'spindle' | 'fluted';

export interface ChairConfig extends IndoorObjectConfig {
  variant: ChairVariant;

  // Dimensions
  seatWidth: number;
  seatDepth: number;
  seatHeight: number;
  backHeight: number;

  // Seat
  seatShape: 'rectangular' | 'rounded' | 'saddle';
  seatThickness: number;
  upholstered: boolean;
  cushionThickness: number;

  // Back
  backStyle: BackStyle;
  backAngle: number; // radians of backward tilt

  // Legs
  legProfile: LegTurnProfile;
  legCount: number; // 4 for dining/office, 4 or central for bar stool
  legRadius: number;
  footRadius: number;
  hasStretchers: boolean;

  // Arms
  hasArms: boolean;
  armHeight: number;

  // Bar stool specific
  hasFootrest: boolean;
  footrestHeight: number;
  hasSwivel: boolean;

  // Office specific
  hasGasLift: boolean;
  hasWheels: boolean;
  wheelCount: number;

  // Materials
  frameMaterial: 'wood' | 'metal' | 'plastic';
  seatMaterial: 'wood' | 'fabric' | 'leather' | 'mesh';
  frameColor: number;
  seatColor: number;
}

// ============================================================================
// Default Configs per Variant
// ============================================================================

const DINING_DEFAULTS: Partial<ChairConfig> = {
  variant: 'dining',
  seatWidth: 0.44,
  seatDepth: 0.42,
  seatHeight: 0.46,
  backHeight: 0.45,
  seatShape: 'rectangular',
  seatThickness: 0.04,
  upholstered: true,
  cushionThickness: 0.06,
  backStyle: 'ladder',
  backAngle: 0.12,
  legProfile: 'tapered',
  legCount: 4,
  legRadius: 0.022,
  footRadius: 0.015,
  hasStretchers: false,
  hasArms: false,
  armHeight: 0.22,
  hasFootrest: false,
  footrestHeight: 0,
  hasSwivel: false,
  hasGasLift: false,
  hasWheels: false,
  wheelCount: 0,
  frameMaterial: 'wood',
  seatMaterial: 'fabric',
  frameColor: 0x8B4513,
  seatColor: 0x555555,
};

const OFFICE_DEFAULTS: Partial<ChairConfig> = {
  variant: 'office',
  seatWidth: 0.50,
  seatDepth: 0.46,
  seatHeight: 0.48,
  backHeight: 0.60,
  seatShape: 'rounded',
  seatThickness: 0.06,
  upholstered: true,
  cushionThickness: 0.08,
  backStyle: 'mesh',
  backAngle: 0.08,
  legProfile: 'straight',
  legCount: 1,
  legRadius: 0.03,
  footRadius: 0.03,
  hasStretchers: false,
  hasArms: true,
  armHeight: 0.20,
  hasFootrest: false,
  footrestHeight: 0,
  hasSwivel: true,
  hasGasLift: true,
  hasWheels: true,
  wheelCount: 5,
  frameMaterial: 'metal',
  seatMaterial: 'fabric',
  frameColor: 0x333333,
  seatColor: 0x222222,
};

const BAR_STOOL_DEFAULTS: Partial<ChairConfig> = {
  variant: 'bar_stool',
  seatWidth: 0.38,
  seatDepth: 0.38,
  seatHeight: 0.75,
  backHeight: 0.20,
  seatShape: 'rounded',
  seatThickness: 0.05,
  upholstered: true,
  cushionThickness: 0.05,
  backStyle: 'none',
  backAngle: 0,
  legProfile: 'spindle',
  legCount: 4,
  legRadius: 0.025,
  footRadius: 0.018,
  hasStretchers: true,
  hasArms: false,
  armHeight: 0,
  hasFootrest: true,
  footrestHeight: 0.45,
  hasSwivel: false,
  hasGasLift: false,
  hasWheels: false,
  wheelCount: 0,
  frameMaterial: 'wood',
  seatMaterial: 'leather',
  frameColor: 0x654321,
  seatColor: 0x3a2a1a,
};

// ============================================================================
// ChairGenerator
// ============================================================================

export class ChairGenerator extends BaseIndoorObjectFactory<ChairConfig> {
  readonly factoryId = 'chair_generator';
  readonly category = 'furniture';
  readonly tags = ['chair', 'seating', 'furniture', 'indoor'];

  private variantDefaults: Record<ChairVariant, Partial<ChairConfig>> = {
    dining: DINING_DEFAULTS,
    office: OFFICE_DEFAULTS,
    bar_stool: BAR_STOOL_DEFAULTS,
  };

  getDefaultConfig(): ChairConfig {
    return { ...DINING_DEFAULTS, seed: this.seed } as ChairConfig;
  }

  generate(config?: Partial<ChairConfig>): THREE.Group {
    const variant: ChairVariant = config?.variant || 'dining';
    const defaults = this.variantDefaults[variant];
    const cfg: ChairConfig = {
      ...(defaults as ChairConfig),
      ...config,
      seed: config?.seed ?? this.seed,
    };

    const group = new THREE.Group();
    group.name = `Chair_${variant}`;

    switch (variant) {
      case 'dining':
        this.buildDiningChair(group, cfg);
        break;
      case 'office':
        this.buildOfficeChair(group, cfg);
        break;
      case 'bar_stool':
        this.buildBarStool(group, cfg);
        break;
    }

    group.userData.generatorId = this.factoryId;
    group.userData.config = cfg;

    return group;
  }

  getBoundingBox(config?: Partial<IndoorObjectConfig>): IndoorBBox {
    const cfg = config as Partial<ChairConfig>;
    const variant = cfg?.variant || 'dining';
    const defaults = this.variantDefaults[variant];
    const c = { ...defaults, ...cfg } as ChairConfig;

    const halfW = c.seatWidth / 2 + 0.05;
    const totalHeight = c.seatHeight + (c.backStyle !== 'none' ? c.backHeight : 0) + c.cushionThickness;

    return {
      min: new THREE.Vector3(-halfW, 0, -c.seatDepth / 2 - 0.05),
      max: new THREE.Vector3(halfW, totalHeight, c.seatDepth / 2 + 0.05),
    };
  }

  getMaterial(config?: Partial<IndoorObjectConfig>): IndoorMaterialDescriptor {
    const cfg = config as Partial<ChairConfig>;
    const variant = cfg?.variant || 'dining';
    const defaults = this.variantDefaults[variant];
    const c = { ...defaults, ...cfg } as ChairConfig;

    const mat = new THREE.MeshStandardMaterial({
      color: c.frameColor,
      roughness: c.frameMaterial === 'metal' ? 0.3 : 0.6,
      metalness: c.frameMaterial === 'metal' ? 0.8 : 0.1,
    });

    return this.createMaterialDescriptor(mat, c.frameMaterial === 'metal' ? 'metal' : 'wood');
  }

  // ==========================================================================
  // Dining Chair
  // ==========================================================================

  private buildDiningChair(group: THREE.Group, cfg: ChairConfig): void {
    const frameMat = this.createFrameMaterial(cfg);
    const seatMat = this.createSeatMaterial(cfg);

    // Seat
    const seat = this.createSeatMesh(cfg, seatMat);
    group.add(seat);

    // Legs using LatheGeometry for turned profiles
    const legPositions = this.getLegPositions(cfg);
    for (let i = 0; i < legPositions.length; i++) {
      const leg = this.createTurnedLeg(cfg, cfg.legProfile, cfg.seatHeight - cfg.seatThickness, frameMat);
      leg.position.set(legPositions[i].x, 0, legPositions[i].y);
      // Slight outward splay
      const splayAngle = 0.04;
      if (legPositions[i].x > 0) leg.rotation.z = -splayAngle;
      else if (legPositions[i].x < 0) leg.rotation.z = splayAngle;
      if (legPositions[i].y > 0) leg.rotation.x = splayAngle;
      else if (legPositions[i].y < 0) leg.rotation.x = -splayAngle;
      group.add(leg);
    }

    // Backrest
    if (cfg.backStyle !== 'none') {
      const back = this.createBackrest(cfg, frameMat, seatMat);
      group.add(back);
    }

    // Stretchers
    if (cfg.hasStretchers) {
      const stretchers = this.createStretchers(cfg, legPositions, frameMat);
      stretchers.forEach(s => group.add(s));
    }

    // Arms
    if (cfg.hasArms) {
      const arms = this.createArms(cfg, frameMat);
      arms.forEach(a => group.add(a));
    }
  }

  // ==========================================================================
  // Office Chair
  // ==========================================================================

  private buildOfficeChair(group: THREE.Group, cfg: ChairConfig): void {
    const frameMat = this.createFrameMaterial(cfg);
    const seatMat = this.createSeatMaterial(cfg);

    // Five-star base with wheels
    const base = this.createFiveStarBase(cfg, frameMat);
    group.add(base);

    // Gas lift column
    if (cfg.hasGasLift) {
      const column = this.createGasLift(cfg, frameMat);
      group.add(column);
    }

    // Seat
    const seat = this.createSeatMesh(cfg, seatMat);
    seat.position.y = cfg.hasGasLift ? 0.2 : 0;
    group.add(seat);

    // Backrest (mesh or solid)
    const back = this.createOfficeBackrest(cfg, frameMat, seatMat);
    group.add(back);

    // Arms
    if (cfg.hasArms) {
      const arms = this.createOfficeArms(cfg, frameMat);
      for (const a of arms.children) group.add(a.clone());
    }
  }

  // ==========================================================================
  // Bar Stool
  // ==========================================================================

  private buildBarStool(group: THREE.Group, cfg: ChairConfig): void {
    const frameMat = this.createFrameMaterial(cfg);
    const seatMat = this.createSeatMaterial(cfg);

    // Seat
    const seat = this.createRoundSeatMesh(cfg, seatMat);
    group.add(seat);

    // Legs using LatheGeometry (taller, spindled profile)
    const legPositions = this.getLegPositions(cfg);
    for (let i = 0; i < legPositions.length; i++) {
      const leg = this.createTurnedLeg(cfg, cfg.legProfile, cfg.seatHeight - cfg.seatThickness, frameMat);
      leg.position.set(legPositions[i].x, 0, legPositions[i].y);
      // More splay for bar stools
      const splayAngle = 0.06;
      if (legPositions[i].x > 0) leg.rotation.z = -splayAngle;
      else if (legPositions[i].x < 0) leg.rotation.z = splayAngle;
      if (legPositions[i].y > 0) leg.rotation.x = splayAngle;
      else if (legPositions[i].y < 0) leg.rotation.x = -splayAngle;
      group.add(leg);
    }

    // Footrest ring
    if (cfg.hasFootrest) {
      const footrest = this.createFootrest(cfg, frameMat);
      group.add(footrest);
    }

    // Stretchers
    if (cfg.hasStretchers) {
      const stretchers = this.createStretchers(cfg, legPositions, frameMat);
      stretchers.forEach(s => group.add(s));
    }

    // Low back (optional)
    if (cfg.backStyle !== 'none' && cfg.backHeight > 0) {
      const back = this.createBackrest(cfg, frameMat, seatMat);
      group.add(back);
    }
  }

  // ==========================================================================
  // LatheGeometry Turned Legs
  // ==========================================================================

  /**
   * Create a turned leg using LatheGeometry — the key feature requested.
   * Generates a 2D profile (array of Vector2 points) and revolves it around
   * the Y axis to produce classic furniture leg shapes.
   */
  private createTurnedLeg(
    cfg: ChairConfig,
    profile: LegTurnProfile,
    height: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const points = this.getLegProfile(profile, height, cfg.legRadius, cfg.footRadius);
    const geometry = new THREE.LatheGeometry(points, 16);
    geometry.translate(0, height / 2, 0); // Center at origin, extend upward
    geometry.translate(0, -height / 2, 0); // Origin at bottom

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `leg_${profile}`;
    return mesh;
  }

  /**
   * Generate 2D profile points for LatheGeometry based on leg style.
   * Points are in (radius, height) space, from bottom to top.
   */
  private getLegProfile(
    profile: LegTurnProfile,
    height: number,
    topRadius: number,
    bottomRadius: number,
  ): THREE.Vector2[] {
    const points: THREE.Vector2[] = [];
    const segments = 20;

    switch (profile) {
      case 'tapered': {
        // Simple taper: thicker at top, thinner at bottom
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const r = bottomRadius + (topRadius - bottomRadius) * t;
          points.push(new THREE.Vector2(r, t * height));
        }
        break;
      }

      case 'cabriole': {
        // Classic cabriole: curves outward at bottom (foot), narrows at knee,
        // then tapers to top
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          let r: number;
          if (t < 0.15) {
            // Foot: wider pad at the bottom
            r = bottomRadius * 1.4 * Math.sin((t / 0.15) * Math.PI / 2);
          } else if (t < 0.35) {
            // Narrowing ankle
            const ankleT = (t - 0.15) / 0.2;
            r = bottomRadius * 1.4 - (bottomRadius * 0.9) * ankleT;
          } else if (t < 0.55) {
            // Knee: bulge outward
            const kneeT = (t - 0.35) / 0.2;
            r = bottomRadius * 0.5 + bottomRadius * 0.8 * Math.sin(kneeT * Math.PI);
          } else {
            // Upper taper to seat
            const upperT = (t - 0.55) / 0.45;
            r = bottomRadius * 0.5 + (topRadius - bottomRadius * 0.5) * upperT;
          }
          points.push(new THREE.Vector2(Math.max(0.005, r), t * height));
        }
        break;
      }

      case 'spindle': {
        // Spindle/turned: series of bulges and narrows (bobbin turning)
        const bulgeCount = 3;
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const h = t * height;
          let r: number;

          // Top and bottom collars
          if (t < 0.05) {
            r = topRadius * 0.9 * (t / 0.05);
          } else if (t > 0.95) {
            r = bottomRadius * 0.9 * ((1 - t) / 0.05);
          } else {
            // Spindle bulges
            const mid = (t - 0.05) / 0.9;
            const bulgePhase = mid * bulgeCount * Math.PI * 2;
            const bulge = Math.sin(bulgePhase) * 0.3;
            const baseR = bottomRadius + (topRadius - bottomRadius) * (1 - t);
            r = baseR * (1 + bulge);
          }
          points.push(new THREE.Vector2(Math.max(0.005, r), h));
        }
        break;
      }

      case 'fluted': {
        // Fluted: reeded column with slight taper
        // LatheGeometry handles the radial symmetry, we just define the outline
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const r = bottomRadius + (topRadius - bottomRadius) * t;
          // Add a subtle collar at top and bottom
          let finalR = r;
          if (t < 0.08) finalR = r * (0.6 + 0.4 * (t / 0.08));
          else if (t > 0.92) finalR = r * (0.6 + 0.4 * ((1 - t) / 0.08));
          points.push(new THREE.Vector2(Math.max(0.005, finalR), t * height));
        }
        break;
      }

      case 'straight':
      default: {
        // Simple straight cylinder
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const r = bottomRadius + (topRadius - bottomRadius) * t;
          points.push(new THREE.Vector2(r, t * height));
        }
        break;
      }
    }

    return points;
  }

  // ==========================================================================
  // Seat Construction
  // ==========================================================================

  private createSeatMesh(cfg: ChairConfig, material: THREE.Material): THREE.Mesh {
    let geometry: THREE.BufferGeometry;

    switch (cfg.seatShape) {
      case 'rounded': {
        // Rounded rectangle using Shape
        const shape = this.createRoundedRectShape(cfg.seatWidth, cfg.seatDepth, 0.03);
        geometry = new THREE.ExtrudeGeometry(shape, {
          depth: cfg.seatThickness,
          bevelEnabled: true,
          bevelThickness: 0.005,
          bevelSize: 0.005,
          bevelSegments: 2,
        });
        geometry.rotateX(-Math.PI / 2);
        break;
      }
      case 'saddle': {
        // Saddle seat: contoured surface
        geometry = new THREE.BoxGeometry(cfg.seatWidth, cfg.seatThickness, cfg.seatDepth);
        // Add saddle dip
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i];
          const y = positions[i + 1];
          if (y > 0) {
            const nx = x / (cfg.seatWidth / 2);
            const dip = (1 - nx * nx) * 0.01;
            positions[i + 1] = y - dip;
          }
        }
        geometry.attributes.position.needsUpdate = true;
        geometry.computeVertexNormals();
        break;
      }
      default: {
        geometry = new THREE.BoxGeometry(cfg.seatWidth, cfg.seatThickness, cfg.seatDepth);
        break;
      }
    }

    const seatMesh = new THREE.Mesh(geometry, material);
    seatMesh.position.y = cfg.seatHeight;
    seatMesh.castShadow = true;
    seatMesh.receiveShadow = true;
    seatMesh.name = 'seat';

    // Add cushion if upholstered
    if (cfg.upholstered && cfg.cushionThickness > 0) {
      const cushionGeo = new THREE.BoxGeometry(
        cfg.seatWidth * 0.92,
        cfg.cushionThickness,
        cfg.seatDepth * 0.92,
      );
      const cushionMat = new THREE.MeshStandardMaterial({
        color: cfg.seatColor,
        roughness: 0.85,
        metalness: 0.0,
      });
      const cushion = new THREE.Mesh(cushionGeo, cushionMat);
      cushion.position.y = cfg.seatHeight + cfg.seatThickness / 2 + cfg.cushionThickness / 2;
      cushion.castShadow = true;
      cushion.name = 'cushion';

      // Group seat + cushion
      const seatGroup = new THREE.Group();
      seatGroup.add(seatMesh);
      seatGroup.add(cushion);
      return seatGroup as any;
    }

    return seatMesh;
  }

  private createRoundSeatMesh(cfg: ChairConfig, material: THREE.Material): THREE.Mesh {
    const radius = Math.min(cfg.seatWidth, cfg.seatDepth) / 2;
    const geometry = new THREE.CylinderGeometry(radius, radius * 0.95, cfg.seatThickness, 32);

    let seatMesh: THREE.Mesh;
    if (cfg.upholstered && cfg.cushionThickness > 0) {
      // Padded seat
      const paddedGeo = new THREE.CylinderGeometry(
        radius * 0.9,
        radius * 0.88,
        cfg.cushionThickness,
        32,
      );
      const cushionMat = new THREE.MeshStandardMaterial({
        color: cfg.seatColor,
        roughness: 0.85,
        metalness: 0.0,
      });
      seatMesh = new THREE.Mesh(geometry, material);
      const cushion = new THREE.Mesh(paddedGeo, cushionMat);
      cushion.position.y = cfg.cushionThickness / 2 + cfg.seatThickness / 2;
      seatMesh.add(cushion);
    } else {
      seatMesh = new THREE.Mesh(geometry, material);
    }

    seatMesh.position.y = cfg.seatHeight;
    seatMesh.castShadow = true;
    seatMesh.receiveShadow = true;
    seatMesh.name = 'round_seat';
    return seatMesh;
  }

  // ==========================================================================
  // Backrest Construction
  // ==========================================================================

  private createBackrest(
    cfg: ChairConfig,
    frameMat: THREE.Material,
    seatMat: THREE.Material,
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = 'backrest';

    const backY = cfg.seatHeight + cfg.seatThickness / 2;
    const backZ = -cfg.seatDepth / 2 + 0.02;

    switch (cfg.backStyle) {
      case 'solid': {
        // Solid wood/fabric panel
        const panelGeo = new THREE.BoxGeometry(
          cfg.seatWidth * 0.9,
          cfg.backHeight,
          0.02,
        );
        const panel = new THREE.Mesh(panelGeo, seatMat);
        panel.position.set(0, backY + cfg.backHeight / 2, backZ);
        panel.rotation.x = -cfg.backAngle;
        panel.castShadow = true;
        group.add(panel);
        break;
      }

      case 'slatted': {
        // Horizontal slats
        const slatCount = Math.floor(cfg.backHeight / 0.06);
        const slatHeight = 0.03;
        for (let i = 0; i < slatCount; i++) {
          const t = i / slatCount;
          const y = backY + t * cfg.backHeight;
          const z = backZ - Math.sin(t * Math.PI) * 0.01;
          const slatGeo = new THREE.BoxGeometry(cfg.seatWidth * 0.85, slatHeight, 0.015);
          const slat = new THREE.Mesh(slatGeo, frameMat);
          slat.position.set(0, y, z);
          slat.rotation.x = -cfg.backAngle;
          slat.castShadow = true;
          group.add(slat);
        }
        break;
      }

      case 'ladder': {
        // Two vertical posts + horizontal rails
        const postRadius = cfg.legRadius * 0.8;
        const halfW = cfg.seatWidth * 0.42;

        for (const side of [-1, 1]) {
          const postGeo = new THREE.CylinderGeometry(postRadius, postRadius, cfg.backHeight, 12);
          const post = new THREE.Mesh(postGeo, frameMat);
          post.position.set(side * halfW, backY + cfg.backHeight / 2, backZ);
          post.rotation.x = -cfg.backAngle;
          post.castShadow = true;
          group.add(post);
        }

        // Horizontal rails
        const railCount = 3;
        for (let i = 0; i < railCount; i++) {
          const t = (i + 1) / (railCount + 1);
          const y = backY + t * cfg.backHeight;
          const railGeo = new THREE.BoxGeometry(halfW * 2, 0.025, 0.015);
          const rail = new THREE.Mesh(railGeo, frameMat);
          rail.position.set(0, y, backZ);
          rail.rotation.x = -cfg.backAngle;
          rail.castShadow = true;
          group.add(rail);
        }
        break;
      }

      case 'none':
      default:
        break;
    }

    return group;
  }

  private createOfficeBackrest(
    cfg: ChairConfig,
    frameMat: THREE.Material,
    seatMat: THREE.Material,
  ): THREE.Group {
    const group = new THREE.Group();
    const baseY = cfg.seatHeight + cfg.cushionThickness;

    if (cfg.backStyle === 'mesh') {
      // Mesh backrest: semi-transparent panel with frame
      const meshMat = new THREE.MeshStandardMaterial({
        color: cfg.seatColor,
        transparent: true,
        opacity: 0.7,
        roughness: 0.8,
        metalness: 0.0,
      });
      const panelGeo = new THREE.BoxGeometry(
        cfg.seatWidth * 0.85,
        cfg.backHeight,
        0.015,
      );
      const panel = new THREE.Mesh(panelGeo, meshMat);
      panel.position.set(0, baseY + cfg.backHeight / 2, -cfg.seatDepth / 3);
      panel.rotation.x = -cfg.backAngle;
      panel.castShadow = true;
      group.add(panel);

      // Frame around mesh
      const frameGeo = new THREE.TorusGeometry(
        Math.max(cfg.seatWidth * 0.85, cfg.backHeight) / 2,
        0.015,
        8,
        32,
      );
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(0, baseY + cfg.backHeight / 2, -cfg.seatDepth / 3);
      frame.rotation.x = -cfg.backAngle;
      frame.castShadow = true;
      group.add(frame);
    } else {
      // Solid padded back
      const panelGeo = new THREE.BoxGeometry(
        cfg.seatWidth * 0.85,
        cfg.backHeight,
        cfg.cushionThickness * 0.8,
      );
      const panel = new THREE.Mesh(panelGeo, seatMat);
      panel.position.set(0, baseY + cfg.backHeight / 2, -cfg.seatDepth / 3);
      panel.rotation.x = -cfg.backAngle;
      panel.castShadow = true;
      group.add(panel);
    }

    return group;
  }

  // ==========================================================================
  // Office Chair Specific Components
  // ==========================================================================

  private createFiveStarBase(cfg: ChairConfig, material: THREE.Material): THREE.Group {
    const base = new THREE.Group();
    base.name = 'five_star_base';
    const hubRadius = 0.06;

    // Central hub
    const hubGeo = new THREE.CylinderGeometry(hubRadius, hubRadius * 1.2, 0.04, 16);
    const hub = new THREE.Mesh(hubGeo, material);
    hub.position.y = 0.02;
    hub.castShadow = true;
    base.add(hub);

    // Star arms
    const armLength = 0.28;
    for (let i = 0; i < cfg.wheelCount; i++) {
      const angle = (i / cfg.wheelCount) * Math.PI * 2;
      const armGeo = new THREE.BoxGeometry(armLength, 0.03, 0.035);
      const arm = new THREE.Mesh(armGeo, material);
      arm.position.set(
        Math.sin(angle) * armLength / 2,
        0.015,
        Math.cos(angle) * armLength / 2,
      );
      arm.rotation.y = -angle;
      arm.castShadow = true;
      base.add(arm);

      // Wheel caster at end of arm
      if (cfg.hasWheels) {
        const wheelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.03, 16);
        const wheel = new THREE.Mesh(wheelGeo, material);
        wheel.position.set(
          Math.sin(angle) * armLength,
          0.015,
          Math.cos(angle) * armLength,
        );
        wheel.rotation.x = Math.PI / 2;
        wheel.castShadow = true;
        base.add(wheel);
      }
    }

    return base;
  }

  private createGasLift(cfg: ChairConfig, material: THREE.Material): THREE.Mesh {
    const columnHeight = cfg.seatHeight - cfg.seatThickness - 0.1;
    const geo = new THREE.CylinderGeometry(0.025, 0.035, columnHeight, 16);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = 0.05 + columnHeight / 2;
    mesh.castShadow = true;
    mesh.name = 'gas_lift';
    return mesh;
  }

  private createOfficeArms(cfg: ChairConfig, material: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    const armY = cfg.seatHeight + cfg.armHeight;

    for (const side of [-1, 1]) {
      // Arm pad
      const padGeo = new THREE.BoxGeometry(0.06, 0.025, cfg.seatDepth * 0.5);
      const padMat = new THREE.MeshStandardMaterial({
        color: cfg.seatColor,
        roughness: 0.8,
        metalness: 0.0,
      });
      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.set(side * (cfg.seatWidth / 2 + 0.03), armY, 0);
      pad.castShadow = true;
      group.add(pad);

      // Vertical support
      const supportGeo = new THREE.CylinderGeometry(0.015, 0.02, cfg.armHeight, 8);
      const support = new THREE.Mesh(supportGeo, material);
      support.position.set(
        side * (cfg.seatWidth / 2 + 0.03),
        armY - cfg.armHeight / 2,
        cfg.seatDepth * 0.15,
      );
      support.castShadow = true;
      group.add(support);
    }

    return group;
  }

  // ==========================================================================
  // Bar Stool Specific Components
  // ==========================================================================

  private createFootrest(cfg: ChairConfig, material: THREE.Material): THREE.Mesh {
    // Ring footrest using TorusGeometry
    const ringRadius = Math.min(cfg.seatWidth, cfg.seatDepth) / 2 - 0.02;
    const tubeRadius = 0.012;
    const geo = new THREE.TorusGeometry(ringRadius, tubeRadius, 8, 32);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = cfg.footrestHeight;
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    mesh.name = 'footrest';
    return mesh;
  }

  // ==========================================================================
  // Shared Components
  // ==========================================================================

  private getLegPositions(cfg: ChairConfig): THREE.Vector2[] {
    const positions: THREE.Vector2[] = [];
    const inset = 0.04;
    const halfW = cfg.seatWidth / 2 - inset;
    const halfD = cfg.seatDepth / 2 - inset;

    if (cfg.legCount === 3) {
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
        positions.push(new THREE.Vector2(
          Math.cos(angle) * halfW,
          Math.sin(angle) * halfD,
        ));
      }
    } else if (cfg.legCount === 4) {
      positions.push(new THREE.Vector2(-halfW, -halfD));
      positions.push(new THREE.Vector2(halfW, -halfD));
      positions.push(new THREE.Vector2(halfW, halfD));
      positions.push(new THREE.Vector2(-halfW, halfD));
    } else if (cfg.legCount === 1) {
      positions.push(new THREE.Vector2(0, 0));
    }

    return positions;
  }

  private createStretchers(
    cfg: ChairConfig,
    legPositions: THREE.Vector2[],
    material: THREE.Material,
  ): THREE.Mesh[] {
    const stretchers: THREE.Mesh[] = [];
    if (legPositions.length < 4) return stretchers;

    const stretcherHeight = cfg.seatHeight * 0.4;
    const stretcherRadius = 0.01;

    // Connect adjacent legs
    for (let i = 0; i < legPositions.length; i++) {
      const a = legPositions[i];
      const b = legPositions[(i + 1) % legPositions.length];
      const midX = (a.x + b.x) / 2;
      const midZ = (a.y + b.y) / 2;
      const length = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);

      const geo = new THREE.CylinderGeometry(stretcherRadius, stretcherRadius, length, 8);
      const stretcher = new THREE.Mesh(geo, material);
      stretcher.position.set(midX, stretcherHeight, midZ);
      stretcher.rotation.z = Math.PI / 2;
      stretcher.rotation.y = -angle;
      stretcher.castShadow = true;
      stretcher.name = `stretcher_${i}`;
      stretchers.push(stretcher);
    }

    return stretchers;
  }

  private createArms(cfg: ChairConfig, material: THREE.Material): THREE.Mesh[] {
    const arms: THREE.Mesh[] = [];
    const armY = cfg.seatHeight + cfg.armHeight;

    for (const side of [-1, 1]) {
      // Arm rest
      const armGeo = new THREE.BoxGeometry(0.04, 0.02, cfg.seatDepth * 0.6);
      const arm = new THREE.Mesh(armGeo, material);
      arm.position.set(side * (cfg.seatWidth / 2 + 0.02), armY, -0.02);
      arm.castShadow = true;
      arms.push(arm);

      // Front support
      const supportGeo = new THREE.CylinderGeometry(0.015, 0.015, cfg.armHeight, 8);
      const frontSupport = new THREE.Mesh(supportGeo, material);
      frontSupport.position.set(
        side * (cfg.seatWidth / 2 + 0.02),
        armY - cfg.armHeight / 2,
        cfg.seatDepth * 0.2,
      );
      frontSupport.castShadow = true;
      arms.push(frontSupport);

      // Back support
      const backSupport = new THREE.Mesh(supportGeo.clone(), material);
      backSupport.position.set(
        side * (cfg.seatWidth / 2 + 0.02),
        armY - cfg.armHeight / 2,
        -cfg.seatDepth * 0.2,
      );
      backSupport.castShadow = true;
      arms.push(backSupport);
    }

    return arms;
  }

  // ==========================================================================
  // Material Helpers
  // ==========================================================================

  private createFrameMaterial(cfg: ChairConfig): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: cfg.frameColor,
      roughness: cfg.frameMaterial === 'metal' ? 0.3 : 0.65,
      metalness: cfg.frameMaterial === 'metal' ? 0.8 : 0.1,
    });
  }

  private createSeatMaterial(cfg: ChairConfig): THREE.MeshStandardMaterial {
    const isMesh = cfg.seatMaterial === 'mesh';
    return new THREE.MeshStandardMaterial({
      color: cfg.seatColor,
      roughness: cfg.seatMaterial === 'leather' ? 0.5 : cfg.seatMaterial === 'wood' ? 0.6 : 0.85,
      metalness: cfg.seatMaterial === 'wood' ? 0.0 : 0.0,
      transparent: isMesh,
      opacity: isMesh ? 0.7 : 1.0,
    });
  }

  private createRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
    const shape = new THREE.Shape();
    const hw = w / 2;
    const hh = h / 2;

    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    shape.lineTo(hw, hh - r);
    shape.quadraticCurveTo(hw, hh, hw - r, hh);
    shape.lineTo(-hw + r, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    shape.lineTo(-hw, -hh + r);
    shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

    return shape;
  }
}
