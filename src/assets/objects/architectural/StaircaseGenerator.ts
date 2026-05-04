/**
 * StaircaseGenerator - Procedural staircase generation
 * FIX: Railings now added for ALL stair types (L, U, spiral, curved)
 * FIX: 'open' stringer type implemented (no stringer visible, just treads from side)
 */
import * as THREE from 'three';
import { Group, Mesh, BoxGeometry, CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface StaircaseParams extends BaseGeneratorConfig {
  totalHeight: number;
  totalRun: number;
  width: number;
  numSteps: number;
  stairType: 'straight' | 'L' | 'U' | 'spiral' | 'curved' | 'cantilever';
  hasLanding: boolean;
  landingPosition?: number;
  hasStringers: boolean;
  stringerType: 'closed' | 'open' | 'mono';
  hasRisers: boolean;
  treadThickness: number;
  riserThickness: number;
  style: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'minimalist';
  treadMaterial: string;
  riserMaterial: string;
  stringerMaterial: string;
  hasRailing: boolean;
  railingHeight: number;
}

const DEFAULT_PARAMS: StaircaseParams = {
  totalHeight: 3.0,
  totalRun: 4.0,
  width: 1.2,
  numSteps: 14,
  stairType: 'straight',
  hasLanding: false,
  hasStringers: true,
  stringerType: 'closed',
  hasRisers: true,
  treadThickness: 0.04,
  riserThickness: 0.02,
  style: 'modern',
  treadMaterial: 'wood',
  riserMaterial: 'wood',
  stringerMaterial: 'wood',
  hasRailing: true,
  railingHeight: 0.9,
};

export class StaircaseGenerator extends BaseObjectGenerator<StaircaseParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): StaircaseParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<StaircaseParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();

    const {
      totalHeight, totalRun, width, numSteps, stairType,
      hasRisers, treadThickness, riserThickness,
      hasStringers, stringerType, hasRailing, railingHeight,
    } = finalParams;

    const rise = totalHeight / numSteps;
    const run = totalRun / numSteps;
    const treadMat = this.getMaterial(finalParams.treadMaterial);
    const riserMat = this.getMaterial(finalParams.riserMaterial);
    const stringerMat = this.getMaterial(finalParams.stringerMaterial);

    switch (stairType) {
      case 'straight':
        this.generateStraightStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType, treadMat, riserMat, stringerMat);
        break;
      case 'L':
        this.generateLStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType, treadMat, riserMat, stringerMat);
        break;
      case 'U':
        this.generateUStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType, treadMat, riserMat, stringerMat);
        break;
      case 'spiral':
        this.generateSpiralStairs(group, numSteps, rise, width, treadThickness, treadMat, hasStringers, stringerType, stringerMat);
        break;
      case 'curved':
        this.generateCurvedStairs(group, numSteps, rise, run, width, treadThickness, treadMat);
        break;
      case 'cantilever':
        this.generateCantileverStairs(group, numSteps, rise, run, width, treadThickness, hasRisers, treadMat, riserMat);
        break;
    }

    // Add railing for ALL stair types
    if (hasRailing) {
      this.addRailing(group, stairType, totalRun, width, totalHeight, railingHeight, numSteps, rise, run);
    }

    return group;
  }

  private getMaterial(materialType: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      wood: { color: 0x8b6914, roughness: 0.65, metalness: 0.0 },
      oak: { color: 0x8b6914, roughness: 0.6, metalness: 0.0 },
      steel: { color: 0x888888, roughness: 0.3, metalness: 0.8 },
      metal: { color: 0x666666, roughness: 0.4, metalness: 0.7 },
      glass: { color: 0x88ccff, roughness: 0.1, metalness: 0.1 },
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
      reclaimed_wood: { color: 0x6b4423, roughness: 0.85, metalness: 0.0 },
      wrought_iron: { color: 0x2a2a2a, roughness: 0.5, metalness: 0.7 },
    };
    const config = configs[materialType] || configs.wood;
    return new MeshStandardMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metalness,
      transparent: materialType === 'glass',
      opacity: materialType === 'glass' ? 0.3 : 1.0,
    });
  }

  private generateStraightStairs(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    treadThickness: number, riserThickness: number, hasRisers: boolean,
    hasStringers: boolean, stringerType: string,
    treadMat: MeshStandardMaterial, riserMat: MeshStandardMaterial, stringerMat: MeshStandardMaterial
  ): void {
    for (let i = 0; i < numSteps; i++) {
      const y = i * rise;
      const x = i * run;

      // Tread
      const treadGeom = new BoxGeometry(run + 0.02, treadThickness, width);
      const tread = new Mesh(treadGeom, treadMat);
      tread.position.set(x + run / 2, y + treadThickness / 2, 0);
      tread.castShadow = true;
      tread.receiveShadow = true;
      tread.name = `tread_${i}`;
      group.add(tread);

      // Riser
      if (hasRisers && i < numSteps - 1) {
        const riserGeom = new BoxGeometry(riserThickness, rise, width);
        const riser = new Mesh(riserGeom, riserMat);
        riser.position.set(x + run / 2, y + treadThickness + rise / 2, 0);
        riser.castShadow = true;
        riser.name = `riser_${i}`;
        group.add(riser);
      }
    }

    // Stringers
    if (hasStringers) {
      this.addStringers(group, numSteps, rise, run, width, stringerType, stringerMat);
    }
  }

  /**
   * Add stringers - supports for the staircase
   * 'open': no stringer visible from side, just treads visible
   * 'closed': solid side panel
   * 'mono': single center beam
   */
  private addStringers(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    stringerType: string, stringerMat: MeshStandardMaterial
  ): void {
    const totalRise = numSteps * rise;
    const totalRunLen = numSteps * run;
    const stringerLength = Math.sqrt(totalRise * totalRise + totalRunLen * totalRunLen);
    const angle = Math.atan2(totalRise, totalRunLen);

    if (stringerType === 'closed') {
      for (const zSide of [-1, 1]) {
        const stringerGeom = new BoxGeometry(totalRunLen, 0.03, width + 0.1);
        const stringer = new Mesh(stringerGeom, stringerMat);
        stringer.position.set(totalRunLen / 2, totalRise / 2, zSide * (width / 2 + 0.05));
        stringer.rotation.z = -angle;
        stringer.name = `stringer_${zSide === -1 ? 'left' : 'right'}`;
        group.add(stringer);
      }
    } else if (stringerType === 'mono') {
      const stringerGeom = new BoxGeometry(totalRunLen, 0.15, 0.1);
      const stringer = new Mesh(stringerGeom, stringerMat);
      stringer.position.set(totalRunLen / 2, totalRise / 2, 0);
      stringer.rotation.z = -angle;
      stringer.name = 'mono_stringer';
      group.add(stringer);
    } else if (stringerType === 'open') {
      // Open stringer: no solid stringer panel visible from side.
      // Instead, use thin support brackets under each tread to hold them
      // (treads visible from side with no solid wall underneath)
      for (let i = 0; i < numSteps; i++) {
        const y = i * rise;
        const x = i * run;

        // Small bracket/tread support under each tread
        for (const zSide of [-1, 1]) {
          const bracketGeo = new BoxGeometry(0.04, 0.04, 0.04);
          const bracket = new Mesh(bracketGeo, stringerMat);
          bracket.position.set(x + run / 2, y, zSide * (width / 2 - 0.02));
          bracket.name = `tread_bracket_${i}_${zSide === -1 ? 'L' : 'R'}`;
          group.add(bracket);
        }
      }
    }
  }

  private generateLStairs(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    treadThickness: number, riserThickness: number, hasRisers: boolean,
    hasStringers: boolean, stringerType: string,
    treadMat: MeshStandardMaterial, riserMat: MeshStandardMaterial, stringerMat: MeshStandardMaterial
  ): void {
    const firstFlightSteps = Math.floor(numSteps / 2);
    const landingSize = width;

    // First flight
    for (let i = 0; i < firstFlightSteps; i++) {
      const y = i * rise;
      const x = i * run;
      const tread = new Mesh(new BoxGeometry(run + 0.02, treadThickness, width), treadMat);
      tread.position.set(x + run / 2, y + treadThickness / 2, 0);
      tread.castShadow = true;
      tread.name = `tread_first_${i}`;
      group.add(tread);
    }

    // Landing
    const landingY = firstFlightSteps * rise;
    const landingX = firstFlightSteps * run;
    const landing = new Mesh(new BoxGeometry(landingSize, treadThickness, landingSize), treadMat);
    landing.position.set(landingX + landingSize / 2, landingY + treadThickness / 2, 0);
    landing.castShadow = true;
    landing.name = 'landing';
    group.add(landing);

    // Second flight
    const secondFlightSteps = numSteps - firstFlightSteps;
    for (let i = 0; i < secondFlightSteps; i++) {
      const y = landingY + (i + 1) * rise;
      const tread = new Mesh(new BoxGeometry(run + 0.02, treadThickness, width), treadMat);
      tread.position.set(landingX + landingSize / 2, y + treadThickness / 2, landingSize / 2 - width / 2 + i * run);
      tread.rotation.y = -Math.PI / 2;
      tread.castShadow = true;
      tread.name = `tread_second_${i}`;
      group.add(tread);
    }

    // Stringers for first flight
    if (hasStringers) {
      const firstRise = firstFlightSteps * rise;
      const firstRunLen = firstFlightSteps * run;
      const angle = Math.atan2(firstRise, firstRunLen);

      if (stringerType === 'closed') {
        for (const zSide of [-1, 1]) {
          const stringer = new Mesh(new BoxGeometry(firstRunLen, 0.03, width + 0.1), stringerMat);
          stringer.position.set(firstRunLen / 2, firstRise / 2, zSide * (width / 2 + 0.05));
          stringer.rotation.z = -angle;
          group.add(stringer);
        }
      } else if (stringerType === 'open') {
        for (let i = 0; i < firstFlightSteps; i++) {
          for (const zSide of [-1, 1]) {
            const bracket = new Mesh(new BoxGeometry(0.04, 0.04, 0.04), stringerMat);
            bracket.position.set(i * run + run / 2, i * rise, zSide * (width / 2 - 0.02));
            group.add(bracket);
          }
        }
      }
    }
  }

  private generateUStairs(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    treadThickness: number, riserThickness: number, hasRisers: boolean,
    hasStringers: boolean, stringerType: string,
    treadMat: MeshStandardMaterial, riserMat: MeshStandardMaterial, stringerMat: MeshStandardMaterial
  ): void {
    const firstFlightSteps = Math.floor(numSteps / 2);
    const landingWidth = width * 2;

    // First flight
    for (let i = 0; i < firstFlightSteps; i++) {
      const tread = new Mesh(new BoxGeometry(run + 0.02, treadThickness, width), treadMat);
      tread.position.set(i * run + run / 2, i * rise + treadThickness / 2, -width / 2);
      tread.castShadow = true;
      tread.name = `tread_first_${i}`;
      group.add(tread);
    }

    // Landing
    const landingY = firstFlightSteps * rise;
    const landing = new Mesh(new BoxGeometry(landingWidth, treadThickness, width), treadMat);
    landing.position.set(firstFlightSteps * run + landingWidth / 2, landingY + treadThickness / 2, 0);
    landing.castShadow = true;
    landing.name = 'landing';
    group.add(landing);

    // Second flight
    const secondFlightSteps = numSteps - firstFlightSteps;
    for (let i = 0; i < secondFlightSteps; i++) {
      const tread = new Mesh(new BoxGeometry(run + 0.02, treadThickness, width), treadMat);
      tread.position.set(firstFlightSteps * run + landingWidth - i * run - run / 2, landingY + (i + 1) * rise + treadThickness / 2, width / 2);
      tread.castShadow = true;
      tread.name = `tread_second_${i}`;
      group.add(tread);
    }

    // Stringers
    if (hasStringers && stringerType !== 'open') {
      const firstRise = firstFlightSteps * rise;
      const firstRunLen = firstFlightSteps * run;
      const angle = Math.atan2(firstRise, firstRunLen);

      if (stringerType === 'closed') {
        for (const zSide of [-1, 1]) {
          const stringer = new Mesh(new BoxGeometry(firstRunLen, 0.03, width + 0.1), stringerMat);
          stringer.position.set(firstRunLen / 2, firstRise / 2, zSide * (-width / 2 + zSide * (width / 2 + 0.05)));
          stringer.rotation.z = -angle;
          group.add(stringer);
        }
      }
    }
  }

  private generateSpiralStairs(
    group: Group, numSteps: number, rise: number, diameter: number,
    treadThickness: number, treadMat: MeshStandardMaterial,
    hasStringers: boolean, stringerType: string, stringerMat: MeshStandardMaterial
  ): void {
    const radius = diameter / 2;
    const totalAngle = Math.PI * 1.5;
    const angleStep = totalAngle / numSteps;

    // Central pole
    const poleMat = this.getMaterial('steel');
    const poleGeom = new CylinderGeometry(0.05, 0.05, numSteps * rise, 16);
    const pole = new Mesh(poleGeom, poleMat);
    pole.position.set(0, numSteps * rise / 2, 0);
    pole.name = 'centralPole';
    group.add(pole);

    // Treads
    for (let i = 0; i < numSteps; i++) {
      const angle = i * angleStep;
      const y = i * rise;

      const shape = new THREE.Shape();
      shape.moveTo(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1);
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      shape.lineTo(Math.cos(angle + angleStep * 0.8) * radius, Math.sin(angle + angleStep * 0.8) * radius);
      shape.lineTo(Math.cos(angle + angleStep * 0.8) * 0.1, Math.sin(angle + angleStep * 0.8) * 0.1);
      shape.closePath();

      const extrudeSettings = { depth: treadThickness, bevelEnabled: false };
      const geom = new ExtrudeGeometry(shape, extrudeSettings);
      const tread = new Mesh(geom, treadMat);
      tread.position.set(0, y, 0);
      tread.rotation.x = -Math.PI / 2;
      tread.castShadow = true;
      tread.name = `tread_${i}`;
      group.add(tread);
    }

    // Open stringer for spiral: no stringer (just central pole + treads)
    // Closed/mono stringer: not applicable for spiral, skip
  }

  private generateCurvedStairs(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    treadThickness: number, treadMat: MeshStandardMaterial
  ): void {
    const totalAngle = Math.PI / 2;
    const angleStep = totalAngle / numSteps;
    const radius = (run * numSteps) / totalAngle;

    for (let i = 0; i < numSteps; i++) {
      const angle = i * angleStep;
      const y = i * rise;
      const innerRadius = radius - width;

      const shape = new THREE.Shape();
      shape.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      shape.lineTo(Math.cos(angle + angleStep) * radius, Math.sin(angle + angleStep) * radius);
      shape.lineTo(Math.cos(angle + angleStep) * innerRadius, Math.sin(angle + angleStep) * innerRadius);
      shape.closePath();

      const extrudeSettings = { depth: treadThickness, bevelEnabled: false };
      const geom = new ExtrudeGeometry(shape, extrudeSettings);
      const tread = new Mesh(geom, treadMat);
      tread.position.set(0, y, 0);
      tread.rotation.x = -Math.PI / 2;
      tread.castShadow = true;
      group.add(tread);
    }
  }

  /**
   * Add railings for ALL stair types
   */
  private addRailing(
    group: Group, stairType: string, totalRun: number, width: number,
    totalHeight: number, railingHeight: number, numSteps: number,
    rise: number, run: number
  ): void {
    const railMat = this.getMaterial('steel');
    const balusterMat = this.getMaterial('steel');

    switch (stairType) {
      case 'straight':
        this.addStraightRailing(group, numSteps, rise, run, width, totalRun, totalHeight, railingHeight, railMat, balusterMat);
        break;
      case 'L':
        this.addLRailing(group, numSteps, rise, run, width, railingHeight, railMat, balusterMat);
        break;
      case 'U':
        this.addURailing(group, numSteps, rise, run, width, totalHeight, railingHeight, railMat, balusterMat);
        break;
      case 'spiral':
        this.addSpiralRailing(group, numSteps, rise, width, railingHeight, railMat, balusterMat);
        break;
      case 'curved':
        this.addCurvedRailing(group, numSteps, rise, run, width, railingHeight, railMat, balusterMat);
        break;
      case 'cantilever':
        this.addCantileverRailing(group, numSteps, rise, run, width, totalHeight, railingHeight, railMat, balusterMat);
        break;
    }
  }

  /**
   * Straight railing: balusters + top rail on both sides
   */
  private addStraightRailing(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    totalRun: number, totalHeight: number, railingHeight: number,
    railMat: MeshStandardMaterial, balusterMat: MeshStandardMaterial
  ): void {
    for (const zSide of [-1, 1]) {
      // Balusters at each step
      for (let i = 0; i <= numSteps; i++) {
        const y = i * rise;
        const x = i * run;
        const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
        const baluster = new Mesh(balusterGeo, balusterMat);
        baluster.position.set(x, y + railingHeight / 2, zSide * width / 2);
        group.add(baluster);
      }

      // Top handrail
      const railLength = Math.sqrt(totalRun * totalRun + totalHeight * totalHeight);
      const railAngle = Math.atan2(totalHeight, totalRun);
      const railGeo = new CylinderGeometry(0.025, 0.025, railLength, 8);
      const rail = new Mesh(railGeo, railMat);
      rail.position.set(totalRun / 2, totalHeight / 2 + railingHeight, zSide * width / 2);
      rail.rotation.z = Math.PI / 2 - railAngle;
      rail.name = `handrail_${zSide === -1 ? 'left' : 'right'}`;
      group.add(rail);
    }
  }

  /**
   * L-type railing: 2 straight segments with railing
   */
  private addLRailing(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    railingHeight: number, railMat: MeshStandardMaterial, balusterMat: MeshStandardMaterial
  ): void {
    const firstFlightSteps = Math.floor(numSteps / 2);
    const landingSize = width;

    // First flight railing (along X axis, on both sides)
    for (let i = 0; i <= firstFlightSteps; i++) {
      const y = i * rise;
      const x = i * run;
      for (const zSide of [-1, 1]) {
        const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
        const baluster = new Mesh(balusterGeo, balusterMat);
        baluster.position.set(x, y + railingHeight / 2, zSide * width / 2);
        group.add(baluster);
      }
    }

    // First flight top rail
    const firstRise = firstFlightSteps * rise;
    const firstRunLen = firstFlightSteps * run;
    const firstRailLen = Math.sqrt(firstRunLen ** 2 + firstRise ** 2);
    const firstAngle = Math.atan2(firstRise, firstRunLen);
    for (const zSide of [-1, 1]) {
      const railGeo = new CylinderGeometry(0.025, 0.025, firstRailLen, 8);
      const rail = new Mesh(railGeo, railMat);
      rail.position.set(firstRunLen / 2, firstRise / 2 + railingHeight, zSide * width / 2);
      rail.rotation.z = Math.PI / 2 - firstAngle;
      group.add(rail);
    }

    // Landing railing (perimeter of landing)
    const landingY = firstFlightSteps * rise;
    const landingX = firstFlightSteps * run;
    // Front edge of landing
    for (let s = 0; s <= 4; s++) {
      const t = s / 4;
      const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
      const baluster = new Mesh(balusterGeo, balusterMat);
      baluster.position.set(
        landingX + landingSize / 2 + (t - 0.5) * landingSize * 0.3,
        landingY + railingHeight / 2,
        landingSize / 2
      );
      group.add(baluster);
    }
    // Top rail on landing front edge
    const landingRailGeo = new CylinderGeometry(0.025, 0.025, landingSize * 0.3, 8);
    const landingRail = new Mesh(landingRailGeo, railMat);
    landingRail.position.set(landingX + landingSize / 2, landingY + railingHeight, landingSize / 2);
    landingRail.rotation.z = Math.PI / 2;
    group.add(landingRail);

    // Second flight railing (going in Z direction)
    const secondFlightSteps = numSteps - firstFlightSteps;
    for (let i = 0; i <= secondFlightSteps; i++) {
      const y = landingY + (i + 1) * rise;
      const z = landingSize / 2 - width / 2 + i * run;
      for (const xSide of [-1, 1]) {
        const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
        const baluster = new Mesh(balusterGeo, balusterMat);
        baluster.position.set(landingX + landingSize / 2 + xSide * width / 2, y + railingHeight / 2, z);
        group.add(baluster);
      }
    }
    // Second flight top rail
    const secondRise = secondFlightSteps * rise;
    const secondRunLen = secondFlightSteps * run;
    const secondRailLen = Math.sqrt(secondRunLen ** 2 + secondRise ** 2);
    const secondAngle = Math.atan2(secondRise, secondRunLen);
    for (const xSide of [-1, 1]) {
      const railGeo = new CylinderGeometry(0.025, 0.025, secondRailLen, 8);
      const rail = new Mesh(railGeo, railMat);
      rail.position.set(
        landingX + landingSize / 2 + xSide * width / 2,
        landingY + secondRise / 2 + railingHeight + rise,
        landingSize / 2 - width / 2 + secondRunLen / 2
      );
      rail.rotation.x = -(Math.PI / 2 - secondAngle);
      group.add(rail);
    }
  }

  /**
   * U-type railing: 2 segments + landing
   */
  private addURailing(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    totalHeight: number, railingHeight: number,
    railMat: MeshStandardMaterial, balusterMat: MeshStandardMaterial
  ): void {
    const firstFlightSteps = Math.floor(numSteps / 2);
    const landingWidth = width * 2;

    // First flight railing
    for (let i = 0; i <= firstFlightSteps; i++) {
      for (const zSide of [-1, 1]) {
        const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
        const baluster = new Mesh(balusterGeo, balusterMat);
        baluster.position.set(i * run, i * rise + railingHeight / 2, -width / 2 + zSide * width / 2);
        group.add(baluster);
      }
    }

    // First flight top rail
    const firstRise = firstFlightSteps * rise;
    const firstRunLen = firstFlightSteps * run;
    const firstRailLen = Math.sqrt(firstRunLen ** 2 + firstRise ** 2);
    const firstAngle = Math.atan2(firstRise, firstRunLen);
    for (const zSide of [-1, 1]) {
      const railGeo = new CylinderGeometry(0.025, 0.025, firstRailLen, 8);
      const rail = new Mesh(railGeo, railMat);
      rail.position.set(firstRunLen / 2, firstRise / 2 + railingHeight, -width / 2 + zSide * width / 2);
      rail.rotation.z = Math.PI / 2 - firstAngle;
      group.add(rail);
    }

    // Landing railing (perimeter)
    const landingY = firstFlightSteps * rise;
    const landingX = firstFlightSteps * run;
    // Front and back edges of landing
    for (const zEdge of [-1, 1]) {
      const landingEdgeRailGeo = new CylinderGeometry(0.025, 0.025, landingWidth, 8);
      const landingEdgeRail = new Mesh(landingEdgeRailGeo, railMat);
      landingEdgeRail.position.set(landingX + landingWidth / 2, landingY + railingHeight, zEdge * width / 2);
      landingEdgeRail.rotation.z = Math.PI / 2;
      group.add(landingEdgeRail);

      // Balusters along landing edge
      for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
        const baluster = new Mesh(balusterGeo, balusterMat);
        baluster.position.set(
          landingX + t * landingWidth,
          landingY + railingHeight / 2,
          zEdge * width / 2
        );
        group.add(baluster);
      }
    }

    // Second flight railing
    const secondFlightSteps = numSteps - firstFlightSteps;
    for (let i = 0; i <= secondFlightSteps; i++) {
      for (const zSide of [-1, 1]) {
        const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
        const baluster = new Mesh(balusterGeo, balusterMat);
        baluster.position.set(
          landingX + landingWidth - i * run,
          landingY + (i + 1) * rise + railingHeight / 2,
          width / 2 + zSide * width / 2
        );
        group.add(baluster);
      }
    }

    // Second flight top rail
    const secondRise = secondFlightSteps * rise;
    const secondRailLen = Math.sqrt(firstRunLen ** 2 + secondRise ** 2);
    const secondAngle = Math.atan2(secondRise, firstRunLen);
    for (const zSide of [-1, 1]) {
      const railGeo = new CylinderGeometry(0.025, 0.025, secondRailLen, 8);
      const rail = new Mesh(railGeo, railMat);
      rail.position.set(
        landingX + landingWidth - firstRunLen / 2,
        landingY + secondRise / 2 + rise + railingHeight,
        width / 2 + zSide * width / 2
      );
      rail.rotation.z = -(Math.PI / 2 - secondAngle);
      group.add(rail);
    }
  }

  /**
   * Spiral railing: helical rail following the stair curve
   */
  private addSpiralRailing(
    group: Group, numSteps: number, rise: number, diameter: number,
    railingHeight: number, railMat: MeshStandardMaterial, balusterMat: MeshStandardMaterial
  ): void {
    const radius = diameter / 2;
    const totalAngle = Math.PI * 1.5;
    const angleStep = totalAngle / numSteps;

    // Outer balusters at each step
    for (let i = 0; i <= numSteps; i++) {
      const angle = i * angleStep;
      const y = i * rise;
      const outerR = radius + 0.05;

      // Outer baluster
      const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
      const baluster = new Mesh(balusterGeo, balusterMat);
      baluster.position.set(
        Math.cos(angle) * outerR,
        y + railingHeight / 2,
        Math.sin(angle) * outerR
      );
      group.add(baluster);
    }

    // Helical top rail (outer)
    // Approximate with segments between steps
    for (let i = 0; i < numSteps; i++) {
      const a0 = i * angleStep;
      const a1 = (i + 1) * angleStep;
      const y0 = i * rise + railingHeight;
      const y1 = (i + 1) * rise + railingHeight;
      const outerR = radius + 0.05;

      const startX = Math.cos(a0) * outerR;
      const startZ = Math.sin(a0) * outerR;
      const endX = Math.cos(a1) * outerR;
      const endZ = Math.sin(a1) * outerR;

      const dx = endX - startX;
      const dy = y1 - y0;
      const dz = endZ - startZ;
      const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const railGeo = new CylinderGeometry(0.02, 0.02, segLen, 8);
      const railSeg = new Mesh(railGeo, railMat);
      railSeg.position.set((startX + endX) / 2, (y0 + y1) / 2, (startZ + endZ) / 2);
      // Orient cylinder to point from start to end
      railSeg.lookAt(endX, y1, endZ);
      railSeg.rotateX(Math.PI / 2);
      group.add(railSeg);
    }
  }

  /**
   * Curved railing: curved rail following the curved stair
   */
  private addCurvedRailing(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    railingHeight: number, railMat: MeshStandardMaterial, balusterMat: MeshStandardMaterial
  ): void {
    const totalAngle = Math.PI / 2;
    const angleStep = totalAngle / numSteps;
    const radius = (run * numSteps) / totalAngle;
    const innerRadius = radius - width;

    // Outer balusters at each step
    for (let i = 0; i <= numSteps; i++) {
      const angle = i * angleStep;
      const y = i * rise + railingHeight / 2;

      // Outer
      const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
      const outerBaluster = new Mesh(balusterGeo, balusterMat);
      outerBaluster.position.set(
        Math.cos(angle) * (radius + 0.05),
        y,
        Math.sin(angle) * (radius + 0.05)
      );
      group.add(outerBaluster);

      // Inner
      const innerBaluster = new Mesh(balusterGeo.clone(), balusterMat);
      innerBaluster.position.set(
        Math.cos(angle) * (innerRadius - 0.05),
        y,
        Math.sin(angle) * (innerRadius - 0.05)
      );
      group.add(innerBaluster);
    }

    // Curved top rail segments (outer)
    for (let i = 0; i < numSteps; i++) {
      const a0 = i * angleStep;
      const a1 = (i + 1) * angleStep;
      const y0 = i * rise + railingHeight;
      const y1 = (i + 1) * rise + railingHeight;
      const outerR = radius + 0.05;

      const startX = Math.cos(a0) * outerR;
      const startZ = Math.sin(a0) * outerR;
      const endX = Math.cos(a1) * outerR;
      const endZ = Math.sin(a1) * outerR;

      const dx = endX - startX;
      const dy = y1 - y0;
      const dz = endZ - startZ;
      const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const railGeo = new CylinderGeometry(0.02, 0.02, segLen, 8);
      const railSeg = new Mesh(railGeo, railMat);
      railSeg.position.set((startX + endX) / 2, (y0 + y1) / 2, (startZ + endZ) / 2);
      railSeg.lookAt(endX, y1, endZ);
      railSeg.rotateX(Math.PI / 2);
      group.add(railSeg);
    }

    // Curved top rail segments (inner)
    for (let i = 0; i < numSteps; i++) {
      const a0 = i * angleStep;
      const a1 = (i + 1) * angleStep;
      const y0 = i * rise + railingHeight;
      const y1 = (i + 1) * rise + railingHeight;
      const innerR = innerRadius - 0.05;

      const startX = Math.cos(a0) * innerR;
      const startZ = Math.sin(a0) * innerR;
      const endX = Math.cos(a1) * innerR;
      const endZ = Math.sin(a1) * innerR;

      const dx = endX - startX;
      const dy = y1 - y0;
      const dz = endZ - startZ;
      const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);

      const railGeo = new CylinderGeometry(0.02, 0.02, segLen, 8);
      const railSeg = new Mesh(railGeo, railMat);
      railSeg.position.set((startX + endX) / 2, (y0 + y1) / 2, (startZ + endZ) / 2);
      railSeg.lookAt(endX, y1, endZ);
      railSeg.rotateX(Math.PI / 2);
      group.add(railSeg);
    }
  }

  /**
   * Cantilever staircase: treads mount directly to a wall, no stringers.
   * Each tread is a standalone box floating from the wall with hidden
   * mounting brackets. No visible support underneath — the hallmark
   * of cantilever construction. Only one side has a railing (the open side).
   *
   * Based on the original Infinigen's CantileverStaircaseFactory which
   * uses support_types="wall" and handrail_types="horizontal-post|vertical-post".
   */
  private generateCantileverStairs(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    treadThickness: number, hasRisers: boolean,
    treadMat: MeshStandardMaterial, riserMat: MeshStandardMaterial
  ): void {
    // Wall mounting side is at z = -width/2 (treads protrude in +Z direction)
    const wallZ = -width / 2;
    const riserThickness = 0.02; // thin risers for cantilever style

    for (let i = 0; i < numSteps; i++) {
      const y = i * rise;
      const x = i * run;

      // Tread: slightly deeper than standard to give the floating appearance
      // more depth, and tapered at the free end for visual elegance
      const treadDepth = width * 1.1; // extends slightly past width
      const treadGeom = new BoxGeometry(run + 0.02, treadThickness, treadDepth);
      const tread = new Mesh(treadGeom, treadMat);
      tread.position.set(x + run / 2, y + treadThickness / 2, wallZ + treadDepth / 2);
      tread.castShadow = true;
      tread.receiveShadow = true;
      tread.name = `cantilever_tread_${i}`;
      group.add(tread);

      // Hidden mounting bracket: small steel plate embedded in the wall
      // that supports the tread from the wall side
      const bracketGeom = new BoxGeometry(run * 0.6, treadThickness * 1.5, 0.04);
      const bracketMat = this.getMaterial('steel');
      const bracket = new Mesh(bracketGeom, bracketMat);
      bracket.position.set(x + run / 2, y, wallZ - 0.01);
      bracket.name = `cantilever_bracket_${i}`;
      group.add(bracket);

      // Optional riser (thin panel between treads, only on the wall side)
      if (hasRisers && i < numSteps - 1) {
        const riserGeom = new BoxGeometry(riserThickness, rise, width * 0.3);
        const riser = new Mesh(riserGeom, riserMat);
        riser.position.set(x + run / 2, y + treadThickness + rise / 2, wallZ + width * 0.15);
        riser.castShadow = true;
        riser.name = `cantilever_riser_${i}`;
        group.add(riser);
      }
    }

    // Wall backing: a thin panel along the mounting wall to suggest
    // the wall surface that the brackets are embedded into
    const wallPanelGeom = new BoxGeometry(numSteps * run + 0.5, numSteps * rise + 0.5, 0.05);
    const wallPanelMat = this.getMaterial('concrete');
    const wallPanel = new Mesh(wallPanelGeom, wallPanelMat);
    wallPanel.position.set(
      numSteps * run / 2 - run / 2,
      numSteps * rise / 2 - rise / 2,
      wallZ - 0.05
    );
    wallPanel.receiveShadow = true;
    wallPanel.name = 'cantilever_wall_panel';
    group.add(wallPanel);
  }

  /**
   * Cantilever railing: only on the open (free) side, no wall-side railing.
   * Uses horizontal-post handrail style (matching original Infinigen's
   * horizontal-post handrail type for cantilever stairs).
   */
  private addCantileverRailing(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    totalHeight: number, railingHeight: number,
    railMat: MeshStandardMaterial, balusterMat: MeshStandardMaterial
  ): void {
    // Railing only on the open side (z = +width/2 + offset for overhang)
    const railZ = width / 2 + width * 0.05; // slightly past the tread edge

    // Vertical posts at every 2nd step (horizontal-post style)
    for (let i = 0; i <= numSteps; i += 2) {
      const y = i * rise;
      const x = i * run;

      // Vertical post
      const postHeight = railingHeight + 0.05;
      const postGeo = new CylinderGeometry(0.02, 0.025, postHeight, 8);
      const post = new Mesh(postGeo, balusterMat);
      post.position.set(x, y + postHeight / 2, railZ);
      post.castShadow = true;
      post.name = `cantilever_post_${i}`;
      group.add(post);
    }

    // Horizontal top rail (continuous, angled with the stairs)
    const totalRunLen = numSteps * run;
    const railLength = Math.sqrt(totalRunLen ** 2 + totalHeight ** 2);
    const railAngle = Math.atan2(totalHeight, totalRunLen);
    const topRailGeo = new CylinderGeometry(0.025, 0.025, railLength, 8);
    const topRail = new Mesh(topRailGeo, railMat);
    topRail.position.set(
      totalRunLen / 2,
      totalHeight / 2 + railingHeight,
      railZ
    );
    topRail.rotation.z = Math.PI / 2 - railAngle;
    topRail.castShadow = true;
    topRail.name = 'cantilever_top_rail';
    group.add(topRail);

    // Horizontal mid-rail (at half railing height, for horizontal-post style)
    const midRailHeight = railingHeight * 0.5;
    const midRailGeo = new CylinderGeometry(0.015, 0.015, railLength, 8);
    const midRail = new Mesh(midRailGeo, railMat);
    midRail.position.set(
      totalRunLen / 2,
      totalHeight / 2 + midRailHeight,
      railZ
    );
    midRail.rotation.z = Math.PI / 2 - railAngle;
    midRail.castShadow = true;
    midRail.name = 'cantilever_mid_rail';
    group.add(midRail);
  }

  getStylePresets(): Record<string, Partial<StaircaseParams>> {
    return {
      modern: { style: 'modern', stringerType: 'mono', hasRisers: false, treadMaterial: 'glass', stringerMaterial: 'steel' },
      traditional: { style: 'traditional', stringerType: 'closed', hasRisers: true, treadMaterial: 'oak', riserMaterial: 'oak', stringerMaterial: 'oak' },
      industrial: { style: 'industrial', stringerType: 'open', hasRisers: false, treadMaterial: 'metal', stringerMaterial: 'steel' },
      rustic: { style: 'rustic', stringerType: 'closed', hasRisers: true, treadMaterial: 'reclaimed_wood', stringerMaterial: 'reclaimed_wood' },
      minimalist: { style: 'minimalist', stringerType: 'mono', hasRisers: false, treadThickness: 0.03, treadMaterial: 'concrete' },
      cantilever: { style: 'modern', stairType: 'cantilever', hasStringers: false, hasRisers: false, treadMaterial: 'oak', stringerMaterial: 'steel' },
    };
  }
}
