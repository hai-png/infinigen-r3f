/**
 * EyeGenerator - Procedural eye generation with deep detail
 *
 * Supports:
 * - Camera (vertebrate) eyes with proper UV sphere, iris/cornea, eyelids
 * - Compound (insect) eyes with faceted surface
 * - Pupil types: round (mammal), horizontal (goat/horse), vertical (cat/snake), compound (insect)
 * - Eyelid geometry that wraps around the eyeball for blinking animation
 * - Iris color ring pattern via procedural texture
 * - Cornea transparency with refraction hint
 *
 * Phase 2: Now returns attachment joints for blinking animation and
 * NURBS-to-armature pipeline integration.
 */

import * as THREE from 'three';
import { SeededRandom } from '../../../../core/util/MathUtils';
import type { Joint } from './HeadDetailGenerator';

// ── Types ────────────────────────────────────────────────────────────

export type EyeType = 'compound' | 'camera';
export type PupilType = 'round' | 'horizontal' | 'vertical' | 'compound';

export interface EyeConfig {
  type: EyeType;
  count: number;           // number of eyes (2 for most, more for spiders)
  size: number;            // radius of the eye
  color: number;           // iris or overall color
  scleraColor?: number;    // white of eye for vertebrates
  pupilColor?: number;     // pupil color for vertebrates
  pupilType?: PupilType;   // pupil shape
  facetCount?: number;     // number of facets for compound eyes
  spacing?: number;        // distance between eyes
  hasEyelid?: boolean;     // whether to generate eyelid geometry
  eyelidColor?: number;    // eyelid/skin color
}

export interface EyeResult {
  group: THREE.Group;
  joints: Record<string, Joint>;
}

// ── Eye Generator ────────────────────────────────────────────────────

export class EyeGenerator {
  private seed: number;
  private rng: SeededRandom;

  constructor(seed?: number) {
    this.seed = seed ?? 42;
    this.rng = new SeededRandom(this.seed);
  }

  generate(type: 'compound' | 'camera' | string, count: number, size: number): THREE.Group;
  generate(config: Partial<EyeConfig>): THREE.Group;
  generate(typeOrConfig: string | Partial<EyeConfig>, count?: number, size?: number): THREE.Group;
  generate(typeOrConfig: string | Partial<EyeConfig>, count?: number, size?: number): THREE.Group {
    const result = this.generateWithJoints(typeOrConfig, count, size);
    return result.group;
  }

  /**
   * Generate eyes with full joint data for rigging.
   */
  generateWithJoints(typeOrConfig: string | Partial<EyeConfig>, count?: number, size?: number): EyeResult {
    let config: EyeConfig;

    if (typeof typeOrConfig === 'string') {
      config = {
        type: typeOrConfig as EyeType,
        count: count ?? 2,
        size: size ?? 0.05,
        color: 0x000000,
        scleraColor: 0xeeeeee,
        pupilColor: 0x111111,
        pupilType: typeOrConfig === 'compound' ? 'compound' : 'round',
        facetCount: 50,
        spacing: size ? size * 2 : 0.1,
        hasEyelid: typeOrConfig !== 'compound',
        eyelidColor: 0xcc9988,
      };
    } else {
      config = {
        type: 'camera',
        count: 2,
        size: 0.05,
        color: 0x442200,
        scleraColor: 0xeeeeee,
        pupilColor: 0x111111,
        pupilType: 'round',
        facetCount: 50,
        spacing: 0.1,
        hasEyelid: true,
        eyelidColor: 0xcc9988,
        ...typeOrConfig,
      };
    }

    const eyes = new THREE.Group();
    eyes.name = 'eyes';

    const joints: Record<string, Joint> = {};

    switch (config.type) {
      case 'compound':
        this.buildCompoundEyes(eyes, config, joints);
        break;
      case 'camera':
      default:
        this.buildCameraEyes(eyes, config, joints);
        break;
    }

    return { group: eyes, joints };
  }

