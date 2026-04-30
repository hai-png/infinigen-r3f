/**
 * WallShelfGenerator - Wall-mounted shelf system
 * 
 * Generates procedural wall-mounted shelves for interior decoration.
 * Supports various styles, materials, and mounting configurations.
 * 
 * Features:
 * - Multiple shelf styles (floating, bracketed, recessed)
 * - Adjustable dimensions and proportions
 * - Material variation (wood, metal, glass, stone)
 * - Decorative bracket options
 * - Multi-tier configurations
 * - Wall mounting hardware
 * 
 * @module WallShelfGenerator
 */

import * as THREE from 'three';

export type ShelfStyle = 'floating' | 'bracketed' | 'recessed' | 'ledged' | 'corner' | 'ornate';
export type ShelfMaterial = 'wood' | 'metal' | 'glass' | 'stone' | 'composite';
export type BracketStyle = 'simple' | 'ornate' | 'industrial' | 'hidden' | 'decorative';

export interface ShelfConfig {
  // Dimensions
  width: number;
  depth: number;
  thickness: number;

  // Style
  style: ShelfStyle;
  material: ShelfMaterial;
  bracketStyle: BracketStyle;

  // Appearance
  color: THREE.Color;
  roughness: number;
  metalness: number;

  // Configuration
  tiers: number;
  tierSpacing: number;
  hasBack: boolean;
  hasSides: boolean;

  // Mounting
  mountType: 'visible' | 'hidden' | 'french_cleat';
  mountDepth: number;
}

const DEFAULT_SHELF_CONFIG: ShelfConfig = {
  width: 1.0,
  depth: 0.25,
  thickness: 0.04,
  style: 'floating',
  material: 'wood',
  bracketStyle: 'simple',
  color: new THREE.Color(0x8b6f47),
  roughness: 0.6,
  metalness: 0.1,
  tiers: 1,
  tierSpacing: 0.4,
  hasBack: false,
  hasSides: false,
  mountType: 'hidden',
  mountDepth: 0.15
};

export class WallShelfGenerator {
  private config: ShelfConfig;

  constructor(config: Partial<ShelfConfig> = {}) {
    this.config = { ...DEFAULT_SHELF_CONFIG, ...config };
  }

  /**
   * Generate a complete wall shelf assembly
   */
  generateShelf(position?: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();

    // Generate shelves based on tier count
    for (let i = 0; i < this.config.tiers; i++) {
      const y = i * this.config.tierSpacing;
      const shelf = this.createShelfBoard();
      shelf.position.y = y;
      group.add(shelf);

      // Add supports based on style
      if (this.config.style === 'bracketed') {
        this.addBrackets(group, y);
      } else if (this.config.style === 'ledged') {
        this.addLedge(group, y);
      }
    }

    // Add back panel if configured
    if (this.config.hasBack) {
      const back = this.createBackPanel();
      group.add(back);
    }

    // Add side panels if configured
    if (this.config.hasSides) {
      this.addSidePanels(group);
    }

    // Add mounting hardware
    this.addMountingHardware(group);

    if (position) {
      group.position.copy(position);
    }

    return group;
  }

  /**
   * Create individual shelf board
   */
  private createShelfBoard(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(
      this.config.width,
      this.config.thickness,
      this.config.depth
    );

    const material = this.getMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    // Add edge detail for certain styles
    if (this.config.style === 'ledged' || this.config.style === 'ornate') {
      this.addEdgeDetail(mesh);
    }

    return mesh;
  }

  /**
   * Add decorative edge detail
   */
  private addEdgeDetail(shelf: THREE.Mesh): void {
    // Create edge molding
    const edgeGeometry = new THREE.BoxGeometry(
      this.config.width + 0.02,
      0.02,
      this.config.depth + 0.02
    );

    const edgeMaterial = this.getMaterial();
    const edgeMesh = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edgeMesh.position.y = -this.config.thickness / 2 - 0.01;

    shelf.add(edgeMesh);
  }

  /**
   * Add support brackets
   */
  private addBrackets(group: THREE.Group, shelfY: number): void {
    const bracketCount = Math.max(2, Math.floor(this.config.width / 0.4));
    const spacing = this.config.width / (bracketCount - 1);

    for (let i = 0; i < bracketCount; i++) {
      const x = -this.config.width / 2 + i * spacing;

      // Skip end brackets for cleaner look
      if (i === 0 || i === bracketCount - 1) {
        x += 0.05;
      }

      const bracket = this.createBracket();
      bracket.position.set(x, shelfY - this.config.tierSpacing / 2, -this.config.depth / 2);
      group.add(bracket);
    }
  }

