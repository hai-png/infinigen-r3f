/**
 * LaundryAppliances - Procedural generation of laundry appliances
 * 
 * Generates: Washing Machines, Dryers, Washer-Dryer Combos
 * Each with multiple variations, parametric controls, and style options
 */

import { Group, BoxGeometry, CylinderGeometry, TorusGeometry, Mesh, CircleGeometry } from 'three';
import { ApplianceBase, ApplianceParams } from './ApplianceBase';

export interface LaundryApplianceParams extends ApplianceParams {
  applianceType: 'washer' | 'dryer' | 'combo';
  capacity?: 'compact' | 'standard' | 'large';
  loadType?: 'front' | 'top';
  hasSteam?: boolean;
  hasSmartControls?: boolean;
  drumSize?: number;
}

export class LaundryAppliances extends ApplianceBase<LaundryApplianceParams> {
  public getDefaultConfig(): LaundryApplianceParams {
    return {
      ...super.getDefaultConfig(),
      applianceType: 'washer',
      capacity: 'standard',
      loadType: 'front',
      hasSteam: false,
      hasSmartControls: false,
      drumSize: 0.35,
    };
  }

  constructor() {
    super();
  }

  public generate(params: Partial<LaundryApplianceParams> = {}): Group {
    const finalParams = this.validateAndMergeParams(params) as LaundryApplianceParams;
    const group = new Group();

    switch (finalParams.applianceType) {
      case 'washer':
        group.add(this.generateWasher(finalParams));
        break;
      case 'dryer':
        group.add(this.generateDryer(finalParams));
        break;
      case 'combo':
        group.add(this.generateCombo(finalParams));
        break;
    }

    return group;
  }

  private generateWasher(params: LaundryApplianceParams): Group {
    const group = new Group();
    
    const width = params.capacity === 'compact' ? 0.5 : params.capacity === 'large' ? 0.7 : 0.6;
    const height = params.loadType === 'top' ? 1.0 : 0.85;
    const depth = 0.6;

    // Main cabinet
    const bodyGroup = this.generateMainBody({ ...params, width, height, depth });
    group.add(bodyGroup);

    if (params.loadType === 'front') {
      // Front-loading washer
      const doorGroup = this.createFrontLoadDoor(params, width, height);
      doorGroup.position.set(0, 0, depth / 2 + 0.02);
      group.add(doorGroup);

      // Control panel at top front
      const controlPanel = this.createWasherControls(params, width);
      controlPanel.position.set(0, height * 0.4, depth / 2 + 0.02);
      group.add(controlPanel);

      // Detergent drawer
      const detergentDrawer = this.createDetergentDrawer(params, width);
      detergentDrawer.position.set(-width * 0.25, height * 0.35, depth / 2 + 0.01);
      group.add(detergentDrawer);
    } else {
      // Top-loading washer
      const lid = this.createTopLid(params, width, depth);
      lid.position.set(0, height / 2, 0);
      group.add(lid);

      // Control panel at back
      const controlPanel = this.createTopLoadControls(params, width);
      controlPanel.position.set(0, height / 2 + 0.15, -depth / 2);
      group.add(controlPanel);

      // Visible drum interior
      const drumInterior = this.createDrumInterior(params.drumSize || 0.35);
      drumInterior.position.set(0, height / 2 - 0.1, 0);
      group.add(drumInterior);
    }

    // Feet
    this.addApplianceFeet(group, width, depth);

    return group;
  }

  private generateDryer(params: LaundryApplianceParams): Group {
    const group = new Group();
    
    const width = params.capacity === 'compact' ? 0.5 : params.capacity === 'large' ? 0.7 : 0.6;
    const height = 0.85;
    const depth = 0.65;

    // Main cabinet
    const bodyGroup = this.generateMainBody({ ...params, width, height, depth });
    group.add(bodyGroup);

    // Front door with window
    const doorGroup = this.createDryerDoor(params, width, height);
    doorGroup.position.set(0, 0, depth / 2 + 0.02);
    group.add(doorGroup);

    // Control panel
    const controlPanel = this.createDryerControls(params, width);
    controlPanel.position.set(0, height * 0.4, depth / 2 + 0.02);
    group.add(controlPanel);

    // Lint trap indicator
    if (params.style === 'modern') {
      const lintIndicator = this.createLintIndicator();
      lintIndicator.position.set(width * 0.3, height * 0.35, depth / 2 + 0.015);
      group.add(lintIndicator);
    }

    // Vent connection at back
    if (params.style !== 'minimal') {
      const ventConnection = this.createVentConnection();
      ventConnection.position.set(0, height * 0.3, -depth / 2);
      group.add(ventConnection);
    }

    // Feet
    this.addApplianceFeet(group, width, depth);

    return group;
  }

