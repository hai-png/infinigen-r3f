/**
 * Niche Decorative Objects Generator for Infinigen R3F
 * Generates procedural decorative items: candles, figurines, vases, trays, wall art
 */

import * as THREE from 'three';

export interface NicheDecorativesParams {
  category: 'candles' | 'figurines' | 'vases' | 'trays' | 'wall-art';
  type?: string;
  material?: 'wax' | 'ceramic' | 'glass' | 'metal' | 'wood' | 'stone';
  animated?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export interface NicheDecorativesResult {
  mesh: THREE.Group;
  metadata: {
    category: string;
    type: string;
    material: string;
    animated: boolean;
    size: string;
  };
}

/**
 * Material presets for decorative objects
 */
const MATERIAL_PRESETS: Record<string, Partial<THREE.MeshStandardMaterial>> = {
  wax: {
    color: 0xFFF8DC,
    roughness: 0.3,
    metalness: 0.0,
    transmission: 0.1,
  },
  ceramic: {
    color: 0xF5F5DC,
    roughness: 0.4,
    metalness: 0.0,
  },
  glass: {
    color: 0xFFFFFF,
    roughness: 0.1,
    metalness: 0.0,
    transmission: 0.9,
    transparent: true,
  },
  metal: {
    color: 0xC0C0C0,
    roughness: 0.2,
    metalness: 0.9,
  },
  wood: {
    color: 0x8B4513,
    roughness: 0.7,
    metalness: 0.0,
  },
  stone: {
    color: 0x808080,
    roughness: 0.6,
    metalness: 0.1,
  },
};

/**
 * Generate niche decorative objects
 */
export function generateNicheDecoratives(params: NicheDecorativesParams): NicheDecorativesResult {
  const group = new THREE.Group();
  
  const materialConfig = MATERIAL_PRESETS[params.material || 'ceramic'];
  const baseMaterial = new THREE.MeshStandardMaterial(materialConfig);
  
  let type = params.type;
  const size = params.size || 'medium';
  const sizeScale = size === 'small' ? 0.7 : size === 'large' ? 1.3 : 1.0;
  
  // Select type based on category if not specified
  if (!type) {
    switch (params.category) {
      case 'candles':
        type = 'pillar';
        break;
      case 'figurines':
        type = 'abstract-sculpture';
        break;
      case 'vases':
        type = 'ceramic-vase';
        break;
      case 'trays':
        type = 'serving-tray';
        break;
      case 'wall-art':
        type = 'floating-frame';
        break;
    }
  }
  
  group.scale.setScalar(sizeScale);
  
  // Generate specific object type
  switch (type) {
    case 'pillar':
      generatePillarCandle(group, baseMaterial, params.animated);
      break;
    case 'taper':
      generateTaperCandle(group, baseMaterial, params.animated);
      break;
    case 'tealight':
      generateTealight(group, baseMaterial, params.animated);
      break;
    case 'jar-candle':
      generateJarCandle(group, baseMaterial, params.animated);
      break;
    case 'abstract-sculpture':
      generateAbstractSculpture(group, baseMaterial);
      break;
    case 'bust':
      generateBust(group, baseMaterial);
      break;
    case 'animal-figurine':
      generateAnimalFigurine(group, baseMaterial);
      break;
    case 'action-figure-pose':
      generateActionFigurePose(group, baseMaterial);
      break;
    case 'ceramic-vase':
      generateCeramicVase(group, baseMaterial);
      break;
    case 'glass-vase':
      generateGlassVase(group, baseMaterial);
      break;
    case 'woven-basket':
      generateWovenBasket(group, baseMaterial);
      break;
    case 'serving-tray':
      generateServingTray(group, baseMaterial);
      break;
    case 'decorative-bowl':
      generateDecorativeBowl(group, baseMaterial);
      break;
    case 'catch-all-dish':
      generateCatchAllDish(group, baseMaterial);
      break;
    case 'floating-frame':
      generateFloatingFrame(group, baseMaterial);
      break;
    case 'canvas-wrap':
      generateCanvasWrap(group, baseMaterial);
      break;
    case 'metal-wall-sculpture':
      generateMetalWallSculpture(group, baseMaterial);
      break;
    default:
      generatePillarCandle(group, baseMaterial, false);
  }
  
  return {
    mesh: group,
    metadata: {
      category: params.category,
      type: type,
      material: params.material || 'ceramic',
      animated: params.animated || false,
      size: size,
    },
  };
}

/**
 * Generate pillar candle with optional flickering flame
 */
function generatePillarCandle(group: THREE.Group, material: THREE.Material, animated = false) {
  // Candle body
  const candleGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.15, 16);
  const candle = new THREE.Mesh(candleGeo, material);
  candle.position.y = 0.075;
  group.add(candle);
  
