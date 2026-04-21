import * as THREE from 'three';
import { InstancedMesh } from 'three';

/**
 * SpecializedLampsGenerator
 * 
 * Generates specialized and decorative lamp variants including:
 * - Desk lamps (architect, banker, LED)
 * - Floor lamps (arc, torchiere, tripod)
 * - Pendant lights (cluster, geometric, industrial)
 * - Wall sconces (uplight, downlight, swing-arm)
 * - Novelty lamps (lava, salt, fiber optic)
 * 
 * Features:
 * - 15+ specialized lamp types
 * - Multiple style variants per type
 * - Animated elements (swing arms, rotating bases)
 * - Advanced materials (fabric shades, glass diffusers)
 * - Smart lighting integration placeholders
 * - Dimmable light sources
 */

export interface SpecializedLampParams {
  category?: 'desk' | 'floor' | 'pendant' | 'sconce' | 'novelty';
  type?: string; // Specific type within category
  style?: 'modern' | 'vintage' | 'industrial' | 'art deco' | 'minimalist' | 'rustic';
  count?: number;
  scale?: number;
  animated?: boolean;
  dimmable?: boolean;
  brightness?: number; // 0-1
  colorTemperature?: number; // Kelvin (2700-6500)
  shadeMaterial?: 'fabric' | 'glass' | 'metal' | 'paper' | 'plastic';
  baseMaterial?: 'wood' | 'metal' | 'ceramic' | 'stone' | 'concrete';
  smartEnabled?: boolean;
  position?: THREE.Vector3;
  rotation?: number;
}

export interface SpecializedLampResult {
  mesh: THREE.Group | InstancedMesh;
  lamps: LampInstance[];
  boundingBox: THREE.Box3;
  lightSources: THREE.Light[];
}

export interface LampInstance {
  id: string;
  category: string;
  type: string;
  style: string;
  position: THREE.Vector3;
  rotation: number;
  scale: THREE.Vector3;
  brightness: number;
  colorTemperature: number;
  animated: boolean;
}

