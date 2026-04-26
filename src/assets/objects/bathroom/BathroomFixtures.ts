/**
 * BathroomFixtures - Procedural generation of bathroom fixtures
 * 
 * Generates: Toilets, Sinks, Bathtubs, Showers
 * Each with multiple variations, parametric controls, and style options
 */

import { Group, BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Mesh, CircleGeometry, ExtrudeGeometry, Shape } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
import { BBox } from '../../../../core/util/math/transforms';

export interface BathroomFixtureParams {
  fixtureType: 'toilet' | 'sink' | 'bathtub' | 'shower';
  style: 'modern' | 'traditional' | 'minimal' | 'luxury';
  finish: 'white' | 'black' | 'stainless' | 'colored';
  faucetStyle?: 'single' | 'double' | 'wall' | 'floor';
  hasBidet?: boolean;
  tubShape?: 'rectangular' | 'oval' | 'corner' | 'freestanding';
  showerType?: 'enclosure' | 'walk-in' | 'tub-shower';
  size?: 'compact' | 'standard' | 'large';
}

export class BathroomFixtures extends BaseObjectGenerator<BathroomFixtureParams> {
  protected defaultParams: BathroomFixtureParams = {
    fixtureType: 'toilet',
    style: 'modern',
    finish: 'white',
    faucetStyle: 'single',
    hasBidet: false,
    tubShape: 'rectangular',
    showerType: 'enclosure',
    size: 'standard',
  };

  constructor() {
    super();
  }

  protected validateParams(params: Partial<BathroomFixtureParams>): Partial<BathroomFixtureParams> {
    return { ...params };
  }

  public generate(params: Partial<BathroomFixtureParams> = {}): Group {
    const finalParams = this.validateAndMergeParams(params) as BathroomFixtureParams;
    const group = new Group();

    switch (finalParams.fixtureType) {
      case 'toilet':
        group.add(this.generateToilet(finalParams));
        break;
      case 'sink':
        group.add(this.generateSink(finalParams));
        break;
      case 'bathtub':
        group.add(this.generateBathtub(finalParams));
        break;
      case 'shower':
        group.add(this.generateShower(finalParams));
        break;
    }

    return group;
  }

  private generateToilet(params: BathroomFixtureParams): Group {
    const group = new Group();
    
    const material = this.getCeramicMaterial(params.finish);
    
    // Bowl
    const bowlShape = this.createToiletBowlShape();
    const bowlGeo = new ExtrudeGeometry(bowlShape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 3 });
    const bowl = new Mesh(bowlGeo, material);
    bowl.rotation.x = Math.PI / 2;
    group.add(bowl);

    // Tank
    const tankWidth = params.style === 'modern' ? 0.35 : 0.4;
    const tankHeight = params.style === 'modern' ? 0.25 : 0.35;
    const tankDepth = 0.2;
    
    const tankGeo = new BoxGeometry(tankWidth, tankHeight, tankDepth);
    const tank = new Mesh(tankGeo, material);
    tank.position.set(0, 0.2, -0.25);
    group.add(tank);

    // Tank lid
    const lidGeo = new BoxGeometry(tankWidth + 0.02, 0.03, tankDepth + 0.02);
    const lid = new Mesh(lidGeo, material);
    lid.position.set(0, 0.2 + tankHeight / 2 + 0.015, -0.25);
    group.add(lid);

