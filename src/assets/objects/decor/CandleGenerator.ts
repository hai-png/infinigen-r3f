/**
 * Candle Generator
 * 
 * Procedural candle generation with various styles,
 * wax materials, flames, and holders.
 */

import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';

export interface CandleConfig {
  style: 'pillar' | 'taper' | 'votive' | 'tea-light' | 'jar';
  waxType: 'paraffin' | 'beeswax' | 'soy' | 'gel';
  waxColor: string;
  height: number;
  radius: number;
  hasFlame: boolean;
  flameSize: 'small' | 'medium' | 'large';
  burned: boolean;
  burnLevel: number;
  holderStyle: 'none' | 'simple' | 'ornate' | 'lantern';
  scentVisible: boolean;
  seed?: number;
}

export class CandleGenerator extends BaseObjectGenerator<CandleConfig> {
  protected readonly defaultParams: CandleConfig = {
    style: 'pillar',
    waxType: 'beeswax',
    waxColor: '#FFF8DC',
    height: 0.15,
    radius: 0.025,
    hasFlame: true,
    flameSize: 'medium',
    burned: false,
    burnLevel: 0,
    holderStyle: 'none',
    scentVisible: false,
    seed: undefined
  };

  getDefaultConfig(): CandleConfig {
    return { ...this.defaultParams };
  }

  generate(params: Partial<CandleConfig> = {}): THREE.Group {
    const config = { ...this.defaultParams, ...params };
    const group = new THREE.Group();

    // Candle holder (if any)
    if (config.holderStyle !== 'none') {
      const holder = this.createHolder(config);
      group.add(holder);
    }

    // Candle body
    const candleBody = this.createCandleBody(config);
    group.add(candleBody);

    // Wick
    if (config.hasFlame || config.burned) {
      const wick = this.createWick(config);
      group.add(wick);
    }

    // Flame
    if (config.hasFlame) {
      const flame = this.createFlame(config);
      group.add(flame);
      
      // Add point light for flame illumination
      const flameLight = new THREE.PointLight(0xFFA500, 1, 3);
      flameLight.position.y = config.height + 0.03;
      group.add(flameLight);
    }

    // Scent particles (visual effect)
    if (config.scentVisible) {
      const scentParticles = this.createScentEffect(config);
      group.add(scentParticles);
    }

    return group;
  }