export class SpecializedLampsGenerator {
  private scene: THREE.Scene;
  private defaultParams: Required<SpecializedLampParams>;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.defaultParams = {
      category: 'desk',
      type: 'architect',
      style: 'modern',
      count: 1,
      scale: 1,
      animated: false,
      dimmable: false,
      brightness: 1.0,
      colorTemperature: 3000,
      shadeMaterial: 'fabric',
      baseMaterial: 'metal',
      smartEnabled: false,
      position: new THREE.Vector3(0, 0, 0),
      rotation: 0,
    };
  }

  /**
   * Generate specialized lamps
   */
  async generate(params: SpecializedLampParams = {}): Promise<SpecializedLampResult> {
    const mergedParams = { ...this.defaultParams, ...params };
    const group = new THREE.Group();
    const lamps: LampInstance[] = [];
    const lightSources: THREE.Light[] = [];

    // Determine specific type if not provided
    const specificType = mergedParams.type || this.getDefaultTypeForCategory(mergedParams.category);

    // Generate lamps
    for (let i = 0; i < mergedParams.count; i++) {
      const lampGroup = this.createLamp({
        ...mergedParams,
        type: specificType,
      });
      
      // Apply positioning with variation
      const offset = mergedParams.count > 1 ?
        new THREE.Vector3(
          (Math.random() - 0.5) * 1.5,
          0,
          (Math.random() - 0.5) * 1.5
        ) : new THREE.Vector3();
      
      lampGroup.position.add(offset);
      lampGroup.rotation.y = mergedParams.rotation + (Math.random() - 0.5) * 0.2;
      
      // Extract light sources
      lampGroup.traverse((child) => {
        if (child instanceof THREE.PointLight || 
            child instanceof THREE.SpotLight) {
          lightSources.push(child);
        }
      });
      
      // Create instance record
      const instance: LampInstance = {
        id: `specialized-lamp-${Date.now()}-${i}`,
        category: mergedParams.category,
        type: specificType,
        style: mergedParams.style,
        position: lampGroup.position.clone(),
        rotation: lampGroup.rotation.y,
        scale: lampGroup.scale.clone(),
        brightness: mergedParams.brightness,
        colorTemperature: mergedParams.colorTemperature,
        animated: mergedParams.animated,
      };
      
      lamps.push(instance);
      group.add(lampGroup);
    }

    const boundingBox = new THREE.Box3().setFromObject(group);

    return {
      mesh: group,
      lamps,
      boundingBox,
      lightSources,
    };
  }

  /**
   * Get default type for category
   */
  private getDefaultTypeForCategory(category: string): string {
    const defaults: Record<string, string> = {
      desk: 'architect',
      floor: 'arc',
      pendant: 'cluster',
      sconce: 'swing-arm',
      novelty: 'lava',
    };
    return defaults[category] || 'architect';
  }

  /**
   * Create lamp based on category and type
   */
  private createLamp(params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    switch (params.category) {
      case 'desk':
        group.add(this.createDeskLamp(params.type, params));
        break;
      case 'floor':
        group.add(this.createFloorLamp(params.type, params));
        break;
      case 'pendant':
        group.add(this.createPendantLight(params.type, params));
        break;
      case 'sconce':
        group.add(this.createWallSconce(params.type, params));
        break;
      case 'novelty':
        group.add(this.createNoveltyLamp(params.type, params));
        break;
    }

    group.scale.setScalar(params.scale);
    return group;
  }

  /**
   * Create desk lamp
   */
  private createDeskLamp(type: string, params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    switch (type) {
      case 'architect':
        group.add(this.createArchitectLamp(params));
        break;
      case 'banker':
        group.add(this.createBankerLamp(params));
        break;
      case 'led':
        group.add(this.createLEDDeskLamp(params));
        break;
      case 'touch':
        group.add(this.createTouchLamp(params));
        break;
      default:
        group.add(this.createArchitectLamp(params));
    }
    
    return group;
  }

  /**
   * Create architect lamp (adjustable arm)
   */
  private createArchitectLamp(params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    const baseMat = this.createBaseMaterial(params.baseMaterial);
    const armMat = new THREE.MeshStandardMaterial({ 
      color: 0x222222, 
      metalness: 0.8, 
      roughness: 0.2 
    });

    // Heavy base
    const baseGeom = new THREE.CylinderGeometry(0.12, 0.15, 0.04, 32);
    const base = new THREE.Mesh(baseGeom, baseMat);
    base.position.y = 0.02;
    group.add(base);

    // Lower arm segment
    const lowerArmLength = 0.35;
    const lowerArmGeom = new THREE.CylinderGeometry(0.015, 0.015, lowerArmLength, 12);
    const lowerArm = new THREE.Mesh(lowerArmGeom, armMat);
    lowerArm.position.y = 0.04 + lowerArmLength / 2;
    lowerArm.rotation.x = Math.PI / 4;
    
    if (params.animated) {
      // Add pivot point for animation
      const pivot = new THREE.Group();
      pivot.position.copy(lowerArm.position);
      pivot.add(lowerArm);
      lowerArm.position.y = lowerArmLength / 2;
      group.add(pivot);
    } else {
      group.add(lowerArm);
    }

    // Upper arm segment
    const upperArmLength = 0.4;
    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, upperArmLength, 12),
      armMat
    );
    upperArm.position.set(
      Math.sin(Math.PI / 4) * lowerArmLength / 2,
      0.04 + lowerArmLength * Math.cos(Math.PI / 4) + upperArmLength / 2,
      0
    );
    upperArm.rotation.x = -Math.PI / 6;
    group.add(upperArm);

    // Lamp head
    const headGeom = params.style === 'vintage' ?
      new THREE.ConeGeometry(0.08, 0.15, 32) :
      new THREE.CylinderGeometry(0.07, 0.1, 0.12, 32);
    
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.7,
      roughness: 0.3,
    });
    
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.set(
      Math.sin(Math.PI / 4) * lowerArmLength + Math.sin(-Math.PI / 6) * upperArmLength,
      0.04 + lowerArmLength * Math.cos(Math.PI / 4) + upperArmLength * Math.cos(-Math.PI / 6),
      0
    );
    head.rotation.x = Math.PI / 3;
    group.add(head);

    // Light bulb
    const bulbGeom = new THREE.SphereGeometry(0.03, 16, 16);
    const bulbMat = new THREE.MeshBasicMaterial({ 
      color: this.kelvinToRGB(params.colorTemperature),
      emissive: this.kelvinToRGB(params.colorTemperature),
      emissiveIntensity: params.brightness,
    });
    const bulb = new THREE.Mesh(bulbGeom, bulbMat);
    bulb.position.copy(head.position).y -= 0.05;
    group.add(bulb);

    // Actual light source
    const light = new THREE.SpotLight(
      this.kelvinToRGB(params.colorTemperature),
      params.brightness * 2,
      2,
      Math.PI / 4,
      0.5
    );
    light.position.copy(bulb.position);
    light.target.position.set(0, -1, 0);
    group.add(light);
    group.add(light.target);

    return group;
  }

  /**
   * Create banker's lamp (classic green shade)
   */
  private createBankerLamp(params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    // Brass base
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.9,
      roughness: 0.2,
    });
    
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.05, 32),
      baseMat
    );
    base.position.y = 0.025;
    group.add(base);

    // Stem
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.02, 0.35, 16),
      baseMat
    );
    stem.position.y = 0.2;
    group.add(stem);

    // Green glass shade
    const shadeMat = new THREE.MeshPhysicalMaterial({
      color: 0x006633,
      metalness: 0.0,
      roughness: 0.1,
      transmission: 0.6,
      transparent: true,
      opacity: 0.8,
    });
    
    const shadeGeom = new THREE.CylinderGeometry(0.08, 0.15, 0.12, 32, 1, true);
    const shade = new THREE.Mesh(shadeGeom, shadeMat);
    shade.position.y = 0.38;
    group.add(shade);

    // Shade top
    const shadeTop = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 32, 16, 0, Math.PI * 2, 0, Math.PI/2),
      shadeMat
    );
    shadeTop.position.y = 0.44;
    group.add(shadeTop);

    // Light bulb inside
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 16, 16),
      new THREE.MeshBasicMaterial({
        color: this.kelvinToRGB(params.colorTemperature),
        emissive: this.kelvinToRGB(params.colorTemperature),
        emissiveIntensity: params.brightness,
      })
    );
    bulb.position.y = 0.38;
    group.add(bulb);

    // Light source
    const light = new THREE.PointLight(
      this.kelvinToRGB(params.colorTemperature),
      params.brightness * 1.5,
      3
    );
    light.position.copy(bulb.position);
    group.add(light);

    return group;
  }

  /**
   * Create modern LED desk lamp
   */
  private createLEDDeskLamp(params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    // Sleek base
    const baseMat = this.createBaseMaterial(params.baseMaterial);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.03, 0.15),
      baseMat
    );
    base.position.y = 0.015;
    group.add(base);

    // Thin stem
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      metalness: 0.6,
      roughness: 0.3,
    });
    
    const stem = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.4, 0.02),
      stemMat
    );
    stem.position.y = 0.22;
    group.add(stem);

    // LED panel head
    const panelGeom = new THREE.BoxGeometry(0.3, 0.02, 0.08);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: this.kelvinToRGB(params.colorTemperature),
      emissiveIntensity: params.brightness * 0.5,
    });
    
    const panel = new THREE.Mesh(panelGeom, panelMat);
    panel.position.y = 0.43;
    panel.rotation.x = -Math.PI / 8;
    group.add(panel);

    // LED light strip (visual)
    const ledStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.01, 0.06),
      new THREE.MeshBasicMaterial({
        color: this.kelvinToRGB(params.colorTemperature),
      })
    );
    ledStrip.position.y = 0.42;
    group.add(ledStrip);

    // Area light
    const light = new THREE.RectAreaLight(
      this.kelvinToRGB(params.colorTemperature),
      params.brightness * 3,
      0.28,
      0.06
    );
    light.position.copy(ledStrip.position);
    light.rotation.x = -Math.PI / 2;
    group.add(light);

    return group;
  }

  /**
   * Create floor lamp
   */
  private createFloorLamp(type: string, params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    switch (type) {
      case 'arc':
        group.add(this.createArcFloorLamp(params));
        break;
      case 'torchiere':
        group.add(this.createTorchiereLamp(params));
        break;
      case 'tripod':
        group.add(this.createTripodLamp(params));
        break;
      case 'reading':
        group.add(this.createReadingLamp(params));
        break;
      default:
        group.add(this.createArcFloorLamp(params));
    }
    
    return group;
  }

  /**
   * Create arc floor lamp
   */
  private createArcFloorLamp(params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    // Heavy marble base
    const baseMat = this.createBaseMaterial('stone');
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.25, 0.08, 32),
      baseMat
    );
    base.position.y = 0.04;
    group.add(base);

    // Arc arm (curved)
    const armMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.8,
      roughness: 0.2,
    });
    
    // Create curved arc using multiple segments
    const arcRadius = 1.2;
    const arcSegments = 16;
    const arcAngle = Math.PI / 3;
    
    for (let i = 0; i < arcSegments; i++) {
      const angle = (i / arcSegments) * arcAngle;
      const x = Math.sin(angle) * arcRadius;
      const y = arcRadius * (1 - Math.cos(angle));
      
      const segment = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.1, 12),
        armMat
      );
      segment.position.set(x, y + 0.04, 0);
      segment.rotation.z = -angle;
      group.add(segment);
    }

    // Hanging shade at end of arc
    const shadeMat = this.createShadeMaterial(params.shadeMaterial, '#ffffff');
    const shadeGeom = new THREE.CylinderGeometry(0.15, 0.25, 0.2, 32, 1, true);
    const shade = new THREE.Mesh(shadeGeom, shadeMat);
    shade.position.set(arcRadius * Math.sin(arcAngle), arcRadius * (1 - Math.cos(arcAngle)) + 0.04, 0);
    group.add(shade);

    // Light source
    const light = new THREE.PointLight(
      this.kelvinToRGB(params.colorTemperature),
      params.brightness * 2,
      4
    );
    light.position.copy(shade.position).y -= 0.1;
    group.add(light);

    return group;
  }

  /**
   * Create pendant light
   */
  private createPendantLight(type: string, params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    switch (type) {
      case 'cluster':
        group.add(this.createClusterPendant(params));
        break;
      case 'geometric':
        group.add(this.createGeometricPendant(params));
        break;
      case 'industrial':
        group.add(this.createIndustrialPendant(params));
        break;
      case 'globe':
        group.add(this.createGlobePendant(params));
        break;
      default:
        group.add(this.createClusterPendant(params));
    }
    
    return group;
  }

  /**
   * Create cluster pendant (multiple hanging lights)
   */
  private createClusterPendant(params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    // Ceiling mount
    const mountMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      metalness: 0.9,
      roughness: 0.1,
    });
    
    const mount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 0.03, 32),
      mountMat
    );
    mount.position.y = 2.5; // Ceiling height
    group.add(mount);

    // Multiple hanging pendants
    const cordMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.8,
    });
    
    const positions = [
      { x: 0, z: 0, length: 0.8 },
      { x: 0.3, z: 0.2, length: 1.0 },
      { x: -0.25, z: 0.3, length: 0.9 },
      { x: 0.15, z: -0.35, length: 1.1 },
      { x: -0.35, z: -0.15, length: 0.85 },
    ];

    positions.forEach((pos, index) => {
      // Cord
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003, 0.003, pos.length, 8),
        cordMat
      );
      cord.position.set(pos.x, 2.5 - pos.length/2, pos.z);
      group.add(cord);

      // Bulb holder
      const holder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.025, 0.05, 16),
        mountMat
      );
      holder.position.set(pos.x, 2.5 - pos.length, pos.z);
      group.add(holder);

      // Exposed bulb
      const bulbGeom = params.style === 'vintage' ?
        new THREE.CylinderGeometry(0.04, 0.05, 0.12, 16) :
        new THREE.SphereGeometry(0.05, 16, 16);
      
      const bulb = new THREE.Mesh(
        bulbGeom,
        new THREE.MeshBasicMaterial({
          color: this.kelvinToRGB(params.colorTemperature),
          emissive: this.kelvinToRGB(params.colorTemperature),
          emissiveIntensity: params.brightness,
        })
      );
      bulb.position.set(pos.x, 2.5 - pos.length - 0.06, pos.z);
      group.add(bulb);

      // Light source
      const light = new THREE.PointLight(
        this.kelvinToRGB(params.colorTemperature),
        params.brightness * 1.2,
        3
      );
      light.position.copy(bulb.position);
      group.add(light);
    });

    return group;
  }

  /**
   * Create wall sconce
   */
  private createWallSconce(type: string, params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    switch (type) {
      case 'swing-arm':
        group.add(this.createSwingArmSconce(params));
        break;
      case 'uplight':
        group.add(this.createUplightSconce(params));
        break;
      case 'downlight':
        group.add(this.createDownlightSconce(params));
        break;
      case 'candle':
        group.add(this.createCandleSconce(params));
        break;
      default:
        group.add(this.createSwingArmSconce(params));
    }
    
    return group;
  }

  /**
   * Create swing-arm sconce
   */
  private createSwingArmSconce(params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    // Wall mount plate
    const mountMat = new THREE.MeshStandardMaterial({
      color: params.baseMaterial === 'metal' ? 0xcccccc : 0x8b4513,
      metalness: params.baseMaterial === 'metal' ? 0.8 : 0.1,
      roughness: 0.3,
    });
    
    const mountPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.15, 0.1),
      mountMat
    );
    group.add(mountPlate);

    // Swing arm mechanism
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.7,
      roughness: 0.3,
    });

    // First arm segment
    const arm1 = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.03, 0.03),
      armMat
    );
    arm1.position.set(0.125, 0.05, 0);
    group.add(arm1);

    // Second arm segment (adjustable)
    const arm2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.025, 0.025),
      armMat
    );
    arm2.position.set(0.35, 0.05, 0);
    arm2.rotation.z = -Math.PI / 6;
    group.add(arm2);

    // Small shade
    const shadeMat = this.createShadeMaterial(params.shadeMaterial, '#f5f5dc');
    const shadeGeom = new THREE.ConeGeometry(0.06, 0.1, 32, 1, true);
    const shade = new THREE.Mesh(shadeGeom, shadeMat);
    shade.position.set(0.5, 0.05, 0);
    shade.rotation.z = -Math.PI / 3;
    group.add(shade);

    // Bulb
    const bulb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.025, 0.06, 16),
      new THREE.MeshBasicMaterial({
        color: this.kelvinToRGB(params.colorTemperature),
        emissive: this.kelvinToRGB(params.colorTemperature),
        emissiveIntensity: params.brightness,
      })
    );
    bulb.position.set(0.5, 0.02, 0);
    bulb.rotation.z = -Math.PI / 2;
    group.add(bulb);

    // Light
    const light = new THREE.SpotLight(
      this.kelvinToRGB(params.colorTemperature),
      params.brightness * 1.5,
      2,
      Math.PI / 3,
      0.5
    );
    light.position.copy(bulb.position);
    light.target.position.set(0.7, 0, 0);
    group.add(light);
    group.add(light.target);

    return group;
  }

  /**
   * Create novelty lamp
   */
  private createNoveltyLamp(type: string, params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    switch (type) {
      case 'lava':
        group.add(this.createLavaLamp(params));
        break;
      case 'salt':
        group.add(this.createSaltLamp(params));
        break;
      case 'fiber':
        group.add(this.createFiberOpticLamp(params));
        break;
      case 'neon':
        group.add(this.createNeonLamp(params));
        break;
      default:
        group.add(this.createLavaLamp(params));
    }
    
    return group;
  }

  /**
   * Create lava lamp
   */
  private createLavaLamp(params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    // Metal base
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.2,
    });
    
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.05, 32),
      baseMat
    );
    base.position.y = 0.025;
    group.add(base);

    // Glass bottle
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xaaccff,
      metalness: 0.0,
      roughness: 0.05,
      transmission: 0.95,
      transparent: true,
      opacity: 0.3,
    });
    
    const bottleGeom = new THREE.CylinderGeometry(0.08, 0.1, 0.35, 32, 1, true);
    const bottle = new THREE.Mesh(bottleGeom, glassMat);
    bottle.position.y = 0.2;
    group.add(bottle);

    // Lava blobs (animated in real implementation)
    const lavaMat = new THREE.MeshStandardMaterial({
      color: 0xff4500,
      emissive: 0xff4500,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8,
    });
    
    const blobPositions = [
      { y: 0.15, scale: 0.6 },
      { y: 0.22, scale: 0.8 },
      { y: 0.3, scale: 0.5 },
      { y: 0.38, scale: 0.7 },
    ];
    
    blobPositions.forEach(pos => {
      const blob = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 * pos.scale, 16, 16),
        lavaMat
      );
      blob.position.set(
        (Math.random() - 0.5) * 0.05,
        pos.y,
        (Math.random() - 0.5) * 0.05
      );
      group.add(blob);
    });

    // Top cap
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 32, 16, 0, Math.PI * 2, 0, Math.PI/2),
      baseMat
    );
    cap.position.y = 0.38;
    group.add(cap);

    // Internal light
    const light = new THREE.PointLight(
      0xff6600,
      params.brightness * 2,
      1
    );
    light.position.set(0, 0.2, 0);
    group.add(light);

    return group;
  }

  /**
   * Create salt lamp
   */
  private createSaltLamp(params: Required<SpecializedLampParams>): THREE.Group {
    const group = new THREE.Group();
    
    // Wooden base
    const baseMat = this.createBaseMaterial('wood');
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.04, 32),
      baseMat
    );
    base.position.y = 0.02;
    group.add(base);

    // Salt crystal (irregular shape)
    const saltMat = new THREE.MeshStandardMaterial({
      color: 0xffaa88,
      emissive: 0xff6644,
      emissiveIntensity: params.brightness * 0.6,
      roughness: 0.8,
      transparent: true,
      opacity: 0.9,
    });
    
    // Create irregular crystal using distorted sphere
    const saltGeom = new THREE.IcosahedronGeometry(0.12, 2);
    const positions = saltGeom.attributes.position.array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const distortion = 0.8 + Math.random() * 0.4;
      positions[i] = x * distortion;
      positions[i + 1] = y * distortion;
      positions[i + 2] = z * distortion;
    }
    
    saltGeom.computeVertexNormals();
    
    const saltCrystal = new THREE.Mesh(saltGeom, saltMat);
    saltCrystal.position.y = 0.15;
    group.add(saltCrystal);

    // Internal warm light
    const light = new THREE.PointLight(
      0xff8844,
      params.brightness * 1.5,
      0.8
    );
    light.position.set(0, 0.15, 0);
    group.add(light);

    return group;
  }

  /**
   * Create base material
   */
  private createBaseMaterial(type: string): THREE.Material {
    switch (type) {
      case 'wood':
        return new THREE.MeshStandardMaterial({
          color: 0x8b4513,
          roughness: 0.6,
          metalness: 0.0,
        });
      case 'metal':
        return new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          roughness: 0.2,
          metalness: 0.9,
        });
      case 'ceramic':
        return new THREE.MeshStandardMaterial({
          color: 0xf5f5dc,
          roughness: 0.3,
          metalness: 0.1,
        });
      case 'stone':
        return new THREE.MeshStandardMaterial({
          color: 0x888888,
          roughness: 0.5,
          metalness: 0.0,
        });
      case 'concrete':
        return new THREE.MeshStandardMaterial({
          color: 0x666666,
          roughness: 0.7,
          metalness: 0.0,
        });
      default:
        return new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          roughness: 0.3,
          metalness: 0.5,
        });
    }
  }

  /**
   * Create shade material
   */
  private createShadeMaterial(type: string, color: string): THREE.Material {
    switch (type) {
      case 'fabric':
        return new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.8,
          metalness: 0.0,
          side: THREE.DoubleSide,
        });
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: color,
          metalness: 0.0,
          roughness: 0.1,
          transmission: 0.7,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        });
      case 'metal':
        return new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.3,
          metalness: 0.8,
          side: THREE.DoubleSide,
        });
      case 'paper':
        return new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.9,
          metalness: 0.0,
          transparent: true,
          opacity: 0.8,
          side: THREE.DoubleSide,
        });
      case 'plastic':
        return new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.4,
          metalness: 0.1,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
        });
      default:
        return new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.5,
          metalness: 0.2,
          side: THREE.DoubleSide,
        });
    }
  }

  /**
   * Convert Kelvin temperature to RGB color
   */
  private kelvinToRGB(kelvin: number): number {
    // Simplified approximation
    const temp = kelvin / 100;
    let r, g, b;

    if (temp <= 66) {
      r = 255;
      g = temp;
      b = temp >= 19 ? 255 * (temp - 10) / 156 : 0;
    } else {
      r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
      b = 255;
    }

    return new THREE.Color(
      Math.min(255, Math.max(0, r)) / 255,
      Math.min(255, Math.max(0, g)) / 255,
      Math.min(255, Math.max(0, b)) / 255
    ).getHex();
  }
}

export default SpecializedLampsGenerator;