  /**
   * Create bracket based on style
   */
  private createBracket(): THREE.Group {
    const group = new THREE.Group();

    switch (this.config.bracketStyle) {
      case 'simple':
        this.createSimpleBracket(group);
        break;
      case 'ornate':
        this.createOrnateBracket(group);
        break;
      case 'industrial':
        this.createIndustrialBracket(group);
        break;
      case 'decorative':
        this.createDecorativeBracket(group);
        break;
      case 'hidden':
      default:
        // No visible bracket
        break;
    }

    return group;
  }

  /**
   * Create simple L-bracket
   */
  private createSimpleBracket(group: THREE.Group): void {
    const bracketMaterial = this.getBracketMaterial();

    // Vertical part
    const vertGeo = new THREE.BoxGeometry(0.03, 0.15, this.config.depth);
    const vertMesh = new THREE.Mesh(vertGeo, bracketMaterial);
    vertMesh.position.y = -0.075;
    group.add(vertMesh);

    // Horizontal part
    const horzGeo = new THREE.BoxGeometry(0.12, 0.03, this.config.depth);
    const horzMesh = new THREE.Mesh(horzGeo, bracketMaterial);
    horzMesh.position.set(0.045, 0, 0);
    group.add(horzMesh);
  }

  /**
   * Create ornate bracket with curves
   */
  private createOrnateBracket(group: THREE.Group): void {
    const bracketMaterial = this.getBracketMaterial();

    // Use torus for curved bracket
    const curveGeo = new THREE.TorusGeometry(0.08, 0.015, 8, 16, Math.PI / 2);
    const curveMesh = new THREE.Mesh(curveGeo, bracketMaterial);
    curveMesh.rotation.z = -Math.PI / 2;
    curveMesh.position.set(0.06, -0.06, 0);
    group.add(curveMesh);

    // Add decorative elements
    const decorGeo = new THREE.SphereGeometry(0.02, 8, 8);
    const decorMesh = new THREE.Mesh(decorGeo, bracketMaterial);
    decorMesh.position.set(0.12, 0, 0);
    group.add(decorMesh);
  }

  /**
   * Create industrial pipe bracket
   */
  private createIndustrialBracket(group: THREE.Group): void {
    const pipeMaterial = this.getBracketMaterial();
    pipeMaterial.metalness = 0.8;
    pipeMaterial.roughness = 0.3;

    // Vertical pipe
    const vertGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.15, 8);
    const vertMesh = new THREE.Mesh(vertGeo, pipeMaterial);
    vertMesh.position.y = -0.075;
    group.add(vertMesh);