  private generateCombo(params: LaundryApplianceParams): Group {
    const group = new Group();
    
    const width = 0.6;
    const height = 1.7; // Stacked unit
    const depth = 0.65;

    // Main cabinet (tall for stacked)
    const bodyGroup = this.generateMainBody({ ...params, width, height, depth });
    group.add(bodyGroup);

    // Bottom washer section
    const washerSection = this.createWasherSection(params, width, height * 0.5);
    washerSection.position.y = -height * 0.25;
    group.add(washerSection);

    // Top dryer section
    const dryerSection = this.createDryerSection(params, width, height * 0.5);
    dryerSection.position.y = height * 0.25;
    group.add(dryerSection);

    // Divider between units
    const divider = this.createDivider(width);
    divider.position.y = 0;
    group.add(divider);

    // Feet
    this.addApplianceFeet(group, width, depth);

    return group;
  }

  private createFrontLoadDoor(params: LaundryApplianceParams, width: number, height: number): Group {
    const group = new Group();
    
    const doorFrameGeo = new BoxGeometry(width * 0.95, height * 0.7, 0.05);
    const doorFrameMat = this.getFinishMaterial(params.finish);
    const doorFrame = new Mesh(doorFrameGeo, doorFrameMat);
    group.add(doorFrame);

    // Circular door window
    const windowRadius = Math.min(width, height) * 0.3;
    const windowGeo = new CircleGeometry(windowRadius, 32);
    const windowMat = this.createPBRMaterial({
      color: 0x111111,
      metalness: 0.9,
      roughness: 0.05,
      transparent: true,
      opacity: 0.7,
    });
    const window = new Mesh(windowGeo, windowMat);
    window.position.z = 0.03;
    group.add(window);

    // Door handle (circular grip)
    const handleGeo = new TorusGeometry(windowRadius * 0.7, 0.015, 16, 32);
    const handleMat = this.getHandleMaterial('stainless');
    const handle = new Mesh(handleGeo, handleMat);
    handle.position.z = 0.05;
    group.add(handle);

    // Door hinge details
    if (params.style !== 'minimal') {
      const hingeGeo = new CylinderGeometry(0.02, 0.02, 0.03, 8);
      const hingeMat = this.getHandleMaterial('stainless');
      
      [-1, 1].forEach(side => {
        const hinge = new Mesh(hingeGeo, hingeMat);
        hinge.rotation.z = Math.PI / 2;
        hinge.position.set(side * width * 0.45, 0, -0.03);
        group.add(hinge);
      });
    }

    return group;
  }

  private createDryerDoor(params: LaundryApplianceParams, width: number, height: number): Group {
    const group = new Group();
    
    // Similar to washer but with larger window
    const doorFrameGeo = new BoxGeometry(width * 0.95, height * 0.75, 0.05);
    const doorFrameMat = this.getFinishMaterial(params.finish);
    const doorFrame = new Mesh(doorFrameGeo, doorFrameMat);
    group.add(doorFrame);

    // Larger window for dryer
    const windowRadius = Math.min(width, height) * 0.35;
    const windowGeo = new CircleGeometry(windowRadius, 32);
    const windowMat = this.createPBRMaterial({
      color: 0x0a0a0a,
      metalness: 0.9,
      roughness: 0.05,
      transparent: true,
      opacity: 0.6,
    });
    const window = new Mesh(windowGeo, windowMat);
    window.position.z = 0.03;
    group.add(window);

    // Handle
    const handleGeo = new TorusGeometry(windowRadius * 0.75, 0.018, 16, 32);
    const handleMat = this.getHandleMaterial('stainless');
    const handle = new Mesh(handleGeo, handleMat);
    handle.position.z = 0.05;
    group.add(handle);

    return group;
  }

  private createTopLid(params: LaundryApplianceParams, width: number, depth: number): Group {
    const group = new Group();
    
    const lidGeo = new BoxGeometry(width * 0.95, 0.03, depth * 0.8);
    const lidMat = this.getFinishMaterial(params.finish);
    const lid = new Mesh(lidGeo, lidMat);
    group.add(lid);

    // Lid handle
    const handleGeo = new BoxGeometry(width * 0.3, 0.02, 0.05);
    const handleMat = this.getHandleMaterial(params.finish);
    const handle = new Mesh(handleGeo, handleMat);
    handle.position.set(0, 0.025, -depth * 0.3);
    group.add(handle);

    // Hinge at back
    const hingeGeo = new CylinderGeometry(0.02, 0.02, width * 0.8, 16);
    const hingeMat = this.getHandleMaterial('stainless');
    const hinge = new Mesh(hingeGeo, hingeMat);
    hinge.rotation.x = Math.PI / 2;
    hinge.position.set(0, 0, -depth * 0.4);
    group.add(hinge);

    return group;
  }

