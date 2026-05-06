/**
 * BirdGenerator - Procedural bird generation
 * Generates various bird species with body, head+beak, wings, legs+toes, and tail
 *
 * Geometry improvements:
 * - Wings use ExtrudeGeometry from a 2D airfoil-profile Shape (thick leading edge,
 *   thin trailing edge) instead of flat BoxGeometry
 * - Feather-like segments along the trailing edge using small scaled geometries
 * - Body uses LatheGeometry for a smooth, anatomically correct bird silhouette
 * - Subdivision smoothing applied to body for smooth head-body junction
 */

import * as THREE from 'three';
import { Object3D, Group, Mesh, Material, MeshStandardMaterial, BufferGeometry, Shape, ShapeGeometry, ExtrudeGeometry, LatheGeometry, Vector2, DoubleSide } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import { SeededRandom } from '../../../core/util/MathUtils';
import { smoothCreatureJunction } from '../../../core/util/GeometryUtils';

export interface BirdParameters extends CreatureParams {
  wingSpan: number;
  beakType: 'hooked' | 'conical' | 'probing' | 'filter';
  featherPattern: 'solid' | 'striped' | 'spotted' | 'iridescent';
  flightStyle: 'soaring' | 'flapping' | 'hovering' | 'gliding' | 'silent' | 'swimming';
  tailShape: 'forked' | 'rounded' | 'square' | 'pointed';
  primaryColor: string;
  secondaryColor: string;
}

export type BirdSpecies = 'eagle' | 'sparrow' | 'parrot' | 'owl' | 'hummingbird' | 'pelican' | 'flamingo' | 'penguin';

export class BirdGenerator extends CreatureBase {
  constructor(seed?: number) {
    super({ seed: seed ?? 42 });
  }

  getDefaultConfig(): BirdParameters {
    return {
      ...this.params,
      creatureType: CreatureType.BIRD,
      wingSpan: 0.5,
      beakType: 'conical',
      featherPattern: 'solid',
      flightStyle: 'flapping',
      tailShape: 'rounded',
      primaryColor: '#8B4513',
      secondaryColor: '#D2691E',
    } as BirdParameters;
  }

  generate(species: BirdSpecies = 'sparrow', params: Partial<BirdParameters> = {}): Group {
    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const s = parameters.size;
    const bird = new Group();
    bird.name = `Bird_${species}`;
    bird.userData.parameters = parameters;

    // Body - smooth LatheGeometry profile
    const body = this.generateBody(parameters);
    bird.add(body);

    // Head
    const head = this.generateHeadGroup(parameters);
    head.position.set(0, s * 0.15, s * 0.25);
    bird.add(head);

    // Wings - ExtrudeGeometry airfoil profile with feather segments
    const wings = this.generateWings(parameters);
    wings.forEach(w => bird.add(w));

    // Legs + toes
    const legs = this.generateLegs(parameters);
    legs.forEach(l => bird.add(l));

    // Tail
    const tail = this.generateTail(parameters);
    bird.add(tail);

    return bird;
  }

  generateBodyCore(): Object3D {
    return this.generateBody(this.getDefaultConfig());
  }

  generateHead(): Object3D {
    return this.generateHeadGroup(this.getDefaultConfig());
  }

  generateLimbs(): Object3D[] {
    return this.generateLegs(this.getDefaultConfig());
  }