  // Wick
  const wickGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.02, 8);
  const wickMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const wick = new THREE.Mesh(wickGeo, wickMat);
  wick.position.y = 0.16;
  group.add(wick);
  
  // Flame (if animated)
  if (animated) {
    const flameGeo = new THREE.ConeGeometry(0.02, 0.05, 8);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xFFA500,
      transparent: true,
      opacity: 0.9,
    });
    
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 0.19;
    flame.userData.animatedFlame = true;
    flame.userData.flickerSpeed = 2 + Math.random();
    group.add(flame);
    
    // Point light for illumination
    const light = new THREE.PointLight(0xFFA500, 1, 2);
    light.position.y = 0.2;
    group.add(light);
  }
}

/**
 * Generate taper candle
 */
function generateTaperCandle(group: THREE.Group, material: THREE.Material, animated = false) {
  // Tapered body
  const candleGeo = new THREE.CylinderGeometry(0.02, 0.03, 0.25, 16);
  const candle = new THREE.Mesh(candleGeo, material);
  candle.position.y = 0.125;
  group.add(candle);
  
  // Drip wax
  const dripGeo = new THREE.SphereGeometry(0.015, 8, 8);
  for (let i = 0; i < 3; i++) {
    const drip = new THREE.Mesh(dripGeo, material);
    drip.position.set(
      (Math.random() - 0.5) * 0.04,
      0.2 - Math.random() * 0.15,
      (Math.random() - 0.5) * 0.04
    );
    drip.scale.y = 0.5 + Math.random() * 0.5;
    group.add(drip);
  }
  
  // Wick and flame
  const wickGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.015, 8);
  const wickMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const wick = new THREE.Mesh(wickGeo, wickMat);
  wick.position.y = 0.26;
  group.add(wick);
  
  if (animated) {
    const flameGeo = new THREE.ConeGeometry(0.015, 0.04, 8);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xFFA500,
      transparent: true,
      opacity: 0.9,
    });
    
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 0.285;
    flame.userData.animatedFlame = true;
    group.add(flame);
  }
}

/**
 * Generate tealight candle
 */
function generateTealight(group: THREE.Group, material: THREE.Material, animated = false) {
  // Metal cup
  const cupGeo = new THREE.CylinderGeometry(0.04, 0.035, 0.02, 16, 1, true);
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xCCCCCC, metalness: 0.8, roughness: 0.3 });
  const cup = new THREE.Mesh(cupGeo, cupMat);
  cup.position.y = 0.01;
  group.add(cup);
  
  // Wax inside
  const waxGeo = new THREE.CylinderGeometry(0.035, 0.03, 0.015, 16);
  const wax = new THREE.Mesh(waxGeo, material);
  wax.position.y = 0.015;
  group.add(wax);
  
  // Wick and flame
  const wickGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.01, 8);
  const wickMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const wick = new THREE.Mesh(wickGeo, wickMat);
  wick.position.y = 0.025;
  group.add(wick);
  
  if (animated) {
    const flameGeo = new THREE.ConeGeometry(0.012, 0.025, 8);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xFFA500,
      transparent: true,
      opacity: 0.9,
    });
    
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 0.04;
    flame.userData.animatedFlame = true;
    group.add(flame);
  }
}

/**
 * Generate jar candle with liquid wax surface
 */
