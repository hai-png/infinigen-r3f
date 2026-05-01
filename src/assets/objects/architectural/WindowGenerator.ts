/**
 * Procedural Window Generator for Infinigen R3F
 * Generates various window types: casement, double-hung, bay, skylights
 * FIX: All geometries are now properly wrapped in Mesh with MeshStandardMaterial
 */

import { Group, Mesh, BoxGeometry, CylinderGeometry, MeshStandardMaterial, Color } from 'three';
import { SeededRandom } from '../../../core/util/math/index';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface WindowParams extends BaseGeneratorConfig {
  width: number;
  height: number;
  depth: number;
  type: 'casement' | 'double-hung' | 'sliding' | 'bay' | 'skylight' | 'arched';
  style: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'victorian';
  paneCount: number;
  hasShutters: boolean;
  frameMaterial: 'wood' | 'metal' | 'vinyl' | 'aluminum';
  glassType: 'clear' | 'frosted' | 'tinted' | 'stained';
  sillDepth: number;
}

export class WindowGenerator extends BaseObjectGenerator<WindowParams> {
  public getDefaultConfig(): WindowParams {
    return {
      width: 1.2 + this.rng.range(-0.3, 0.6),
      height: 1.5 + this.rng.range(-0.3, 0.8),
      depth: 0.15 + this.rng.range(0, 0.1),
      type: this.rng.choice(['casement', 'double-hung', 'sliding', 'bay', 'skylight', 'arched']),
      style: this.rng.choice(['modern', 'traditional', 'industrial', 'rustic', 'victorian']),
      paneCount: this.rng.int(2, 12),
      hasShutters: this.rng.boolean(0.4),
      frameMaterial: this.rng.choice(['wood', 'metal', 'vinyl', 'aluminum']),
      glassType: this.rng.choice(['clear', 'frosted', 'tinted', 'stained']),
      sillDepth: 0.1 + this.rng.range(0, 0.15),
    };
  }

  generate(params?: Partial<WindowParams>): Group {
    const finalParams = { ...this.getDefaultConfig(), ...params };
    return this.createWindow(finalParams);
  }

  private createWindow(params: WindowParams): Group {
    const group = new Group();

    // Create frame - all bars are proper Mesh objects
    const frame = this.createFrame(params);
    group.add(frame);

    // Create glass panes - all wrapped in Mesh
    const panes = this.createPanes(params);
    panes.forEach(pane => group.add(pane));

    // Add mullions/muntins - all wrapped in Mesh
    const mullions = this.createMullions(params);
    mullions.forEach(m => group.add(m));

    // Add shutters if specified
    if (params.hasShutters) {
      const shutters = this.createShutters(params);
      shutters.forEach(s => group.add(s));
    }

    // Add window sill
    const sill = this.createSill(params);
    group.add(sill);

    return group;
  }

  private createFrame(params: WindowParams): Group {
    const frameGroup = new Group();
    const frameColor = this.getFrameColor(params);
    const frameMaterial = new MeshStandardMaterial({
      color: frameColor,
      roughness: params.frameMaterial === 'metal' ? 0.3 : 0.7
    });

    const frameThickness = 0.08;

    // Top frame bar
    const topGeo = new BoxGeometry(params.width, frameThickness, params.depth);
    const topBar = new Mesh(topGeo, frameMaterial);
    topBar.position.set(0, params.height / 2 - frameThickness / 2, 0);
    topBar.castShadow = true;
    frameGroup.add(topBar);

    // Bottom frame bar
    const bottomGeo = new BoxGeometry(params.width, frameThickness, params.depth);
    const bottomBar = new Mesh(bottomGeo, frameMaterial);
    bottomBar.position.set(0, -params.height / 2 + frameThickness / 2, 0);
    bottomBar.castShadow = true;
    frameGroup.add(bottomBar);

    // Left frame bar
    const leftGeo = new BoxGeometry(frameThickness, params.height, params.depth);
    const leftBar = new Mesh(leftGeo, frameMaterial);
    leftBar.position.set(-params.width / 2 + frameThickness / 2, 0, 0);
    leftBar.castShadow = true;
    frameGroup.add(leftBar);

    // Right frame bar
    const rightGeo = new BoxGeometry(frameThickness, params.height, params.depth);
    const rightBar = new Mesh(rightGeo, frameMaterial);
    rightBar.position.set(params.width / 2 - frameThickness / 2, 0, 0);
    rightBar.castShadow = true;
    frameGroup.add(rightBar);

    return frameGroup;
  }