  private createDrumInterior(radius: number): Group {
    const group = new Group();
    
    // Drum cylinder
    const drumGeo = new CylinderGeometry(radius, radius, 0.3, 32, 1, true);
    const drumMat = this.createPBRMaterial({
      color: 0x888888,
      metalness: 0.95,
      roughness: 0.2,
      side: 2, // BackSide
    });
    const drum = new Mesh(drumGeo, drumMat);
    drum.rotation.x = Math.PI / 2;
    group.add(drum);

    // Drum paddles/baffles
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const paddleGeo = new BoxGeometry(0.02, 0.05, 0.2);
      const paddleMat = this.createPBRMaterial({ color: 0x666666, metalness: 0.8, roughness: 0.3 });
      const paddle = new Mesh(paddleGeo, paddleMat);
      paddle.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      paddle.rotation.z = angle;
      group.add(paddle);
    }

    return group;
  }

  private createWasherControls(params: LaundryApplianceParams, width: number): Group {
    const group = new Group();
    
    const panelGeo = new BoxGeometry(width * 0.9, 0.08, 0.03);
    const panelMat = this.createPBRMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.3 });
    const panel = new Mesh(panelGeo, panelMat);
    group.add(panel);

    // Dial/knob
    const dialGeo = new CylinderGeometry(0.04, 0.04, 0.02, 32);
    const dialMat = this.getHandleMaterial('stainless');
    const dial = new Mesh(dialGeo, dialMat);
    dial.position.x = -width * 0.25;
    dial.position.z = 0.02;
    group.add(dial);

    // Display
    if (params.hasSmartControls) {
      const displayGeo = new BoxGeometry(width * 0.3, 0.04, 0.01);
      const displayMat = this.createEmissiveMaterial(0x00ffff, 0.5);
      const display = new Mesh(displayGeo, displayMat);
      display.position.x = width * 0.1;
      display.position.z = 0.02;
      group.add(display);
    } else {
      // LED indicators
      const ledGeo = new CylinderGeometry(0.005, 0.005, 0.01, 8);
      const ledMat = this.createEmissiveMaterial(0x00ff00, 0.8);
      
      ['wash', 'rinse', 'spin'].forEach((_, i) => {
        const led = new Mesh(ledGeo, ledMat);
        led.position.x = width * 0.05 + i * 0.08;
        led.position.z = 0.02;
        group.add(led);
      });
    }

    // Buttons
    const buttonGeo = new CylinderGeometry(0.012, 0.012, 0.01, 16);
    const buttonMat = this.createPBRMaterial({ color: 0x444444, emissive: 0x222222, emissiveIntensity: 0.3 });
    
    for (let i = 0; i < 4; i++) {
      const button = new Mesh(buttonGeo, buttonMat);
      button.position.x = width * 0.25 + i * 0.05;
      button.position.z = 0.02;
      group.add(button);
    }

    return group;
  }

  private createTopLoadControls(params: LaundryApplianceParams, width: number): Group {
    const group = new Group();
    
    const panelGeo = new BoxGeometry(width * 0.8, 0.1, 0.05);
    const panelMat = this.getFinishMaterial(params.finish);
    const panel = new Mesh(panelGeo, panelMat);
    panel.rotation.x = -Math.PI / 6;
    group.add(panel);

    // Knobs
    const knobGeo = new CylinderGeometry(0.025, 0.025, 0.03, 16);
    const knobMat = this.getHandleMaterial('stainless');
    
    [0, 1, 2].forEach(i => {
      const knob = new Mesh(knobGeo, knobMat);
      knob.position.x = -width * 0.2 + i * 0.15;
      knob.position.y = 0.02;
      knob.position.z = 0.02;
      group.add(knob);
    });

    return group;
  }

  private createDryerControls(params: LaundryApplianceParams, width: number): Group {
    const group = new Group();
    
    const panelGeo = new BoxGeometry(width * 0.9, 0.08, 0.03);
    const panelMat = this.createPBRMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.3 });
    const panel = new Mesh(panelGeo, panelMat);
    group.add(panel);

    // Large cycle dial
    const dialGeo = new CylinderGeometry(0.05, 0.05, 0.02, 32);
    const dialMat = this.getHandleMaterial('stainless');
    const dial = new Mesh(dialGeo, dialMat);
    dial.position.x = -width * 0.3;
    dial.position.z = 0.02;
    group.add(dial);

    // Digital display
    const displayGeo = new BoxGeometry(width * 0.35, 0.05, 0.01);
    const displayMat = this.createEmissiveMaterial(0xff6600, 0.6);
    const display = new Mesh(displayGeo, displayMat);
    display.position.x = width * 0.1;
    display.position.z = 0.02;
    group.add(display);

    // Steam button if available
    if (params.hasSteam) {
      const steamBtnGeo = new BoxGeometry(0.04, 0.03, 0.01);
      const steamBtnMat = this.createEmissiveMaterial(0x0066ff, 0.5);
      const steamBtn = new Mesh(steamBtnGeo, steamBtnMat);
      steamBtn.position.x = width * 0.35;
      steamBtn.position.z = 0.02;
      group.add(steamBtn);
    }

    return group;
  }

  private createDetergentDrawer(params: LaundryApplianceParams, width: number): Group {
    const group = new Group();
    
    const drawerGeo = new BoxGeometry(width * 0.2, 0.04, 0.03);
    const drawerMat = this.createPBRMaterial({ color: 0x333333, metalness: 0.4, roughness: 0.5 });
    const drawer = new Mesh(drawerGeo, drawerMat);
    group.add(drawer);

    // Handle
    const handleGeo = new BoxGeometry(width * 0.15, 0.02, 0.015);
    const handleMat = this.getHandleMaterial('stainless');
    const handle = new Mesh(handleGeo, handleMat);
    handle.position.z = 0.02;
    group.add(handle);

    return group;
  }

  private createWasherSection(params: LaundryApplianceParams, width: number, height: number): Group {
    const group = new Group();
    
    // Simplified washer front for stacked unit
    const doorGroup = this.createFrontLoadDoor(params, width, height * 0.9);
    group.add(doorGroup);

    return group;
  }

  private createDryerSection(params: LaundryApplianceParams, width: number, height: number): Group {
    const group = new Group();
    
    // Simplified dryer front for stacked unit
    const doorGroup = this.createDryerDoor(params, width, height * 0.9);
    group.add(doorGroup);

    return group;
  }

  private createDivider(width: number): Group {
    const group = new Group();
    
    const dividerGeo = new BoxGeometry(width * 0.95, 0.05, 0.65);
    const dividerMat = this.createPBRMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.4 });
    const divider = new Mesh(dividerGeo, dividerMat);
    group.add(divider);

    return group;
  }

  private createLintIndicator(): Group {
    const group = new Group();
    
    const indicatorGeo = new CylinderGeometry(0.008, 0.008, 0.01, 8);
    const indicatorMat = this.createEmissiveMaterial(0xffaa00, 0.7);
    const indicator = new Mesh(indicatorGeo, indicatorMat);
    group.add(indicator);

    return group;
  }

  private createVentConnection(): Group {
    const group = new Group();
    
    const ventGeo = new CylinderGeometry(0.1, 0.1, 0.05, 16, 1, true);
    const ventMat = this.createPBRMaterial({ color: 0x666666, metalness: 0.7, roughness: 0.4 });
    const vent = new Mesh(ventGeo, ventMat);
    vent.rotation.x = Math.PI / 2;
    group.add(vent);

    return group;
  }

  private addApplianceFeet(group: Group, width: number, depth: number): void {
    const footGeo = new CylinderGeometry(0.03, 0.03, 0.05, 16);
    const footMat = this.createPBRMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.7 });
    
    const positions = [
      { x: -width / 2 + 0.05, z: -depth / 2 + 0.05 },
      { x: width / 2 - 0.05, z: -depth / 2 + 0.05 },
      { x: -width / 2 + 0.05, z: depth / 2 - 0.05 },
      { x: width / 2 - 0.05, z: depth / 2 - 0.05 },
    ];

    positions.forEach(pos => {
      const foot = new Mesh(footGeo, footMat);
      foot.position.set(pos.x, -0.025, pos.z);
      group.add(foot);
    });
  }

  public getRandomParams(): LaundryApplianceParams {
    const types = ['washer', 'dryer', 'combo'] as const;
    const capacities = ['compact', 'standard', 'large'] as const;
    const loadTypes = ['front', 'top'] as const;
    
    const applianceType = types[Math.floor(Math.random() * types.length)];
    const loadType = applianceType === 'dryer' ? 'front' : loadTypes[Math.floor(Math.random() * loadTypes.length)] as 'front' | 'top';

    return {
      ...super.getRandomParams(),
      applianceType,
      capacity: capacities[Math.floor(Math.random() * capacities.length)],
      loadType,
      hasSteam: Math.random() > 0.6,
      hasSmartControls: Math.random() > 0.5,
      drumSize: 0.3 + Math.random() * 0.15,
    };
  }
}
