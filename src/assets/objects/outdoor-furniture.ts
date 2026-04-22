/**
 * Outdoor Furniture Generator for Infinigen R3F
 * Generates procedural outdoor furniture with weather-resistant materials
 */

import * as THREE from 'three';

export interface OutdoorFurnitureParams {
  category: 'seating' | 'tables' | 'lounging' | 'dining' | 'accessories' | 'shading';
  type?: string;
  material?: 'teak' | 'aluminum' | 'wicker' | 'hdpe' | 'steel';
  weathered?: boolean;
  uvDegradation?: number;
  animated?: boolean;
}

export interface OutdoorFurnitureResult {
  mesh: THREE.Group;
  metadata: {
    category: string;
    type: string;
    material: string;
    weathered: boolean;
    animatedComponents: string[];
  };
}

/**
 * Material presets for outdoor furniture
 */
const MATERIAL_PRESETS: Record<string, Partial<THREE.MeshStandardMaterial>> = {
  teak: {
    color: 0x8B6914,
    roughness: 0.7,
    metalness: 0.0,
  },
  aluminum: {
    color: 0xC0C0C0,
    roughness: 0.3,
    metalness: 0.8,
  },
  wicker: {
    color: 0xD2B48C,
    roughness: 0.9,
    metalness: 0.0,
  },
  hdpe: {
    color: 0x2F4F4F,
    roughness: 0.5,
    metalness: 0.1,
  },
  steel: {
    color: 0x708090,
    roughness: 0.4,
    metalness: 0.7,
  },
};

/**
 * Generate outdoor furniture based on parameters
 */
export function generateOutdoorFurniture(params: OutdoorFurnitureParams): OutdoorFurnitureResult {
  const group = new THREE.Group();
  const animatedComponents: string[] = [];
  
  const materialConfig = MATERIAL_PRESETS[params.material || 'teak'];
  const baseMaterial = new THREE.MeshStandardMaterial(materialConfig);
  
  // Apply UV degradation if specified
  if (params.uvDegradation && params.uvDegradation > 0) {
    baseMaterial.color.multiplyScalar(1 - params.uvDegradation * 0.3);
  }
  
  let type = params.type;
  
  // Select type based on category if not specified
  if (!type) {
    switch (params.category) {
      case 'seating':
        type = 'adirondack';
        break;
      case 'tables':
        type = 'picnic';
        break;
      case 'lounging':
        type = 'sun-lounger';
        break;
      case 'dining':
        type = 'patio-set';
        break;
      case 'accessories':
        type = 'planter-box';
        break;
      case 'shading':
        type = 'umbrella';
        break;
    }
  }
  
  // Generate specific furniture type
  switch (type) {
    case 'adirondack':
      generateAdirondackChair(group, baseMaterial, params.animated);
      break;
    case 'bench':
      generateBench(group, baseMaterial);
      break;
    case 'swing-seat':
      generateSwingSeat(group, baseMaterial, params.animated);
      animatedComponents.push('swing');
      break;
    case 'bistro-set':
      generateBistroSet(group, baseMaterial);
      break;
    case 'picnic':
      generatePicnicTable(group, baseMaterial);
      break;
    case 'side-table':
      generateSideTable(group, baseMaterial);
      break;
    case 'bar-cart':
      generateBarCart(group, baseMaterial, params.animated);
      if (params.animated) animatedComponents.push('wheels');
      break;
    case 'sun-lounger':
      generateSunLounger(group, baseMaterial, params.animated);
      if (params.animated) animatedComponents.push('adjustable-back');
      break;
    case 'daybed':
      generateDaybed(group, baseMaterial);
      break;
    case 'hammock':
      generateHammock(group, baseMaterial, params.animated);
      if (params.animated) animatedComponents.push('sway');
      break;
    case 'patio-set':
      generatePatioDiningSet(group, baseMaterial);
      break;
    case 'planter-box':
      generatePlanterBox(group, baseMaterial);
      break;
    case 'fire-pit':
      generateFirePit(group, baseMaterial, params.animated);
      if (params.animated) animatedComponents.push('flames');
      break;
    case 'umbrella':
      generateMarketUmbrella(group, baseMaterial, params.animated);
      if (params.animated) animatedComponents.push('crank', 'wind-sway');
      break;
    case 'pergola':
      generatePergola(group, baseMaterial);
      break;
    default:
      generateAdirondackChair(group, baseMaterial, false);
  }
  
  return {
    mesh: group,
    metadata: {
      category: params.category,
      type: type,
      material: params.material || 'teak',
      weathered: params.weathered || false,
      animatedComponents,
    },
  };
}