  private createPanes(params: WindowParams): Mesh[] {
    const panes: Mesh[] = [];
    const glassMaterial = this.getGlassMaterial(params);

    const paneWidth = params.width / Math.sqrt(params.paneCount);
    const paneHeight = params.height / Math.sqrt(params.paneCount);

    const rows = Math.ceil(Math.sqrt(params.paneCount));
    const cols = Math.ceil(params.paneCount / rows);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols && panes.length < params.paneCount; col++) {
        const x = (col - (cols - 1) / 2) * paneWidth;
        const y = (row - (rows - 1) / 2) * paneHeight;

        const paneGeo = new BoxGeometry(paneWidth * 0.9, paneHeight * 0.9, 0.01);
        const pane = new Mesh(paneGeo, glassMaterial);
        pane.position.set(x, y, 0);
        pane.name = `pane_${panes.length}`;
        panes.push(pane);
      }
    }

    return panes;
  }

  private createMullions(params: WindowParams): Mesh[] {
    const mullions: Mesh[] = [];
    const mullionMaterial = new MeshStandardMaterial({
      color: this.getFrameColor(params),
      roughness: 0.5
    });

    // Vertical mullions
    const vCount = Math.floor(Math.sqrt(params.paneCount)) - 1;
    for (let i = 0; i < vCount; i++) {
      const x = ((i + 1) / (vCount + 1)) * params.width - params.width / 2;
      const mullionGeo = new BoxGeometry(0.03, params.height, 0.02);
      const mullion = new Mesh(mullionGeo, mullionMaterial);
      mullion.position.set(x, 0, 0);
      mullion.castShadow = true;
      mullions.push(mullion);
    }

    // Horizontal mullions
    const hCount = Math.floor(params.paneCount / (vCount + 1)) - 1;
    for (let i = 0; i < hCount; i++) {
      const y = ((i + 1) / (hCount + 1)) * params.height - params.height / 2;
      const mullionGeo = new BoxGeometry(params.width, 0.03, 0.02);
      const mullion = new Mesh(mullionGeo, mullionMaterial);
      mullion.position.set(0, y, 0);
      mullion.castShadow = true;
      mullions.push(mullion);
    }

    return mullions;
  }

  private createShutters(params: WindowParams): Group[] {
    const shutters: Group[] = [];
    const shutterColor = this.getShutterColor(params);
    const shutterMaterial = new MeshStandardMaterial({
      color: shutterColor,
      roughness: 0.6
    });

    for (const side of [-1, 1]) {
      const shutterGroup = new Group();
      const shutterWidth = params.width * 0.35;

      // Main shutter panel
      const panelGeo = new BoxGeometry(shutterWidth, params.height, 0.04);
      const panel = new Mesh(panelGeo, shutterMaterial);
      panel.castShadow = true;
      shutterGroup.add(panel);

      // Horizontal slats
      const slatCount = 5;
      for (let i = 0; i < slatCount; i++) {
        const y = ((i + 0.5) / slatCount - 0.5) * params.height;
        const slatGeo = new BoxGeometry(shutterWidth * 0.85, 0.03, 0.05);
        const slat = new Mesh(slatGeo, shutterMaterial);
        slat.position.y = y;
        slat.position.z = 0.025;
        shutterGroup.add(slat);
      }

      shutterGroup.position.set(side * (params.width / 2 + shutterWidth / 2 + 0.02), 0, 0);
      shutters.push(shutterGroup);
    }

    return shutters;
  }

  private createSill(params: WindowParams): Mesh {
    const sillMaterial = new MeshStandardMaterial({
      color: this.getFrameColor(params),
      roughness: 0.7
    });

    const sillGeo = new BoxGeometry(params.width + 0.2, 0.05, params.sillDepth);
    const sill = new Mesh(sillGeo, sillMaterial);
    sill.position.set(0, -params.height / 2 - 0.025, params.sillDepth / 2 - params.depth / 2);
    sill.castShadow = true;
    sill.receiveShadow = true;
    sill.name = 'sill';
    return sill;
  }

  private getGlassMaterial(params: WindowParams): MeshStandardMaterial {
    let color = 0x88ccff;
    let opacity = 0.3;
    let roughness = 0.1;

    switch (params.glassType) {
      case 'frosted': color = 0xcccccc; opacity = 0.5; roughness = 0.4; break;
      case 'tinted': color = 0x6688aa; opacity = 0.4; break;
      case 'stained': color = 0xaa6688; opacity = 0.6; break;
    }

    return new MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      roughness,
      metalness: 0.1
    });
  }

  private getFrameColor(params: WindowParams): Color {
    switch (params.frameMaterial) {
      case 'wood': return new Color(0x4a3728);
      case 'metal': return new Color(0x333333);
      case 'vinyl': return new Color(0xffffff);
      case 'aluminum': return new Color(0xaaaaaa);
      default: return new Color(0x4a3728);
    }
  }

  private getShutterColor(params: WindowParams): Color {
    const colors = [0x2d5016, 0x1a1a1a, 0x4a3728, 0x8b0000, 0x003366];
    return new Color(this.rng.choice(colors));
  }

  validateParams(params: WindowParams): boolean {
    return (
      params.width > 0.5 && params.width < 4.0 &&
      params.height > 0.5 && params.height < 3.5 &&
      params.paneCount >= 1 && params.paneCount <= 24
    );
  }
}
