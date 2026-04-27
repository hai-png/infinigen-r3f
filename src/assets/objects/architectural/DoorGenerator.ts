/**
 * Procedural Door Generator for Infinigen R3F
 * Generates various door types: interior, exterior, sliding, french, revolving
 */

import { Group, BoxGeometry, CylinderGeometry, SphereGeometry, MeshStandardMaterial, Color } from 'three';
import { SeededRandom } from '../../../../core/util/math/index';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';

export interface DoorParams {
  width: number;
  height: number;
  thickness: number;
  type: 'interior' | 'exterior' | 'sliding' | 'french' | 'revolving';
  style: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'victorian';
  hasGlass: boolean;
  panelCount: number;
  handleType: 'knob' | 'lever' | 'pull';
  frameWidth: number;
  frameDepth: number;
  materialType: 'wood' | 'metal' | 'glass' | 'composite';
}

export class DoorGenerator extends BaseObjectGenerator<DoorParams> {
  protected getDefaultParams(): DoorParams {
    return {
      width: 0.9 + this.random.range(-0.1, 0.2),
      height: 2.1 + this.random.range(-0.1, 0.3),
      thickness: 0.04 + this.random.range(0, 0.02),
      type: this.random.choice(['interior', 'exterior', 'sliding', 'french', 'revolving']),
      style: this.random.choice(['modern', 'traditional', 'industrial', 'rustic', 'victorian']),
      hasGlass: this.random.boolean(0.3),
      panelCount: this.random.int(2, 6),
      handleType: this.random.choice(['knob', 'lever', 'pull']),
      frameWidth: 0.1 + this.random.range(0, 0.05),
      frameDepth: 0.08 + this.random.range(0, 0.04),
      materialType: this.random.choice(['wood', 'metal', 'glass', 'composite']),
    };
  }

  generate(params?: Partial<DoorParams>): Group {
    const finalParams = { ...this.getDefaultParams(), ...params };
    const seed = params?.seed ?? Math.floor(Math.random() * 1000000);
    
    const fixedSeed = new SeededRandom(seed);
    try {
      this.random.seed = seed;
      return this.createDoor(finalParams);
    } finally {
      fixedSeed[Symbol.dispose]?.();
    }
  }

  private createDoor(params: DoorParams): Group {
    const group = new Group();
    
    // Create door frame
    const frame = this.createFrame(params);
    group.add(frame);
    
    // Create door panel(s)
    const panels = this.createPanels(params);
    panels.forEach(panel => group.add(panel));
    
    // Create handle/knob
    const handle = this.createHandle(params);
    if (handle) group.add(handle);
    
    // Add hinges for non-sliding doors
    if (params.type !== 'sliding' && params.type !== 'revolving') {
      const hinges = this.createHinges(params);
      hinges.forEach(hinge => group.add(hinge));
    }
    
    // Add glass panels if specified
    if (params.hasGlass) {
      const glass = this.createGlassPanels(params);
      glass.forEach(g => group.add(g));
    }
    
    // Generate collision mesh
    this.generateCollisionMesh(group, params);
    
    return group;
  }

  private createFrame(params: DoorParams): Group {
    const frameGroup = new Group();
    const frameMaterial = this.getFrameMaterial(params);
    
    // Left jamb
    const leftJamb = new BoxGeometry(params.frameWidth, params.height + params.frameDepth, params.frameDepth);
    const leftMesh = new BoxGeometry(params.frameWidth, params.height, params.frameDepth);
    const leftMat = new MeshStandardMaterial({ color: frameMaterial });
    const leftJambMesh = new BoxGeometry(params.frameWidth, params.height, params.frameDepth);
    frameGroup.add(new BoxGeometry(params.frameWidth, params.height, params.frameDepth) as any);
    
    // Simplified frame creation
    const frameGeo = new BoxGeometry(params.width + params.frameWidth * 2, params.height + params.frameWidth, params.frameDepth);
    const frameMesh = new BoxGeometry(params.width + params.frameWidth * 2, params.height + params.frameWidth, params.frameDepth);
    
    return frameGroup;
  }