/**
 * Generate Adirondack chair
 */
function generateAdirondackChair(group: THREE.Group, material: THREE.Material, animated = false) {
  // Seat
  const seatGeo = new THREE.BoxGeometry(0.6, 0.05, 0.5);
  const seat = new THREE.Mesh(seatGeo, material);
  seat.position.y = 0.4;
  seat.rotation.x = -0.2;
  group.add(seat);
  
  // Backrest (slatted)
  for (let i = 0; i < 5; i++) {
    const slatGeo = new THREE.BoxGeometry(0.6, 0.08, 0.03);
    const slat = new THREE.Mesh(slatGeo, material);
    slat.position.set(0, 0.6 + i * 0.12, -0.2);
    slat.rotation.x = -0.15;
    group.add(slat);
  }
  
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.4);
  const positions = [
    [-0.25, 0.2, 0.2],
    [0.25, 0.2, 0.2],
    [-0.25, 0.2, -0.2],
    [0.25, 0.2, -0.2],
  ];
  
  positions.forEach(pos => {
    const leg = new THREE.Mesh(legGeo, material);
    leg.position.set(...pos);
    group.add(leg);
  });
  
  // Armrests
  const armGeo = new THREE.BoxGeometry(0.08, 0.05, 0.5);
  const leftArm = new THREE.Mesh(armGeo, material);
  leftArm.position.set(-0.3, 0.5, 0);
  group.add(leftArm);
  
  const rightArm = new THREE.Mesh(armGeo, material);
  rightArm.position.set(0.3, 0.5, 0);
  group.add(rightArm);
}

/**
 * Generate bench
 */
function generateBench(group: THREE.Group, material: THREE.Material) {
  // Seat slats
  for (let i = 0; i < 4; i++) {
    const slatGeo = new THREE.BoxGeometry(1.5, 0.05, 0.3);
    const slat = new THREE.Mesh(slatGeo, material);
    slat.position.set(0, 0.45 + i * 0.06, 0);
    group.add(slat);
  }
  
  // Backrest slats
  for (let i = 0; i < 3; i++) {
    const slatGeo = new THREE.BoxGeometry(1.5, 0.08, 0.03);
    const slat = new THREE.Mesh(slatGeo, material);
    slat.position.set(0, 0.7 + i * 0.1, -0.15);
    slat.rotation.x = -0.1;
    group.add(slat);
  }
  
  // Legs
  const legGeo = new THREE.BoxGeometry(0.1, 0.45, 0.1);
  const legPositions = [[-0.6, 0.225, 0], [0.6, 0.225, 0]];
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeo, material);
    leg.position.set(...pos);
    group.add(leg);
  });
}

/**
 * Generate swing seat with ropes/chains
 */
function generateSwingSeat(group: THREE.Group, material: THREE.Material, animated = false) {
  // Seat
  const seatGeo = new THREE.BoxGeometry(1.2, 0.05, 0.4);
  const seat = new THREE.Mesh(seatGeo, material);
  group.add(seat);
  
  // Backrest
  const backGeo = new THREE.BoxGeometry(1.2, 0.5, 0.03);
  const back = new THREE.Mesh(backGeo, material);
  back.position.set(0, 0.25, -0.2);
  group.add(back);
  
  // Suspension ropes/chains
  const ropeGeo = new THREE.CylinderGeometry(0.01, 0.01, 2.0, 8);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
  
  const ropePositions = [[-0.5, 1.0, -0.15], [0.5, 1.0, -0.15]];
  
  ropePositions.forEach(pos => {
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.position.set(...pos);
    if (animated) {
      // Add pivot point for animation
      rope.userData.swingAxis = new THREE.Vector3(0, 1, 0);
    }
    group.add(rope);
  });
}