function generateJarCandle(group: THREE.Group, material: THREE.Material, animated = false) {
  // Glass jar
  const jarGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.12, 16, 1, true);
  const jarMat = new THREE.MeshStandardMaterial({
    color: 0xFFFFFF,
    transparent: true,
    opacity: 0.3,
    roughness: 0.1,
    transmission: 0.9,
  });
  const jar = new THREE.Mesh(jarGeo, jarMat);
  jar.position.y = 0.06;
  group.add(jar);
  
  // Wax inside
  const waxGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.1, 16);
  const wax = new THREE.Mesh(waxGeo, material);
  wax.position.y = 0.05;
  group.add(wax);
  
  // Liquid wax surface (if animated)
  if (animated) {
    const liquidGeo = new THREE.CircleGeometry(0.055, 32);
    const liquidMat = new THREE.MeshStandardMaterial({
      color: material.color?.clone().multiplyScalar(0.9),
      roughness: 0.2,
      transparent: true,
      opacity: 0.8,
    });
    const liquid = new THREE.Mesh(liquidGeo, liquidMat);
    liquid.rotation.x = -Math.PI / 2;
    liquid.position.y = 0.095;
    liquid.userData.liquidSurface = true;
    group.add(liquid);
  }
  
  // Wick and flame
  const wickGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.015, 8);
  const wickMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const wick = new THREE.Mesh(wickGeo, wickMat);
  wick.position.y = 0.105;
  group.add(wick);
  
  if (animated) {
    const flameGeo = new THREE.ConeGeometry(0.018, 0.04, 8);
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xFFA500,
      transparent: true,
      opacity: 0.9,
    });
    
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 0.13;
    flame.userData.animatedFlame = true;
    group.add(flame);
    
    const light = new THREE.PointLight(0xFFA500, 1, 2);
    light.position.y = 0.13;
    group.add(light);
  }
}

/**
 * Generate abstract sculpture with parametric curves
 */
function generateAbstractSculpture(group: THREE.Group, material: THREE.Material) {
  // Create twisted form using curve
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = Math.sin(t * Math.PI * 2) * 0.1 * (1 - t);
    const y = t * 0.3;
    const z = Math.cos(t * Math.PI * 2) * 0.1 * (1 - t);
    points.push(new THREE.Vector3(x, y, z));
  }
  
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.03, 8, false);
  const sculpture = new THREE.Mesh(tubeGeo, material);
  sculpture.position.y = 0.15;
  group.add(sculpture);
  
  // Base
  const baseGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.02, 16);
  const base = new THREE.Mesh(baseGeo, material);
  base.position.y = 0.01;
  group.add(base);
}

/**
 * Generate bust figurine
 */
function generateBust(group: THREE.Group, material: THREE.Material) {
  // Head (simplified)
  const headGeo = new THREE.SphereGeometry(0.06, 16, 16);
  const head = new THREE.Mesh(headGeo, material);
  head.position.y = 0.18;
  head.scale.y = 1.2;
  group.add(head);
  
  // Shoulders/chest
  const chestGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.08, 16);
  const chest = new THREE.Mesh(chestGeo, material);
  chest.position.y = 0.1;
  group.add(chest);
  
  // Base pedestal
  const baseGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.1, 16);
  const base = new THREE.Mesh(baseGeo, material);
  base.position.y = 0.05;
  group.add(base);
  
  const platformGeo = new THREE.BoxGeometry(0.15, 0.02, 0.1);
  const platform = new THREE.Mesh(platformGeo, material);
  platform.position.y = 0.01;
  group.add(platform);
}

/**
 * Generate animal figurine (stylized)
 */