  private createCandleBody(config: CandleConfig): THREE.Mesh {
    let geometry: THREE.BufferGeometry;
    
    const effectiveHeight = config.height * (1 - config.burnLevel * 0.3);
    
    if (config.style === 'jar') {
      // Jar candle - cylinder with glass container
      const jarGeometry = new THREE.CylinderGeometry(
        config.radius + 0.003,
        config.radius + 0.003,
        effectiveHeight * 0.7,
        16
      );
      const jarMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        transmission: 0.9
      });
      return new THREE.Mesh(jarGeometry, jarMaterial);
    } else {
      // Standard candle shapes
      const topRadius = config.style === 'taper' ? config.radius * 0.7 : config.radius;
      geometry = new THREE.CylinderGeometry(
        topRadius,
        config.radius,
        effectiveHeight,
        16
      );
    }

    const waxMaterial = this.getWaxMaterial(config);
    const candle = new THREE.Mesh(geometry, waxMaterial);
    candle.position.y = config.holderStyle !== 'none' ? config.height * 0.1 : 0;
    
    // Burn effects
    if (config.burned && config.burnLevel > 0) {
      this.addBurnEffects(candle, config);
    }

    return candle;
  }

  private getWaxMaterial(config: CandleConfig): THREE.Material {
    let roughness = 0.3;
    let transmission = 0;
    
    switch (config.waxType) {
      case 'beeswax':
        roughness = 0.4;
        break;
      case 'soy':
        roughness = 0.5;
        break;
      case 'gel':
        roughness = 0.1;
        transmission = 0.6;
        break;
      default: // paraffin
        roughness = 0.3;
    }

    return new THREE.MeshStandardMaterial({
      color: config.waxColor,
      roughness,
      transmission,
      transparent: transmission > 0
    });
  }

  private createWick(config: CandleConfig): THREE.Mesh {
    const wickGeometry = new THREE.CylinderGeometry(0.001, 0.001, 0.01, 8);
    const wickMaterial = new THREE.MeshStandardMaterial({
      color: 0x2F2F2F,
      roughness: 0.9
    });
    const wick = new THREE.Mesh(wickGeometry, wickMaterial);
    wick.position.y = config.height + 0.005;
    return wick;
  }

  private createFlame(config: CandleConfig): THREE.Group {
    const flameGroup = new THREE.Group();
    
    const flameHeight = config.flameSize === 'small' ? 0.015 : 
                        config.flameSize === 'large' ? 0.035 : 0.025;
    
    // Inner flame (bright core)
    const innerGeometry = new THREE.ConeGeometry(0.005, flameHeight * 0.6, 8);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFFFE0,
      transparent: true,
      opacity: 0.9
    });
    const innerFlame = new THREE.Mesh(innerGeometry, innerMaterial);
    flameGroup.add(innerFlame);
    
    // Outer flame (orange glow)
    const outerGeometry = new THREE.ConeGeometry(0.008, flameHeight, 8);
    const outerMaterial = new THREE.MeshBasicMaterial({
      color: 0xFFA500,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    const outerFlame = new THREE.Mesh(outerGeometry, outerMaterial);
    outerFlame.position.y = flameHeight * 0.2;
    flameGroup.add(outerFlame);
    
    flameGroup.position.y = config.height + 0.01;
    
    return flameGroup;
  }

  private createHolder(config: CandleConfig): THREE.Group {
    const holderGroup = new THREE.Group();
    
    let holderGeometry: THREE.BufferGeometry;
    let holderMaterial: THREE.Material;
    
    if (config.holderStyle === 'simple') {
      holderGeometry = new THREE.CylinderGeometry(
        config.radius + 0.02,
        config.radius + 0.02,
        0.02,
        16
      );
      holderMaterial = new THREE.MeshStandardMaterial({
        color: 0xC0C0C0,
        metalness: 0.8,
        roughness: 0.2
      });
    } else if (config.holderStyle === 'ornate') {
      holderGeometry = new THREE.TorusGeometry(
        config.radius + 0.025,
        0.005,
        16,
        32
      );
      holderMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFD700,
        metalness: 0.9,
        roughness: 0.1
      });
    } else { // lantern
      holderGeometry = new THREE.BoxGeometry(
        config.radius * 3,
        config.height * 0.8,
        config.radius * 3
      );
      holderMaterial = new THREE.MeshStandardMaterial({
        color: 0x2F2F2F,
        metalness: 0.7,
        roughness: 0.3,
        wireframe: true
      });
    }
    
    const holder = new THREE.Mesh(holderGeometry, holderMaterial);
    holderGroup.add(holder);
    
    return holderGroup;
  }

  private addBurnEffects(candle: THREE.Mesh, config: CandleConfig): void {
    // Create slight depression at top for burned candles
    const material = candle.material as THREE.MeshStandardMaterial;
    material.color.offsetHSL(0, -0.02, -0.05);
  }

  private createScentEffect(config: CandleConfig): THREE.Points {
    const particleCount = 20;
    const positions = new Float32Array(particleCount * 3);
    
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 1] = config.height + Math.random() * 0.1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
      color: 0xFFFFFF,
      size: 0.002,
      transparent: true,
      opacity: 0.4
    });
    
    return new THREE.Points(geometry, material);
  }

  getVariations(): CandleConfig[] {
    return [
      { ...this.defaultParams, style: 'pillar', waxColor: '#FFF8DC', flameSize: 'medium' },
      { ...this.defaultParams, style: 'taper', waxColor: '#DC143C', height: 0.25, radius: 0.01 },
      { ...this.defaultParams, style: 'votive', waxColor: '#4B0082', holderStyle: 'simple' },
      { ...this.defaultParams, style: 'jar', waxType: 'soy', waxColor: '#FFB6C1', holderStyle: 'none' }
    ];
  }
}
