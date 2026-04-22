/**
 * Appliances & Bathroom Fixtures Generator
 * InfiniGen R3F Port - Phase 2D
 * 
 * Generates procedural appliances and bathroom fixtures including:
 * - Kitchen: Refrigerator, Oven, Microwave, Dishwasher
 * - Bathroom: Toilet, Bathtub, Sink
 * - Electronics: TV
 * 
 * Based on original InfiniGen assets from Princeton University
 */

import * as THREE from 'three';
import { BaseAssetGenerator, GeneratedAsset } from './base-generator';
import { LODLevel } from '../../utils/lod';

export interface ApplianceParams {
  // Common
  seed: number;
  lodLevel: LODLevel;
  
  // Dimensions
  width: number;
  height: number;
  depth: number;
  
  // Style options
  style: 'modern' | 'retro' | 'industrial' | 'minimalist';
  color: string;
  hasBrandLogo: boolean;
  
  // Feature flags
  hasDisplay: boolean;
  hasHandle: boolean;
  handleType: 'bar' | 'knob' | 'recessed' | 'ring';
  doorOpenAngle?: number;
}

/**
 * Base Appliance Generator
 */
export class ApplianceGenerator extends BaseAssetGenerator<ApplianceParams> {
  protected getDefaultParameters(): ApplianceParams {
    return {
      seed: Math.floor(Math.random() * 1000000),
      lodLevel: LODLevel.HIGH,
      width: 0.6,
      height: 0.85,
      depth: 0.6,
      style: 'modern',
      color: '#ffffff',
      hasBrandLogo: true,
      hasDisplay: false,
      hasHandle: true,
      handleType: 'bar',
      doorOpenAngle: 0,
    };
  }

  generate(params: Partial<ApplianceParams> = {}): GeneratedAsset {
    const finalParams = { ...this.getDefaultParameters(), ...params };
    const rng = this.createSeededRandom(finalParams.seed);
    
    let geometry: THREE.BufferGeometry;
    const applianceType = params.type || 'refrigerator';
    
    switch (applianceType) {
      case 'refrigerator':
        geometry = this.generateRefrigerator(finalParams, rng);
        break;
      case 'oven':
        geometry = this.generateOven(finalParams, rng);
        break;
      case 'microwave':
        geometry = this.generateMicrowave(finalParams, rng);
        break;
      case 'dishwasher':
        geometry = this.generateDishwasher(finalParams, rng);
        break;
      case 'toilet':
        geometry = this.generateToilet(finalParams, rng);
        break;
      case 'bathtub':
        geometry = this.generateBathtub(finalParams, rng);
        break;
      case 'sink':
        geometry = this.generateSink(finalParams, rng);
        break;
      case 'tv':
        geometry = this.generateTV(finalParams, rng);
        break;
      default:
        geometry = this.generateRefrigerator(finalParams, rng);
    }

    const bbox = new THREE.Box3().setFromObject(
      new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())
    );