/**
 * Generate bistro set (table + 2 chairs)
 */
function generateBistroSet(group: THREE.Group, material: THREE.Material) {
  // Table
  const tableTopGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16);
  const tableTop = new THREE.Mesh(tableTopGeo, material);
  tableTop.position.y = 0.7;
  group.add(tableTop);
  
  const tableLegGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.7, 8);
  const tableLeg = new THREE.Mesh(tableLegGeo, material);
  tableLeg.position.y = 0.35;
  group.add(tableLeg);
  
  // Base
  const baseGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16);
  const base = new THREE.Mesh(baseGeo, material);
  base.position.y = 0.015;
  group.add(base);
  
  // Two chairs
  for (let side of [-1, 1]) {
    const chairGroup = new THREE.Group();
    
    const chairSeatGeo = new THREE.BoxGeometry(0.35, 0.03, 0.35);
    const chairSeat = new THREE.Mesh(chairSeatGeo, material);
    chairSeat.position.y = 0.4;
    chairGroup.add(chairSeat);
    
    const chairBackGeo = new THREE.BoxGeometry(0.35, 0.3, 0.02);
    const chairBack = new THREE.Mesh(chairBackGeo, material);
    chairBack.position.set(0, 0.55, -0.15);
    chairGroup.add(chairBack);
    
    const chairLegGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
    const chairLegPositions = [[-0.15, 0.2, -0.15], [0.15, 0.2, -0.15], [-0.15, 0.2, 0.15], [0.15, 0.2, 0.15]];
    
    chairLegPositions.forEach(pos => {
      const leg = new THREE.Mesh(chairLegGeo, material);
      leg.position.set(...pos);
      chairGroup.add(leg);
    });
    
    chairGroup.position.set(side * 0.7, 0, 0);
    group.add(chairGroup);
  }
}

/**
 * Generate picnic table
 */
function generatePicnicTable(group: THREE.Group, material: THREE.Material) {
  // Table top slats
  for (let i = 0; i < 5; i++) {
    const slatGeo = new THREE.BoxGeometry(0.25, 0.05, 1.8);
    const slat = new THREE.Mesh(slatGeo, material);
    slat.position.set(-0.5 + i * 0.25, 0.7, 0);
    group.add(slat);
  }
  
  // A-frame legs
  const legPositions = [[-0.7, 0.35, 0], [0.7, 0.35, 0]];
  
  legPositions.forEach(pos => {
    const legGroup = new THREE.Group();
    
    const legGeo = new THREE.BoxGeometry(0.05, 0.7, 0.05);
    const leftLeg = new THREE.Mesh(legGeo, material);
    leftLeg.position.set(-0.3, 0, 0);
    leftLeg.rotation.z = 0.3;
    legGroup.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeo, material);
    rightLeg.position.set(0.3, 0, 0);
    rightLeg.rotation.z = -0.3;
    legGroup.add(rightLeg);
    
    const crossGeo = new THREE.BoxGeometry(0.6, 0.05, 0.05);
    const cross = new THREE.Mesh(crossGeo, material);
    cross.position.y = -0.2;
    legGroup.add(cross);
    
    legGroup.position.set(...pos);
    group.add(legGroup);
  });
  
  // Bench seats
  for (let side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const benchSlatGeo = new THREE.BoxGeometry(0.25, 0.05, 1.8);
      const benchSlat = new THREE.Mesh(benchSlatGeo, material);
      benchSlat.position.set(-0.25 + i * 0.25, 0.4, side * 0.5);
      group.add(benchSlat);
    }
  }
}

/**
 * Generate side table
 */
function generateSideTable(group: THREE.Group, material: THREE.Material) {
  const topGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16);
  const top = new THREE.Mesh(topGeo, material);
  top.position.y = 0.5;
  group.add(top);
  
  const legGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.5, 8);
  const leg = new THREE.Mesh(legGeo, material);
  leg.position.y = 0.25;
  group.add(leg);
  
  const baseGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16);
  const base = new THREE.Mesh(baseGeo, material);
  base.position.y = 0.015;
  group.add(base);
}