function generateAnimalFigurine(group: THREE.Group, material: THREE.Material) {
  // Body
  const bodyGeo = new THREE.SphereGeometry(0.05, 16, 16);
  const body = new THREE.Mesh(bodyGeo, material);
  body.position.y = 0.06;
  body.scale.set(1, 0.7, 1.5);
  group.add(body);
  
  // Head
  const headGeo = new THREE.SphereGeometry(0.035, 16, 16);
  const head = new THREE.Mesh(headGeo, material);
  head.position.set(0, 0.09, 0.06);
  group.add(head);
  
  // Ears
  const earGeo = new THREE.ConeGeometry(0.01, 0.025, 8);
  const leftEar = new THREE.Mesh(earGeo, material);
  leftEar.position.set(-0.02, 0.11, 0.06);
  group.add(leftEar);
  
  const rightEar = new THREE.Mesh(earGeo, material);
  rightEar.position.set(0.02, 0.11, 0.06);
  group.add(rightEar);
  
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.05, 8);
  const legPositions = [[-0.03, 0.025, 0.05], [0.03, 0.025, 0.05], [-0.03, 0.025, -0.05], [0.03, 0.025, -0.05]];
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeo, material);
    leg.position.set(...pos);
    group.add(leg);
  });
  
  // Tail
  const tailGeo = new THREE.CylinderGeometry(0.005, 0.008, 0.04, 8);
  const tail = new THREE.Mesh(tailGeo, material);
  tail.position.set(0, 0.07, -0.08);
  tail.rotation.x = -0.5;
  group.add(tail);
}

/**
 * Generate action figure pose (simplified humanoid)
 */
function generateActionFigurePose(group: THREE.Group, material: THREE.Material) {
  // Torso
  const torsoGeo = new THREE.BoxGeometry(0.06, 0.08, 0.03);
  const torso = new THREE.Mesh(torsoGeo, material);
  torso.position.y = 0.12;
  group.add(torso);
  
  // Head
  const headGeo = new THREE.SphereGeometry(0.025, 16, 16);
  const head = new THREE.Mesh(headGeo, material);
  head.position.y = 0.18;
  group.add(head);
  
  // Arms (posed)
  const armGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8);
  
  const leftArm = new THREE.Mesh(armGeo, material);
  leftArm.position.set(-0.04, 0.13, 0);
  leftArm.rotation.z = 0.5;
  group.add(leftArm);
  
  const rightArm = new THREE.Mesh(armGeo, material);
  rightArm.position.set(0.04, 0.13, 0);
  rightArm.rotation.z = -0.8;
  rightArm.rotation.x = 0.3;
  group.add(rightArm);
  
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.07, 8);
  
  const leftLeg = new THREE.Mesh(legGeo, material);
  leftLeg.position.set(-0.02, 0.05, 0);
  group.add(leftLeg);
  
  const rightLeg = new THREE.Mesh(legGeo, material);
  rightLeg.position.set(0.02, 0.05, 0);
  rightLeg.rotation.x = -0.3;
  group.add(rightLeg);
}

/**
 * Generate ceramic vase
 */
function generateCeramicVase(group: THREE.Group, material: THREE.Material) {
  // Vase body (curved profile)
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = t * 0.25;
    const radius = 0.05 + 0.03 * Math.sin(t * Math.PI) - 0.01 * Math.sin(t * Math.PI * 3);
    points.push(new THREE.Vector2(radius, y));
  }
  
  const vaseGeo = new THREE.LatheGeometry(points, 32);
  const vase = new THREE.Mesh(vaseGeo, material);
  vase.position.y = 0.125;
  group.add(vase);
}

/**
 * Generate glass vase with refraction
 */
function generateGlassVase(group: THREE.Group, material: THREE.Material) {
  // Use glass-specific material
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xFFFFFF,
    metalness: 0.0,
    roughness: 0.05,
    transmission: 1.0,
    thickness: 0.5,
    transparent: true,
  });
  
  // Thin-walled vase
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const y = t * 0.3;
    const radius = 0.06 + 0.02 * Math.sin(t * Math.PI);
    points.push(new THREE.Vector2(radius, y));
  }
  
  const vaseGeo = new THREE.LatheGeometry(points, 32);
  const vase = new THREE.Mesh(vaseGeo, glassMat);
  vase.position.y = 0.15;
  group.add(vase);
}

/**
 * Generate woven basket
 */
