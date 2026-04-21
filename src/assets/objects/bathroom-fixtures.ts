import * as THREE from 'three';
import { InstancedMesh } from 'three';

/**
 * BathroomFixturesGenerator
 * 
 * Generates procedural bathroom fixtures including sinks, toilets, bathtubs,
 * showers, and accessories with realistic materials and configurations.
 * 
 * Features:
 * - 5 fixture types (sink, toilet, bathtub, shower, bidet)
 * - 3 style variants (modern, classic, industrial)
 * - Material options (porcelain, ceramic, stone, metal)
 * - Configurable dimensions and proportions
 * - Faucet and hardware attachments
 * - Water simulation placeholders
 * - Accessibility options (ADA compliant variations)
 */

export interface BathroomFixtureParams {
  type?: 'sink' | 'toilet' | 'bathtub' | 'shower' | 'bidet';
  style?: 'modern' | 'classic' | 'industrial';
  material?: 'porcelain' | 'ceramic' | 'stone' | 'metal';
  count?: number;
  scale?: number;
  includeFaucets?: boolean;
  includeHardware?: boolean;
  accessibility?: boolean; // ADA compliant
  color?: string;
  position?: THREE.Vector3;
  rotation?: number;
}

export interface BathroomFixtureResult {
  mesh: THREE.Group | InstancedMesh;
  fixtures: FixtureInstance[];
  boundingBox: THREE.Box3;
}

export interface FixtureInstance {
  id: string;
  type: string;
  style: string;
  position: THREE.Vector3;
  rotation: number;
  scale: THREE.Vector3;
  material: THREE.Material;
}