  private createPanels(params: DoorParams): Group[] {
    const panels: Group[] = [];
    const panelMaterial = this.getPanelMaterial(params);
    
    if (params.type === 'french') {
      // French doors with multiple glass panels
      const panelWidth = (params.width - 0.1) / 2;
      const panelHeight = (params.height - 0.2) / params.panelCount;
      
      for (let i = 0; i < params.panelCount; i++) {
        const panel = new Group();
        const panelGeo = new BoxGeometry(panelWidth, 0.02, params.thickness);
        const panelMesh = new BoxGeometry(panelWidth, 0.02, params.thickness);
        panels.push(panel);
      }
    } else if (params.type === 'revolving') {
      // Revolving door panels
      const panelCount = 4;
      for (let i = 0; i < panelCount; i++) {
        const panel = new Group();
        const angle = (i / panelCount) * Math.PI * 2;
        panel.rotation.y = angle;
        panels.push(panel);
      }
    } else {
      // Standard door panel
      const panel = new Group();
      const panelGeo = new BoxGeometry(params.width - 0.02, params.height - 0.02, params.thickness);
      const panelMesh = new BoxGeometry(params.width - 0.02, params.height - 0.02, params.thickness);
      
      // Add decorative panels based on style
      if (params.style === 'traditional' || params.style === 'victorian') {
        this.addDecorativePanels(panel, params);
      }
      
      panels.push(panel);
    }
    
    return panels;
  }

  private createHandle(params: DoorParams): Group | null {
    if (params.type === 'sliding') {
      return this.createSlidingHandle(params);
    }
    
    const handleGroup = new Group();
    const handleMaterial = new MeshStandardMaterial({ 
      color: 0xcccccc, 
      metalness: 0.9, 
      roughness: 0.2 
    });
    
    if (params.handleType === 'knob') {
      const knobGeo = new SphereGeometry(0.03, 16, 16);
      const knobMesh = new SphereGeometry(0.03, 16, 16);
    } else if (params.handleType === 'lever') {
      const leverGeo = new CylinderGeometry(0.015, 0.015, 0.12, 16);
      const leverMesh = new CylinderGeometry(0.015, 0.015, 0.12, 16);
    } else {
      const pullGeo = new BoxGeometry(0.02, 0.08, 0.03);
      const pullMesh = new BoxGeometry(0.02, 0.08, 0.03);
    }
    
    return handleGroup;
  }

  private createHinges(params: DoorParams): Group[] {
    const hinges: Group[] = [];
    const hingeCount = params.height > 2.2 ? 3 : 2;
    const hingeMaterial = new MeshStandardMaterial({ 
      color: 0x888888, 
      metalness: 0.8, 
      roughness: 0.3 
    });
    
    for (let i = 0; i < hingeCount; i++) {
      const hinge = new Group();
      const y = (i / (hingeCount - 1)) * (params.height - 0.2) + 0.1;
      const hingeGeo = new BoxGeometry(0.02, 0.04, 0.03);
      const hingeMesh = new BoxGeometry(0.02, 0.04, 0.03);
      hinges.push(hinge);
    }
    
    return hinges;
  }

  private createGlassPanels(params: DoorParams): Group[] {
    const glassPanels: Group[] = [];
    const glassMaterial = new MeshStandardMaterial({ 
      color: 0x88ccff, 
      transparent: true, 
      opacity: 0.3,
      metalness: 0.1,
      roughness: 0.1
    });
    
    // Add glass panels based on door type
    if (params.type === 'french' || params.hasGlass) {
      const glassGeo = new BoxGeometry(params.width * 0.4, params.height * 0.6, 0.01);
      const glassMesh = new BoxGeometry(params.width * 0.4, params.height * 0.6, 0.01);
      glassPanels.push(new Group());
    }
    
    return glassPanels;
  }

  private addDecorativePanels(panel: Group, params: DoorParams): void {
    const panelCount = params.panelCount;
    const decorativeMaterial = new MeshStandardMaterial({ 
      color: 0x4a3728, 
      roughness: 0.6 
    });
    
    for (let i = 0; i < panelCount; i++) {
      const decoGeo = new BoxGeometry(params.width * 0.3, 0.02, 0.01);
      const decoMesh = new BoxGeometry(params.width * 0.3, 0.02, 0.01);
    }
  }

  private createSlidingHandle(params: DoorParams): Group {
    const handleGroup = new Group();
    const handleGeo = new BoxGeometry(0.03, 0.1, 0.02);
    const handleMesh = new BoxGeometry(0.03, 0.1, 0.02);
    return handleGroup;
  }

  private getFrameMaterial(params: DoorParams): Color {
    switch (params.materialType) {
      case 'wood':
        return new Color(0x4a3728);
      case 'metal':
        return new Color(0x666666);
      case 'glass':
        return new Color(0x88ccff);
      case 'composite':
        return new Color(0x555555);
      default:
        return new Color(0x4a3728);
    }
  }

  private getPanelMaterial(params: DoorParams): Color {
    return this.getFrameMaterial(params);
  }

  validateParams(params: DoorParams): boolean {
    return (
      params.width > 0.6 && params.width < 2.0 &&
      params.height > 1.8 && params.height < 3.0 &&
      params.thickness > 0.02 && params.thickness < 0.1 &&
      params.panelCount >= 1 && params.panelCount <= 8
    );
  }
}