function generateWovenBasket(group: THREE.Group, material: THREE.Material) {
  // Basket body
  const basketGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.15, 16, 1, true);
  const basket = new THREE.Mesh(basketGeo, material);
  basket.position.y = 0.075;
  group.add(basket);
  
  // Woven texture simulation (rings)
  const ringGeo = new THREE.TorusGeometry(0.07, 0.005, 8, 32);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xD2B48C, roughness: 0.9 });
  
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03 + i * 0.03;
    group.add(ring);
  }
  
  // Handle
  const handleCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.08, 0.15, 0),
    new THREE.Vector3(0, 0.25, 0),
    new THREE.Vector3(0.08, 0.15, 0)
  );
  
  const handlePoints = handleCurve.getPoints(20);
  const handlePath = new THREE.CatmullRomCurve3(handlePoints);
  const handleGeo = new THREE.TubeGeometry(handlePath, 20, 0.008, 8, false);
  const handle = new THREE.Mesh(handleGeo, ringMat);
  group.add(handle);
}

/**
 * Generate serving tray
 */
function generateServingTray(group: THREE.Group, material: THREE.Material) {
  // Tray base
  const baseGeo = new THREE.BoxGeometry(0.4, 0.02, 0.3);
  const base = new THREE.Mesh(baseGeo, material);
  base.position.y = 0.01;
  group.add(base);
  
  // Raised edges
  const edgeGeo = new THREE.BoxGeometry(0.4, 0.03, 0.02);
  
  const frontEdge = new THREE.Mesh(edgeGeo, material);
  frontEdge.position.set(0, 0.025, -0.14);
  group.add(frontEdge);
  
  const backEdge = new THREE.Mesh(edgeGeo, material);
  backEdge.position.set(0, 0.025, 0.14);
  group.add(backEdge);
  
  const sideEdgeGeo = new THREE.BoxGeometry(0.02, 0.03, 0.26);
  
  const leftEdge = new THREE.Mesh(sideEdgeGeo, material);
  leftEdge.position.set(-0.19, 0.025, 0);
  group.add(leftEdge);
  
  const rightEdge = new THREE.Mesh(sideEdgeGeo, material);
  rightEdge.position.set(0.19, 0.025, 0);
  group.add(rightEdge);
  
  // Handles
  const handleGeo = new THREE.TorusGeometry(0.03, 0.008, 8, 16);
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
  
  const leftHandle = new THREE.Mesh(handleGeo, handleMat);
  leftHandle.rotation.y = Math.PI / 2;
  leftHandle.position.set(-0.22, 0.03, 0);
  group.add(leftHandle);
  
  const rightHandle = new THREE.Mesh(handleGeo, handleMat);
  rightHandle.rotation.y = Math.PI / 2;
  rightHandle.position.set(0.22, 0.03, 0);
  group.add(rightHandle);
}

/**
 * Generate decorative bowl
 */
function generateDecorativeBowl(group: THREE.Group, material: THREE.Material) {
  // Bowl (hemisphere-like)
  const points = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const angle = t * Math.PI;
    const x = Math.sin(angle) * 0.1;
    const y = (1 - Math.cos(angle)) * 0.05;
    points.push(new THREE.Vector2(x, y));
  }
  
  const bowlGeo = new THREE.LatheGeometry(points, 32);
  const bowl = new THREE.Mesh(bowlGeo, material);
  bowl.position.y = 0.05;
  group.add(bowl);
  
  // Base ring
  const ringGeo = new THREE.TorusGeometry(0.04, 0.008, 8, 32);
  const ring = new THREE.Mesh(ringGeo, material);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.008;
  group.add(ring);
}

/**
 * Generate catch-all dish
 */
function generateCatchAllDish(group: THREE.Group, material: THREE.Material) {
  // Shallow dish
  const dishGeo = new THREE.CylinderGeometry(0.1, 0.09, 0.02, 32);
  const dish = new THREE.Mesh(dishGeo, material);
  dish.position.y = 0.01;
  group.add(dish);
  
  // Rim
  const rimGeo = new THREE.TorusGeometry(0.1, 0.008, 8, 32);
  const rim = new THREE.Mesh(rimGeo, material);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.02;
  group.add(rim);
}

