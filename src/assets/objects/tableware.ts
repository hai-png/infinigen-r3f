/**
 * Tableware Generator - Phase 2A Implementation
 * 
 * Procedural generation of tableware items: cups, bowls, plates, utensils, bottles, jars
 * Based on original InfiniGen tableware generators from Princeton VL
 * 
 * @module assets/objects/tableware
 */

import * as THREE from 'three';
import { BaseAssetGenerator, GeneratedAsset } from './furniture';
import { LODLevel } from '../../utils/lod';

export type TablewareType = 
  | 'cup' 
  | 'bowl' 
  | 'plate' 
  | 'fork' 
  | 'knife' 
  | 'spoon'
  | 'bottle'
  | 'jar'
  | 'wineglass'
  | 'can';

export interface TablewareParams {
  type: TablewareType;
  scale?: number;
  thickness?: number;
  hasHandle?: boolean;
  hasLid?: boolean;
  material?: string;
  seed?: number;
}

const DEFAULT_PARAMS: TablewareParams = {
  type: 'cup',
  scale: 1.0,
  thickness: 0.02,
  hasHandle: true,
  hasLid: false,
  material: 'ceramic',
  seed: Math.random(),
};

/**
 * Tableware Generator
 * Generates procedural tableware items including cups, bowls, plates, utensils, and containers
 */
export class TablewareGenerator extends BaseAssetGenerator<TablewareParams> {
  protected defaultParams: TablewareParams = DEFAULT_PARAMS;

  constructor(seed?: number) {
    super(seed);
  }

