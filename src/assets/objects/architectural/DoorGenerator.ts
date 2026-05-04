/**
 * Procedural Door Generator for Infinigen R3F
 * FIX: All geometries are now properly wrapped in Mesh with MeshStandardMaterial
 *
 * @deprecated Use `articulated/DoorGenerator` instead, which extends ArticulatedObjectBase
 *           and provides joint metadata + MJCF/URDF export. This architectural version
 *           will be removed in a future release.
 */

import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, MeshStandardMaterial, Color } from 'three';
import { SeededRandom } from '../../../core/util/math/index';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface DoorParams extends BaseGeneratorConfig {
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

/**
 * @deprecated Use `import { DoorGenerator } from '../articulated/DoorGenerator'` instead.
 *           The articulated version includes physics joint definitions and MJCF export.
 */
export class DoorGenerator extends BaseObjectGenerator<DoorParams> {
  public getDefaultConfig(): DoorParams {
    return {
      width: 0.9 + this.rng.range(-0.1, 0.2),
      height: 2.1 + this.rng.range(-0.1, 0.3),
      thickness: 0.04 + this.rng.range(0, 0.02),
      type: this.rng.choice(['interior', 'exterior', 'sliding', 'french', 'revolving']),
      style: this.rng.choice(['modern', 'traditional', 'industrial', 'rustic', 'victorian']),
      hasGlass: this.rng.boolean(0.3),
      panelCount: this.rng.int(2, 6),
      handleType: this.rng.choice(['knob', 'lever', 'pull']),
      frameWidth: 0.1 + this.rng.range(0, 0.05),
      frameDepth: 0.08 + this.rng.range(0, 0.04),
      materialType: this.rng.choice(['wood', 'metal', 'glass', 'composite']),
    };
  }

  generate(params?: Partial<DoorParams>): Group {
    const finalParams = { ...this.getDefaultConfig(), ...params };
    return this.createDoor(finalParams);
  }

  private createDoor(params: DoorParams): Group {
    const group = new Group();

    // Create door frame - proper Mesh objects
    const frame = this.createFrame(params);
    group.add(frame);

    // Create door panel(s) - proper Mesh objects
    const panels = this.createPanels(params);
    panels.forEach(panel => group.add(panel));

    // Create handle/knob - proper Mesh objects
    const handle = this.createHandle(params);
    if (handle) group.add(handle);

    // Add hinges - proper Mesh objects
    if (params.type !== 'sliding' && params.type !== 'revolving') {
      const hinges = this.createHinges(params);
      hinges.forEach(hinge => group.add(hinge));
    }

    // Add glass panels if specified - proper Mesh objects
    if (params.hasGlass) {
      const glass = this.createGlassPanels(params);
      glass.forEach(g => group.add(g));
    }

    return group;
  }

  private createFrame(params: DoorParams): Group {
    const frameGroup = new Group();
    const frameColor = this.getFrameColor(params);
    const frameMaterial = new MeshStandardMaterial({ color: frameColor, roughness: 0.6 });

    // Left jamb
    const leftJambGeo = new BoxGeometry(params.frameWidth, params.height + params.frameWidth, params.frameDepth);
    const leftJamb = new Mesh(leftJambGeo, frameMaterial);
    leftJamb.position.set(-params.width / 2 - params.frameWidth / 2, (params.height + params.frameWidth) / 2, 0);
    leftJamb.castShadow = true;
    leftJamb.name = 'leftJamb';
    frameGroup.add(leftJamb);

    // Right jamb
    const rightJambGeo = new BoxGeometry(params.frameWidth, params.height + params.frameWidth, params.frameDepth);
    const rightJamb = new Mesh(rightJambGeo, frameMaterial);
    rightJamb.position.set(params.width / 2 + params.frameWidth / 2, (params.height + params.frameWidth) / 2, 0);
    rightJamb.castShadow = true;
    rightJamb.name = 'rightJamb';
    frameGroup.add(rightJamb);

    // Top header
    const headerGeo = new BoxGeometry(params.width + params.frameWidth * 2, params.frameWidth, params.frameDepth);
    const header = new Mesh(headerGeo, frameMaterial);
    header.position.set(0, params.height + params.frameWidth / 2, 0);
    header.castShadow = true;
    header.name = 'header';
    frameGroup.add(header);

    return frameGroup;
  }

  private createPanels(params: DoorParams): Mesh[] {
    const panels: Mesh[] = [];
    const panelColor = this.getFrameColor(params);
    const panelMaterial = new MeshStandardMaterial({ color: panelColor, roughness: 0.65 });

    if (params.type === 'french') {
      // French doors - two narrow panels
      const panelWidth = (params.width - 0.1) / 2;
      for (const side of [-1, 1]) {
        const panelGeo = new BoxGeometry(panelWidth, params.height - 0.02, params.thickness);
        const panel = new Mesh(panelGeo, panelMaterial);
        panel.position.set(side * (panelWidth / 2 + 0.025), params.height / 2, 0);
        panel.castShadow = true;
        panel.name = `panel_${side === -1 ? 'left' : 'right'}`;
        panels.push(panel);

        // Decorative panels
        this.addDecorativePanels(panel, params, panelWidth);
      }
    } else if (params.type === 'revolving') {
      // Revolving door panels - 4 panels around center
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const panelWidth = params.width * 0.4;
        const panelGeo = new BoxGeometry(panelWidth, params.height - 0.02, params.thickness);
        const panel = new Mesh(panelGeo, panelMaterial);
        panel.position.set(0, params.height / 2, 0);
        panel.rotation.y = angle;
        panel.castShadow = true;
        panel.name = `revolving_panel_${i}`;
        panels.push(panel);
      }
      // Center pivot
      const pivotGeo = new CylinderGeometry(0.03, 0.03, params.height, 16);
      const pivotMat = new MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 });
      const pivot = new Mesh(pivotGeo, pivotMat);
      pivot.position.set(0, params.height / 2, 0);
      pivot.name = 'pivot';
      panels.push(pivot);
    } else {
      // Standard door panel
      const panelGeo = new BoxGeometry(params.width - 0.02, params.height - 0.02, params.thickness);
      const panel = new Mesh(panelGeo, panelMaterial);
      panel.position.set(0, params.height / 2, 0);
      panel.castShadow = true;
      panel.name = 'doorPanel';
      panels.push(panel);

      // Decorative panels
      if (params.style === 'traditional' || params.style === 'victorian') {
        this.addDecorativePanels(panel, params, params.width - 0.02);
      }
    }

    return panels;
  }

  private addDecorativePanels(parent: Mesh, params: DoorParams, panelWidth: number): void {
    const decorativeMaterial = new MeshStandardMaterial({
      color: 0x3a2a1a,
      roughness: 0.6
    });

    const rows = params.panelCount;
    const panelHeight = (params.height - 0.2) / (rows * 2 - 1);

    for (let i = 0; i < rows; i++) {
      const y = (i * 2 + 1) * panelHeight;
      const decoGeo = new BoxGeometry(panelWidth * 0.7, panelHeight * 0.8, 0.01);
      const deco = new Mesh(decoGeo, decorativeMaterial);
      deco.position.set(0, y - params.height / 2 + 0.1, params.thickness / 2 + 0.005);
      deco.name = `deco_panel_${i}`;
      parent.add(deco);
    }
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
      const knob = new Mesh(knobGeo, handleMaterial);
      knob.position.set(params.width / 2 - 0.08, params.height * 0.52, params.thickness / 2 + 0.03);
      knob.name = 'knob';
      handleGroup.add(knob);

      // Rose plate
      const roseGeo = new CylinderGeometry(0.025, 0.025, 0.01, 16);
      const rose = new Mesh(roseGeo, handleMaterial);
      rose.position.set(params.width / 2 - 0.08, params.height * 0.52, params.thickness / 2 + 0.005);
      rose.rotation.x = Math.PI / 2;
      rose.name = 'rose';
      handleGroup.add(rose);
    } else if (params.handleType === 'lever') {
      const leverGeo = new CylinderGeometry(0.012, 0.012, 0.12, 16);
      const lever = new Mesh(leverGeo, handleMaterial);
      lever.position.set(params.width / 2 - 0.06, params.height * 0.52, params.thickness / 2 + 0.06);
      lever.rotation.z = Math.PI / 2;
      lever.name = 'lever';
      handleGroup.add(lever);

      // Backplate
      const backplateGeo = new BoxGeometry(0.05, 0.15, 0.01);
      const backplate = new Mesh(backplateGeo, handleMaterial);
      backplate.position.set(params.width / 2 - 0.06, params.height * 0.52, params.thickness / 2 + 0.005);
      backplate.name = 'backplate';
      handleGroup.add(backplate);
    } else {
      // Pull handle
      const pullGeo = new BoxGeometry(0.02, 0.12, 0.03);
      const pull = new Mesh(pullGeo, handleMaterial);
      pull.position.set(params.width / 2 - 0.05, params.height * 0.52, params.thickness / 2 + 0.015);
      pull.name = 'pull';
      handleGroup.add(pull);
    }

    return handleGroup;
  }

  private createHinges(params: DoorParams): Mesh[] {
    const hinges: Mesh[] = [];
    const hingeCount = params.height > 2.2 ? 3 : 2;
    const hingeMaterial = new MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.3
    });

    for (let i = 0; i < hingeCount; i++) {
      const y = (i / (hingeCount - 1)) * (params.height - 0.2) + 0.1;
      const hingeGeo = new BoxGeometry(0.02, 0.06, 0.03);
      const hinge = new Mesh(hingeGeo, hingeMaterial);
      hinge.position.set(-params.width / 2 + 0.01, y, 0);
      hinge.castShadow = true;
      hinge.name = `hinge_${i}`;
      hinges.push(hinge);
    }

    return hinges;
  }

  private createGlassPanels(params: DoorParams): Mesh[] {
    const glassPanels: Mesh[] = [];
    const glassMaterial = new MeshStandardMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.3,
      metalness: 0.1,
      roughness: 0.1
    });

    if (params.type === 'french' || params.hasGlass) {
      const glassWidth = params.width * (params.type === 'french' ? 0.35 : 0.7);
      const glassHeight = params.height * 0.5;
      const glassGeo = new BoxGeometry(glassWidth, glassHeight, 0.01);
      const glass = new Mesh(glassGeo, glassMaterial);
      glass.position.set(0, params.height * 0.45, params.thickness / 2 + 0.005);
      glass.name = 'glass';
      glassPanels.push(glass);
    }

    return glassPanels;
  }

  private createSlidingHandle(params: DoorParams): Group {
    const handleGroup = new Group();
    const handleMaterial = new MeshStandardMaterial({
      color: 0xaaaaaa,
      metalness: 0.8,
      roughness: 0.3
    });
    const handleGeo = new BoxGeometry(0.03, 0.1, 0.02);
    const handle = new Mesh(handleGeo, handleMaterial);
    handle.position.set(params.width / 2 - 0.05, params.height * 0.52, params.thickness / 2 + 0.01);
    handle.name = 'slidingHandle';
    handleGroup.add(handle);

    // Track
    const trackGeo = new BoxGeometry(params.width * 1.5, 0.03, 0.03);
    const track = new Mesh(trackGeo, handleMaterial);
    track.position.set(0, params.height + 0.015, 0);
    track.name = 'track';
    handleGroup.add(track);

    return handleGroup;
  }

  private getFrameColor(params: DoorParams): Color {
    switch (params.materialType) {
      case 'wood': return new Color(0x4a3728);
      case 'metal': return new Color(0x666666);
      case 'glass': return new Color(0x88ccff);
      case 'composite': return new Color(0x555555);
      default: return new Color(0x4a3728);
    }
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