export class BathroomFixturesGenerator {
  private scene: THREE.Scene;
  private defaultParams: Required<BathroomFixtureParams>;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.defaultParams = {
      type: 'sink',
      style: 'modern',
      material: 'porcelain',
      count: 1,
      scale: 1,
      includeFaucets: true,
      includeHardware: true,
      accessibility: false,
      color: '#ffffff',
      position: new THREE.Vector3(0, 0, 0),
      rotation: 0,
    };
  }

  /**
   * Generate bathroom fixtures
   */
  async generate(params: BathroomFixtureParams = {}): Promise<BathroomFixtureResult> {
    const mergedParams = { ...this.defaultParams, ...params };
    const group = new THREE.Group();
    const fixtures: FixtureInstance[] = [];

    // Create base material
    const material = this.createFixtureMaterial(mergedParams.material, mergedParams.color);

    // Generate fixtures based on count
    for (let i = 0; i < mergedParams.count; i++) {
      const fixtureGroup = this.createFixture(mergedParams);
      
      // Apply positioning with slight randomization for natural variation
      const offset = mergedParams.count > 1 ? 
        new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          0,
          (Math.random() - 0.5) * 2
        ) : new THREE.Vector3();
      
      fixtureGroup.position.add(offset);
      fixtureGroup.rotation.y = mergedParams.rotation + (Math.random() - 0.5) * 0.1;
      
      // Create instance record
      const instance: FixtureInstance = {
        id: `bathroom-fixture-${Date.now()}-${i}`,
        type: mergedParams.type,
        style: mergedParams.style,
        position: fixtureGroup.position.clone(),
        rotation: fixtureGroup.rotation.y,
        scale: fixtureGroup.scale.clone(),
        material: material,
      };
      
      fixtures.push(instance);
      group.add(fixtureGroup);
    }

    // Calculate bounding box
    const boundingBox = new THREE.Box3().setFromObject(group);

    return {
      mesh: group,
      fixtures,
      boundingBox,
    };
  }

  /**
   * Create a single fixture based on type
   */
  private createFixture(params: Required<BathroomFixtureParams>): THREE.Group {
    const group = new THREE.Group();
    
    switch (params.type) {
      case 'sink':
        group.add(this.createSink(params));
        break;
      case 'toilet':
        group.add(this.createToilet(params));
        break;
      case 'bathtub':
        group.add(this.createBathtub(params));
        break;
      case 'shower':
        group.add(this.createShower(params));
        break;
      case 'bidet':
        group.add(this.createBidet(params));
        break;
    }

    // Add faucets if requested
    if (params.includeFaucets && ['sink', 'bathtub', 'bidet'].includes(params.type)) {
      group.add(this.createFaucet(params.style));
    }

    // Add hardware (towel bars, handles, etc.)
    if (params.includeHardware) {
      group.add(this.createHardware(params.type, params.style));
    }

    group.scale.setScalar(params.scale);
    return group;
  }

  /**
   * Create sink geometry
   */
  private createSink(params: Required<BathroomFixtureParams>): THREE.Mesh {
    const shape = params.style === 'modern' ? 'rectangular' : 
                  params.style === 'classic' ? 'oval' : 'industrial';
    
    let geometry: THREE.BufferGeometry;
    
    if (shape === 'rectangular') {
      // Modern rectangular sink
      const width = 0.6 * params.scale;
      const depth = 0.5 * params.scale;
      const height = 0.15 * params.scale;
      
      geometry = new THREE.BoxGeometry(width, height, depth);
      
      // Create basin depression
      const basinGeom = new THREE.BoxGeometry(width * 0.7, height * 0.8, depth * 0.7);
      // In production, use CSG to subtract basin
    } else if (shape === 'oval') {
      // Classic oval sink
      geometry = this.createOvalBasin(0.6, 0.5, 0.15, params.scale);
    } else {
      // Industrial wall-mounted or trough
      geometry = new THREE.BoxGeometry(0.8, 0.12, 0.4, 1, 1, 1);
    }

    const mesh = new THREE.Mesh(geometry, this.createFixtureMaterial(params.material, params.color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Position at appropriate height
    mesh.position.y = params.accessibility ? 0.8 : 0.85; // ADA height vs standard
    
    return mesh;
  }

  /**
   * Create toilet geometry
   */
  private createToilet(params: Required<BathroomFixtureParams>): THREE.Group {
    const group = new THREE.Group();
    const material = this.createFixtureMaterial(params.material, params.color);
    
    // Bowl
    const bowlHeight = params.accessibility ? 0.48 : 0.42; // ADA compliant height
    const bowlGeom = params.style === 'modern' ? 
      new THREE.CylinderGeometry(0.18, 0.2, bowlHeight, 16) :
      new THREE.BoxGeometry(0.4, bowlHeight, 0.55);
    
    const bowl = new THREE.Mesh(bowlGeom, material);
    bowl.position.y = bowlHeight / 2;
    bowl.castShadow = true;
    group.add(bowl);
    
    // Tank
    const tankWidth = params.style === 'modern' ? 0.35 : 0.45;
    const tankHeight = 0.35;
    const tankDepth = 0.2;
    const tankGeom = new THREE.BoxGeometry(tankWidth, tankHeight, tankDepth);
    const tank = new THREE.Mesh(tankGeom, material);
    tank.position.set(0, bowlHeight + tankHeight / 2, -0.25);
    tank.castShadow = true;
    group.add(tank);
    
    // Seat
    const seatGeom = params.style === 'modern' ?
      new THREE.TorusGeometry(0.2, 0.03, 8, 24, Math.PI) :
      new THREE.BoxGeometry(0.38, 0.05, 0.45);
    const seat = new THREE.Mesh(seatGeom, new THREE.MeshStandardMaterial({ color: 0x333333 }));
    seat.position.y = bowlHeight;
    seat.rotation.x = Math.PI / 2;
    group.add(seat);
    
    // Lid (optional open/closed state could be added)
    if (params.style !== 'industrial') {
      const lidGeom = new THREE.BoxGeometry(0.36, 0.02, 0.43);
      const lid = new THREE.Mesh(lidGeom, material);
      lid.position.set(0, bowlHeight + 0.03, -0.15);
      lid.rotation.x = -Math.PI / 6; // Slightly open
      group.add(lid);
    }
    
    return group;
  }

  /**
   * Create bathtub geometry
   */
  private createBathtub(params: Required<BathroomFixtureParams>): THREE.Group {
    const group = new THREE.Group();
    const material = this.createFixtureMaterial(params.material, params.color);
    
    const length = params.style === 'classic' ? 1.8 : 1.7;
    const width = params.style === 'classic' ? 0.8 : 0.75;
    const height = 0.6;
    const thickness = 0.05;
    
    // Outer shell
    const outerGeom = new THREE.BoxGeometry(length, height, width);
    const outer = new THREE.Mesh(outerGeom, material);
    outer.position.y = height / 2;
    outer.castShadow = true;
    group.add(outer);
    
    // Inner basin (subtracted visually by making it slightly smaller and different color)
    const innerGeom = new THREE.BoxGeometry(
      length - thickness * 2,
      height - thickness * 2,
      width - thickness * 2
    );
    const inner = new THREE.Mesh(innerGeom, material);
    inner.position.y = height / 2 + 0.01;
    group.add(inner);
    
    // Feet for classic style
    if (params.style === 'classic') {
      const footGeom = new THREE.SphereGeometry(0.08, 8, 8);
      const footMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.2 });
      
      const positions = [
        [-length/2 + 0.15, 0, width/2 - 0.1],
        [length/2 - 0.15, 0, width/2 - 0.1],
        [-length/2 + 0.15, 0, -width/2 + 0.1],
        [length/2 - 0.15, 0, -width/2 + 0.1],
      ];
      
      positions.forEach(pos => {
        const foot = new THREE.Mesh(footGeom, footMat);
        foot.position.set(...pos);
        group.add(foot);
      });
    }
    
    // Faucet mounting area
    if (params.includeFaucets) {
      const faucetBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.05, 16),
        new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.1 })
      );
      faucetBase.position.set(0, height, width/2 - 0.1);
      group.add(faucetBase);
    }
    
    return group;
  }

  /**
   * Create shower geometry
   */
  private createShower(params: Required<BathroomFixtureParams>): THREE.Group {
    const group = new THREE.Group();
    
    const width = params.accessibility ? 1.5 : 0.9; // ADA roll-in shower
    const depth = params.accessibility ? 1.5 : 0.9;
    const height = 2.1;
    
    // Base/pan
    const baseGeom = new THREE.BoxGeometry(width, 0.1, depth);
    const baseMat = new THREE.MeshStandardMaterial({ 
      color: params.material === 'stone' ? 0x888888 : 0xffffff,
      roughness: 0.3 
    });
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.05;
    base.receiveShadow = true;
    group.add(base);
    
    // Glass enclosure (modern) or curtain rod (classic)
    if (params.style === 'modern') {
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xaaccff,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.9,
        transparent: true,
        opacity: 0.3,
      });
      
      // Glass panels
      const panelGeom = new THREE.PlaneGeometry(width, height);
      const backPanel = new THREE.Mesh(panelGeom, glassMat);
      backPanel.position.set(0, height/2, -depth/2);
      backPanel.rotation.y = Math.PI;
      group.add(backPanel);
      
      const sidePanel = new THREE.Mesh(
        new THREE.PlaneGeometry(depth, height),
        glassMat
      );
      sidePanel.position.set(-width/2, height/2, 0);
      sidePanel.rotation.y = -Math.PI / 2;
      group.add(sidePanel);
    } else {
      // Curtain rod
      const rodGeom = new THREE.CylinderGeometry(0.02, 0.02, width, 8);
      const rodMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 });
      const rod = new THREE.Mesh(rodGeom, rodMat);
      rod.position.set(0, height, 0);
      group.add(rod);
      
      // Curtain rings
      for (let i = 0; i < 8; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.03, 0.005, 8, 16),
          rodMat
        );
        ring.position.set(-width/2 + (i + 0.5) * (width/8), height, 0);
        group.add(ring);
      }
    }
    
    // Shower head
    const showerHead = this.createShowerHead(params.style);
    showerHead.position.set(0, height - 0.3, -depth/2 + 0.1);
    group.add(showerHead);
    
    return group;
  }

  /**
   * Create bidet geometry
   */
  private createBidet(params: Required<BathroomFixtureParams>): THREE.Mesh {
    const height = params.accessibility ? 0.48 : 0.42;
    const radius = 0.22;
    
    let geometry: THREE.BufferGeometry;
    
    if (params.style === 'modern') {
      geometry = new THREE.CylinderGeometry(radius * 0.8, radius, height, 16);
    } else if (params.style === 'classic') {
      geometry = this.createOvalBasin(radius * 1.5, radius, height, 1);
    } else {
      geometry = new THREE.BoxGeometry(0.4, height, 0.55);
    }
    
    const mesh = new THREE.Mesh(geometry, this.createFixtureMaterial(params.material, params.color));
    mesh.position.y = height / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Create faucet
   */
  private createFaucet(style: string): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ 
      color: style === 'industrial' ? 0x888888 : 0xffd700,
      metalness: 0.9,
      roughness: style === 'industrial' ? 0.3 : 0.1,
    });
    
    // Base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.08, 16),
      material
    );
    base.position.y = 0.04;
    group.add(base);
    
    // Spout
    const spoutHeight = style === 'modern' ? 0.25 : 0.18;
    const spout = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.03, spoutHeight, 12),
      material
    );
    spout.position.y = 0.08 + spoutHeight / 2;
    spout.rotation.x = -Math.PI / 8;
    group.add(spout);
    
    // Handles
    const handleGeom = style === 'modern' ?
      new THREE.CylinderGeometry(0.015, 0.015, 0.1, 8) :
      new THREE.SphereGeometry(0.03, 8, 8);
    
    const hotHandle = new THREE.Mesh(handleGeom, material);
    hotHandle.position.set(-0.08, 0.12, 0);
    hotHandle.rotation.z = Math.PI / 4;
    
    const coldHandle = new THREE.Mesh(handleGeom, material);
    coldHandle.position.set(0.08, 0.12, 0);
    coldHandle.rotation.z = -Math.PI / 4;
    
    // Color indicators
    const indicatorMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const hotIndicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 8, 8),
      indicatorMat
    );
    hotIndicator.position.copy(hotHandle.position).y += 0.05;
    
    const coldIndicatorMat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    const coldIndicator = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 8, 8),
      coldIndicatorMat
    );
    coldIndicator.position.copy(coldHandle.position).y += 0.05;
    
    group.add(hotHandle, coldHandle, hotIndicator, coldIndicator);
    
    return group;
  }

  /**
   * Create shower head
   */
  private createShowerHead(style: string): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ 
      color: style === 'industrial' ? 0x666666 : 0xffd700,
      metalness: 0.9,
      roughness: 0.1,
    });
    
    // Head
    const headGeom = style === 'modern' ?
      new THREE.CylinderGeometry(0.12, 0.15, 0.05, 24) :
      new THREE.SphereGeometry(0.1, 16, 16, 0, Math.PI * 2, 0, Math.PI/2);
    
    const head = new THREE.Mesh(headGeom, material);
    head.rotation.x = Math.PI / 2;
    group.add(head);
    
    // Arm
    const armLength = style === 'modern' ? 0.4 : 0.3;
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.02, armLength, 8),
      material
    );
    arm.position.set(0, 0.1, -armLength/2);
    arm.rotation.x = Math.PI / 2;
    group.add(arm);
    
    // Nozzles (small details)
    const nozzleGeom = new THREE.SphereGeometry(0.005, 8, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const nozzle = new THREE.Mesh(nozzleGeom, nozzleMat);
      nozzle.position.set(
        Math.cos(angle) * 0.08,
        0.025,
        Math.sin(angle) * 0.08
      );
      group.add(nozzle);
    }
    
    return group;
  }

  /**
   * Create hardware (towel bars, handles, etc.)
   */
  private createHardware(type: string, style: string): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ 
      color: style === 'industrial' ? 0x666666 : 0xffd700,
      metalness: 0.9,
      roughness: 0.1,
    });
    
    // Add towel bar for bathtubs and showers
    if (['bathtub', 'shower'].includes(type)) {
      const barLength = type === 'bathtub' ? 0.6 : 0.4;
      const barGeom = new THREE.CylinderGeometry(0.015, 0.015, barLength, 12);
      const bar = new THREE.Mesh(barGeom, material);
      bar.rotation.z = Math.PI / 2;
      
      if (type === 'bathtub') {
        bar.position.set(0, 0.8, 0.5);
      } else {
        bar.position.set(0.3, 1.2, 0);
      }
      
      // Mounting brackets
      const bracketGeom = new THREE.CylinderGeometry(0.02, 0.025, 0.05, 8);
      const leftBracket = new THREE.Mesh(bracketGeom, material);
      leftBracket.position.x = -barLength/2;
      
      const rightBracket = new THREE.Mesh(bracketGeom, material);
      rightBracket.position.x = barLength/2;
      
      group.add(bar, leftBracket, rightBracket);
    }
    
    // Toilet paper holder for toilets
    if (type === 'toilet') {
      const holderArm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.15, 8),
        material
      );
      holderArm.rotation.z = Math.PI / 2;
      holderArm.position.set(0.4, 0.5, 0.3);
      
      const spindle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8),
        material
      );
      spindle.rotation.z = Math.PI / 2;
      spindle.position.set(0.4, 0.5, 0.35);
      
      group.add(holderArm, spindle);
    }
    
    return group;
  }

  /**
   * Create oval basin geometry helper
   */
  private createOvalBasin(width: number, depth: number, height: number, scale: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const xRadius = (width / 2) * scale;
    const yRadius = (depth / 2) * scale;
    
    // Draw oval
    for (let i = 0; i <= 32; i++) {
      const angle = (i / 32) * Math.PI * 2;
      const x = Math.cos(angle) * xRadius;
      const y = Math.sin(angle) * yRadius;
      
      if (i === 0) {
        shape.moveTo(x, y);
      } else {
        shape.lineTo(x, y);
      }
    }
    
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: height * scale,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
    };
    
    return new THREE.ExtrudeGeometry(shape, extrudeSettings);
  }

  /**
   * Create fixture material based on type
   */
  private createFixtureMaterial(materialType: string, color: string): THREE.MeshStandardMaterial {
    let baseColor: number;
    let metalness: number;
    let roughness: number;
    
    switch (materialType) {
      case 'porcelain':
        baseColor = new THREE.Color(color).getHex();
        metalness = 0.1;
        roughness = 0.2;
        break;
      case 'ceramic':
        baseColor = new THREE.Color(color).getHex();
        metalness = 0.05;
        roughness = 0.3;
        break;
      case 'stone':
        baseColor = new THREE.Color(color || '#888888').getHex();
        metalness = 0.0;
        roughness = 0.6;
        break;
      case 'metal':
        baseColor = new THREE.Color(color || '#cccccc').getHex();
        metalness = 0.9;
        roughness = 0.15;
        break;
      default:
        baseColor = 0xffffff;
        metalness = 0.1;
        roughness = 0.2;
    }
    
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      metalness,
      roughness,
    });
  }
}

export default BathroomFixturesGenerator;