  generateAppendages(): Object3D[] {
    const params = this.getDefaultConfig();
    return [...this.generateWings(params), this.generateTail(params)];
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  private applySpeciesDefaults(species: BirdSpecies, params: BirdParameters): void {
    switch (species) {
      case 'eagle':
        params.size = 1.2; params.wingSpan = 2.0; params.beakType = 'hooked';
        params.flightStyle = 'soaring'; params.tailShape = 'square'; params.primaryColor = '#2F1810'; break;
      case 'sparrow':
        params.size = 0.15; params.wingSpan = 0.25; params.beakType = 'conical';
        params.flightStyle = 'flapping'; params.tailShape = 'pointed'; params.primaryColor = '#8B4513'; break;
      case 'parrot':
        params.size = 0.4; params.wingSpan = 0.6; params.beakType = 'hooked';
        params.flightStyle = 'flapping'; params.tailShape = 'pointed'; params.primaryColor = '#228B22'; break;
      case 'owl':
        params.size = 0.5; params.wingSpan = 1.0; params.beakType = 'hooked';
        params.flightStyle = 'silent'; params.tailShape = 'rounded'; params.primaryColor = '#8B4513'; break;
      case 'hummingbird':
        params.size = 0.05; params.wingSpan = 0.08; params.beakType = 'probing';
        params.flightStyle = 'hovering'; params.tailShape = 'forked'; params.primaryColor = '#228B22'; break;
      case 'pelican':
        params.size = 1.0; params.wingSpan = 2.5; params.beakType = 'filter';
        params.flightStyle = 'gliding'; params.tailShape = 'rounded'; params.primaryColor = '#FFFFFF'; break;
      case 'flamingo':
        params.size = 1.2; params.wingSpan = 1.5; params.beakType = 'filter';
        params.flightStyle = 'flapping'; params.tailShape = 'pointed'; params.primaryColor = '#FF69B4'; break;
      case 'penguin':
        params.size = 0.6; params.wingSpan = 0.3; params.beakType = 'conical';
        params.flightStyle = 'swimming'; params.tailShape = 'rounded'; params.primaryColor = '#2F2F2F'; break;
    }
  }

  /**
   * Generate bird body using LatheGeometry with a smooth anatomical profile.
   * The profile follows a streamlined bird body shape: narrow at the neck,
   * widest at the breast, tapering to the tail.
   */
  private generateBody(params: BirdParameters): Mesh {
    const s = params.size;
    const bodyLength = s * 0.5;  // Total body length
    const bodyWidth = s * 0.12;  // Maximum body half-width (radius)
    const bodyHeight = s * 0.14; // Maximum body half-height

    // Build bird body profile using control points
    // The profile is drawn in the Y (height) vs X (radius) plane,
    // then rotated around the Y axis by LatheGeometry
    const segments = 24;
    const points: Vector2[] = [];

    // Control points defining the bird body silhouette
    // [t along body, radius factor] — t goes from tail (0) to breast (1)
    const controlPoints: [number, number][] = [
      [0.0,  0.02],  // Tail tip — very narrow
      [0.08, 0.15],  // Tail base
      [0.20, 0.45],  // Lower back
      [0.35, 0.75],  // Mid body
      [0.50, 0.95],  // Belly (widest)
      [0.65, 1.00],  // Breast peak
      [0.80, 0.80],  // Upper breast
      [0.92, 0.45],  // Neck base
      [1.0,  0.15],  // Neck / head connection
    ];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let r = 0;
      for (let c = 0; c < controlPoints.length - 1; c++) {
        const [t0, r0] = controlPoints[c];
        const [t1, r1] = controlPoints[c + 1];
        if (t >= t0 && t <= t1) {
          const localT = (t - t0) / (t1 - t0);
          // Smoothstep interpolation for natural curves
          const st = localT * localT * (3 - 2 * localT);
          r = r0 + (r1 - r0) * st;
          break;
        }
      }
      // The radius is non-uniform: wider horizontally (elliptical cross-section)
      // LatheGeometry produces circular cross-sections, so we use the wider dimension
      // and scale the geometry afterward
      points.push(new Vector2(Math.max(0.001, r * bodyWidth), t * bodyLength - bodyLength * 0.25));
    }

    const geo = new LatheGeometry(points, 16);

    // Scale to make elliptical cross-section (flatter vertically, wider horizontally)
    // The LatheGeometry produces a circular cross-section; we scale Y down for the
    // characteristic bird body shape (wider than tall)
    geo.scale(1, bodyHeight / bodyWidth, 1);

    // Apply subdivision smoothing for smooth head-body junction
    const smoothedGeo = smoothCreatureJunction(geo, 1);

    const mat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.7 });
    const mesh = new Mesh(smoothedGeo, mat);
    mesh.name = 'body';

    // Rotate so body is horizontal (LatheGeometry produces vertical shapes)
    mesh.rotation.x = Math.PI / 2;

    return mesh;
  }

  private generateHeadGroup(params: BirdParameters): Group {
    const s = params.size;
    const group = new Group();
    group.name = 'headGroup';

    // Head sphere
    const headGeo = this.createSphereGeometry(s * 0.08);
    const headMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.7 });
    const head = new Mesh(headGeo, headMat);
    head.name = 'head';
    group.add(head);

    // Beak - cone
    const beakLen = s * 0.08;
    const beakGeo = this.createConeGeometry(s * 0.02, beakLen, 8);
    const beakMat = new MeshStandardMaterial({ color: 0xf5a623, roughness: 0.4 });
    const beak = new Mesh(beakGeo, beakMat);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, -s * 0.01, s * 0.08 + beakLen / 2);
    beak.name = 'beak';
    group.add(beak);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x111111 });
    const eyeGeo = this.createSphereGeometry(s * 0.015);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.04, s * 0.02, s * 0.06);
    leftEye.name = 'leftEye';
    group.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.04, s * 0.02, s * 0.06);
    rightEye.name = 'rightEye';
    group.add(rightEye);

    return group;
  }

  /**
   * Generate wings using ExtrudeGeometry from a 2D airfoil-profile Shape.
   *
   * The wing profile is an airfoil-like shape:
   * - Thick at the leading edge (front of wing)
   * - Thin at the trailing edge (back of wing)
   * - Slightly curved on top (camber) for lift
   *
   * Additionally, feather-like segments are added along the trailing edge
   * as small scaled geometries to break up the flat trailing edge.
   */
  private generateWings(params: BirdParameters): Group[] {
    const s = params.size;
    const wingLen = params.wingSpan / 2;
    const wingChord = s * 0.12; // Chord length (front-to-back)
    const wingThickness = s * 0.015; // Maximum thickness at leading edge
    const wingMat = new MeshStandardMaterial({
      color: params.secondaryColor,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const featherMat = new MeshStandardMaterial({
      color: params.primaryColor,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const wings: Group[] = [];

    for (const side of [-1, 1]) {
      const wingGroup = new Group();
      wingGroup.name = side === -1 ? 'leftWing' : 'rightWing';

      // ── Airfoil wing profile using ExtrudeGeometry ──────────────
      // Build a 2D airfoil cross-section shape
      // X = chordwise (front to back), Y = thickness (up/down)
      const airfoil = new Shape();

      // Leading edge (front) — thick, rounded
      airfoil.moveTo(0, 0);
      // Upper surface: smooth curve from leading edge to trailing edge
      airfoil.bezierCurveTo(
        wingChord * 0.05, wingThickness * 1.2,   // Leading edge curve up
        wingChord * 0.30, wingThickness * 0.8,    // Peak thickness
        wingChord * 0.70, wingThickness * 0.3,    // Gradual thinning
      );
      airfoil.lineTo(wingChord, 0); // Trailing edge — thin point

      // Lower surface: flatter, slight concavity
      airfoil.bezierCurveTo(
        wingChord * 0.70, -wingThickness * 0.15,  // Slight undercamber
        wingChord * 0.30, -wingThickness * 0.25,  // Lower surface
        0, 0,                                       // Back to leading edge
      );

      // Extrude along the wing span direction
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: wingLen,
        bevelEnabled: true,
        bevelThickness: wingThickness * 0.3,
        bevelSize: wingThickness * 0.2,
        bevelSegments: 2,
        steps: 8,       // Segments along the span
        curveSegments: 8,
      };

      const wingGeo = new ExtrudeGeometry(airfoil, extrudeSettings);

      // Apply taper: wing narrows toward the tip
      // Modify vertices: scale XZ (chord+thickness) by a factor that decreases
      // with distance along the span (Y direction in extrude space)
      const posAttr = wingGeo.attributes.position;
      const positions = posAttr.array as Float32Array;
      for (let i = 0; i < posAttr.count; i++) {
        const x = positions[i * 3];     // Chordwise
        const y = positions[i * 3 + 1]; // Spanwise (extrude direction)
        const z = positions[i * 3 + 2]; // Thickness

        // Taper factor: 1 at root, 0.4 at tip
        const spanT = y / wingLen;
        const taper = 1.0 - spanT * 0.6;
        // Sweep: trailing edge sweeps back
        const sweepOffset = spanT * wingChord * 0.3;

        positions[i * 3]     = x * taper + sweepOffset;
        positions[i * 3 + 2] = z * taper;
      }
      posAttr.needsUpdate = true;
      wingGeo.computeVertexNormals();

      // Apply airfoil curvature (slight dome for lift)
      for (let i = 0; i < posAttr.count; i++) {
        const y = positions[i * 3 + 1];
        const spanT = y / wingLen;
        // Dome shape: maximum lift at mid-span
        const dome = Math.sin(spanT * Math.PI) * wingThickness * 2;
        positions[i * 3 + 2] += dome * (1 - spanT * 0.5);
      }
      posAttr.needsUpdate = true;
      wingGeo.computeVertexNormals();

      const wing = new Mesh(wingGeo, wingMat);
      wing.name = 'wingSurface';

      // Position and orient the wing
      // ExtrudeGeometry extrudes along +Y, so rotate to lie flat
      wing.rotation.x = -Math.PI / 2;           // Lay flat
      wing.rotation.z = side * 0.15;             // Slight dihedral angle
      wing.position.set(side * wingLen * 0.1, s * 0.05, -s * 0.05);
      wingGroup.add(wing);

      // ── Feather-like segments along trailing edge ──────────────
      // Small elongated shapes along the trailing edge to simulate
      // individual primary and secondary feathers
      const featherCount = Math.max(4, Math.floor(wingLen / (s * 0.03)));
      for (let f = 0; f < featherCount; f++) {
        const t = f / featherCount;
        const featherLen = wingChord * (0.5 + t * 0.3) * (1 - t * 0.4);
        const featherWidth = s * 0.005 * (1 - t * 0.3);

        // Create individual feather as a thin tapered shape
        const featherShape = new Shape();
        featherShape.moveTo(0, 0);
        featherShape.bezierCurveTo(
          featherWidth, featherLen * 0.3,
          featherWidth * 0.8, featherLen * 0.7,
          0, featherLen,
        );
        featherShape.bezierCurveTo(
          -featherWidth * 0.8, featherLen * 0.7,
          -featherWidth, featherLen * 0.3,
          0, 0,
        );

        const featherGeo = new ShapeGeometry(featherShape, 3);

        // Apply slight curvature to feather
        const fPosAttr = featherGeo.attributes.position;
        const fPositions = fPosAttr.array as Float32Array;
        for (let fi = 0; fi < fPosAttr.count; fi++) {
          const fy = fPositions[fi * 3 + 1];
          const ft = fy / featherLen;
          fPositions[fi * 3 + 2] += Math.sin(ft * Math.PI) * featherWidth * 0.5;
        }
        fPosAttr.needsUpdate = true;
        featherGeo.computeVertexNormals();

        const feather = new Mesh(featherGeo, featherMat);
        feather.name = `feather_${f}`;

        // Position along trailing edge
        const spanPos = wingLen * (0.3 + t * 0.65); // Start from 30% span to tip
        const chordPos = wingChord * (0.6 + t * 0.15); // Near trailing edge

        feather.position.set(
          side * (spanPos + wingLen * 0.1),
          s * 0.05 + Math.sin(t * Math.PI) * wingThickness * 2,
          -s * 0.05 + chordPos * 0.5 - featherLen * 0.3,
        );
        feather.rotation.x = -Math.PI / 2;
        feather.rotation.z = side * (t * 0.08 - 0.04); // Slight spread
        feather.rotation.y = side * -0.1; // Trail backward

        wingGroup.add(feather);
      }

      // ── Covert feather row on top of wing ──────────────────────
      const covertCount = Math.max(3, Math.floor(wingLen / (s * 0.04)));
      for (let c = 0; c < covertCount; c++) {
        const t = c / covertCount;
        const covertLen = wingChord * 0.25 * (1 - t * 0.3);
        const covertGeo = this.createBoxGeometry(
          s * 0.015 * (1 - t * 0.2),
          s * 0.003,
          covertLen,
        );
        const covert = new Mesh(covertGeo, featherMat);
        covert.name = `covert_${c}`;
        covert.position.set(
          side * (wingLen * (0.15 + t * 0.7) + wingLen * 0.1),
          s * 0.055 + Math.sin(t * Math.PI) * wingThickness * 2.5,
          -s * 0.05 + wingChord * 0.2,
        );
        covert.rotation.z = side * -0.05;
        wingGroup.add(covert);
      }

      wings.push(wingGroup);
    }

    return wings;
  }

  private generateLegs(params: BirdParameters): Group[] {
    const s = params.size;
    const legMat = new MeshStandardMaterial({ color: 0xcc8833, roughness: 0.5 });
    const legs: Group[] = [];

    for (const side of [-1, 1]) {
      const legGroup = new Group();
      legGroup.name = side === -1 ? 'leftLeg' : 'rightLeg';

      // Upper leg
      const upperGeo = this.createCylinderGeometry(s * 0.01, s * 0.008, s * 0.12);
      const upper = new Mesh(upperGeo, legMat);
      upper.position.set(side * s * 0.04, -s * 0.18, s * 0.02);
      legGroup.add(upper);

      // Lower leg
      const lowerGeo = this.createCylinderGeometry(s * 0.008, s * 0.006, s * 0.1);
      const lower = new Mesh(lowerGeo, legMat);
      lower.position.set(side * s * 0.04, -s * 0.29, s * 0.02);
      legGroup.add(lower);

      // Toes (3 forward, 1 back)
      const toeGeo = this.createCylinderGeometry(s * 0.003, s * 0.002, s * 0.04);
      for (let t = -1; t <= 1; t++) {
        const toe = new Mesh(toeGeo, legMat);
        toe.rotation.x = Math.PI / 2;
        toe.position.set(side * s * 0.04 + t * s * 0.015, -s * 0.34, s * 0.04);
        legGroup.add(toe);
      }
      // Back toe
      const backToe = new Mesh(toeGeo, legMat);
      backToe.rotation.x = -Math.PI / 2;
      backToe.position.set(side * s * 0.04, -s * 0.34, -s * 0.01);
      legGroup.add(backToe);

      legs.push(legGroup);
    }

    return legs;
  }

  private generateTail(params: BirdParameters): Group {
    const s = params.size;
    const tailGroup = new Group();
    tailGroup.name = 'tail';
    const tailMat = new MeshStandardMaterial({ color: params.primaryColor, roughness: 0.7 });

    // Fan-shaped tail with airfoil-profiled feathers instead of flat boxes
    const fanCount = 5;
    for (let i = 0; i < fanCount; i++) {
      const angle = ((i / (fanCount - 1)) - 0.5) * 0.6;
      const featherLen = s * 0.1;
      const featherWidth = s * 0.02;

      // Create tail feather as a thin airfoil-ish shape
      const featherShape = new Shape();
      featherShape.moveTo(0, 0);
      featherShape.bezierCurveTo(
        featherWidth * 0.5, featherLen * 0.3,
        featherWidth * 0.3, featherLen * 0.7,
        0, featherLen,
      );
      featherShape.bezierCurveTo(
        -featherWidth * 0.3, featherLen * 0.7,
        -featherWidth * 0.5, featherLen * 0.3,
        0, 0,
      );

      const featherGeo = new ShapeGeometry(featherShape, 3);
      const feather = new Mesh(featherGeo, tailMat);
      feather.position.set(Math.sin(angle) * s * 0.05, 0, -s * 0.25 - Math.cos(angle) * s * 0.05);
      feather.rotation.y = angle;
      feather.rotation.x = -0.15; // Slight fan angle
      feather.name = `tailFeather_${i}`;
      tailGroup.add(feather);
    }

    return tailGroup;
  }
}
