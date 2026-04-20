/**
 * Architectural Elements Generator - Phase 2C
 *
 * Procedural generation of architectural elements for indoor/outdoor scenes
 * Based on original InfiniGen architectural generators
 *
 * Categories:
 * - Doors (panel, slab, glass, with frames and handles)
 * - Windows (various frame styles, pane configurations)
 * - Stairs (straight, L-shaped, U-shaped, spiral, curved)
 * - Pillars/Columns (classical orders, modern columns)
 */

import * as THREE from 'three';
import { BaseAssetGenerator, GeneratedAsset, AssetParameters } from './BaseAssetGenerator';
import { SeededRandom } from '../../utils/SeededRandom';

export interface ArchitecturalParameters extends AssetParameters {
  // Common parameters
  scale?: number;

  // Door-specific
  doorType?: 'panel' | 'slab' | 'glass' | 'french' | 'sliding' | 'garage';
  doorWidth?: number;
  doorHeight?: number;
  doorThickness?: number;
  panelCount?: number; // 1-6 panels
  panelStyle?: 'raised' | 'flat' | 'beveled';
  handleType?: 'knob' | 'lever' | 'pull' | 'ring';
  handleSide?: 'left' | 'right' | 'center';
  hasFrame?: boolean;
  frameWidth?: number;
  hasTransom?: boolean; // Window above door
  transomHeight?: number;
  swingDirection?: 'inward' | 'outward' | 'sliding';

  // Window-specific
  windowType?: 'casement' | 'double_hung' | 'sliding' | 'fixed' | 'awning' | 'bay';
  windowWidth?: number;
  windowHeight?: number;
  frameDepth?: number;
  paneRows?: number; // Grid rows
  paneCols?: number; // Grid columns
  muntinWidth?: number; // Divider strips
  sillDepth?: number;
  hasShutters?: boolean;
  shutterStyle?: 'louvered' | 'raised_panel' | 'board_batten';
  glassType?: 'clear' | 'frosted' | 'tinted' | 'stained';

  // Stair-specific
  stairType?: 'straight' | 'l_shaped' | 'u_shaped' | 'spiral' | 'curved' | 'winder';
  stairWidth?: number;
  totalRise?: number; // Total height
  totalRun?: number; // Total horizontal length
  riserHeight?: number; // Individual riser
  treadDepth?: number; // Individual tread
  handrailStyle?: 'none' | 'single' | 'double' | 'wall_mounted';
  balusterStyle?: 'square' | 'round' | 'ornate' | 'cable' | 'glass';
  balusterSpacing?: number;
  newelPostStyle?: 'simple' | 'box' | 'turned' | 'ornate';
  material?: 'wood' | 'concrete' | 'metal' | 'stone';
  nosing?: boolean; // Tread overhang
  closedRisers?: boolean;

  // Pillar/Column-specific
  columnType?: 'doric' | 'ionic' | 'corinthian' | 'tuscan' | 'composite' | 'modern' | 'square';
  columnHeight?: number;
  baseDiameter?: number;
  topDiameter?: number; // For tapered columns
  entasis?: boolean; // Slight convex curve
  fluting?: boolean; // Vertical grooves
  fluteCount?: number;
  capitalStyle?: 'plain' | 'volutes' | 'acanthus' | 'floral';
  baseStyle?: 'plain' | 'attic' | 'pedestal';
  shaftSections?: number;
}

export class ArchitecturalGenerator extends BaseAssetGenerator<ArchitecturalParameters> {
  protected getDefaultParameters(): ArchitecturalParameters {
    return {
      scale: 1.0,

      // Door defaults
      doorType: 'panel',
      doorWidth: 0.9,
      doorHeight: 2.1,
      doorThickness: 0.045,
      panelCount: 4,
      panelStyle: 'raised',
      handleType: 'knob',
      handleSide: 'right',
      hasFrame: true,
      frameWidth: 0.1,
      hasTransom: false,
      transomHeight: 0.3,
      swingDirection: 'inward',

      // Window defaults
      windowType: 'double_hung',
      windowWidth: 1.2,
      windowHeight: 1.5,
      frameDepth: 0.08,
      paneRows: 2,
      paneCols: 2,
      muntinWidth: 0.03,
      sillDepth: 0.1,
      hasShutters: false,
      shutterStyle: 'louvered',
      glassType: 'clear',

      // Stair defaults
      stairType: 'straight',
      stairWidth: 1.0,
      totalRise: 2.7,
      totalRun: 3.6,
      riserHeight: 0.18,
      treadDepth: 0.28,
      handrailStyle: 'single',
      balusterStyle: 'round',
      balusterSpacing: 0.1,
      newelPostStyle: 'turned',
      material: 'wood',
      nosing: true,
      closedRisers: true,

      // Column defaults
      columnType: 'doric',
      columnHeight: 3.0,
      baseDiameter: 0.4,
      topDiameter: 0.35,
      entasis: true,
      fluting: false,
      fluteCount: 20,
      capitalStyle: 'plain',
      baseStyle: 'attic',
      shaftSections: 1,
    };
  }

  getSupportedTypes(): string[] {
    return ['door', 'window', 'stairs', 'pillar', 'column'];
  }