/**
 * Generate floating frame wall art
 */
function generateFloatingFrame(group: THREE.Group, material: THREE.Material) {
  // Frame
  const frameGeo = new THREE.BoxGeometry(0.5, 0.7, 0.03);
  const frame = new THREE.Mesh(frameGeo, material);
  group.add(frame);
  
  // Canvas/art inside
  const canvasGeo = new THREE.PlaneGeometry(0.46, 0.66);
  const canvasMat = new THREE.MeshStandardMaterial({ 
    color: 0xFFFFFF, 
    roughness: 0.9 
  });
  const canvas = new THREE.Mesh(canvasGeo, canvasMat);
  canvas.position.z = 0.016;
  group.add(canvas);
  
  // Hanging wire (back)
  const wireCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.15, 0.3, -0.02),
    new THREE.Vector3(0, 0.25, -0.02),
    new THREE.Vector3(0.15, 0.3, -0.02),
  ]);
  
  const wirePoints = wireCurve.getPoints(20);
  const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePoints);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x333333 });
  const wire = new THREE.Line(wireGeo, wireMat);
  group.add(wire);
}

/**
 * Generate canvas wrap art
 */
function generateCanvasWrap(group: THREE.Group, material: THREE.Material) {
  // Stretched canvas
  const canvasGeo = new THREE.BoxGeometry(0.6, 0.8, 0.04);
  const canvas = new THREE.Mesh(canvasGeo, material);
  group.add(canvas);
  
  // Abstract pattern on front (simple colored rectangles)
  const patternMat1 = new THREE.MeshStandardMaterial({ color: 0xFF6B6B });
  const patternMat2 = new THREE.MeshStandardMaterial({ color: 0x4ECDC4 });
  const patternMat3 = new THREE.MeshStandardMaterial({ color: 0xFFE66D });
  
  const rect1 = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), patternMat1);
  rect1.position.set(-0.15, 0.1, 0.021);
  group.add(rect1);
  
  const rect2 = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.2), patternMat2);
  rect2.position.set(0.15, -0.15, 0.021);
  group.add(rect2);
  
  const rect3 = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), patternMat3);
  rect3.position.set(-0.1, -0.2, 0.021);
  group.add(rect3);
}

/**
 * Generate metal wall sculpture
 */
function generateMetalWallSculpture(group: THREE.Group, material: THREE.Material) {
  // Use metallic material
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x8B4513,
    metalness: 0.9,
    roughness: 0.3,
  });
  
  // Abstract geometric composition
  const shapes = [
    { geo: new THREE.TorusGeometry(0.1, 0.015, 8, 32), pos: [0, 0.1, 0], rot: [0, 0, 0] },
    { geo: new THREE.BoxGeometry(0.25, 0.02, 0.02), pos: [0.1, -0.1, 0], rot: [0, 0, Math.PI / 4] },
    { geo: new THREE.CylinderGeometry(0.08, 0, 0.02, 16), pos: [-0.15, -0.15, 0], rot: [0, 0, 0] },
    { geo: new THREE.OctahedronGeometry(0.06), pos: [0.05, 0.2, 0.02], rot: [0, 0, 0] },
  ];
  
  shapes.forEach(shape => {
    const mesh = new THREE.Mesh(shape.geo, metalMat);
    mesh.position.set(...shape.pos);
    mesh.rotation.set(...shape.rot);
    group.add(mesh);
  });
  
  // Mounting brackets (back)
  const bracketGeo = new THREE.BoxGeometry(0.05, 0.03, 0.01);
  const bracketMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  
  const leftBracket = new THREE.Mesh(bracketGeo, bracketMat);
  leftBracket.position.set(-0.2, 0.25, -0.02);
  group.add(leftBracket);
  
  const rightBracket = new THREE.Mesh(bracketGeo, bracketMat);
  rightBracket.position.set(0.2, 0.25, -0.02);
  group.add(rightBracket);
}

/**
 * Default export
 */
export default generateNicheDecoratives;