/**
 * Generate bar cart with wheels
 */
function generateBarCart(group: THREE.Group, material: THREE.Material, animated = false) {
  // Shelves
  for (let i = 0; i < 2; i++) {
    const shelfGeo = new THREE.BoxGeometry(0.6, 0.03, 0.4);
    const shelf = new THREE.Mesh(shelfGeo, material);
    shelf.position.y = 0.3 + i * 0.4;
    group.add(shelf);
  }
  
  // Frame posts
  const postGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
  const postPositions = [[-0.28, 0.4, -0.18], [0.28, 0.4, -0.18], [-0.28, 0.4, 0.18], [0.28, 0.4, 0.18]];
  
  postPositions.forEach(pos => {
    const post = new THREE.Mesh(postGeo, material);
    post.position.set(...pos);
    group.add(post);
  });
  
  // Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  
  const wheelPositions = [[-0.28, 0.05, -0.2], [0.28, 0.05, -0.2], [-0.28, 0.05, 0.2], [0.28, 0.05, 0.2]];
  
  wheelPositions.forEach((pos, idx) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(...pos);
    wheel.rotation.z = Math.PI / 2;
    if (animated) {
      wheel.userData.rotatable = true;
    }
    group.add(wheel);
  });
}

/**
 * Generate sun lounger with adjustable back
 */
function generateSunLounger(group: THREE.Group, material: THREE.Material, animated = false) {
  // Base frame
  const frameGeo = new THREE.BoxGeometry(1.8, 0.05, 0.6);
  const frame = new THREE.Mesh(frameGeo, material);
  frame.position.y = 0.3;
  group.add(frame);
  
  // Adjustable backrest
  const backGeo = new THREE.BoxGeometry(0.8, 0.05, 0.6);
  const back = new THREE.Mesh(backGeo, material);
  back.position.set(-0.5, 0.6, 0);
  back.rotation.x = -0.4;
  
  if (animated) {
    back.userData.adjustable = true;
    back.userData.pivotPoint = new THREE.Vector3(0.1, 0.575, 0);
  }
  
  group.add(back);
  
  // Legs
  const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8);
  const legPositions = [[-0.8, 0.15, -0.25], [0.8, 0.15, -0.25], [-0.8, 0.15, 0.25], [0.8, 0.15, 0.25]];
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeo, material);
    leg.position.set(...pos);
    group.add(leg);
  });
}

/**
 * Generate daybed
 */
function generateDaybed(group: THREE.Group, material: THREE.Material) {
  // Mattress platform
  const platformGeo = new THREE.BoxGeometry(2.0, 0.1, 1.0);
  const platform = new THREE.Mesh(platformGeo, material);
  platform.position.y = 0.4;
  group.add(platform);
  
  // Canopy posts
  const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.0, 8);
  const postPositions = [[-0.9, 1.0, -0.45], [0.9, 1.0, -0.45], [-0.9, 1.0, 0.45], [0.9, 1.0, 0.45]];
  
  postPositions.forEach(pos => {
    const post = new THREE.Mesh(postGeo, material);
    post.position.set(...pos);
    group.add(post);
  });
  
  // Canopy top
  const canopyGeo = new THREE.BoxGeometry(2.2, 0.03, 1.2);
  const canopy = new THREE.Mesh(canopyGeo, material);
  canopy.position.y = 2.0;
  group.add(canopy);
}

/**
 * Generate hammock with suspension
 */