  /**
   * Compound eyes (insect): large, faceted hemispheres covering much of the head
   */
  private buildCompoundEyes(eyes: THREE.Group, config: EyeConfig, joints: Record<string, Joint>): void {
    const { count, size, color, facetCount, spacing } = config;

    for (let i = 0; i < count; i++) {
      const side = i === 0 ? -1 : 1;
      const sideName = side === -1 ? 'L' : 'R';
      const eyeGroup = new THREE.Group();
      eyeGroup.name = `compoundEye_${sideName}`;

      // Main hemisphere of the compound eye
      const eyeGeo = new THREE.SphereGeometry(size, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
      });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.name = 'compoundEyeSurface';
      eyeGroup.add(eye);

      // Facet bumps on the surface
      const facetMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).offsetHSL(0, 0, 0.1),
        roughness: 0.15,
        metalness: 0.1,
      });
      const actualFacetCount = facetCount ?? 50;
      for (let f = 0; f < actualFacetCount; f++) {
        // Distribute facets on the hemisphere
        const phi = Math.acos(1 - this.rng.next() * 0.6); // upper hemisphere
        const theta = this.rng.next() * Math.PI * 2;
        const facetRadius = size * this.rng.nextFloat(0.06, 0.10);

        const facetGeo = new THREE.SphereGeometry(facetRadius, 6, 4);
        const facet = new THREE.Mesh(facetGeo, facetMat);

        // Position on the hemisphere surface
        const r = size * 0.95;
        facet.position.set(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta)
        );
        facet.name = `facet_${f}`;
        eyeGroup.add(facet);
      }

      // Position each eye
      eyeGroup.position.set(side * (spacing ?? size * 2), size * 0.2, size * 0.6);
      eyes.add(eyeGroup);

      // Joint for potential eye movement
      joints[`compoundEye_${sideName}`] = {
        name: `compoundEye_${sideName}`,
        position: eyeGroup.position.clone(),
        rotation: new THREE.Euler(0, 0, 0),
        bounds: {
          min: new THREE.Vector3(-0.2, -0.2, -0.1),
          max: new THREE.Vector3(0.2, 0.2, 0.1),
        },
      };
    }
  }

  /**
   * Camera/vertebrate eyes: sclera + iris + pupil with realistic layering,
   * eyelids, and proper pupil shapes
   */
  private buildCameraEyes(eyes: THREE.Group, config: EyeConfig, joints: Record<string, Joint>): void {
    const { count, size, color, scleraColor, pupilColor, pupilType, spacing, hasEyelid, eyelidColor } = config;
    const irisColor = color;
    const white = scleraColor ?? 0xeeeeee;
    const dark = pupilColor ?? 0x111111;
    const pupilShape = pupilType ?? 'round';

    for (let i = 0; i < count; i++) {
      const side = i === 0 ? -1 : 1;
      const sideName = side === -1 ? 'L' : 'R';
      const eyeGroup = new THREE.Group();
      eyeGroup.name = `eye_${sideName}`;

      // Eyeball: proper UV sphere with slight asymmetry
      const eyeballGeo = this.createEyeballGeometry(size);
      const scleraMat = new THREE.MeshStandardMaterial({
        color: white,
        roughness: 0.3,
        metalness: 0.0,
      });
      const eyeball = new THREE.Mesh(eyeballGeo, scleraMat);
      eyeball.name = 'eyeball';
      eyeGroup.add(eyeball);

      // Iris (colored ring) - procedural texture via canvas
      const irisRadius = size * 0.55;
      const irisGeo = new THREE.CircleGeometry(irisRadius, 32);
      const irisMat = this.createIrisMaterial(irisColor, irisRadius);
      const iris = new THREE.Mesh(irisGeo, irisMat);
      iris.position.z = size * 0.95;
      iris.name = 'iris';
      eyeGroup.add(iris);

      // Iris detail ring (darker outer edge)
      const irisRingGeo = new THREE.RingGeometry(irisRadius * 0.85, irisRadius, 32);
      const irisRingMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(irisColor).multiplyScalar(0.6),
        roughness: 0.5,
        side: THREE.DoubleSide,
      });
      const irisRing = new THREE.Mesh(irisRingGeo, irisRingMat);
      irisRing.position.z = size * 0.96;
      irisRing.name = 'irisRing';
      eyeGroup.add(irisRing);

      // Pupil shape based on type
      const pupilMesh = this.createPupil(pupilShape, size, dark);
      pupilMesh.position.z = size * 0.97;
      eyeGroup.add(pupilMesh);

      // Cornea (transparent dome over the front with refraction hint)
      const corneaGeo = new THREE.SphereGeometry(size * 0.95, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.4);
      const corneaMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
        roughness: 0.05,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        transmission: 0.6,
        ior: 1.376, // cornea refractive index
      });
      const cornea = new THREE.Mesh(corneaGeo, corneaMat);
      cornea.rotation.x = Math.PI;
      cornea.position.z = size * 0.1;
      cornea.name = 'cornea';
      eyeGroup.add(cornea);

      // Specular highlight (tiny bright dot)
      const highlightGeo = new THREE.SphereGeometry(size * 0.06, 6, 6);
      const highlightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.0,
        metalness: 0.0,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
      });
      const highlight = new THREE.Mesh(highlightGeo, highlightMat);
      highlight.position.set(size * 0.2, size * 0.25, size * 0.9);
      highlight.name = 'highlight';
      eyeGroup.add(highlight);

      // Eyelid geometry (wraps around the eyeball for blinking)
      if (hasEyelid !== false) {
        this.buildEyelids(eyeGroup, size, eyelidColor ?? 0xcc9988);
      }

      // Position each eye
      eyeGroup.position.set(side * (spacing ?? size * 2), 0, size * 0.5);
      eyes.add(eyeGroup);

      // Joint for blinking animation (eyelid rotation)
      joints[`eye_${sideName}`] = {
        name: `eye_${sideName}`,
        position: eyeGroup.position.clone(),
        rotation: new THREE.Euler(0, 0, 0),
        bounds: {
          min: new THREE.Vector3(-0.3, -0.3, -0.1),
          max: new THREE.Vector3(0.3, 0.3, 0.3),
        },
      };

      joints[`eyelid_${sideName}`] = {
        name: `eyelid_${sideName}`,
        position: new THREE.Vector3(side * (spacing ?? size * 2), size * 0.5, size * 0.5),
        rotation: new THREE.Euler(0, 0, 0),
        bounds: {
          min: new THREE.Vector3(0, 0, 0),
          max: new THREE.Vector3(0, 1.2, 0), // eyelid can close fully
        },
      };
    }
  }

  /**
   * Create eyeball geometry with proper UV sphere and slight forward bulge for cornea
   */
  private createEyeballGeometry(size: number): THREE.BufferGeometry {
    const geo = new THREE.SphereGeometry(size, 24, 24);

    // Slight forward bulge for the cornea region
    const positions = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const z = positions[i + 2];
      if (z > size * 0.7) {
        // Forward hemisphere: slight bulge
        const t = (z - size * 0.7) / (size * 0.3);
        positions[i + 2] += size * 0.03 * t * t;
      }
    }

    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Create iris material with procedural color ring pattern
   */
  private createIrisMaterial(irisColor: number, radius: number): THREE.MeshStandardMaterial {
    // Generate a canvas-based procedural iris texture
    const canvasSize = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d')!;

    const cx = canvasSize / 2;
    const cy = canvasSize / 2;

    // Base iris color
    const baseColor = new THREE.Color(irisColor);
    const r = Math.round(baseColor.r * 255);
    const g = Math.round(baseColor.g * 255);
    const b = Math.round(baseColor.b * 255);

    // Radial gradient from outer (darker) to inner (lighter)
    const gradient = ctx.createRadialGradient(cx, cy, canvasSize * 0.15, cx, cy, canvasSize * 0.5);
    gradient.addColorStop(0, `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, 1)`);
    gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 1)`);
    gradient.addColorStop(0.7, `rgba(${Math.max(0, r - 30)}, ${Math.max(0, g - 30)}, ${Math.max(0, b - 30)}, 1)`);
    gradient.addColorStop(1, `rgba(${Math.max(0, r - 50)}, ${Math.max(0, g - 50)}, ${Math.max(0, b - 50)}, 1)`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Radial fiber pattern
    ctx.strokeStyle = `rgba(${Math.max(0, r - 20)}, ${Math.max(0, g - 20)}, ${Math.max(0, b - 20)}, 0.3)`;
    ctx.lineWidth = 1;
    for (let angle = 0; angle < Math.PI * 2; angle += 0.08) {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * canvasSize * 0.15, cy + Math.sin(angle) * canvasSize * 0.15);
      ctx.lineTo(cx + Math.cos(angle) * canvasSize * 0.48, cy + Math.sin(angle) * canvasSize * 0.48);
      ctx.stroke();
    }

    // Collarette (ring around pupil edge)
    ctx.strokeStyle = `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)}, 0.5)`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, canvasSize * 0.22, 0, Math.PI * 2);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.4,
      metalness: 0.1,
    });
  }

  /**
   * Create pupil mesh based on pupil type
   */
  private createPupil(type: PupilType, eyeSize: number, color: number): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.2,
      metalness: 0.0,
    });

    switch (type) {
      case 'vertical': {
        // Vertical slit pupil (cat/snake)
        const geo = new THREE.CircleGeometry(eyeSize * 0.35, 16);
        geo.scale(0.3, 1.0, 1.0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'pupil_vertical';
        return mesh;
      }
      case 'horizontal': {
        // Horizontal pupil (goat/horse)
        const geo = new THREE.CircleGeometry(eyeSize * 0.35, 16);
        geo.scale(1.3, 0.4, 1.0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'pupil_horizontal';
        return mesh;
      }
      case 'compound': {
        // Compound eye: many tiny pseudo-pupils
        const group = new THREE.Group();
        group.name = 'pupil_compound';
        const facetCount = 12;
        for (let f = 0; f < facetCount; f++) {
          const angle = (f / facetCount) * Math.PI * 2;
          const r = eyeSize * 0.15;
          const facetGeo = new THREE.CircleGeometry(eyeSize * 0.05, 6);
          const facet = new THREE.Mesh(facetGeo, mat);
          facet.position.set(Math.cos(angle) * r, Math.sin(angle) * r, 0);
          group.add(facet);
        }
        // Center pupil
        const centerGeo = new THREE.CircleGeometry(eyeSize * 0.08, 8);
        const center = new THREE.Mesh(centerGeo, mat);
        group.add(center);
        // Wrap in a mesh-like group (return first child as placeholder)
        const wrapper = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        wrapper.name = 'pupil_compound_wrapper';
        wrapper.add(group);
        return wrapper;
      }
      case 'round':
      default: {
        // Round pupil (mammal)
        const pupilRadius = eyeSize * 0.25;
        const geo = new THREE.CircleGeometry(pupilRadius, 20);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'pupil_round';
        return mesh;
      }
    }
  }

  /**
   * Build upper and lower eyelids that wrap around the eyeball.
   * These are shell-like meshes that can be animated for blinking.
   */
  private buildEyelids(eyeGroup: THREE.Group, size: number, lidColor: number): void {
    const lidMat = new THREE.MeshStandardMaterial({
      color: lidColor,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });

    // Upper eyelid
    const upperLidGeo = new THREE.SphereGeometry(
      size * 1.02, 16, 8,
      0, Math.PI * 2,     // full theta
      0, Math.PI * 0.35,  // top portion only
    );
    const upperLid = new THREE.Mesh(upperLidGeo, lidMat);
    upperLid.rotation.x = Math.PI; // flip so it covers the top
    upperLid.position.z = size * 0.05;
    upperLid.name = 'upperEyelid';
    // Store rotation range for blinking animation
    upperLid.userData.blinkAxis = 'x';
    upperLid.userData.blinkOpen = 0;
    upperLid.userData.blinkClosed = Math.PI * 0.25;
    eyeGroup.add(upperLid);

    // Lower eyelid
    const lowerLidGeo = new THREE.SphereGeometry(
      size * 1.02, 16, 8,
      0, Math.PI * 2,     // full theta
      0, Math.PI * 0.25,  // bottom portion
    );
    const lowerLid = new THREE.Mesh(lowerLidGeo, lidMat);
    lowerLid.position.z = size * 0.05;
    lowerLid.name = 'lowerEyelid';
    // Lower lid moves less during blinking
    lowerLid.userData.blinkAxis = 'x';
    lowerLid.userData.blinkOpen = 0;
    lowerLid.userData.blinkClosed = -Math.PI * 0.1;
    eyeGroup.add(lowerLid);
  }

  // ── Static Helpers ──────────────────────────────────────────────────

  /**
   * Animate eyelid blink on a single eye group.
   * @param eyeGroup - The eye group containing upper/lower eyelid meshes
   * @param amount - Blink amount from 0 (open) to 1 (closed)
   */
  static setBlinkAmount(eyeGroup: THREE.Group, amount: number): void {
    const upper = eyeGroup.getObjectByName('upperEyelid');
    const lower = eyeGroup.getObjectByName('lowerEyelid');

    if (upper) {
      const closed = (upper as any).userData.blinkClosed ?? Math.PI * 0.25;
      upper.rotation.x = amount * closed;
    }
    if (lower) {
      const closed = (lower as any).userData.blinkClosed ?? -Math.PI * 0.1;
      lower.rotation.x = amount * closed;
    }
  }
}