    // Seat
    const seatShape = this.createToiletSeatShape();
    const seatGeo = new ExtrudeGeometry(seatShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 2 });
    const seatMat = this.getSeatMaterial(params.style);
    const seat = new Mesh(seatGeo, seatMat);
    seat.rotation.x = Math.PI / 2;
    seat.position.y = 0.01;
    group.add(seat);

    // Flush handle/button
    if (params.style === 'modern') {
      const flushBtn = this.createFlushButton();
      flushBtn.position.set(tankWidth / 2 - 0.05, tankHeight / 2, tankDepth / 2 + 0.01);
      group.add(flushBtn);
    } else {
      const flushHandle = this.createFlushHandle();
      flushHandle.position.set(tankWidth / 2 - 0.08, 0, tankDepth / 2 + 0.01);
      group.add(flushHandle);
    }

    // Base/floor mounting
    const baseGeo = new BoxGeometry(0.25, 0.05, 0.35);
    const base = new Mesh(baseGeo, material);
    base.position.y = -0.2;
    group.add(base);

    // Bidet attachment if requested
    if (params.hasBidet) {
      const bidet = this.createBidetAttachment(params);
      bidet.position.set(0.35, 0, 0);
      group.add(bidet);
    }

    return group;
  }

  private generateSink(params: BathroomFixtureParams): Group {
    const group = new Group();
    
    const material = this.getCeramicMaterial(params.finish);
    
    const size = params.size === 'compact' ? 0.4 : params.size === 'large' ? 0.7 : 0.55;
    const sinkType = this.getSinkType(params.style);

    if (sinkType === 'pedestal') {
      // Basin
      const basin = this.createSinkBasin(size, params.style);
      basin.position.y = 0.8;
      group.add(basin);

      // Pedestal
      const pedestal = this.createPedestal(params.style);
      pedestal.position.y = 0.4;
      group.add(pedestal);

      // Faucet
      const faucet = this.createFaucet(params.faucetStyle || 'single', params.finish);
      faucet.position.set(0, 0.85, -size * 0.3);
      group.add(faucet);
    } else if (sinkType === 'vessel') {
      // Vessel sink sits on counter
      const vessel = this.createVesselSink(size, params.style);
      vessel.position.y = 0.9;
      group.add(vessel);

      // Counter/cabinet base
      const cabinet = this.createSinkCabinet(size, params.style);
      cabinet.position.y = 0.45;
      group.add(cabinet);

      // Faucet (wall-mounted or deck-mounted)
      const faucet = this.createFaucet(params.faucetStyle || 'wall', params.finish);
      faucet.position.set(0, 0.95, -size * 0.4);
      group.add(faucet);
    } else {
      // Undermount/drop-in
      const countertop = this.createCountertop(size, params.style);
      group.add(countertop);

      const basin = this.createUndermountBasin(size, params.style);
      basin.position.y = 0.85;
      group.add(basin);

      const faucet = this.createFaucet(params.faucetStyle || 'deck', params.finish);
      faucet.position.set(0, 0.9, -size * 0.3);
      group.add(faucet);

      // Cabinet below
      const cabinet = this.createSinkCabinet(size, params.style);
      cabinet.position.y = 0.4;
      group.add(cabinet);
    }

    // Drain pipe
    if (params.style !== 'minimal') {
      const drainPipe = this.createDrainPipe();
      drainPipe.position.y = 0.3;
      group.add(drainPipe);
    }

    return group;
  }

  private generateBathtub(params: BathroomFixtureParams): Group {
    const group = new Group();
    
    const material = this.getCeramicMaterial(params.finish);
    
    const length = params.size === 'compact' ? 1.4 : params.size === 'large' ? 1.9 : 1.7;
    const width = params.size === 'compact' ? 0.7 : params.size === 'large' ? 0.9 : 0.8;
    const height = 0.5;

    if (params.tubShape === 'freestanding') {
      // Freestanding tub
      const tub = this.createFreestandingTub(length, width, height, params.style);
      group.add(tub);

      // Floor-mounted faucet
      if (params.faucetStyle === 'floor') {
        const floorFaucet = this.createFloorFaucet(params.finish);
        floorFaucet.position.set(length * 0.3, 0, width / 2 + 0.3);
        group.add(floorFaucet);
      }
    } else if (params.tubShape === 'corner') {
      // Corner tub (triangular)
      const cornerTub = this.createCornerTub(params.size || 'standard');
      group.add(cornerTub);
    } else {
      // Alcove/built-in tub
      const tub = this.createAlcoveTub(length, width, height, params.tubShape === 'oval');
      group.add(tub);

      // Surround/skirt
      const skirt = this.createTubSkirt(length, params.style);
      skirt.position.set(0, -height / 2, width / 2);
      group.add(skirt);

      // Wall-mounted faucet
      if (params.faucetStyle === 'wall') {
        const wallFaucet = this.createWallFaucet(params.finish);
        wallFaucet.position.set(0, height * 0.8, -width / 2 - 0.1);
        group.add(wallFaucet);
      }
    }

    return group;
  }

  private generateShower(params: BathroomFixtureParams): Group {
    const group = new Group();
    
    const size = params.size === 'compact' ? 0.8 : params.size === 'large' ? 1.2 : 1.0;
    const height = 2.0;

    if (params.showerType === 'enclosure') {
      // Full shower enclosure with doors
      const enclosure = this.createShowerEnclosure(size, height, params.style);
      group.add(enclosure);
    } else if (params.showerType === 'walk-in') {
      // Walk-in shower with glass panel
      const walkIn = this.createWalkInShower(size, height, params.style);
      group.add(walkIn);
    } else {
      // Tub-shower combo
      const combo = this.createTubShowerCombo(size, height, params.finish);
      group.add(combo);
    }

    return group;
  }

  private createToiletBowlShape(): Shape {
    const shape = new Shape();
    shape.moveTo(-0.18, -0.15);
    shape.lineTo(0.18, -0.15);
    shape.quadraticCurveTo(0.22, -0.15, 0.22, -0.1);
    shape.lineTo(0.22, 0);
    shape.quadraticCurveTo(0.22, 0.1, 0.15, 0.15);
    shape.lineTo(-0.15, 0.15);
    shape.quadraticCurveTo(-0.22, 0.1, -0.22, 0);
    shape.lineTo(-0.22, -0.1);
    shape.quadraticCurveTo(-0.22, -0.15, -0.18, -0.15);
    
    // Inner hole
    const hole = new Path();
    hole.moveTo(-0.12, -0.1);
    hole.lineTo(0.12, -0.1);
    hole.quadraticCurveTo(0.15, -0.1, 0.15, -0.05);
    hole.lineTo(0.15, 0.05);
    hole.quadraticCurveTo(0.15, 0.1, 0.12, 0.1);
    hole.lineTo(-0.12, 0.1);
    hole.quadraticCurveTo(-0.15, 0.1, -0.15, 0.05);
    hole.lineTo(-0.15, -0.05);
    hole.quadraticCurveTo(-0.15, -0.1, -0.12, -0.1);
    shape.holes.push(hole);
    
    return shape;
  }

  private createToiletSeatShape(): Shape {
    const shape = new Shape();
    shape.moveTo(-0.17, -0.14);
    shape.lineTo(0.17, -0.14);
    shape.quadraticCurveTo(0.2, -0.14, 0.2, -0.08);
    shape.lineTo(0.2, 0.08);
    shape.quadraticCurveTo(0.2, 0.14, 0.17, 0.14);
    shape.lineTo(-0.17, 0.14);
    shape.quadraticCurveTo(-0.2, 0.08, -0.2, 0);
    shape.lineTo(-0.2, -0.08);
    shape.quadraticCurveTo(-0.2, -0.14, -0.17, -0.14);
    
    return shape;
  }

  private createSinkBasin(size: number, style: string): Group {
    const group = new Group();
    const material = this.getCeramicMaterial('white');
    
    if (style === 'modern') {
      // Rectangular modern basin
      const outerGeo = new BoxGeometry(size, 0.15, size * 0.7);
      const innerGeo = new BoxGeometry(size - 0.04, 0.12, size * 0.7 - 0.04);
      
      const outer = new Mesh(outerGeo, material);
      const inner = new Mesh(innerGeo, material);
      inner.position.y = 0.015;
      
      // Use CSG-like approach by scaling inner slightly larger to create cavity
      inner.scale.set(1.02, 1.5, 1.02);
      
      group.add(outer);
    } else {
      // Oval traditional basin
      const basinGeo = new SphereGeometry(size / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const basin = new Mesh(basinGeo, material);
      basin.scale.set(1.3, 0.5, 1);
      group.add(basin);
    }
    
    return group;
  }

  private createPedestal(style: string): Mesh {
    const material = this.getCeramicMaterial('white');
    
    if (style === 'traditional') {
      const pedestalGeo = new CylinderGeometry(0.15, 0.2, 0.8, 8);
      return new Mesh(pedestalGeo, material);
    } else {
      const pedestalGeo = new BoxGeometry(0.25, 0.8, 0.2);
      return new Mesh(pedestalGeo, material);
    }
  }

  private createVesselSink(size: number, style: string): Mesh {
    const material = this.getCeramicMaterial('white');
    
    if (style === 'modern') {
      const vesselGeo = new CylinderGeometry(size / 2, size / 2, 0.15, 32);
      return new Mesh(vesselGeo, material);
    } else {
      const vesselGeo = new SphereGeometry(size / 2.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      return new Mesh(vesselGeo, material);
    }
  }

  private createSinkCabinet(size: number, style: string): Mesh {
    const material = this.getWoodMaterial(style);
    
    const cabinetGeo = new BoxGeometry(size + 0.1, 0.9, size * 0.6);
    return new Mesh(cabinetGeo, material);
  }

  private createCountertop(size: number, style: string): Mesh {
    const material = this.getStoneMaterial(style);
    
    const counterGeo = new BoxGeometry(size + 0.2, 0.05, size * 0.8);
    return new Mesh(counterGeo, material);
  }

  private createUndermountBasin(size: number, style: string): Mesh {
    const material = this.getCeramicMaterial('white');
    
    const basinGeo = new SphereGeometry(size / 2.5, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const basin = new Mesh(basinGeo, material);
    basin.rotation.x = Math.PI;
    return basin;
  }

  private createFaucet(style: string, finish: string): Group {
    const group = new Group();
    const material = this.getMetalMaterial(finish);
    
    if (style === 'single') {
      // Single lever faucet
      const spoutGeo = new CylinderGeometry(0.02, 0.02, 0.15, 16);
      const spout = new Mesh(spoutGeo, material);
      spout.rotation.x = Math.PI / 2;
      spout.position.z = 0.1;
      group.add(spout);
      
      const baseGeo = new CylinderGeometry(0.04, 0.04, 0.05, 16);
      const base = new Mesh(baseGeo, material);
      group.add(base);
      
      const handleGeo = new BoxGeometry(0.02, 0.08, 0.02);
      const handle = new Mesh(handleGeo, material);
      handle.position.set(0, 0.04, 0);
      group.add(handle);
    } else if (style === 'double') {
      // Double handle faucet
      const spoutGeo = new CylinderGeometry(0.02, 0.02, 0.12, 16);
      const spout = new Mesh(spoutGeo, material);
      spout.rotation.x = Math.PI / 2;
      spout.position.z = 0.1;
      group.add(spout);
      
      [-0.08, 0.08].forEach(x => {
        const handleGeo = new CylinderGeometry(0.025, 0.025, 0.06, 16);
        const handle = new Mesh(handleGeo, material);
        handle.position.x = x;
        group.add(handle);
      });
    } else {
      // Wall-mounted or deck-mounted simplified
      const spoutGeo = new CylinderGeometry(0.015, 0.015, 0.2, 16);
      const spout = new Mesh(spoutGeo, material);
      spout.rotation.x = Math.PI / 2;
      group.add(spout);
    }
    
    return group;
  }

  private createDrainPipe(): Group {
    const group = new Group();
    const material = this.getMetalMaterial('stainless');
    
    const pipeGeo = new CylinderGeometry(0.03, 0.03, 0.3, 16);
    const pipe = new Mesh(pipeGeo, material);
    group.add(pipe);
    
    const trapGeo = new TorusGeometry(0.05, 0.03, 8, 16, Math.PI);
    const trap = new Mesh(trapGeo, material);
    trap.rotation.y = Math.PI / 2;
    trap.position.y = -0.15;
    group.add(trap);
    
    return group;
  }

  private createFreestandingTub(length: number, width: number, height: number, style: string): Mesh {
    const material = this.getCeramicMaterial('white');
    
    if (style === 'modern') {
      // Rectangular freestanding
      const tubGeo = new BoxGeometry(length, height, width);
      return new Mesh(tubGeo, material);
    } else {
      // Oval/clawfoot style
      const tubGeo = new SphereGeometry(length / 2, 32, 16);
      const tub = new Mesh(tubGeo, material);
      tub.scale.set(1, 0.5, width / length);
      return tub;
    }
  }

  private createCornerTub(size: string): Mesh {
    const material = this.getCeramicMaterial('white');
    const len = size === 'compact' ? 1.2 : 1.5;
    
    // Triangular corner tub shape
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.lineTo(len, 0);
    shape.quadraticCurveTo(len, len, 0, len);
    shape.closePath();
    
    const tubGeo = new ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
    return new Mesh(tubGeo, material);
  }

  private createAlcoveTub(length: number, width: number, height: number, isOval: boolean): Mesh {
    const material = this.getCeramicMaterial('white');
    
    if (isOval) {
      const tubGeo = new SphereGeometry(length / 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const tub = new Mesh(tubGeo, material);
      tub.scale.set(1, 0.6, width / length * 2);
      return tub;
    } else {
      const tubGeo = new BoxGeometry(length, height, width);
      return new Mesh(tubGeo, material);
    }
  }

  private createTubSkirt(length: number, style: string): Mesh {
    const material = style === 'modern' ? this.getMetalMaterial('stainless') : this.getCeramicMaterial('white');
    
    const skirtGeo = new BoxGeometry(length, 0.5, 0.05);
    return new Mesh(skirtGeo, material);
  }

  private createFloorFaucet(finish: string): Group {
    const group = new Group();
    const material = this.getMetalMaterial(finish);
    
    const poleGeo = new CylinderGeometry(0.03, 0.03, 1.0, 16);
    const pole = new Mesh(poleGeo, material);
    pole.position.y = 0.5;
    group.add(pole);
    
    const spoutGeo = new CylinderGeometry(0.02, 0.02, 0.3, 16);
    const spout = new Mesh(spoutGeo, material);
    spout.rotation.x = Math.PI / 2;
    spout.position.set(0, 0.9, 0.2);
    group.add(spout);
    
    return group;
  }

  private createWallFaucet(finish: string): Group {
    const group = new Group();
    const material = this.getMetalMaterial(finish);
    
    const spoutGeo = new CylinderGeometry(0.02, 0.02, 0.25, 16);
    const spout = new Mesh(spoutGeo, material);
    spout.rotation.x = Math.PI / 2;
    spout.position.z = 0.15;
    group.add(spout);
    
    return group;
  }

  private createShowerEnclosure(size: number, height: number, style: string): Group {
    const group = new Group();
    
    // Glass panels
    const glassMat = this.createPBRMaterial({ color: 0x88ccff, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.3 });
    
    [-1, 1].forEach(side => {
      const panelGeo = new BoxGeometry(size, height, 0.01);
      const panel = new Mesh(panelGeo, glassMat);
      panel.position.set(side * size / 2, height / 2, 0);
      group.add(panel);
    });
    
    // Door frame
    const frameMat = this.getMetalMaterial('stainless');
    const frameGeo = new BoxGeometry(0.05, height, 0.05);
    const frame = new Mesh(frameGeo, frameMat);
    frame.position.set(size / 2, height / 2, size / 2);
    group.add(frame);
    
    // Shower head
    const showerHead = this.createShowerHead('stainless');
    showerHead.position.set(0, height - 0.2, -size / 2);
    group.add(showerHead);
    
    return group;
  }

  private createWalkInShower(size: number, height: number, style: string): Group {
    const group = new Group();
    
    // Single glass panel
    const glassMat = this.createPBRMaterial({ color: 0x88ccff, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.3 });
    const panelGeo = new BoxGeometry(size, height, 0.01);
    const panel = new Mesh(panelGeo, glassMat);
    panel.position.set(0, height / 2, size / 2);
    group.add(panel);
    
    // Shower head
    const showerHead = this.createShowerHead('stainless');
    showerHead.position.set(0, height - 0.2, 0);
    group.add(showerHead);
    
    return group;
  }

  private createTubShowerCombo(size: number, height: number, finish: string): Group {
    const group = new Group();
    
    // Tub base
    const tub = this.createAlcoveTub(size, size * 0.7, 0.5, false);
    group.add(tub);
    
    // Curtain rod or glass
    const rodMat = this.getMetalMaterial(finish);
    const rodGeo = new CylinderGeometry(0.015, 0.015, size, 16);
    const rod = new Mesh(rodGeo, rodMat);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(0, height - 0.2, size * 0.35);
    group.add(rod);
    
    // Shower head
    const showerHead = this.createShowerHead(finish);
    showerHead.position.set(0, height - 0.3, 0);
    group.add(showerHead);
    
    return group;
  }

  private createShowerHead(finish: string): Group {
    const group = new Group();
    const material = this.getMetalMaterial(finish);
    
    const headGeo = new CylinderGeometry(0.1, 0.12, 0.05, 32);
    const head = new Mesh(headGeo, material);
    head.rotation.x = Math.PI / 2;
    group.add(head);
    
    const armGeo = new CylinderGeometry(0.015, 0.015, 0.3, 16);
    const arm = new Mesh(armGeo, material);
    arm.rotation.z = Math.PI / 4;
    arm.position.set(0, 0.1, -0.2);
    group.add(arm);
    
    return group;
  }

  private createFlushButton(): Mesh {
    const geo = new CylinderGeometry(0.03, 0.03, 0.02, 16);
    const mat = this.createPBRMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    return new Mesh(geo, mat);
  }

  private createFlushHandle(): Mesh {
    const geo = new CylinderGeometry(0.01, 0.01, 0.08, 8);
    const mat = this.getMetalMaterial('stainless');
    const handle = new Mesh(geo, mat);
    handle.rotation.z = Math.PI / 4;
    return handle;
  }

  private createBidetAttachment(params: BathroomFixtureParams): Group {
    const group = new Group();
    const material = this.getCeramicMaterial(params.finish);
    
    const bidetGeo = new BoxGeometry(0.3, 0.35, 0.45);
    const bidet = new Mesh(bidetGeo, material);
    group.add(bidet);
    
    const seatGeo = new CylinderGeometry(0.15, 0.15, 0.03, 32);
    const seat = new Mesh(seatGeo, this.getSeatMaterial(params.style));
    seat.position.y = 0.19;
    group.add(seat);
    
    return group;
  }

  private getSinkType(style: string): string {
    if (style === 'modern') return 'vessel';
    if (style === 'traditional') return 'pedestal';
    return 'undermount';
  }

  private getCeramicMaterial(finish: string): any {
    return this.createPBRMaterial({
      color: finish === 'white' ? 0xffffff : finish === 'black' ? 0x111111 : 0x88ccff,
      metalness: 0.1,
      roughness: 0.15,
    });
  }

  private getSeatMaterial(style: string): any {
    return this.createPBRMaterial({
      color: style === 'modern' ? 0xffffff : 0xdddddd,
      metalness: 0.0,
      roughness: 0.5,
    });
  }

  private getMetalMaterial(finish: string): any {
    return this.createPBRMaterial({
      color: finish === 'stainless' ? 0xcccccc : 0x333333,
      metalness: 0.9,
      roughness: 0.2,
    });
  }

  private getWoodMaterial(style: string): any {
    return this.createPBRMaterial({
      color: style === 'modern' ? 0x4a3728 : 0x6b4423,
      metalness: 0.0,
      roughness: 0.7,
    });
  }

  private getStoneMaterial(style: string): any {
    return this.createPBRMaterial({
      color: style === 'modern' ? 0xeeeeee : 0xd4c5b0,
      metalness: 0.1,
      roughness: 0.4,
    });
  }

  public getBoundingBox(params: BathroomFixtureParams): BBox {
    const size = params.size === 'compact' ? 0.8 : params.size === 'large' ? 1.2 : 1.0;
    return {
      min: { x: -size / 2, y: 0, z: -size / 2 },
      max: { x: size / 2, y: params.fixtureType === 'shower' ? 2.0 : 1.0, z: size / 2 },
    };
  }

  public getCollisionMesh(params: BathroomFixtureParams): Mesh {
    const size = params.size === 'compact' ? 0.8 : params.size === 'large' ? 1.2 : 1.0;
    const geometry = new BoxGeometry(size, 0.5, size);
    return this.createMesh(geometry, this.getCollisionMaterial());
  }

  public getRandomParams(): BathroomFixtureParams {
    const types = ['toilet', 'sink', 'bathtub', 'shower'] as const;
    const styles = ['modern', 'traditional', 'minimal', 'luxury'] as const;
    const finishes = ['white', 'black', 'stainless', 'colored'] as const;
    const faucetStyles = ['single', 'double', 'wall', 'floor'] as const;
    const tubShapes = ['rectangular', 'oval', 'corner', 'freestanding'] as const;
    const showerTypes = ['enclosure', 'walk-in', 'tub-shower'] as const;
    const sizes = ['compact', 'standard', 'large'] as const;

    const fixtureType = types[Math.floor(Math.random() * types.length)];

    return {
      fixtureType,
      style: styles[Math.floor(Math.random() * styles.length)],
      finish: finishes[Math.floor(Math.random() * finishes.length)],
      faucetStyle: faucetStyles[Math.floor(Math.random() * faucetStyles.length)],
      hasBidet: fixtureType === 'toilet' && Math.random() > 0.7,
      tubShape: tubShapes[Math.floor(Math.random() * tubShapes.length)],
      showerType: showerTypes[Math.floor(Math.random() * showerTypes.length)],
      size: sizes[Math.floor(Math.random() * sizes.length)],
    };
  }
}

// Required for Path type
import { Path } from 'three';