function generateHammock(group: THREE.Group, material: THREE.Material, animated = false) {
  // Hammock fabric (curved)
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-1.5, 0.8, 0),
    new THREE.Vector3(0, 0.3, 0),
    new THREE.Vector3(1.5, 0.8, 0)
  );
  
  const points = curve.getPoints(20);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  
  // Create tube geometry for hammock
  const path = new THREE.CatmullRomCurve3(points);
  const hammockGeo = new THREE.TubeGeometry(path, 20, 0.3, 8, false);
  const hammock = new THREE.Mesh(hammockGeo, material);
  hammock.scale.set(1, 0.3, 1);
  group.add(hammock);
  
  // Suspension ropes
  const ropeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 0.9 });
  
  const ropePositions = [[-1.5, 1.0, 0], [1.5, 1.0, 0]];
  
  ropePositions.forEach((pos, idx) => {
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.position.set(pos[0] * 0.7, pos[1] + 0.25, pos[2]);
    rope.rotation.z = idx === 0 ? 0.4 : -0.4;
    if (animated) {
      rope.userData.swayAxis = new THREE.Vector3(0, 1, 0);
    }
    group.add(rope);
  });
}

/**
 * Generate patio dining set
 */
function generatePatioDiningSet(group: THREE.Group, material: THREE.Material) {
  // Large table
  const tableTopGeo = new THREE.BoxGeometry(1.8, 0.05, 1.0);
  const tableTop = new THREE.Mesh(tableTopGeo, material);
  tableTop.position.y = 0.7;
  group.add(tableTop);
  
  const tableLegGeo = new THREE.BoxGeometry(0.1, 0.7, 0.1);
  const legPositions = [[-0.8, 0.35, -0.4], [0.8, 0.35, -0.4], [-0.8, 0.35, 0.4], [0.8, 0.35, 0.4]];
  
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(tableLegGeo, material);
    leg.position.set(...pos);
    group.add(leg);
  });
  
  // Cross support
  const crossGeo = new THREE.BoxGeometry(1.6, 0.05, 0.05);
  const cross1 = new THREE.Mesh(crossGeo, material);
  cross1.position.set(0, 0.2, -0.4);
  group.add(cross1);
  
  const cross2 = new THREE.Mesh(crossGeo, material);
  cross2.position.set(0, 0.2, 0.4);
  group.add(cross2);
  
  // 6 chairs around table
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const chairGroup = new THREE.Group();
    
    const chairSeatGeo = new THREE.BoxGeometry(0.4, 0.03, 0.4);
    const chairSeat = new THREE.Mesh(chairSeatGeo, material);
    chairSeat.position.y = 0.4;
    chairGroup.add(chairSeat);
    
    const chairBackGeo = new THREE.BoxGeometry(0.4, 0.35, 0.02);
    const chairBack = new THREE.Mesh(chairBackGeo, material);
    chairBack.position.set(0, 0.575, -0.18);
    chairGroup.add(chairBack);
    
    const chairLegGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8);
    const chairLegPositions = [[-0.18, 0.2, -0.18], [0.18, 0.2, -0.18], [-0.18, 0.2, 0.18], [0.18, 0.2, 0.18]];
    
    chairLegPositions.forEach(pos => {
      const leg = new THREE.Mesh(chairLegGeo, material);
      leg.position.set(...pos);
      chairGroup.add(leg);
    });
    
    chairGroup.position.set(Math.cos(angle) * 1.3, 0, Math.sin(angle) * 1.3);
    chairGroup.rotation.y = -angle;
    group.add(chairGroup);
  }
}

/**
 * Generate planter box
 */
function generatePlanterBox(group: THREE.Group, material: THREE.Material) {
  const outerGeo = new THREE.BoxGeometry(0.6, 0.4, 0.3);
  const innerGeo = new THREE.BoxGeometry(0.54, 0.35, 0.26);
  
  // Use CSG-like approach by scaling
  const box = new THREE.Mesh(outerGeo, material);
  box.position.y = 0.2;
  group.add(box);
  
  // Rim
  const rimGeo = new THREE.BoxGeometry(0.62, 0.03, 0.32);
  const rim = new THREE.Mesh(rimGeo, material);
  rim.position.y = 0.4;
  group.add(rim);
}

/**
 * Generate fire pit with optional animated flames
 */