    // Horizontal pipe
    const horzGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8);
    const horzMesh = new THREE.Mesh(horzGeo, pipeMaterial);
    horzMesh.rotation.z = Math.PI / 2;
    horzMesh.position.set(0.06, 0, 0);
    group.add(horzMesh);

    // Flange at wall
    const flangeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16);
    const flangeMesh = new THREE.Mesh(flangeGeo, pipeMaterial);
    flangeMesh.rotation.x = Math.PI / 2;
    flangeMesh.position.y = -0.15;
    group.add(flangeMesh);
  }

  /**
   * Create decorative scrolled bracket
   */
  private createDecorativeBracket(group: THREE.Group): void {
    const bracketMaterial = this.getBracketMaterial();

    // Create scroll pattern using multiple torus segments
    for (let i = 0; i < 3; i++) {
      const scrollGeo = new THREE.TorusGeometry(0.04 + i * 0.02, 0.008, 8, 16, Math.PI);
      const scrollMesh = new THREE.Mesh(scrollGeo, bracketMaterial);
      scrollMesh.rotation.z = Math.PI / 2;
      scrollMesh.position.set(0.04 + i * 0.02, -0.04 - i * 0.02, 0);
      group.add(scrollMesh);
    }
  }

  /**
   * Add front ledge to shelf
   */
  private addLedge(group: THREE.Group, shelfY: number): void {
    const ledgeHeight = 0.05;
    const ledgeGeo = new THREE.BoxGeometry(
      this.config.width,
      ledgeHeight,
      0.03
    );

    const ledgeMaterial = this.getMaterial();
    const ledgeMesh = new THREE.Mesh(ledgeGeo, ledgeMaterial);
    ledgeMesh.position.set(0, shelfY + ledgeHeight / 2, this.config.depth / 2 - 0.015);
    group.add(ledgeMesh);
  }

  /**
   * Create back panel
   */
  private createBackPanel(): THREE.Mesh {
    const totalHeight = (this.config.tiers - 1) * this.config.tierSpacing + this.config.thickness;

    const geometry = new THREE.BoxGeometry(
      this.config.width + 0.04,
      totalHeight,
      0.02
    );

    const material = this.getMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, totalHeight / 2, -this.config.depth / 2 - 0.01);

    return mesh;
  }

  /**
   * Add side panels
   */
  private addSidePanels(group: THREE.Group): void {
    const totalHeight = (this.config.tiers - 1) * this.config.tierSpacing + this.config.thickness;

    const sideGeometry = new THREE.BoxGeometry(
      0.03,
      totalHeight,
      this.config.depth
    );

    const material = this.getMaterial();

    // Left side
    const leftSide = new THREE.Mesh(sideGeometry, material);
    leftSide.position.set(-this.config.width / 2 - 0.015, totalHeight / 2, 0);
    group.add(leftSide);

    // Right side
    const rightSide = new THREE.Mesh(sideGeometry, material);
    rightSide.position.set(this.config.width / 2 + 0.015, totalHeight / 2, 0);
    group.add(rightSide);
  }

  /**
   * Add mounting hardware
   */
  private addMountingHardware(group: THREE.Group): void {
    if (this.config.mountType === 'hidden') {
      // Add hidden mounting rods
      const rodGeometry = new THREE.CylinderGeometry(0.01, 0.01, this.config.mountDepth, 8);
      const rodMaterial = new THREE.MeshStandardMaterial({
        color: 0x666666,
        metalness: 0.9,
        roughness: 0.2
      });

      for (let i = 0; i < this.config.tiers; i++) {
        const y = i * this.config.tierSpacing;

        // Two mounting rods per shelf
        const offsets = [-this.config.width / 3, this.config.width / 3];

        for (const offset of offsets) {
          const rod = new THREE.Mesh(rodGeometry, rodMaterial);
          rod.rotation.x = Math.PI / 2;
          rod.position.set(offset, y, -this.config.depth / 2);
          group.add(rod);
        }
      }
    } else if (this.config.mountType === 'visible') {
      // Add visible mounting screws
      const screwGeometry = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 8);
      const screwMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.8,
        roughness: 0.3
      });

      for (let i = 0; i < this.config.tiers; i++) {
        const y = i * this.config.tierSpacing;
        const positions = [
          [-this.config.width / 2 + 0.05, -this.config.depth / 2],
          [this.config.width / 2 - 0.05, -this.config.depth / 2]
        ];

        for (const [x, z] of positions) {
          const screw = new THREE.Mesh(screwGeometry, screwMaterial);
          screw.rotation.x = Math.PI / 2;
          screw.position.set(x, y, z);
          group.add(screw);
        }
      }
    }
    // french_cleat would add a cleat system
  }

  /**
   * Get shelf material based on configuration
   */
  private getMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: this.config.color,
      roughness: this.config.roughness,
      metalness: this.config.metalness
    });
  }

  /**
   * Get bracket material
   */
  private getBracketMaterial(): THREE.MeshStandardMaterial {
    if (this.config.material === 'metal' || this.config.bracketStyle === 'industrial') {
      return new THREE.MeshStandardMaterial({
        color: 0x444444,
        roughness: 0.4,
        metalness: 0.8
      });
    }

    return new THREE.MeshStandardMaterial({
      color: this.config.color,
      roughness: this.config.roughness,
      metalness: this.config.metalness
    });
  }

  /**
   * Generate corner shelf variant
   */
  generateCornerShelf(position?: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();

    // Triangular shelf for corner
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(this.config.depth, 0);
    shape.lineTo(0, this.config.depth);
    shape.closePath();

    const extrudeSettings = {
      depth: this.config.width * 0.7,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.01,
      bevelThickness: 0.01
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const material = this.getMaterial();
    const mesh = new THREE.Mesh(geometry, material);

    // Rotate for corner placement
    mesh.rotation.y = -Math.PI / 4;

    group.add(mesh);

    // Add corner bracket
    const bracket = this.createBracket();
    bracket.rotation.y = -Math.PI / 4;
    bracket.position.y = -this.config.tierSpacing / 2;
    group.add(bracket);

    if (position) {
      group.position.copy(position);
    }

    return group;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ShelfConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ShelfConfig {
    return { ...this.config };
  }
}

export default WallShelfGenerator;