  generate(params: Partial<TablewareParams> = {}): GeneratedAsset {
    const finalParams = { ...this.defaultParams, ...params };
    this.setSeed(finalParams.seed);
    
    let geometry: THREE.BufferGeometry;
    let tags: string[] = [];
    
    switch (finalParams.type) {
      case 'cup':
        geometry = this.generateCup(finalParams);
        tags = ['tableware', 'cup', 'drinkware', 'kitchen'];
        break;
      case 'bowl':
        geometry = this.generateBowl(finalParams);
        tags = ['tableware', 'bowl', 'dishware', 'kitchen'];
        break;
      case 'plate':
        geometry = this.generatePlate(finalParams);
        tags = ['tableware', 'plate', 'dishware', 'kitchen'];
        break;
      case 'fork':
        geometry = this.generateFork(finalParams);
        tags = ['tableware', 'fork', 'utensil', 'cutlery', 'kitchen'];
        break;
      case 'knife':
        geometry = this.generateKnife(finalParams);
        tags = ['tableware', 'knife', 'utensil', 'cutlery', 'kitchen'];
        break;
      case 'spoon':
        geometry = this.generateSpoon(finalParams);
        tags = ['tableware', 'spoon', 'utensil', 'cutlery', 'kitchen'];
        break;
      case 'bottle':
        geometry = this.generateBottle(finalParams);
        tags = ['tableware', 'bottle', 'container', 'drinkware', 'kitchen'];
        break;
      case 'jar':
        geometry = this.generateJar(finalParams);
        tags = ['tableware', 'jar', 'container', 'storage', 'kitchen'];
        break;
      case 'wineglass':
        geometry = this.generateWineglass(finalParams);
        tags = ['tableware', 'wineglass', 'glassware', 'drinkware', 'kitchen'];
        break;
      case 'can':
        geometry = this.generateCan(finalParams);
        tags = ['tableware', 'can', 'container', 'packaging', 'kitchen'];
        break;
      default:
        geometry = this.generateCup(finalParams);
        tags = ['tableware', 'cup'];
    }

    const bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
    const scale = finalParams.scale || 1.0;
    
    // Apply scale to geometry
    geometry.scale(scale, scale, scale);
    
    // Recalculate bbox after scaling
    const scaledBbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));

    return {
      geometry,
      bbox: scaledBbox,
      tags,
      parameters: finalParams,
      lod: this.generateLOD(geometry),
      collisionGeometry: this.createCollisionGeometry(geometry),
      materialZones: this.getMaterialZones(finalParams.type),
    };
  }

  /**
   * Generate a cup/mug geometry
   * Based on original InfiniGen CupFactory
   */
  private generateCup(params: TablewareParams): THREE.BufferGeometry {
    const { thickness, scale } = params;
    const isShort = this.random() < 0.5;
    
    // Cup dimensions
    const depth = isShort ? this.randomRange(0.25, 0.5) : this.randomRange(0.5, 1.0);
    const xEnd = isShort ? 0.25 : 0.35;
    const xLowest = this.randomRange(0.6, 0.9);
    const thicknessActual = this.randomRange(0.01, 0.04);
    
    // Create cup profile for lathe
    const points: THREE.Vector2[] = [];
    const segments = 32;
    
    // Inner profile
    const innerRadius = xEnd - thicknessActual;
    const innerDepth = depth - thicknessActual;
    
    // Bottom center
    points.push(new THREE.Vector2(0, 0));
    // Bottom edge inner
    points.push(new THREE.Vector2(innerRadius * 0.3, 0));
    // Side inner (tapered)
    points.push(new THREE.Vector2(innerRadius, innerDepth * 0.1));
    points.push(new THREE.Vector2(innerRadius * xLowest, innerDepth * 0.5));
    points.push(new THREE.Vector2(innerRadius, innerDepth));
    // Rim
    points.push(new THREE.Vector2(innerRadius + thicknessActual * 0.5, innerDepth + thicknessActual * 0.5));
    
    // Outer profile (reverse order for proper lathe)
    points.push(new THREE.Vector2(xEnd + thicknessActual * 0.5, innerDepth + thicknessActual * 0.5));
    points.push(new THREE.Vector2(xEnd, innerDepth));
    points.push(new THREE.Vector2(xEnd * xLowest, innerDepth * 0.5));
    points.push(new THREE.Vector2(xEnd * 0.3, 0));
    points.push(new THREE.Vector2(xEnd, 0));
    
    const geometry = new THREE.LatheGeometry(points, segments);
    
    // Add handle if requested
    if (params.hasHandle) {
      const handleGeometry = this.createCupHandle(xEnd, depth, thicknessActual);
      this.mergeGeometries(geometry, handleGeometry);
    }
    
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Create cup handle geometry
   */
  private createCupHandle(xEnd: number, depth: number, thickness: number): THREE.BufferGeometry {
    const handleType = this.random() < 0.5 ? 'round' : 'shear';
    const handleRadius = depth * this.randomRange(0.2, 0.4);
    const handleInnerRadius = handleRadius * this.randomRange(0.2, 0.3);
    
    if (handleType === 'round') {
      // Torus handle
      const geometry = new THREE.TorusGeometry(handleRadius, handleInnerRadius, 8, 16, Math.PI);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(xEnd * 1.2, 0, depth * 0.5);
      return geometry;
    } else {
      // Shear-style handle using extruded shape
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(handleRadius, 0, handleRadius, handleRadius);
      shape.quadraticCurveTo(handleRadius, handleRadius * 2, 0, handleRadius * 2);
      shape.quadraticCurveTo(handleRadius * 0.5, handleRadius * 1.5, 0, handleRadius * 2);
      
      const extrudeSettings = { depth: handleInnerRadius, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.rotateY(-Math.PI / 2);
      geometry.translate(xEnd * 1.1, 0, depth * 0.45);
      return geometry;
    }
  }

  /**
   * Generate a bowl geometry
   * Based on original InfiniGen BowlFactory
   */
  private generateBowl(params: TablewareParams): THREE.BufferGeometry {
    const { thickness, scale } = params;
    const thicknessActual = this.randomRange(0.01, 0.03) * scale;
    const xEnd = 0.5 * scale;
    const zLength = this.randomRange(0.4, 0.8) * scale;
    const xBottom = this.randomRange(0.2, 0.3) * xEnd;
    const zBottom = this.randomRange(0.02, 0.05) * scale;
    
    const points: THREE.Vector2[] = [];
    const segments = 32;
    
    // Inner profile
    const innerXEnd = xEnd - thicknessActual;
    const innerZLength = zLength - thicknessActual;
    const innerXBottom = xBottom - thicknessActual;
    
    // Bottom center
    points.push(new THREE.Vector2(0, 0));
    // Bottom inner
    points.push(new THREE.Vector2(innerXBottom, 0));
    // Curve up
    points.push(new THREE.Vector2(innerXBottom, zBottom));
    points.push(new THREE.Vector2(innerXEnd * 0.8, innerZLength * 0.5));
    points.push(new THREE.Vector2(innerXEnd, innerZLength));
    // Rim
    points.push(new THREE.Vector2(innerXEnd + thicknessActual * 0.3, innerZLength + thicknessActual * 0.2));
    
    // Outer profile
    points.push(new THREE.Vector2(xEnd + thicknessActual * 0.3, zLength + thicknessActual * 0.2));
    points.push(new THREE.Vector2(xEnd, zLength));
    points.push(new THREE.Vector2(xEnd * 0.8, zLength * 0.5));
    points.push(new THREE.Vector2(xBottom, zBottom));
    points.push(new THREE.Vector2(xBottom * 1.2, 0));
    points.push(new THREE.Vector2(xEnd, 0));
    
    const geometry = new THREE.LatheGeometry(points, segments);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Generate a plate geometry
   * Based on original InfiniGen PlateFactory
   */
  private generatePlate(params: TablewareParams): THREE.BufferGeometry {
    const { thickness, scale } = params;
    const thicknessActual = this.randomRange(0.01, 0.03) * scale;
    const xEnd = 0.5 * scale;
    const zLength = this.randomRange(0.05, 0.2) * scale;
    const xMid = this.randomRange(0.3, 1.0) * xEnd;
    const zMid = this.randomRange(0.3, 0.8) * zLength;
    
    const points: THREE.Vector2[] = [];
    const segments = 32;
    
    // Inner profile
    const innerXEnd = xEnd - thicknessActual;
    const innerZLength = zLength - thicknessActual;
    
    // Center bottom
    points.push(new THREE.Vector2(0, 0));
    // Flat center
    points.push(new THREE.Vector2(xMid - thicknessActual, 0));
    // Rise to rim
    points.push(new THREE.Vector2(xMid - thicknessActual, zMid));
    points.push(new THREE.Vector2(innerXEnd, innerZLength));
    // Rim edge
    points.push(new THREE.Vector2(innerXEnd + thicknessActual * 0.5, innerZLength + thicknessActual * 0.3));
    
    // Outer profile
    points.push(new THREE.Vector2(xEnd + thicknessActual * 0.5, zLength + thicknessActual * 0.3));
    points.push(new THREE.Vector2(xEnd, zLength));
    points.push(new THREE.Vector2(xMid, zMid));
    points.push(new THREE.Vector2(xMid, 0));
    points.push(new THREE.Vector2(xEnd, 0));
    
    const geometry = new THREE.LatheGeometry(points, segments);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Generate a fork geometry
   * Based on original InfiniGen ForkFactory
   */
  private generateFork(params: TablewareParams): THREE.BufferGeometry {
    const scale = params.scale || 1.0;
    const xLength = this.randomRange(0.4, 0.8) * scale;
    const xTip = 0.15 * scale;
    const yLength = this.randomRange(0.05, 0.08) * scale;
    const zDepth = this.randomRange(0.02, 0.04) * scale;
    const thickness = this.randomRange(0.008, 0.015) * scale;
    const nTines = this.random() < 0.3 ? this.randomInt(1, 3) : 3;
    
    // Create fork using box geometries
    const geometries: THREE.BufferGeometry[] = [];
    
    // Handle
    const handleGeom = new THREE.BoxGeometry(xLength, yLength * 0.6, thickness);
    handleGeom.translate(-xEnd - xLength / 2, 0, 0);
    geometries.push(handleGeom);
    
    // Neck transition
    const neckGeom = new THREE.BoxGeometry(0.12 * scale, yLength * 0.8, thickness);
    neckGeom.translate(-xEnd - 0.06 * scale, 0, 0);
    geometries.push(neckGeom);
    
    // Tines
    const tineWidth = (yLength * 1.5) / nTines;
    const tineSpacing = yLength * 1.5 / (nTines + 1);
    
    for (let i = 0; i < nTines; i++) {
      const tineY = -yLength * 0.75 + tineSpacing * (i + 1);
      const tineGeom = new THREE.BoxGeometry(xTip, thickness, zDepth);
      tineGeom.translate(-xEnd + xTip / 2, tineY, 0);
      geometries.push(tineGeom);
    }
    
    // Guard (optional)
    if (this.random() < 0.4) {
      const guardGeom = new THREE.BoxGeometry(0.08 * scale, yLength * 1.2, thickness * 2);
      guardGeom.translate(-xEnd - 0.04 * scale, 0, 0);
      geometries.push(guardGeom);
    }
    
    const geometry = this.mergeGeometriesList(geometries);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Generate a knife geometry
   */
  private generateKnife(params: TablewareParams): THREE.BufferGeometry {
    const scale = params.scale || 1.0;
    const bladeLength = this.randomRange(0.5, 0.8) * scale;
    const bladeWidth = this.randomRange(0.08, 0.12) * scale;
    const bladeThickness = this.randomRange(0.005, 0.01) * scale;
    const handleLength = this.randomRange(0.3, 0.4) * scale;
    const handleWidth = this.randomRange(0.06, 0.08) * scale;
    const handleThickness = this.randomRange(0.02, 0.03) * scale;
    
    const geometries: THREE.BufferGeometry[] = [];
    
    // Blade with taper
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, -bladeWidth / 2);
    bladeShape.lineTo(bladeLength, -bladeWidth * 0.3);
    bladeShape.lineTo(bladeLength, bladeWidth * 0.3);
    bladeShape.lineTo(0, bladeWidth / 2);
    bladeShape.closePath();
    
    const bladeGeom = new THREE.ExtrudeGeometry(bladeShape, { depth: bladeThickness, bevelEnabled: false });
    bladeGeom.rotateX(Math.PI / 2);
    bladeGeom.translate(-handleLength, 0, 0);
    geometries.push(bladeGeom);
    
    // Handle
    const handleGeom = new THREE.BoxGeometry(handleLength, handleWidth, handleThickness);
    handleGeom.translate(-handleLength / 2, 0, 0);
    geometries.push(handleGeom);
    
    // Guard
    const guardGeom = new THREE.BoxGeometry(0.02 * scale, bladeWidth * 1.2, handleThickness * 1.2);
    guardGeom.translate(-handleLength, 0, 0);
    geometries.push(guardGeom);
    
    const geometry = this.mergeGeometriesList(geometries);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Generate a spoon geometry
   */
  private generateSpoon(params: TablewareParams): THREE.BufferGeometry {
    const scale = params.scale || 1.0;
    const bowlRadius = this.randomRange(0.08, 0.12) * scale;
    const bowlDepth = this.randomRange(0.03, 0.05) * scale;
    const handleLength = this.randomRange(0.4, 0.6) * scale;
    const handleWidth = this.randomRange(0.04, 0.06) * scale;
    const thickness = this.randomRange(0.005, 0.01) * scale;
    
    const geometries: THREE.BufferGeometry[] = [];
    
    // Spoon bowl (hemisphere-like)
    const bowlGeom = new THREE.SphereGeometry(bowlRadius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    bowlGeom.scale(1, 1, bowlDepth / bowlRadius);
    bowlGeom.rotateX(Math.PI);
    bowlGeom.translate(-handleLength, 0, 0);
    geometries.push(bowlGeom);
    
    // Handle
    const handleShape = new THREE.Shape();
    handleShape.moveTo(0, -handleWidth / 2);
    handleShape.lineTo(-handleLength, -handleWidth * 0.4);
    handleShape.quadraticCurveTo(-handleLength - bowlRadius * 0.5, 0, -handleLength, handleWidth * 0.4);
    handleShape.lineTo(0, handleWidth / 2);
    handleShape.closePath();
    
    const handleGeom = new THREE.ExtrudeGeometry(handleShape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
    handleGeom.rotateX(Math.PI / 2);
    geometries.push(handleGeom);
    
    const geometry = this.mergeGeometriesList(geometries);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Generate a bottle geometry
   * Based on original InfiniGen BottleFactory
   */
  private generateBottle(params: TablewareParams): THREE.BufferGeometry {
    const scale = params.scale || 1.0;
    const bottleTypes = ['beer', 'bordeaux', 'champagne', 'coke', 'vintage'] as const;
    const bottleType = bottleTypes[Math.floor(this.random() * bottleTypes.length)];
    
    const zLength = this.randomRange(0.15, 0.25) * scale;
    const xBase = zLength * this.randomRange(0.15, 0.25);
    const xCap = this.randomRange(0.3, 0.35);
    
    let xAnchors: number[];
    let zAnchors: number[];
    
    switch (bottleType) {
      case 'beer':
        const zNeckBeer = this.randomRange(0.5, 0.6);
        const zCapBeer = this.randomRange(0.05, 0.08);
        const neckSizeBeer = this.randomRange(0.06, 0.1);
        const neckRatioBeer = this.randomRange(0.4, 0.5);
        xAnchors = [
          0,
          1,
          1,
          (neckRatioBeer + 1) / 2 + (1 - neckRatioBeer) / 2 * xCap,
          neckRatioBeer + (1 - neckRatioBeer) * xCap,
          xCap,
          xCap,
          0,
        ];
        zAnchors = [
          0,
          0,
          zNeckBeer,
          zNeckBeer + this.randomRange(0.6, 0.7) * neckSizeBeer,
          zNeckBeer + neckSizeBeer,
          1 - zCapBeer,
          1,
          1,
        ];
        break;
      case 'bordeaux':
        const zNeckBordeaux = this.randomRange(0.6, 0.7);
        const zCapBordeaux = this.randomRange(0.1, 0.15);
        const neckSizeBordeaux = this.randomRange(0.1, 0.15);
        xAnchors = [0, 1, 1, (1 + xCap) / 2, xCap, xCap, 0];
        zAnchors = [
          0,
          0,
          zNeckBordeaux,
          zNeckBordeaux + this.randomRange(0.6, 0.7) * neckSizeBordeaux,
          zNeckBordeaux + neckSizeBordeaux,
          1,
          1,
        ];
        break;
      case 'champagne':
        const zNeckChampagne = this.randomRange(0.4, 0.5);
        const zCapChampagne = this.randomRange(0.05, 0.08);
        xAnchors = [0, 1, 1, 1, (1 + xCap) / 2, xCap, xCap, 0];
        zAnchors = [
          0,
          0,
          zNeckChampagne,
          zNeckChampagne + this.randomRange(0.1, 0.15),
          1 - zCapChampagne,
          1 - zCapChampagne,
          1,
          1,
        ];
        break;
      default:
        xAnchors = [0, 1, 1, 0.8, 0.6, 0.4, 0.4, 0];
        zAnchors = [0, 0, 0.6, 0.7, 0.85, 0.9, 1, 1];
    }
    
    // Scale anchors
    xAnchors = xAnchors.map(x => x * xBase);
    zAnchors = zAnchors.map(z => z * zLength);
    
    const points: THREE.Vector2[] = [];
    const segments = 32;
    
    for (let i = 0; i < xAnchors.length; i++) {
      points.push(new THREE.Vector2(xAnchors[i], zAnchors[i]));
    }
    
    const geometry = new THREE.LatheGeometry(points, segments);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Generate a jar geometry
   */
  private generateJar(params: TablewareParams): THREE.BufferGeometry {
    const scale = params.scale || 1.0;
    const hasLid = params.hasLid ?? this.random() < 0.5;
    
    const bodyRadius = this.randomRange(0.15, 0.25) * scale;
    const bodyHeight = this.randomRange(0.2, 0.3) * scale;
    const neckRadius = this.randomRange(0.1, 0.15) * scale;
    const neckHeight = this.randomRange(0.05, 0.1) * scale;
    const lidHeight = hasLid ? this.randomRange(0.03, 0.05) * scale : 0;
    const thickness = this.randomRange(0.01, 0.02) * scale;
    
    const points: THREE.Vector2[] = [];
    const segments = 32;
    
    // Inner profile
    const innerBodyRadius = bodyRadius - thickness;
    const innerNeckRadius = neckRadius - thickness;
    
    // Bottom center
    points.push(new THREE.Vector2(0, 0));
    // Bottom inner
    points.push(new THREE.Vector2(innerBodyRadius, 0));
    // Body side inner
    points.push(new THREE.Vector2(innerBodyRadius, bodyHeight));
    // Shoulder inner
    points.push(new THREE.Vector2(innerNeckRadius, bodyHeight + neckHeight * 0.3));
    // Neck inner
    points.push(new THREE.Vector2(innerNeckRadius, bodyHeight + neckHeight));
    // Rim inner
    points.push(new THREE.Vector2(innerNeckRadius + thickness * 0.3, bodyHeight + neckHeight + thickness));
    
    // Outer profile
    points.push(new THREE.Vector2(neckRadius + thickness * 0.5, bodyHeight + neckHeight + thickness));
    if (hasLid) {
      points.push(new THREE.Vector2(neckRadius + thickness * 0.8, bodyHeight + neckHeight + lidHeight));
      points.push(new THREE.Vector2(bodyRadius * 1.1, bodyHeight + neckHeight + lidHeight));
    }
    points.push(new THREE.Vector2(bodyRadius, bodyHeight));
    points.push(new THREE.Vector2(bodyRadius, 0));
    points.push(new THREE.Vector2(bodyRadius * 1.05, 0));
    
    const geometry = new THREE.LatheGeometry(points, segments);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Generate a wineglass geometry
   */
  private generateWineglass(params: TablewareParams): THREE.BufferGeometry {
    const scale = params.scale || 1.0;
    const bowlRadius = this.randomRange(0.15, 0.2) * scale;
    const bowlHeight = this.randomRange(0.15, 0.2) * scale;
    const stemHeight = this.randomRange(0.2, 0.3) * scale;
    const baseRadius = this.randomRange(0.1, 0.15) * scale;
    const thickness = this.randomRange(0.005, 0.015) * scale;
    
    const points: THREE.Vector2[] = [];
    const segments = 32;
    
    // Wineglass profile (open at top)
    // Bowl bottom inner
    points.push(new THREE.Vector2(0, stemHeight + thickness));
    points.push(new THREE.Vector2(bowlRadius * 0.3, stemHeight + thickness * 2));
    // Bowl side inner
    points.push(new THREE.Vector2(bowlRadius - thickness, stemHeight + bowlHeight * 0.5));
    points.push(new THREE.Vector2(bowlRadius - thickness * 0.5, stemHeight + bowlHeight - thickness));
    // Rim
    points.push(new THREE.Vector2(bowlRadius, stemHeight + bowlHeight));
    
    // Bowl outer
    points.push(new THREE.Vector2(bowlRadius + thickness, stemHeight + bowlHeight));
    points.push(new THREE.Vector2(bowlRadius, stemHeight + bowlHeight - thickness));
    points.push(new THREE.Vector2(bowlRadius * 0.5, stemHeight + thickness));
    // Stem
    points.push(new THREE.Vector2(thickness * 2, stemHeight * 0.5));
    // Base
    points.push(new THREE.Vector2(thickness * 2, thickness));
    points.push(new THREE.Vector2(baseRadius, thickness));
    points.push(new THREE.Vector2(baseRadius, 0));
    points.push(new THREE.Vector2(0, 0));
    
    const geometry = new THREE.LatheGeometry(points, segments);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Generate a can geometry
   */
  private generateCan(params: TablewareParams): THREE.BufferGeometry {
    const scale = params.scale || 1.0;
    const radius = this.randomRange(0.1, 0.15) * scale;
    const height = this.randomRange(0.3, 0.4) * scale;
    const thickness = this.randomRange(0.005, 0.01) * scale;
    
    const points: THREE.Vector2[] = [];
    const segments = 32;
    
    // Can profile with ridges
    // Bottom inner
    points.push(new THREE.Vector2(0, 0));
    points.push(new THREE.Vector2(radius - thickness, 0));
    // Bottom ridge
    points.push(new THREE.Vector2(radius - thickness, thickness * 2));
    // Side inner
    points.push(new THREE.Vector2(radius - thickness, height - thickness * 2));
    // Top ridge inner
    points.push(new THREE.Vector2(radius - thickness, height - thickness));
    points.push(new THREE.Vector2(radius - thickness * 2, height));
    
    // Top outer
    points.push(new THREE.Vector2(radius, height));
    points.push(new THREE.Vector2(radius, height - thickness));
    // Top ridge
    points.push(new THREE.Vector2(radius, thickness * 2));
    // Side outer
    points.push(new THREE.Vector2(radius, 0));
    // Bottom outer
    points.push(new THREE.Vector2(radius, 0));
    points.push(new THREE.Vector2(radius * 1.02, 0));
    
    const geometry = new THREE.LatheGeometry(points, segments);
    geometry.scale(scale, scale, scale);
    return geometry;
  }

  /**
   * Get material zones for different tableware types
   */
  private getMaterialZones(type: TablewareType): Record<string, string> {
    const zones: Record<string, string> = {};
    
    switch (type) {
      case 'cup':
      case 'bowl':
        zones['exterior'] = 'ceramic_exterior';
        zones['interior'] = 'ceramic_interior';
        if (this.random() < 0.3) zones['rim'] = 'ceramic_rim';
        break;
      case 'plate':
        zones['top'] = 'ceramic_top';
        zones['bottom'] = 'ceramic_bottom';
        break;
      case 'fork':
      case 'knife':
      case 'spoon':
        zones['metal'] = 'stainless_steel';
        break;
      case 'bottle':
      case 'jar':
        zones['body'] = 'glass_clear';
        if (this.random() < 0.5) zones['label'] = 'paper_label';
        if (this.random() < 0.3) zones['cap'] = 'metal_cap';
        break;
      case 'wineglass':
        zones['glass'] = 'glass_clear';
        break;
      case 'can':
        zones['body'] = 'aluminum';
        zones['label'] = 'printed_label';
        break;
    }
    
    return zones;
  }

  getSupportedTypes(): string[] {
    return ['cup', 'bowl', 'plate', 'fork', 'knife', 'spoon', 'bottle', 'jar', 'wineglass', 'can'];
  }

  getDefaultParameters(): TablewareParams {
    return { ...DEFAULT_PARAMS };
  }
}

/**
 * Specialized Cup Generator with preset configurations
 */
export class CupGenerator extends TablewareGenerator {
  generatePreset(preset: 'espresso' | 'mug' | 'latte' | 'tea'): GeneratedAsset {
    const params: Partial<TablewareParams> = { type: 'cup' };
    
    switch (preset) {
      case 'espresso':
        params.scale = 0.6;
        params.thickness = 0.03;
        params.hasHandle = true;
        break;
      case 'mug':
        params.scale = 1.2;
        params.thickness = 0.04;
        params.hasHandle = true;
        break;
      case 'latte':
        params.scale = 1.0;
        params.thickness = 0.025;
        params.hasHandle = false;
        break;
      case 'tea':
        params.scale = 0.8;
        params.thickness = 0.02;
        params.hasHandle = true;
        break;
    }
    
    return this.generate(params);
  }
}

/**
 * Specialized Utensil Generator
 */
export class UtensilGenerator extends TablewareGenerator {
  generateSet(count: number = 4): GeneratedAsset[] {
    const types: TablewareType[] = ['fork', 'knife', 'spoon'];
    const assets: GeneratedAsset[] = [];
    
    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      assets.push(this.generate({ type, seed: this.seed + i }));
    }
    
    return assets;
  }
}