function generateFirePit(group: THREE.Group, material: THREE.Material, animated = false) {
  // Bowl
  const bowlGeo = new THREE.CylinderGeometry(0.5, 0.4, 0.3, 16, 1, true);
  const bowl = new THREE.Mesh(bowlGeo, material);
  bowl.position.y = 0.15;
  group.add(bowl);
  
  // Base
  const baseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.1, 16);
  const base = new THREE.Mesh(baseGeo, material);
  base.position.y = 0.05;
  group.add(base);
  
  // Logs
  const logGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
  const logMat = new THREE.MeshStandardMaterial({ color: 0x4A3728, roughness: 0.9 });
  
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(logGeo, logMat);
    log.position.set((i % 2 - 0.5) * 0.3, 0.3, (Math.floor(i / 2) - 0.5) * 0.3);
    log.rotation.z = i % 2 === 0 ? 0 : Math.PI / 2;
    group.add(log);
  }
  
  // Flames (if animated)
  if (animated) {
    const flameGeo = new THREE.ConeGeometry(0.1, 0.3, 8);
    const flameMat = new THREE.MeshBasicMaterial({ 
      color: 0xFF4500, 
      transparent: true, 
      opacity: 0.8 
    });
    
    for (let i = 0; i < 5; i++) {
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(
        (Math.random() - 0.5) * 0.3,
        0.5 + Math.random() * 0.2,
        (Math.random() - 0.5) * 0.3
      );
      flame.scale.setScalar(0.8 + Math.random() * 0.4);
      flame.userData.animatedFlame = true;
      group.add(flame);
    }
  }
}

/**
 * Generate market umbrella with crank mechanism
 */
function generateMarketUmbrella(group: THREE.Group, material: THREE.Material, animated = false) {
  // Pole
  const poleGeo = new THREE.CylinderGeometry(0.03, 0.04, 2.5, 8);
  const pole = new THREE.Mesh(poleGeo, material);
  pole.position.y = 1.25;
  group.add(pole);
  
  // Umbrella canopy (cone)
  const canopyGeo = new THREE.ConeGeometry(1.5, 0.5, 16);
  const canopyMat = new THREE.MeshStandardMaterial({ 
    color: 0xCC3333, 
    roughness: 0.7,
    side: THREE.DoubleSide 
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = 2.3;
  group.add(canopy);
  
  // Ribs
  const ribGeo = new THREE.CylinderGeometry(0.01, 0.01, 1.5, 8);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(ribGeo, material);
    rib.position.set(0, 2.3, 0);
    rib.rotation.z = -0.3;
    rib.rotation.y = angle;
    group.add(rib);
  }
  
  // Crank handle
  const crankGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.15, 8);
  const crank = new THREE.Mesh(crankGeo, material);
  crank.position.set(0.05, 0.8, 0);
  crank.rotation.z = Math.PI / 2;
  
  if (animated) {
    crank.userData.crankable = true;
  }
  
  group.add(crank);
  
  // Base stand
  const baseGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.1, 16);
  const base = new THREE.Mesh(baseGeo, material);
  base.position.y = 0.05;
  group.add(base);
}

/**
 * Generate pergola structure
 */
function generatePergola(group: THREE.Group, material: THREE.Material) {
  // Posts
  const postGeo = new THREE.BoxGeometry(0.15, 2.5, 0.15);
  const postPositions = [[-1.0, 1.25, -1.0], [1.0, 1.25, -1.0], [-1.0, 1.25, 1.0], [1.0, 1.25, 1.0]];
  
  postPositions.forEach(pos => {
    const post = new THREE.Mesh(postGeo, material);
    post.position.set(...pos);
    group.add(post);
  });
  
  // Top beams
  const beamGeo = new THREE.BoxGeometry(2.4, 0.1, 0.15);
  for (let i = 0; i < 5; i++) {
    const beam = new THREE.Mesh(beamGeo, material);
    beam.position.set(-1.0 + i * 0.5, 2.45, 0);
    group.add(beam);
  }
  
  // Cross slats
  const slatGeo = new THREE.BoxGeometry(0.1, 0.05, 2.4);
  for (let i = 0; i < 8; i++) {
    const slat = new THREE.Mesh(slatGeo, material);
    slat.position.set(0, 2.5, -1.0 + i * 0.3);
    group.add(slat);
  }
}

/**
 * Default export for module compatibility
 */
export default generateOutdoorFurniture;