  generate(params: ArchitecturalParameters): GeneratedAsset {
    const seed = params.seed || Math.random();
    const rng = new SeededRandom(seed);
    const type = params.type || 'door';

    let geometry: THREE.BufferGeometry;
    let bbox: THREE.Box3;
    let tags: string[] = [];

    switch (type) {
      case 'door':
        geometry = this.generateDoor(params, rng);
        break;
      case 'window':
        geometry = this.generateWindow(params, rng);
        break;
      case 'stairs':
        geometry = this.generateStairs(params, rng);
        break;
      case 'pillar':
      case 'column':
        geometry = this.generateColumn(params, rng);
        break;
      default:
        geometry = this.generateDoor(params, rng);
    }

    // Compute bounding box
    bbox = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));

    // Generate tags
    tags = this.generateTags(type, params);

    // Create LOD levels
    const lodLevels = this.createLODLevels(geometry, params);

    // Create collision geometry
    const collisionGeometry = this.createCollisionGeometry(geometry, type);

    return {
      geometry,
      bbox,
      tags,
      parameters: params,
      lodLevels,
      collisionGeometry,
      metadata: {
        seed,
        type,
        generator: 'ArchitecturalGenerator',
        category: 'architectural',
      },
    };
  }

  /**
   * Generate a door with configurable style
   */
  private generateDoor(params: ArchitecturalParameters, rng: SeededRandom): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    
    const width = params.doorWidth!;
    const height = params.doorHeight!;
    const thickness = params.doorThickness!;
    const doorType = params.doorType || 'panel';
    const panelCount = params.panelCount || 4;
    const panelStyle = params.panelStyle || 'raised';

    // Door slab/base
    const slabGeom = new THREE.BoxGeometry(width, height, thickness);
    geometries.push(slabGeom);

    // Add panels for panel doors
    if (doorType === 'panel' && panelCount > 0) {
      const panels = this.createDoorPanels(width, height, thickness, panelCount, panelStyle, rng);
      geometries.push(...panels);
    }

    // Add frame if requested
    if (params.hasFrame) {
      const frameGeom = this.createDoorFrame(width, height, thickness, params.frameWidth!, rng);
      geometries.push(frameGeom);
    }

    // Add handle
    const handleGeom = this.createDoorHandle(handleType, handleSide, width, height, thickness, rng);
    if (handleGeom) {
      geometries.push(handleGeom);
    }

    // Add transom window if requested
    if (params.hasTransom) {
      const transomGeom = this.createTransom(width, params.transomHeight!, thickness, rng);
      geometries.push(transomGeom);
    }

    // Merge all geometries
    const mergedGeom = this.mergeGeometriesList(geometries);
    
    // Apply transformations for door orientation
    mergedGeom.rotateY(Math.PI / 2);
    
    return mergedGeom;
  }

  /**
   * Create door panels (raised, flat, or beveled)
   */
  private createDoorPanels(
    width: number,
    height: number,
    thickness: number,
    panelCount: number,
    panelStyle: string,
    rng: SeededRandom
  ): THREE.BufferGeometry[] {
    const panels: THREE.BufferGeometry[] = [];
    
    // Determine panel layout based on count
    let rows: number, cols: number;
    if (panelCount <= 2) {
      rows = panelCount;
      cols = 1;
    } else if (panelCount <= 4) {
      rows = 2;
      cols = panelCount / 2;
    } else {
      rows = 3;
      cols = Math.ceil(panelCount / 3);
    }

    const panelWidth = (width - 0.2) / cols;
    const panelHeight = (height - 0.3) / rows;
    const panelDepth = panelStyle === 'raised' ? 0.015 : panelStyle === 'beveled' ? 0.01 : 0.005;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = (col - (cols - 1) / 2) * (panelWidth + 0.05);
        const y = (row - (rows - 1) / 2) * (panelHeight + 0.05) + height / 2 - height / rows;
        
        let panelGeom: THREE.BufferGeometry;
        
        if (panelStyle === 'raised') {
          // Raised panel with beveled edges
          const shape = new THREE.Shape();
          const w = panelWidth / 2;
          const h = panelHeight / 2;
          shape.moveTo(-w, -h);
          shape.lineTo(w, -h);
          shape.lineTo(w, h);
          shape.lineTo(-w, h);
          shape.lineTo(-w, -h);
          
          const extrudeSettings = {
            depth: panelDepth,
            bevelEnabled: true,
            bevelThickness: 0.005,
            bevelSize: 0.005,
            bevelSegments: 2,
          };
          
          panelGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
          panelGeom.center();
          panelGeom.translate(x, y, thickness / 2 + panelDepth / 2);
        } else {
          // Flat or beveled panel
          panelGeom = new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth);
          panelGeom.translate(x, y, thickness / 2 + panelDepth / 2);
        }
        
        panels.push(panelGeom);
      }
    }

    return panels;
  }

  /**
   * Create door frame/casing
   */
  private createDoorFrame(
    width: number,
    height: number,
    thickness: number,
    frameWidth: number,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    const frameGeom = new THREE.BufferGeometry();
    const frameParts: THREE.BufferGeometry[] = [];

    // Side jambs
    const jambDepth = thickness + 0.05;
    const leftJamb = new THREE.BoxGeometry(frameWidth, height, jambDepth);
    leftJamb.translate(-(width / 2 + frameWidth / 2), 0, 0);
    frameParts.push(leftJamb);

    const rightJamb = new THREE.BoxGeometry(frameWidth, height, jambDepth);
    rightJamb.translate(width / 2 + frameWidth / 2, 0, 0);
    frameParts.push(rightJamb);

    // Head jamb (top)
    const headJamb = new THREE.BoxGeometry(width + frameWidth * 2, frameWidth, jambDepth);
    headJamb.translate(0, height / 2 + frameWidth / 2, 0);
    frameParts.push(headJamb);

    // Optional stop molding
    const stopWidth = 0.03;
    const stopDepth = 0.02;
    
    const leftStop = new THREE.BoxGeometry(stopWidth, height - 0.1, stopDepth);
    leftStop.translate(-(width / 2 - stopWidth / 2), 0, thickness / 2);
    frameParts.push(leftStop);

    const rightStop = new THREE.BoxGeometry(stopWidth, height - 0.1, stopDepth);
    rightStop.translate(width / 2 - stopWidth / 2, 0, thickness / 2);
    frameParts.push(rightStop);

    const topStop = new THREE.BoxGeometry(width - stopWidth * 2, stopWidth, stopDepth);
    topStop.translate(0, height / 2 - stopWidth / 2, thickness / 2);
    frameParts.push(topStop);

    return this.mergeGeometriesList(frameParts);
  }

  /**
   * Create door handle/knob
   */
  private createDoorHandle(
    handleType: string = 'knob',
    handleSide: string = 'right',
    width: number,
    height: number,
    thickness: number,
    rng: SeededRandom
  ): THREE.BufferGeometry | null {
    const handleHeight = height * 0.6; // Standard handle height
    const xOffset = handleSide === 'left' ? -0.35 : 0.35;
    
    let handleGeom: THREE.BufferGeometry;

    if (handleType === 'knob') {
      // Round knob
      handleGeom = new THREE.SphereGeometry(0.04, 16, 16);
      handleGeom.translate(xOffset * width, handleHeight, thickness / 2 + 0.04);
      
      // Add rosette plate
      const plateGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16);
      plateGeom.rotateX(Math.PI / 2);
      plateGeom.translate(xOffset * width, handleHeight, thickness / 2);
      handleGeom = this.mergeGeometriesList([handleGeom, plateGeom]);
    } else if (handleType === 'lever') {
      // Lever handle
      const leverGeom = new THREE.CylinderGeometry(0.015, 0.015, 0.15, 16);
      leverGeom.rotateZ(Math.PI / 2);
      leverGeom.translate(xOffset * width + 0.075, handleHeight, thickness / 2 + 0.015);
      
      const baseGeom = new THREE.CylinderGeometry(0.025, 0.025, 0.05, 16);
      baseGeom.rotateX(Math.PI / 2);
      baseGeom.translate(xOffset * width, handleHeight, thickness / 2);
      
      handleGeom = this.mergeGeometriesList([leverGeom, baseGeom]);
    } else if (handleType === 'pull') {
      // Pull handle (for sliding doors)
      const pullGeom = new THREE.TorusGeometry(0.03, 0.008, 8, 16, Math.PI);
      pullGeom.rotateY(Math.PI / 2);
      pullGeom.translate(xOffset * width, handleHeight, thickness / 2 + 0.03);
      handleGeom = pullGeom;
    } else {
      // Ring handle
      const ringGeom = new THREE.TorusGeometry(0.04, 0.006, 8, 16);
      ringGeom.rotateY(Math.PI / 2);
      ringGeom.translate(xOffset * width, handleHeight, thickness / 2 + 0.04);
      handleGeom = ringGeom;
    }

    return handleGeom;
  }

  /**
   * Create transom window above door
   */
  private createTransom(
    width: number,
    transomHeight: number,
    thickness: number,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    const frameDepth = 0.08;
    const totalHeight = transomHeight + 0.1; // Include frame
    
    // Transom frame
    const frameGeom = new THREE.BoxGeometry(width, totalHeight, frameDepth);
    
    // Glass pane
    const glassGeom = new THREE.BoxGeometry(width - 0.1, transomHeight - 0.05, 0.01);
    glassGeom.translate(0, 0.025, frameDepth / 2);
    
    // Muntins (dividers)
    const muntinGeom = new THREE.BoxGeometry(width - 0.1, 0.02, 0.02);
    muntinGeom.translate(0, transomHeight / 2, frameDepth / 2 + 0.005);
    
    return this.mergeGeometriesList([frameGeom, glassGeom, muntinGeom]);
  }

  /**
   * Generate a window with configurable style
   */
  private generateWindow(params: ArchitecturalParameters, rng: SeededRandom): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    
    const width = params.windowWidth!;
    const height = params.windowHeight!;
    const frameDepth = params.frameDepth!;
    const windowType = params.windowType || 'double_hung';
    const paneRows = params.paneRows || 2;
    const paneCols = params.paneCols || 2;

    // Main frame
    const frameGeom = this.createWindowFrame(width, height, frameDepth, rng);
    geometries.push(frameGeom);

    // Glass panes
    const glassGeom = this.createWindowGlass(width, height, frameDepth, paneRows, paneCols, rng);
    geometries.push(glassGeom);

    // Window sill
    const sillGeom = this.createWindowSill(width, frameDepth, params.sillDepth!, rng);
    geometries.push(sillGeom);

    // Shutters (optional)
    if (params.hasShutters) {
      const shutterGeom = this.createShutters(width, height, frameDepth, params.shutterStyle!, rng);
      geometries.push(shutterGeom);
    }

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Create window frame
   */
  private createWindowFrame(
    width: number,
    height: number,
    frameDepth: number,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    const frameWidth = 0.08;
    const frameParts: THREE.BufferGeometry[] = [];

    // Side stiles
    const leftStile = new THREE.BoxGeometry(frameWidth, height, frameDepth);
    leftStile.translate(-(width / 2 + frameWidth / 2), 0, 0);
    frameParts.push(leftStile);

    const rightStile = new THREE.BoxGeometry(frameWidth, height, frameDepth);
    rightStile.translate(width / 2 + frameWidth / 2, 0, 0);
    frameParts.push(rightStile);

    // Top rail
    const topRail = new THREE.BoxGeometry(width, frameWidth, frameDepth);
    topRail.translate(0, height / 2 + frameWidth / 2, 0);
    frameParts.push(topRail);

    // Bottom rail
    const bottomRail = new THREE.BoxGeometry(width, frameWidth, frameDepth);
    bottomRail.translate(0, -(height / 2 + frameWidth / 2), 0);
    frameParts.push(bottomRail);

    return this.mergeGeometriesList(frameParts);
  }

  /**
   * Create window glass with muntins (grid dividers)
   */
  private createWindowGlass(
    width: number,
    height: number,
    frameDepth: number,
    paneRows: number,
    paneCols: number,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    
    const glassThickness = 0.01;
    const muntinWidth = 0.03;
    const glassDepth = frameDepth / 2;

    // Individual glass panes
    const paneWidth = (width - muntinWidth * (paneCols + 1)) / paneCols;
    const paneHeight = (height - muntinWidth * (paneRows + 1)) / paneRows;

    for (let row = 0; row < paneRows; row++) {
      for (let col = 0; col < paneCols; col++) {
        const x = (col - (paneCols - 1) / 2) * (paneWidth + muntinWidth);
        const y = (row - (paneRows - 1) / 2) * (paneHeight + muntinWidth);
        
        const paneGeom = new THREE.BoxGeometry(paneWidth, paneHeight, glassThickness);
        paneGeom.translate(x, y, glassDepth / 2);
        geometries.push(paneGeom);
      }
    }

    // Muntins (grid dividers)
    // Vertical muntins
    for (let col = 1; col < paneCols; col++) {
      const x = (col - paneCols / 2) * (paneWidth + muntinWidth);
      const muntinVert = new THREE.BoxGeometry(muntinWidth, height - muntinWidth * 2, muntinWidth);
      muntinVert.translate(x, 0, glassDepth / 2 + muntinWidth / 2);
      geometries.push(muntinVert);
    }

    // Horizontal muntins
    for (let row = 1; row < paneRows; row++) {
      const y = (row - paneRows / 2) * (paneHeight + muntinWidth);
      const muntinHoriz = new THREE.BoxGeometry(width - muntinWidth * 2, muntinWidth, muntinWidth);
      muntinHoriz.translate(0, y, glassDepth / 2 + muntinWidth / 2);
      geometries.push(muntinHoriz);
    }

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Create window sill
   */
  private createWindowSill(
    width: number,
    frameDepth: number,
    sillDepth: number,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    const sillGeom = new THREE.BoxGeometry(width + 0.2, 0.04, sillDepth);
    sillGeom.translate(0, -frameDepth / 2 - 0.02, (sillDepth - frameDepth) / 2);
    
    // Add drip edge
    const dripEdge = new THREE.BoxGeometry(width + 0.2, 0.02, 0.02);
    dripEdge.translate(0, -frameDepth / 2 - 0.05, sillDepth / 2 + 0.01);
    
    return this.mergeGeometriesList([sillGeom, dripEdge]);
  }

  /**
   * Create shutters
   */
  private createShutters(
    width: number,
    height: number,
    frameDepth: number,
    shutterStyle: string,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    
    const shutterWidth = width / 2 + 0.1;
    const shutterDepth = 0.03;
    const offset = width / 2 + shutterWidth / 2 + 0.05;

    for (let side = -1; side <= 1; side += 2) {
      // Shutter frame
      const frameGeom = new THREE.BoxGeometry(shutterWidth, height, shutterDepth);
      frameGeom.translate(side * offset, 0, -frameDepth / 2 - shutterDepth / 2);
      geometries.push(frameGeom);

      // Louvers or panels based on style
      if (shutterStyle === 'louvered') {
        const louverCount = Math.floor(height / 0.15);
        for (let i = 0; i < louverCount; i++) {
          const y = (i - (louverCount - 1) / 2) * 0.15;
          const louver = new THREE.BoxGeometry(shutterWidth - 0.04, 0.02, 0.01);
          louver.rotateX(Math.PI / 6); // Angled louvers
          louver.translate(side * offset, y, -frameDepth / 2);
          geometries.push(louver);
        }
      } else if (shutterStyle === 'raised_panel') {
        // Add raised panels similar to door panels
        const panelGeom = new THREE.BoxGeometry(shutterWidth - 0.1, height - 0.2, 0.015);
        panelGeom.translate(side * offset, 0, -frameDepth / 2 - shutterDepth / 2 - 0.01);
        geometries.push(panelGeom);
      }
    }

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Generate stairs with configurable type
   */
  private generateStairs(params: ArchitecturalParameters, rng: SeededRandom): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    
    const stairType = params.stairType || 'straight';
    const stairWidth = params.stairWidth!;
    const totalRise = params.totalRise!;
    const totalRun = params.totalRun!;
    const riserHeight = params.riserHeight! || 0.18;
    const treadDepth = params.treadDepth! || 0.28;
    const closedRisers = params.closedRisers !== undefined ? params.closedRisers : true;

    // Calculate number of steps
    const numSteps = Math.round(totalRise / riserHeight);
    const actualRiserHeight = totalRise / numSteps;

    switch (stairType) {
      case 'straight':
        geometries.push(this.createStraightStairs(
          stairWidth, numSteps, actualRiserHeight, treadDepth, closedRisers, params
        ));
        break;
      case 'l_shaped':
        geometries.push(this.createLShapedStairs(
          stairWidth, numSteps, actualRiserHeight, treadDepth, closedRisers, params
        ));
        break;
      case 'u_shaped':
        geometries.push(this.createUShapedStairs(
          stairWidth, numSteps, actualRiserHeight, treadDepth, closedRisers, params
        ));
        break;
      case 'spiral':
        geometries.push(this.createSpiralStairs(
          stairWidth, numSteps, totalRise, params
        ));
        break;
      case 'curved':
        geometries.push(this.createCurvedStairs(
          stairWidth, numSteps, actualRiserHeight, treadDepth, params
        ));
        break;
      default:
        geometries.push(this.createStraightStairs(
          stairWidth, numSteps, actualRiserHeight, treadDepth, closedRisers, params
        ));
    }

    // Add handrails if requested
    if (params.handrailStyle !== 'none') {
      const handrailGeom = this.createHandrail(stairType, stairWidth, numSteps, actualRiserHeight, treadDepth, totalRise, totalRun, params);
      if (handrailGeom) {
        geometries.push(handrailGeom);
      }
    }

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Create straight staircase
   */
  private createStraightStairs(
    width: number,
    numSteps: number,
    riserHeight: number,
    treadDepth: number,
    closedRisers: boolean,
    params: ArchitecturalParameters
  ): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const nosing = params.nosing !== undefined ? params.nosing : true;
    const nosingOverhang = nosing ? 0.03 : 0;

    for (let i = 0; i < numSteps; i++) {
      // Tread (horizontal part)
      const treadY = i * riserHeight;
      const treadZ = i * treadDepth;
      const treadGeom = new THREE.BoxGeometry(
        width,
        nosing ? 0.04 : 0.03,
        treadDepth + nosingOverhang
      );
      treadGeom.translate(0, treadY + riserHeight, treadZ + treadDepth / 2);
      geometries.push(treadGeom);

      // Riser (vertical part)
      if (closedRisers) {
        const riserY = i * riserHeight;
        const riserZ = i * treadDepth;
        const riserGeom = new THREE.BoxGeometry(width, riserHeight, 0.03);
        riserGeom.translate(0, riserY + riserHeight / 2, riserZ);
        geometries.push(riserGeom);
      }
    }

    // Stringers (side supports)
    const stringerGeom = this.createStringers(width, numSteps, riserHeight, treadDepth);
    geometries.push(stringerGeom);

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Create L-shaped staircase with landing
   */
  private createLShapedStairs(
    width: number,
    numSteps: number,
    riserHeight: number,
    treadDepth: number,
    closedRisers: boolean,
    params: ArchitecturalParameters
  ): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const halfSteps = Math.floor(numSteps / 2);
    const landingSize = width;

    // First flight
    for (let i = 0; i < halfSteps; i++) {
      const treadY = i * riserHeight;
      const treadZ = i * treadDepth;
      const treadGeom = new THREE.BoxGeometry(width, 0.04, treadDepth + 0.03);
      treadGeom.translate(0, treadY + riserHeight, treadZ + treadDepth / 2);
      geometries.push(treadGeom);

      if (closedRisers) {
        const riserGeom = new THREE.BoxGeometry(width, riserHeight, 0.03);
        riserGeom.translate(0, treadY + riserHeight / 2, treadZ);
        geometries.push(riserGeom);
      }
    }

    // Landing
    const landingY = halfSteps * riserHeight;
    const landingZ = halfSteps * treadDepth;
    const landingGeom = new THREE.BoxGeometry(width, 0.05, landingSize);
    landingGeom.translate(landingSize / 2, landingY, landingZ + landingSize / 2);
    geometries.push(landingGeom);

    // Second flight (rotated 90 degrees)
    for (let i = 0; i < numSteps - halfSteps; i++) {
      const treadY = landingY + (i + 1) * riserHeight;
      const treadX = landingSize + i * treadDepth;
      const treadGeom = new THREE.BoxGeometry(treadDepth + 0.03, 0.04, width);
      treadGeom.translate(treadX + treadDepth / 2, treadY, landingSize + width / 2);
      geometries.push(treadGeom);

      if (closedRisers) {
        const riserGeom = new THREE.BoxGeometry(0.03, riserHeight, width);
        riserGeom.translate(treadX, landingY + i * riserHeight + riserHeight / 2, landingSize + width / 2);
        geometries.push(riserGeom);
      }
    }

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Create U-shaped staircase with landing
   */
  private createUShapedStairs(
    width: number,
    numSteps: number,
    riserHeight: number,
    treadDepth: number,
    closedRisers: boolean,
    params: ArchitecturalParameters
  ): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const thirdSteps = Math.floor(numSteps / 3);
    const landingSize = width * 1.5;

    // First flight
    for (let i = 0; i < thirdSteps; i++) {
      const treadY = i * riserHeight;
      const treadZ = i * treadDepth;
      const treadGeom = new THREE.BoxGeometry(width, 0.04, treadDepth + 0.03);
      treadGeom.translate(0, treadY + riserHeight, treadZ + treadDepth / 2);
      geometries.push(treadGeom);
    }

    // Landing
    const landingY = thirdSteps * riserHeight;
    const landingZ = thirdSteps * treadDepth;
    const landingGeom = new THREE.BoxGeometry(width, 0.05, landingSize);
    landingGeom.translate(landingSize / 2, landingY, landingZ + landingSize / 2);
    geometries.push(landingGeom);

    // Middle flight (return direction)
    for (let i = 0; i < thirdSteps; i++) {
      const treadY = landingY + (i + 1) * riserHeight;
      const treadX = landingSize;
      const treadGeom = new THREE.BoxGeometry(treadDepth + 0.03, 0.04, width);
      treadGeom.translate(treadX + treadDepth / 2, treadY, width / 2);
      geometries.push(treadGeom);
    }

    // Second landing
    const landing2Y = (thirdSteps * 2 + 1) * riserHeight;
    const landing2Geom = new THREE.BoxGeometry(width, 0.05, landingSize);
    landing2Geom.translate(landingSize * 1.5, landing2Y, landingSize / 2);
    geometries.push(landing2Geom);

    // Third flight (same direction as first)
    for (let i = 0; i < numSteps - thirdSteps * 2 - 1; i++) {
      const treadY = landing2Y + (i + 1) * riserHeight;
      const treadZ = landingSize + i * treadDepth;
      const treadGeom = new THREE.BoxGeometry(width, 0.04, treadDepth + 0.03);
      treadGeom.translate(landingSize * 2, treadY, treadZ + treadDepth / 2);
      geometries.push(treadGeom);
    }

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Create spiral staircase
   */
  private createSpiralStairs(
    width: number,
    numSteps: number,
    totalRise: number,
    params: ArchitecturalParameters
  ): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const radius = width / 2;
    const totalAngle = Math.PI * 1.5; // 270 degrees typical
    const anglePerStep = totalAngle / numSteps;
    const risePerStep = totalRise / numSteps;

    // Central pole
    const poleGeom = new THREE.CylinderGeometry(0.1, 0.1, totalRise, 16);
    geometries.push(poleGeom);

    // Steps
    for (let i = 0; i < numSteps; i++) {
      const angle = i * anglePerStep;
      const y = i * risePerStep;
      
      // Create wedge-shaped step
      const stepGeom = new THREE.BoxGeometry(width, 0.04, radius);
      stepGeom.rotateY(angle);
      stepGeom.translate(Math.sin(angle) * radius / 2, y + risePerStep, Math.cos(angle) * radius / 2);
      geometries.push(stepGeom);
    }

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Create curved staircase
   */
  private createCurvedStairs(
    width: number,
    numSteps: number,
    riserHeight: number,
    treadDepth: number,
    params: ArchitecturalParameters
  ): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const radius = treadDepth * numSteps / Math.PI;
    const totalAngle = Math.PI / 2; // 90 degree curve
    const anglePerStep = totalAngle / numSteps;

    for (let i = 0; i < numSteps; i++) {
      const angle = i * anglePerStep;
      const y = i * riserHeight;
      const x = Math.sin(angle) * radius;
      const z = (1 - Math.cos(angle)) * radius;
      
      const stepGeom = new THREE.BoxGeometry(width, 0.04, treadDepth);
      stepGeom.rotateY(angle);
      stepGeom.translate(x, y + riserHeight, z);
      geometries.push(stepGeom);
    }

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Create stringers (side supports for stairs)
   */
  private createStringers(
    width: number,
    numSteps: number,
    riserHeight: number,
    treadDepth: number
  ): THREE.BufferGeometry {
    const stringerParts: THREE.BufferGeometry[] = [];
    
    // Simple rectangular stringers for now
    const totalRun = numSteps * treadDepth;
    const totalRise = numSteps * riserHeight;
    const stringerLength = Math.sqrt(totalRun * totalRun + totalRise * totalRise);
    const angle = Math.atan2(totalRise, totalRun);
    
    const leftStringer = new THREE.BoxGeometry(0.05, stringerLength, 0.3);
    leftStringer.rotateX(-angle);
    leftStringer.translate(-width / 2 - 0.025, totalRise / 2, totalRun / 2 - 0.15);
    stringerParts.push(leftStringer);

    const rightStringer = new THREE.BoxGeometry(0.05, stringerLength, 0.3);
    rightStringer.rotateX(-angle);
    rightStringer.translate(width / 2 + 0.025, totalRise / 2, totalRun / 2 - 0.15);
    stringerParts.push(rightStringer);

    return this.mergeGeometriesList(stringerParts);
  }

  /**
   * Create handrail system
   */
  private createHandrail(
    stairType: string,
    width: number,
    numSteps: number,
    riserHeight: number,
    treadDepth: number,
    totalRise: number,
    totalRun: number,
    params: ArchitecturalParameters
  ): THREE.BufferGeometry | null {
    const geometries: THREE.BufferGeometry[] = [];
    const handrailStyle = params.handrailStyle || 'single';
    const balusterStyle = params.balusterStyle || 'round';
    const balusterSpacing = params.balusterSpacing || 0.1;

    // Handrail tube
    const railHeight = 0.9;
    const railGeom = new THREE.TubeGeometry(
      new THREE.LineCurve3(
        new THREE.Vector3(width / 2 + 0.1, 0, 0),
        new THREE.Vector3(width / 2 + 0.1, totalRise, totalRun)
      ),
      1,
      0.03,
      8,
      false
    );
    geometries.push(railGeom);

    // Balusters (spindles)
    const numBalusters = Math.floor(totalRun / balusterSpacing);
    for (let i = 0; i <= numBalusters; i++) {
      const t = i / numBalusters;
      const y = t * totalRise;
      const z = t * totalRun;
      
      let balusterGeom: THREE.BufferGeometry;
      
      if (balusterStyle === 'square') {
        balusterGeom = new THREE.BoxGeometry(0.04, railHeight - 0.1, 0.04);
      } else if (balusterStyle === 'round') {
        balusterGeom = new THREE.CylinderGeometry(0.02, 0.02, railHeight - 0.1, 8);
      } else if (balusterStyle === 'ornate') {
        balusterGeom = new THREE.CylinderGeometry(0.03, 0.02, railHeight - 0.1, 8);
      } else {
        continue; // Skip cable/glass for now
      }
      
      balusterGeom.translate(width / 2 + 0.1, y + (railHeight - 0.1) / 2, z);
      geometries.push(balusterGeom);
    }

    // Newel posts
    const newelGeom1 = new THREE.CylinderGeometry(0.08, 0.08, railHeight, 8);
    newelGeom1.translate(width / 2 + 0.1, railHeight / 2, 0);
    geometries.push(newelGeom1);

    const newelGeom2 = new THREE.CylinderGeometry(0.08, 0.08, railHeight, 8);
    newelGeom2.translate(width / 2 + 0.1, totalRise + railHeight / 2, totalRun);
    geometries.push(newelGeom2);

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Generate classical or modern column/pillar
   */
  private generateColumn(params: ArchitecturalParameters, rng: SeededRandom): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    
    const columnType = params.columnType || 'doric';
    const height = params.columnHeight!;
    const baseDiameter = params.baseDiameter!;
    const topDiameter = params.topDiameter || baseDiameter * 0.9;
    const fluting = params.fluting || false;
    const fluteCount = params.fluteCount || 20;

    // Shaft (main body)
    const shaftGeom = this.createColumnShaft(height, baseDiameter, topDiameter, fluting, fluteCount, params);
    geometries.push(shaftGeom);

    // Base
    if (params.baseStyle !== 'plain') {
      const baseGeom = this.createColumnBase(baseDiameter, params.baseStyle, rng);
      geometries.push(baseGeom);
    }

    // Capital
    const capitalGeom = this.createColumnCapital(topDiameter, columnType, params.capitalStyle, rng);
    geometries.push(capitalGeom);

    return this.mergeGeometriesList(geometries);
  }

  /**
   * Create column shaft with optional entasis and fluting
   */
  private createColumnShaft(
    height: number,
    baseDiameter: number,
    topDiameter: number,
    fluting: boolean,
    fluteCount: number,
    params: ArchitecturalParameters
  ): THREE.BufferGeometry {
    const entasis = params.entasis || false;
    
    if (fluting) {
      // Fluted column using cylinder with modified geometry
      const segments = fluteCount * 2;
      const geom = new THREE.CylinderGeometry(
        baseDiameter / 2,
        topDiameter / 2,
        height,
        segments,
        1,
        false
      );
      
      // Modify vertices to create flutes
      const positions = geom.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];
        const z = positions[i + 2];
        
        const angle = Math.atan2(z, x);
        const fluteAngle = (Math.PI * 2) / fluteCount;
        const flutePhase = Math.floor(angle / fluteAngle) * fluteAngle + fluteAngle / 2;
        const distanceFromFluteCenter = Math.abs(angle - flutePhase);
        
        // Create concave flute
        if (distanceFromFluteCenter < fluteAngle / 2) {
          const depth = 0.02 * baseDiameter;
          const factor = 1 - depth * Math.sin((distanceFromFluteCenter / (fluteAngle / 2)) * Math.PI);
          positions[i] = x * factor;
          positions[i + 2] = z * factor;
        }
      }
      
      geom.computeVertexNormals();
      return geom;
    } else {
      // Simple tapered cylinder
      return new THREE.CylinderGeometry(
        baseDiameter / 2,
        topDiameter / 2,
        height,
        16,
        1,
        false
      );
    }
  }

  /**
   * Create column base
   */
  private createColumnBase(diameter: number, baseStyle: string, rng: SeededRandom): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    
    if (baseStyle === 'attic') {
      // Attic base with multiple torus sections
      const torus1 = new THREE.TorusGeometry(diameter / 2, 0.03, 8, 24);
      torus1.rotateX(Math.PI / 2);
      torus1.translate(0, 0.03, 0);
      parts.push(torus1);

      const torus2 = new THREE.TorusGeometry(diameter / 2 * 0.7, 0.025, 8, 24);
      torus2.rotateX(Math.PI / 2);
      torus2.translate(0, 0.055, 0);
      parts.push(torus2);

      const plinth = new THREE.CylinderGeometry(diameter / 2 * 1.1, diameter / 2 * 1.1, 0.03, 16);
      plinth.translate(0, -0.015, 0);
      parts.push(plinth);
    } else if (baseStyle === 'pedestal') {
      const pedestal = new THREE.BoxGeometry(diameter * 1.2, 0.15, diameter * 1.2);
      parts.push(pedestal);
    }

    return this.mergeGeometriesList(parts);
  }

  /**
   * Create column capital based on order
   */
  private createColumnCapital(
    diameter: number,
    columnType: string,
    capitalStyle: string,
    rng: SeededRandom
  ): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    
    if (columnType === 'doric' || columnType === 'tuscan') {
      // Simple Doric capital
      const echinus = new THREE.TorusGeometry(diameter / 2 * 0.8, 0.04, 8, 24);
      echinus.rotateX(Math.PI / 2);
      echinus.translate(0, 0.04, 0);
      parts.push(echinus);

      const abacus = new THREE.BoxGeometry(diameter * 1.2, 0.05, diameter * 1.2);
      abacus.translate(0, 0.08, 0);
      parts.push(abacus);
    } else if (columnType === 'ionic') {
      // Ionic capital with volutes
      const echinus = new THREE.TorusGeometry(diameter / 2 * 0.7, 0.03, 8, 24);
      echinus.rotateX(Math.PI / 2);
      echinus.translate(0, 0.03, 0);
      parts.push(echinus);

      // Volutes (simplified as torus segments)
      for (let side = -1; side <= 1; side += 2) {
        const volute = new THREE.TorusGeometry(0.15 * diameter, 0.02, 8, 16, Math.PI);
        volute.rotateY(side * Math.PI / 2);
        volute.translate(side * diameter * 0.4, 0.08, 0);
        parts.push(volute);
      }

      const abacus = new THREE.BoxGeometry(diameter * 1.3, 0.04, diameter * 0.8);
      abacus.translate(0, 0.11, 0);
      parts.push(abacus);
    } else if (columnType === 'corinthian' || columnType === 'composite') {
      // Corinthian capital with acanthus leaves (simplified)
      const bell = new THREE.CylinderGeometry(diameter * 0.6, diameter * 0.8, 0.3, 16);
      bell.translate(0, 0.15, 0);
      parts.push(bell);

      const abacus = new THREE.BoxGeometry(diameter * 1.3, 0.05, diameter * 1.3);
      abacus.translate(0, 0.33, 0);
      parts.push(abacus);
    } else {
      // Modern/simple capital
      const capital = new THREE.CylinderGeometry(diameter * 1.1, diameter, 0.15, 16);
      capital.translate(0, 0.075, 0);
      parts.push(capital);
    }

    return this.mergeGeometriesList(parts);
  }

  /**
   * Generate semantic tags for architectural elements
   */
  private generateTags(type: string, params: ArchitecturalParameters): string[] {
    const tags: string[] = ['architectural'];

    switch (type) {
      case 'door':
        tags.push('door', 'entrance', `${params.doorType}_door`);
        if (params.hasFrame) tags.push('framed');
        if (params.hasTransom) tags.push('transom');
        break;
      case 'window':
        tags.push('window', `${params.windowType}_window`);
        if (params.hasShutters) tags.push('shutters');
        break;
      case 'stairs':
        tags.push('stairs', 'circulation', `${params.stairType}_stairs`);
        if (params.handrailStyle !== 'none') tags.push('handrail');
        break;
      case 'pillar':
      case 'column':
        tags.push('column', 'pillar', 'support', `${params.columnType}_column`);
        if (params.fluting) tags.push('fluted');
        break;
    }

    // Size tags
    const volume = this.estimateVolume(type, params);
    if (volume < 0.5) tags.push('small');
    else if (volume < 2.0) tags.push('medium');
    else tags.push('large');

    // Material tags
    if (params.material) {
      tags.push(params.material);
    }

    return tags;
  }

  /**
   * Estimate volume for size categorization
   */
  private estimateVolume(type: string, params: ArchitecturalParameters): number {
    switch (type) {
      case 'door':
        return params.doorWidth! * params.doorHeight! * params.doorThickness!;
      case 'window':
        return params.windowWidth! * params.windowHeight! * params.frameDepth!;
      case 'stairs':
        return params.stairWidth! * params.totalRise! * params.totalRun! * 0.3;
      case 'pillar':
      case 'column':
        return Math.PI * Math.pow(params.baseDiameter! / 2, 2) * params.columnHeight!;
      default:
        return 1.0;
    }
  }

  /**
   * Merge array of geometries into single geometry
   */
  private mergeGeometriesList(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    if (geometries.length === 0) {
      return new THREE.BufferGeometry();
    }
    if (geometries.length === 1) {
      return geometries[0];
    }
    
    // Use mergeBufferGeometries from Three.js
    return THREE.BufferGeometryUtils.mergeBufferGeometries(geometries) || new THREE.BufferGeometry();
  }
}

// Export specialized generators for convenience
export class DoorGenerator extends ArchitecturalGenerator {
  generateDoor(params: Partial<ArchitecturalParameters> = {}): GeneratedAsset {
    const fullParams = { ...this.getDefaultParameters(), ...params, type: 'door' };
    return this.generate(fullParams);
  }
}

export class WindowGenerator extends ArchitecturalGenerator {
  generateWindow(params: Partial<ArchitecturalParameters> = {}): GeneratedAsset {
    const fullParams = { ...this.getDefaultParameters(), ...params, type: 'window' };
    return this.generate(fullParams);
  }
}

export class StairsGenerator extends ArchitecturalGenerator {
  generateStairs(params: Partial<ArchitecturalParameters> = {}): GeneratedAsset {
    const fullParams = { ...this.getDefaultParameters(), ...params, type: 'stairs' };
    return this.generate(fullParams);
  }
}

export class ColumnGenerator extends ArchitecturalGenerator {
  generateColumn(params: Partial<ArchitecturalParameters> = {}): GeneratedAsset {
    const fullParams = { ...this.getDefaultParameters(), ...params, type: 'column' };
    return this.generate(fullParams);
  }
}