    return {
      geometry,
      bbox,
      tags: this.generateTags(applianceType, finalParams),
      parameters: finalParams,
      lod: this.generateLOD(geometry, finalParams.lodLevel),
      collisionGeometry: this.createCollisionGeometry(geometry),
    };
  }

  private generateRefrigerator(params: ApplianceParams, rng: () => number): THREE.BufferGeometry {
    const { width, height, depth, style, hasHandle, handleType } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const materialIndices: number[] = [];
    
    // Main body
    const bodyHeight = height * (style === 'retro' ? 0.85 : 0.9);
    const bodyGeo = new THREE.BoxGeometry(width, bodyHeight, depth);
    geometries.push(bodyGeo);
    materialIndices.push(0); // Body material
    
    // Top section (freezer or top compartment)
    const topSectionHeight = height * 0.15;
    if (style !== 'minimalist') {
      const topGeo = new THREE.BoxGeometry(width, topSectionHeight, depth * 0.95);
      topGeo.translate(0, bodyHeight / 2 + topSectionHeight / 2, 0);
      geometries.push(topGeo);
      materialIndices.push(0);
    }
    
    // Doors
    const doorThickness = 0.03;
    const doorMargin = 0.02;
    
    if (style === 'retro' || style === 'industrial') {
      // Single door with handle
      const doorGeo = new THREE.BoxGeometry(
        width - doorMargin * 2,
        bodyHeight - doorMargin * 2,
        doorThickness
      );
      doorGeo.translate(0, 0, depth / 2 + doorThickness / 2);
      geometries.push(doorGeo);
      materialIndices.push(1); // Door material
      
      // Handle
      if (hasHandle) {
        const handleGeo = this.createHandle(handleType, 0.03, 0.25, rng);
        handleGeo.translate(width / 2 - 0.08, 0, depth / 2 + doorThickness + 0.02);
        geometries.push(handleGeo);
        materialIndices.push(2); // Handle material (metal)
      }
    } else {
      // Double doors (modern French door style)
      const leftDoorGeo = new THREE.BoxGeometry(
        width / 2 - doorMargin,
        bodyHeight - doorMargin * 2,
        doorThickness
      );
      leftDoorGeo.translate(-width / 4, 0, depth / 2 + doorThickness / 2);
      geometries.push(leftDoorGeo);
      materialIndices.push(1);
      
      const rightDoorGeo = new THREE.BoxGeometry(
        width / 2 - doorMargin,
        bodyHeight - doorMargin * 2,
        doorThickness
      );
      rightDoorGeo.translate(width / 4, 0, depth / 2 + doorThickness / 2);
      geometries.push(rightDoorGeo);
      materialIndices.push(1);
      
      // Handles
      if (hasHandle) {
        const leftHandleGeo = this.createHandle(handleType, 0.025, 0.2, rng);
        leftHandleGeo.translate(width / 4 - 0.05, 0, depth / 2 + doorThickness + 0.02);
        geometries.push(leftHandleGeo);
        materialIndices.push(2);
        
        const rightHandleGeo = this.createHandle(handleType, 0.025, 0.2, rng);
        rightHandleGeo.translate(-width / 4 + 0.05, 0, depth / 2 + doorThickness + 0.02);
        geometries.push(rightHandleGeo);
        materialIndices.push(2);
      }
    }
    
    // Base/feet
    const footHeight = 0.05;
    const footGeo = new THREE.BoxGeometry(width, footHeight, depth * 0.9);
    footGeo.translate(0, -bodyHeight / 2 - footHeight / 2, 0);
    geometries.push(footGeo);
    materialIndices.push(3); // Base material (darker)
    
    // Brand logo area (optional)
    if (params.hasBrandLogo && style !== 'minimalist') {
      const logoWidth = 0.15;
      const logoHeight = 0.04;
      const logoGeo = new THREE.BoxGeometry(logoWidth, logoHeight, 0.01);
      logoGeo.translate(0, bodyHeight * 0.7, depth / 2 + doorThickness + 0.01);
      geometries.push(logoGeo);
      materialIndices.push(2);
    }
    
    // Merge geometries
    const mergedGeometry = this.mergeGeometriesWithIndices(geometries, materialIndices);
    
    // Add bevel effect via vertex manipulation for rounded edges
    if (params.lodLevel !== LODLevel.LOW) {
      this.addRoundedEdges(mergedGeometry, 0.02);
    }
    
    return mergedGeometry;
  }

  private generateOven(params: ApplianceParams, rng: () => number): THREE.BufferGeometry {
    const { width, height, depth, style, hasDisplay, hasHandle, handleType } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const materialIndices: number[] = [];
    
    // Main body/cabinet
    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    geometries.push(bodyGeo);
    materialIndices.push(0); // Body material
    
    // Oven door (front glass panel)
    const doorThickness = 0.04;
    const doorMargin = 0.03;
    const doorWidth = width - doorMargin * 2;
    const doorHeight = height * 0.6;
    
    // Door frame
    const frameThickness = 0.05;
    const frameGeo = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
    frameGeo.translate(0, -height * 0.1, depth / 2 + doorThickness / 2);
    geometries.push(frameGeo);
    materialIndices.push(2); // Metal frame
    
    // Glass window
    const glassWidth = doorWidth - frameThickness * 2;
    const glassHeight = doorHeight * 0.7;
    const glassGeo = new THREE.BoxGeometry(glassWidth, glassHeight, doorThickness * 0.5);
    glassGeo.translate(0, -height * 0.1 + doorHeight * 0.15, depth / 2 + doorThickness * 0.75);
    geometries.push(glassGeo);
    materialIndices.push(3); // Glass material
    
    // Handle
    if (hasHandle) {
      const handleGeo = this.createHandle(handleType, 0.03, doorWidth * 0.8, rng);
      handleGeo.translate(0, -height * 0.1 - doorHeight / 2 + 0.05, depth / 2 + doorThickness + 0.02);
      geometries.push(handleGeo);
      materialIndices.push(2);
    }
    
    // Control panel (top section)
    const controlPanelHeight = height * 0.15;
    const controlPanelDepth = 0.08;
    const controlGeo = new THREE.BoxGeometry(width, controlPanelHeight, controlPanelDepth);
    controlGeo.translate(0, height / 2 - controlPanelHeight / 2, depth / 2 + controlPanelDepth / 2);
    geometries.push(controlGeo);
    materialIndices.push(2);
    
    // Display/Buttons
    if (hasDisplay || style === 'modern') {
      const displayWidth = width * 0.3;
      const displayHeight = 0.04;
      const displayGeo = new THREE.BoxGeometry(displayWidth, displayHeight, 0.01);
      displayGeo.translate(-width * 0.1, height / 2 - controlPanelHeight / 2, depth / 2 + controlPanelDepth + 0.01);
      geometries.push(displayGeo);
      materialIndices.push(4); // Display (dark glass)
      
      // Knob or buttons
      const knobCount = style === 'retro' ? 4 : 3;
      for (let i = 0; i < knobCount; i++) {
        const knobGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16);
        knobGeo.rotateX(Math.PI / 2);
        knobGeo.translate(
          width * 0.15 + i * 0.06,
          height / 2 - controlPanelHeight / 2,
          depth / 2 + controlPanelDepth + 0.02
        );
        geometries.push(knobGeo);
        materialIndices.push(2);
      }
    }
    
    // Ventilation slots
    if (params.lodLevel !== LODLevel.LOW) {
      const ventCount = 8;
      const ventWidth = 0.08;
      const ventHeight = 0.01;
      for (let i = 0; i < ventCount; i++) {
        const ventGeo = new THREE.BoxGeometry(ventWidth, ventHeight, 0.01);
        ventGeo.translate(-width / 2 + ventWidth + i * (width - ventWidth * 2) / (ventCount - 1), 
                         -height / 2 + 0.1, depth / 2 + 0.005);
        geometries.push(ventGeo);
        materialIndices.push(0);
      }
    }
    
    return this.mergeGeometriesWithIndices(geometries, materialIndices);
  }

  private generateMicrowave(params: ApplianceParams, rng: () => number): THREE.BufferGeometry {
    const { width, height, depth, style, hasDisplay, hasHandle, handleType } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const materialIndices: number[] = [];
    
    // Main body
    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    geometries.push(bodyGeo);
    materialIndices.push(0);
    
    // Door with window
    const doorThickness = 0.03;
    const doorMargin = 0.02;
    const doorWidth = width * 0.65;
    const doorHeight = height - doorMargin * 2;
    
    // Door frame
    const frameGeo = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
    frameGeo.translate(-width * 0.15, 0, depth / 2 + doorThickness / 2);
    geometries.push(frameGeo);
    materialIndices.push(2);
    
    // Window mesh
    const windowWidth = doorWidth * 0.7;
    const windowHeight = doorHeight * 0.7;
    const windowGeo = new THREE.BoxGeometry(windowWidth, windowHeight, doorThickness * 0.5);
    windowGeo.translate(-width * 0.15, 0, depth / 2 + doorThickness * 0.75);
    geometries.push(windowGeo);
    materialIndices.push(3);
    
    // Handle
    if (hasHandle) {
      const handleGeo = this.createHandle(handleType, 0.02, doorHeight * 0.6, rng);
      handleGeo.translate(-width * 0.15 + doorWidth / 2 + 0.03, 0, depth / 2 + doorThickness + 0.02);
      geometries.push(handleGeo);
      materialIndices.push(2);
    }
    
    // Control panel (right side)
    const panelWidth = width * 0.3;
    const panelGeo = new THREE.BoxGeometry(panelWidth, height, 0.05);
    panelGeo.translate(width * 0.35, 0, depth / 2 + 0.025);
    geometries.push(panelGeo);
    materialIndices.push(2);
    
    // Display
    if (hasDisplay) {
      const displayWidth = panelWidth * 0.7;
      const displayHeight = 0.04;
      const displayGeo = new THREE.BoxGeometry(displayWidth, displayHeight, 0.01);
      displayGeo.translate(width * 0.35, height * 0.3, depth / 2 + 0.03);
      geometries.push(displayGeo);
      materialIndices.push(4);
    }
    
    // Buttons
    const buttonRows = 4;
    const buttonCols = 2;
    for (let row = 0; row < buttonRows; row++) {
      for (let col = 0; col < buttonCols; col++) {
        const buttonGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.015, 12);
        buttonGeo.translate(
          width * 0.25 + col * 0.05,
          height * 0.1 - row * 0.06,
          depth / 2 + 0.03
        );
        geometries.push(buttonGeo);
        materialIndices.push(2);
      }
    }
    
    return this.mergeGeometriesWithIndices(geometries, materialIndices);
  }

  private generateDishwasher(params: ApplianceParams, rng: () => number): THREE.BufferGeometry {
    const { width, height, depth, style, hasHandle, handleType } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const materialIndices: number[] = [];
    
    // Main body (under-counter height)
    const bodyGeo = new THREE.BoxGeometry(width, height, depth);
    geometries.push(bodyGeo);
    materialIndices.push(0);
    
    // Front panel/door
    const doorThickness = 0.03;
    const doorMargin = 0.02;
    const doorGeo = new THREE.BoxGeometry(
      width - doorMargin * 2,
      height - doorMargin * 2,
      doorThickness
    );
    doorGeo.translate(0, 0, depth / 2 + doorThickness / 2);
    geometries.push(doorGeo);
    materialIndices.push(style === 'integrated' ? 0 : 2);
    
    // Handle (typically horizontal bar at top)
    if (hasHandle) {
      const handleGeo = this.createHandle(handleType, 0.025, width * 0.7, rng);
      handleGeo.rotateZ(Math.PI / 2);
      handleGeo.translate(0, height / 2 - 0.08, depth / 2 + doorThickness + 0.02);
      geometries.push(handleGeo);
      materialIndices.push(2);
    }
    
    // Control strip (top edge, often hidden when installed)
    const controlStripHeight = 0.04;
    const controlGeo = new THREE.BoxGeometry(width * 0.8, controlStripHeight, 0.02);
    controlGeo.translate(0, height / 2 - controlStripHeight / 2, depth / 2 + doorThickness + 0.01);
    geometries.push(controlGeo);
    materialIndices.push(4);
    
    // Kick plate (bottom)
    const kickHeight = 0.05;
    const kickGeo = new THREE.BoxGeometry(width, kickHeight, depth * 0.9);
    kickGeo.translate(0, -height / 2 + kickHeight / 2, 0);
    geometries.push(kickGeo);
    materialIndices.push(3);
    
    // Feet
    const footSize = 0.04;
    const footPositions = [
      [-width / 2 + 0.05, -height / 2, depth / 2 - 0.05],
      [width / 2 - 0.05, -height / 2, depth / 2 - 0.05],
      [-width / 2 + 0.05, -height / 2, -depth / 2 + 0.05],
      [width / 2 - 0.05, -height / 2, -depth / 2 + 0.05],
    ];
    
    footPositions.forEach(pos => {
      const footGeo = new THREE.BoxGeometry(footSize, footSize, footSize);
      footGeo.translate(...pos);
      geometries.push(footGeo);
      materialIndices.push(3);
    });
    
    return this.mergeGeometriesWithIndices(geometries, materialIndices);
  }

  private generateToilet(params: ApplianceParams, rng: () => number): THREE.BufferGeometry {
    const { width, height, depth } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const materialIndices: number[] = [];
    
    // Bowl base
    const bowlWidth = width * 0.7;
    const bowlHeight = height * 0.4;
    const bowlDepth = depth * 0.6;
    const bowlGeo = this.createRoundedBox(bowlWidth, bowlHeight, bowlDepth, 0.05, 16);
    bowlGeo.translate(0, bowlHeight / 2, 0);
    geometries.push(bowlGeo);
    materialIndices.push(0); // Ceramic
    
    // Seat
    const seatThickness = 0.03;
    const seatWidth = bowlWidth * 0.95;
    const seatDepth = bowlDepth * 0.9;
    const seatGeo = this.createRoundedBox(seatWidth, seatThickness, seatDepth, 0.03, 16);
    seatGeo.translate(0, bowlHeight + seatThickness / 2, 0);
    geometries.push(seatGeo);
    materialIndices.push(1); // Plastic seat
    
    // Seat lid (optional, slightly open)
    const lidOpenAngle = rng() * 0.3;
    const lidGeo = this.createRoundedBox(seatWidth, seatThickness * 0.8, seatDepth * 0.95, 0.02, 16);
    lidGeo.translate(0, bowlHeight + seatThickness + Math.sin(lidOpenAngle) * seatDepth * 0.4, 
                     -Math.cos(lidOpenAngle) * seatDepth * 0.4);
    lidGeo.rotateX(-lidOpenAngle);
    geometries.push(lidGeo);
    materialIndices.push(1);
    
    // Tank
    const tankWidth = width * 0.6;
    const tankHeight = height * 0.5;
    const tankDepth = depth * 0.3;
    const tankGeo = this.createRoundedBox(tankWidth, tankHeight, tankDepth, 0.03, 16);
    tankGeo.translate(0, bowlHeight + tankHeight / 2, -bowlDepth / 2 - tankDepth / 2 + 0.02);
    geometries.push(tankGeo);
    materialIndices.push(0);
    
    // Tank lid
    const tankLidThickness = 0.025;
    const tankLidGeo = this.createRoundedBox(tankWidth * 1.02, tankLidThickness, tankDepth * 1.02, 0.02, 16);
    tankLidGeo.translate(0, bowlHeight + tankHeight + tankLidThickness / 2, -bowlDepth / 2 - tankDepth / 2 + 0.02);
    geometries.push(tankLidGeo);
    materialIndices.push(0);
    
    // Flush handle/button
    const handleType = rng() > 0.5 ? 'lever' : 'button';
    if (handleType === 'lever') {
      const leverGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.08, 8);
      leverGeo.rotateZ(Math.PI / 2);
      leverGeo.translate(tankWidth / 2 + 0.02, tankHeight * 0.3, -tankDepth / 2);
      geometries.push(leverGeo);
      materialIndices.push(2); // Metal
    } else {
      const buttonGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.015, 16);
      buttonGeo.translate(0, tankHeight + tankLidThickness + 0.01, -tankDepth / 2);
      geometries.push(buttonGeo);
      materialIndices.push(2);
    }
    
    // Connection between bowl and tank
    const connectorGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.08, 16);
    connectorGeo.translate(0, bowlHeight + 0.04, -bowlDepth / 2 + 0.02);
    geometries.push(connectorGeo);
    materialIndices.push(0);
    
    return this.mergeGeometriesWithIndices(geometries, materialIndices);
  }

  private generateBathtub(params: ApplianceParams, rng: () => number): THREE.BufferGeometry {
    const { width, height, depth, style } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const materialIndices: number[] = [];
    
    const wallThickness = 0.05;
    const bottomThickness = 0.06;
    
    // Outer shell
    const outerGeo = this.createRoundedBox(width, height, depth, 0.08, 24);
    geometries.push(outerGeo);
    materialIndices.push(0); // Acrylic/enamel
    
    // Inner cavity (subtractive, but we'll create inner walls)
    const innerWidth = width - wallThickness * 2;
    const innerHeight = height - bottomThickness;
    const innerDepth = depth - wallThickness * 2;
    
    // Bottom
    const bottomGeo = new THREE.BoxGeometry(innerWidth, bottomThickness, innerDepth);
    bottomGeo.translate(0, -height / 2 + bottomThickness / 2, 0);
    geometries.push(bottomGeo);
    materialIndices.push(0);
    
    // Side walls (4 panels)
    const wallHeight = height - bottomThickness;
    
    // Back wall
    const backWallGeo = new THREE.BoxGeometry(innerWidth, wallHeight, wallThickness);
    backWallGeo.translate(0, -height / 2 + wallHeight / 2, -depth / 2 + wallThickness / 2);
    geometries.push(backWallGeo);
    materialIndices.push(0);
    
    // Front wall
    const frontWallGeo = new THREE.BoxGeometry(innerWidth, wallHeight, wallThickness);
    frontWallGeo.translate(0, -height / 2 + wallHeight / 2, depth / 2 - wallThickness / 2);
    geometries.push(frontWallGeo);
    materialIndices.push(0);
    
    // Left wall
    const leftWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, innerDepth);
    leftWallGeo.translate(-width / 2 + wallThickness / 2, -height / 2 + wallHeight / 2, 0);
    geometries.push(leftWallGeo);
    materialIndices.push(0);
    
    // Right wall
    const rightWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, innerDepth);
    rightWallGeo.translate(width / 2 - wallThickness / 2, -height / 2 + wallHeight / 2, 0);
    geometries.push(rightWallGeo);
    materialIndices.push(0);
    
    // Rim/edge
    const rimWidth = 0.1;
    const rimThickness = 0.03;
    const rimGeo = new THREE.BoxGeometry(width + rimWidth * 2, rimThickness, depth + rimWidth * 2);
    rimGeo.translate(0, height / 2 - rimThickness / 2, 0);
    geometries.push(rimGeo);
    materialIndices.push(0);
    
    // Faucet mount (optional, for built-in tubs)
    if (style === 'built-in' || rng() > 0.7) {
      const faucetBaseGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.03, 16);
      faucetBaseGeo.translate(0, height / 2 + rimThickness + 0.015, -depth / 2 + 0.1);
      geometries.push(faucetBaseGeo);
      materialIndices.push(2); // Chrome
      
      const faucetSpoutGeo = new THREE.TorusGeometry(0.03, 0.01, 8, 16, Math.PI);
      faucetSpoutGeo.translate(0, height / 2 + rimThickness + 0.03, -depth / 2 + 0.15);
      geometries.push(faucetSpoutGeo);
      materialIndices.push(2);
    }
    
    // Feet (for clawfoot style)
    if (style === 'clawfoot') {
      const footPositions = [
        [-width / 2 + 0.1, -height / 2, -depth / 2 + 0.1],
        [width / 2 - 0.1, -height / 2, -depth / 2 + 0.1],
        [-width / 2 + 0.1, -height / 2, depth / 2 - 0.1],
        [width / 2 - 0.1, -height / 2, depth / 2 - 0.1],
      ];
      
      footPositions.forEach((pos, idx) => {
        const footGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.08, 8);
        footGeo.translate(pos[0], pos[1] + 0.04, pos[2]);
        geometries.push(footGeo);
        materialIndices.push(2); // Metal feet
      });
    }
    
    return this.mergeGeometriesWithIndices(geometries, materialIndices);
  }

  private generateSink(params: ApplianceParams, rng: () => number): THREE.BufferGeometry {
    const { width, height, depth, style } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const materialIndices: number[] = [];
    
    const basinDepth = height * 0.6;
    const rimWidth = 0.08;
    const wallThickness = 0.04;
    
    // Basin outer
    const outerGeo = this.createRoundedBox(width, height, depth, 0.05, 16);
    geometries.push(outerGeo);
    materialIndices.push(0); // Ceramic/porcelain
    
    // Basin inner cavity walls
    const innerWidth = width - wallThickness * 2 - rimWidth * 2;
    const innerDepth = depth - wallThickness * 2 - rimWidth * 2;
    
    // Bottom
    const bottomGeo = new THREE.BoxGeometry(innerWidth, wallThickness, innerDepth);
    bottomGeo.translate(0, -height / 2 + basinDepth - wallThickness / 2, 0);
    geometries.push(bottomGeo);
    materialIndices.push(0);
    
    // Four walls
    const wallHeight = basinDepth - wallThickness;
    
    const backWallGeo = new THREE.BoxGeometry(innerWidth, wallHeight, wallThickness);
    backWallGeo.translate(0, -height / 2 + basinDepth - wallHeight / 2, -depth / 2 + rimWidth + wallThickness / 2);
    geometries.push(backWallGeo);
    materialIndices.push(0);
    
    const frontWallGeo = new THREE.BoxGeometry(innerWidth, wallHeight, wallThickness);
    frontWallGeo.translate(0, -height / 2 + basinDepth - wallHeight / 2, depth / 2 - rimWidth - wallThickness / 2);
    geometries.push(frontWallGeo);
    materialIndices.push(0);
    
    const leftWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, innerDepth);
    leftWallGeo.translate(-width / 2 + rimWidth + wallThickness / 2, -height / 2 + basinDepth - wallHeight / 2, 0);
    geometries.push(leftWallGeo);
    materialIndices.push(0);
    
    const rightWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, innerDepth);
    rightWallGeo.translate(width / 2 - rimWidth - wallThickness / 2, -height / 2 + basinDepth - wallHeight / 2, 0);
    geometries.push(rightWallGeo);
    materialIndices.push(0);
    
    // Rim/countertop edge
    const rimGeo = new THREE.BoxGeometry(width, 0.03, depth);
    rimGeo.translate(0, height / 2 - 0.015, 0);
    geometries.push(rimGeo);
    materialIndices.push(style === 'undermount' ? 2 : 0);
    
    // Drain hole (visual representation)
    const drainGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.02, 16);
    drainGeo.translate(0, -height / 2 + basinDepth - wallThickness, 0);
    geometries.push(drainGeo);
    materialIndices.push(2); // Metal drain
    
    // Faucet holes (optional)
    if (style !== 'wall-mounted') {
      const faucetHoleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12);
      faucetHoleGeo.translate(0, height / 2 - 0.015, -depth / 2 + rimWidth + 0.03);
      geometries.push(faucetHoleGeo);
      materialIndices.push(0);
    }
    
    // P-trap (visible plumbing underneath, optional)
    if (style === 'pedestal' || rng() > 0.5) {
      const trapGeo = new THREE.TorusGeometry(0.04, 0.015, 8, 16, Math.PI * 1.5);
      trapGeo.rotateY(Math.PI / 2);
      trapGeo.translate(0, -height / 2 - 0.1, 0);
      geometries.push(trapGeo);
      materialIndices.push(2); // Chrome pipe
    }
    
    return this.mergeGeometriesWithIndices(geometries, materialIndices);
  }

  private generateTV(params: ApplianceParams, rng: () => number): THREE.BufferGeometry {
    const { width, height, depth, style } = params;
    
    const geometries: THREE.BufferGeometry[] = [];
    const materialIndices: number[] = [];
    
    const aspectRatio = 16 / 9;
    const tvWidth = width;
    const tvHeight = width / aspectRatio;
    const screenThickness = 0.02;
    const bezelWidth = 0.03;
    
    // Screen panel
    const screenGeo = new THREE.BoxGeometry(tvWidth, tvHeight, screenThickness);
    geometries.push(screenGeo);
    materialIndices.push(3); // Screen (black glass)
    
    // Bezel/frame
    const bezelThickness = 0.03;
    const frameGeo = new THREE.BoxGeometry(
      tvWidth + bezelWidth * 2,
      tvHeight + bezelWidth * 2,
      bezelThickness
    );
    // Create frame by subtracting center (we'll use multiple boxes)
    const topFrameGeo = new THREE.BoxGeometry(tvWidth + bezelWidth * 2, bezelWidth, bezelThickness);
    topFrameGeo.translate(0, tvHeight / 2 + bezelWidth / 2, -screenThickness / 2 - bezelThickness / 2);
    geometries.push(topFrameGeo);
    materialIndices.push(0); // Frame material
    
    const bottomFrameGeo = new THREE.BoxGeometry(tvWidth + bezelWidth * 2, bezelWidth, bezelThickness);
    bottomFrameGeo.translate(0, -tvHeight / 2 - bezelWidth / 2, -screenThickness / 2 - bezelThickness / 2);
    geometries.push(bottomFrameGeo);
    materialIndices.push(0);
    
    const leftFrameGeo = new THREE.BoxGeometry(bezelWidth, tvHeight, bezelThickness);
    leftFrameGeo.translate(-tvWidth / 2 - bezelWidth / 2, 0, -screenThickness / 2 - bezelThickness / 2);
    geometries.push(leftFrameGeo);
    materialIndices.push(0);
    
    const rightFrameGeo = new THREE.BoxGeometry(bezelWidth, tvHeight, bezelThickness);
    rightFrameGeo.translate(tvWidth / 2 + bezelWidth / 2, 0, -screenThickness / 2 - bezelThickness / 2);
    geometries.push(rightFrameGeo);
    materialIndices.push(0);
    
    // Back panel
    const backGeo = new THREE.BoxGeometry(tvWidth, tvHeight, depth - screenThickness - bezelThickness);
    backGeo.translate(0, 0, -(screenThickness + bezelThickness) / 2 - (depth - screenThickness - bezelThickness) / 2);
    geometries.push(backGeo);
    materialIndices.push(0);
    
    // Stand/base
    if (style !== 'wall-mount') {
      const standWidth = tvWidth * 0.3;
      const standDepth = depth * 0.6;
      const standHeight = 0.1;
      
      // Stand base
      const standBaseGeo = new THREE.BoxGeometry(standWidth, 0.02, standDepth);
      standBaseGeo.translate(0, -tvHeight / 2 - standHeight / 2, 0);
      geometries.push(standBaseGeo);
      materialIndices.push(2); // Metal/plastic stand
      
      // Stand neck
      const standNeckGeo = new THREE.BoxGeometry(0.08, standHeight, 0.08);
      standNeckGeo.translate(0, -tvHeight / 2 - standHeight / 2, 0);
      geometries.push(standNeckGeo);
      materialIndices.push(2);
    }
    
    // Logo (optional)
    if (params.hasBrandLogo) {
      const logoWidth = 0.08;
      const logoHeight = 0.02;
      const logoGeo = new THREE.BoxGeometry(logoWidth, logoHeight, 0.005);
      logoGeo.translate(0, -tvHeight / 2 + bezelWidth + logoHeight / 2, -screenThickness / 2 - bezelThickness - 0.005);
      geometries.push(logoGeo);
      materialIndices.push(2);
    }
    
    // Ports on back (optional detail)
    if (params.lodLevel !== LODLevel.LOW) {
      const portCount = 4;
      for (let i = 0; i < portCount; i++) {
        const portGeo = new THREE.BoxGeometry(0.02, 0.015, 0.01);
        portGeo.translate(-tvWidth / 2 + 0.05 + i * 0.04, -tvHeight / 2 + 0.1, -(depth) / 2);
        geometries.push(portGeo);
        materialIndices.push(0);
      }
    }
    
    return this.mergeGeometriesWithIndices(geometries, materialIndices);
  }

  private createHandle(type: string, radius: number, length: number, rng: () => number): THREE.BufferGeometry {
    switch (type) {
      case 'bar':
        return new THREE.CylinderGeometry(radius, radius, length, 12);
      case 'knob':
        return new THREE.SphereGeometry(radius, 16, 16);
      case 'recessed':
        const recessGeo = new THREE.BoxGeometry(length, radius * 2, radius);
        return recessGeo;
      case 'ring':
        return new THREE.TorusGeometry(radius * 2, radius * 0.3, 8, 16);
      default:
        return new THREE.CylinderGeometry(radius, radius, length, 12);
    }
  }

  private createRoundedBox(
    width: number,
    height: number,
    depth: number,
    radius: number,
    segments: number
  ): THREE.BufferGeometry {
    // Simplified rounded box using sphere segments at corners
    const geo = new THREE.BoxGeometry(width, height, depth, 4, 4, 4);
    
    // Modify vertices to create rounded edges
    const positions = geo.attributes.position.array as Float32Array;
    const halfW = width / 2 - radius;
    const halfH = height / 2 - radius;
    const halfD = depth / 2 - radius;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      
      // Clamp to rounded box shape
      const cx = Math.max(-halfW, Math.min(halfW, x));
      const cy = Math.max(-halfH, Math.min(halfH, y));
      const cz = Math.max(-halfD, Math.min(halfD, z));
      
      // Calculate distance to clamped point
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (dist > radius) {
        const scale = radius / dist;
        positions[i] = cx + dx * scale;
        positions[i + 1] = cy + dy * scale;
        positions[i + 2] = cz + dz * scale;
      }
    }
    
    geo.computeVertexNormals();
    return geo;
  }

  private mergeGeometriesWithIndices(
    geometries: THREE.BufferGeometry[],
    materialIndices: number[]
  ): THREE.BufferGeometry {
    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }
    
    if (geometries.length === 1) {
      return geometries[0];
    }
    
    // Simple merge without groups for now
    const mergedGeometry = geometries[0].clone();
    
    for (let i = 1; i < geometries.length; i++) {
      const geo = geometries[i];
      mergedGeometry.merge(geo);
    }
    
    return mergedGeometry;
  }

  private addRoundedEdges(geometry: THREE.BufferGeometry, radius: number): void {
    // Simplified edge rounding via normal smoothing
    geometry.computeVertexNormals();
  }

  private generateTags(type: string, params: ApplianceParams): string[] {
    const baseTags = [
      'appliance',
      type,
      params.style,
      params.hasDisplay ? 'with_display' : 'no_display',
      params.hasHandle ? 'with_handle' : 'no_handle',
    ];
    
    const typeSpecificTags: Record<string, string[]> = {
      refrigerator: ['kitchen', 'cold_storage', 'large_appliance'],
      oven: ['kitchen', 'cooking', 'large_appliance'],
      microwave: ['kitchen', 'cooking', 'small_appliance'],
      dishwasher: ['kitchen', 'cleaning', 'large_appliance'],
      toilet: ['bathroom', 'sanitary', 'fixture'],
      bathtub: ['bathroom', 'sanitary', 'fixture'],
      sink: ['bathroom', 'kitchen', 'sanitary', 'fixture'],
      tv: ['electronics', 'entertainment', 'display'],
    };
    
    return [...baseTags, ...(typeSpecificTags[type] || [])];
  }

  getSupportedTypes(): string[] {
    return [
      'refrigerator',
      'oven',
      'microwave',
      'dishwasher',
      'toilet',
      'bathtub',
      'sink',
      'tv',
    ];
  }
}

// Specialized generators for convenience
export class KitchenApplianceGenerator extends ApplianceGenerator {
  getSupportedTypes(): string[] {
    return ['refrigerator', 'oven', 'microwave', 'dishwasher'];
  }
}

export class BathroomFixtureGenerator extends ApplianceGenerator {
  getSupportedTypes(): string[] {
    return ['toilet', 'bathtub', 'sink'];
  }
}

export class ElectronicsGenerator extends ApplianceGenerator {
  getSupportedTypes(): string[] {
    return ['tv'];
  }
}
