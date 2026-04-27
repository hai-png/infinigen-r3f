import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';

/**
 * Clothing configuration interface
 */
export interface ClothingConfig {
  /** Garment type */
  type: 'shirt' | 'pants' | 'dress' | 'skirt' | 'jacket' | 'coat' | 'socks' | 'underwear';
  
  /** Fabric material type */
  fabricType: 'cotton' | 'wool' | 'silk' | 'linen' | 'polyester' | 'denim' | 'leather';
  
  /** Size category */
  size: 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl';
  
  /** Pattern type */
  pattern?: 'solid' | 'striped' | 'checkered' | 'floral' | 'polkadot' | 'plaid';
  
  /** Primary color */
  primaryColor: THREE.Color;
  
  /** Secondary color (for patterns) */
  secondaryColor?: THREE.Color;
  
  /** Weathering level (0-1) */
  wearLevel?: number;
  
  /** Whether to generate hanger */
  includeHanger?: boolean;
  
  /** Fold style if not hanging */
  foldStyle?: 'neat' | 'casual' | 'crumpled';
}

/**
 * Clothing generator for creating garment meshes
 */
export class ClothingGenerator {
  private config: ClothingConfig;
  
  constructor(config: ClothingConfig) {
    this.config = {
      wearLevel: 0,
      includeHanger: false,
      foldStyle: 'neat',
      ...config
    };
  }
  
  /**
   * Generate clothing mesh
   */
  public generate(): THREE.Group {
    const group = new THREE.Group();
    
    // Generate base garment
    const garmentMesh = this.createGarmentMesh();
    group.add(garmentMesh);
    
    // Add hanger if requested
    if (this.config.includeHanger) {
      const hanger = this.createHanger();
      hanger.position.y = 0.3;
      group.add(hanger);
    }
    
    // Apply wear effects
    if (this.config.wearLevel && this.config.wearLevel > 0) {
      this.applyWearEffects(garmentMesh);
    }
    
    return group;
  }
  
  /**
   * Create base garment mesh based on type
   */
  private createGarmentMesh(): THREE.Mesh {
    const geometry = this.getGarmentGeometry();
    const material = this.createFabricMaterial();
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
  
  /**
   * Get geometry for specific garment type
   */
  private getGarmentGeometry(): THREE.BufferGeometry {
    switch (this.config.type) {
      case 'shirt':
        return this.createShirtGeometry();
      case 'pants':
        return this.createPantsGeometry();
      case 'dress':
        return this.createDressGeometry();
      case 'skirt':
        return this.createSkirtGeometry();
      case 'jacket':
      case 'coat':
        return this.createJacketGeometry();
      case 'socks':
        return this.createSocksGeometry();
      default:
        return this.createSimpleClothGeometry();
    }
  }
  
  /**
   * Create shirt geometry
   */
  private createShirtGeometry(): THREE.BufferGeometry {
    const bodyWidth = 0.25 + this.getSizeFactor() * 0.05;
    const bodyHeight = 0.35;
    const bodyDepth = 0.15;
    
    // Body
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    
    // Sleeves
    const sleeveLength = 0.2;
    const sleeveWidth = 0.08;
    const sleeveDepth = 0.08;
    
    const leftSleeveGeometry = new THREE.CylinderGeometry(sleeveWidth * 0.7, sleeveWidth, sleeveLength, 8);
    const rightSleeveGeometry = new THREE.CylinderGeometry(sleeveWidth * 0.7, sleeveWidth, sleeveLength, 8);
    
    // Collar
    const collarGeometry = new THREE.TorusGeometry(0.06, 0.02, 8, 16, Math.PI);
    
    // Merge geometries (simplified - in production use BufferGeometryUtils.mergeGeometries)
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    
    // Add body vertices
    const bodyPos = bodyGeometry.attributes.position.array;
    positions.push(...bodyPos);
    
    // Transform and add sleeves
    const leftSleevePos = leftSleeveGeometry.attributes.position.array;
    for (let i = 0; i < leftSleevePos.length; i += 3) {
      positions.push(
        leftSleevePos[i] - bodyWidth / 2 - sleeveLength / 2,
        leftSleevePos[i + 1] + bodyHeight / 4,
        leftSleevePos[i + 2]
      );
    }
    
    const rightSleevePos = rightSleeveGeometry.attributes.position.array;
    for (let i = 0; i < rightSleevePos.length; i += 3) {
      positions.push(
        rightSleevePos[i] + bodyWidth / 2 + sleeveLength / 2,
        rightSleevePos[i + 1] + bodyHeight / 4,
        rightSleevePos[i + 2]
      );
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create pants geometry
   */
  private createPantsGeometry(): THREE.BufferGeometry {
    const waistWidth = 0.2 + this.getSizeFactor() * 0.04;
    const hipWidth = 0.22 + this.getSizeFactor() * 0.04;
    const length = 0.5;
    const legWidth = 0.12;
    
    // Waist band
    const waistGeometry = new THREE.CylinderGeometry(waistWidth * 0.6, waistWidth * 0.65, 0.08, 16);
    
    // Legs
    const leftLegGeometry = new THREE.CylinderGeometry(legWidth * 0.7, legWidth, length / 2, 12);
    const rightLegGeometry = new THREE.CylinderGeometry(legWidth * 0.7, legWidth, length / 2, 12);
    
    const positions: number[] = [];
    
    // Add waist
    const waistPos = waistGeometry.attributes.position.array;
    positions.push(...waistPos);
    
    // Add legs
    const leftLegPos = leftLegGeometry.attributes.position.array;
    for (let i = 0; i < leftLegPos.length; i += 3) {
      positions.push(
        leftLegPos[i] - waistWidth / 4,
        leftLegPos[i + 1] - length / 4,
        leftLegPos[i + 2]
      );
    }
    
    const rightLegPos = rightLegGeometry.attributes.position.array;
    for (let i = 0; i < rightLegPos.length; i += 3) {
      positions.push(
        rightLegPos[i] + waistWidth / 4,
        rightLegPos[i + 1] - length / 4,
        rightLegPos[i + 2]
      );
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create dress geometry
   */
  private createDressGeometry(): THREE.BufferGeometry {
    const bodiceWidth = 0.2 + this.getSizeFactor() * 0.04;
    const bodiceHeight = 0.25;
    const skirtTopWidth = bodiceWidth;
    const skirtBottomWidth = 0.4 + this.getSizeFactor() * 0.08;
    const skirtLength = 0.35;
    
    // Bodice
    const bodiceGeometry = new THREE.BoxGeometry(bodiceWidth, bodiceHeight, 0.15);
    
    // Skirt (cone-like)
    const skirtGeometry = new THREE.CylinderGeometry(skirtTopWidth * 0.6, skirtBottomWidth * 0.6, skirtLength, 16);
    
    const positions: number[] = [];
    
    // Add bodice
    const bodicePos = bodiceGeometry.attributes.position.array;
    positions.push(...bodicePos);
    
    // Add skirt
    const skirtPos = skirtGeometry.attributes.position.array;
    for (let i = 0; i < skirtPos.length; i += 3) {
      positions.push(
        skirtPos[i],
        skirtPos[i + 1] - bodiceHeight / 2 - skirtLength / 2,
        skirtPos[i + 2]
      );
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create skirt geometry
   */
  private createSkirtGeometry(): THREE.BufferGeometry {
    const waistWidth = 0.18 + this.getSizeFactor() * 0.04;
    const bottomWidth = 0.35 + this.getSizeFactor() * 0.07;
    const length = 0.3;
    
    const geometry = new THREE.CylinderGeometry(waistWidth * 0.6, bottomWidth * 0.6, length, 16);
    return geometry;
  }
  
  /**
   * Create jacket/coat geometry
   */
  private createJacketGeometry(): THREE.BufferGeometry {
    const isCoat = this.config.type === 'coat';
    const bodyWidth = 0.28 + this.getSizeFactor() * 0.05;
    const bodyHeight = isCoat ? 0.5 : 0.35;
    const bodyDepth = 0.18;
    
    // Body
    const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
    
    // Sleeves
    const sleeveLength = isCoat ? 0.35 : 0.25;
    const sleeveWidth = 0.1;
    
    const leftSleeveGeometry = new THREE.CylinderGeometry(sleeveWidth * 0.7, sleeveWidth, sleeveLength, 8);
    const rightSleeveGeometry = new THREE.CylinderGeometry(sleeveWidth * 0.7, sleeveWidth, sleeveLength, 8);
    
    // Collar (larger for coats)
    const collarRadius = isCoat ? 0.08 : 0.06;
    const collarGeometry = new THREE.TorusGeometry(collarRadius, 0.025, 8, 16, Math.PI);
    
    const positions: number[] = [];
    
    // Add body
    const bodyPos = bodyGeometry.attributes.position.array;
    positions.push(...bodyPos);
    
    // Add sleeves
    const leftSleevePos = leftSleeveGeometry.attributes.position.array;
    for (let i = 0; i < leftSleevePos.length; i += 3) {
      positions.push(
        leftSleevePos[i] - bodyWidth / 2 - sleeveLength / 2,
        leftSleevePos[i + 1] + bodyHeight / 4,
        leftSleevePos[i + 2]
      );
    }
    
    const rightSleevePos = rightSleeveGeometry.attributes.position.array;
    for (let i = 0; i < rightSleevePos.length; i += 3) {
      positions.push(
        rightSleevePos[i] + bodyWidth / 2 + sleeveLength / 2,
        rightSleevePos[i + 1] + bodyHeight / 4,
        rightSleevePos[i + 2]
      );
    }
    
    // Add collar
    const collarPos = collarGeometry.attributes.position.array;
    for (let i = 0; i < collarPos.length; i += 3) {
      positions.push(
        collarPos[i],
        collarPos[i + 1] + bodyHeight / 2,
        collarPos[i + 2]
      );
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create socks geometry
   */
  private createSocksGeometry(): THREE.BufferGeometry {
    const footLength = 0.15;
    const ankleHeight = 0.08;
    const footWidth = 0.06;
    
    // Foot part
    const footGeometry = new THREE.CapsuleGeometry(footWidth, footLength - footWidth * 2, 8, 8);
    
    // Ankle part
    const ankleGeometry = new THREE.CylinderGeometry(footWidth * 0.9, footWidth * 1.1, ankleHeight, 12);
    
    const positions: number[] = [];
    
    // Add foot
    const footPos = footGeometry.attributes.position.array;
    positions.push(...footPos);
    
    // Add ankle
    const anklePos = ankleGeometry.attributes.position.array;
    for (let i = 0; i < anklePos.length; i += 3) {
      positions.push(
        anklePos[i],
        anklePos[i + 1] + footLength / 2 + ankleHeight / 2,
        anklePos[i + 2]
      );
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Create simple cloth geometry for unsupported types
   */
  private createSimpleClothGeometry(): THREE.BufferGeometry {
    const width = 0.25;
    const height = 0.35;
    const depth = 0.15;
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    return geometry;
  }
  
  /**
   * Get size factor based on size config
   */
  private getSizeFactor(): number {
    const sizeMap: Record<string, number> = {
      'xs': -0.3,
      's': -0.15,
      'm': 0,
      'l': 0.15,
      'xl': 0.3,
      'xxl': 0.45
    };
    return sizeMap[this.config.size] || 0;
  }
  
  /**
   * Create fabric material
   */
  private createFabricMaterial(): THREE.MeshStandardMaterial {
    const fabricProperties = this.getFabricProperties();
    
    const material = new THREE.MeshStandardMaterial({
      color: this.config.primaryColor,
      roughness: fabricProperties.roughness,
      metalness: fabricProperties.metalness,
      normalScale: new THREE.Vector2(0.5, 0.5),
    });
    
    // Apply pattern if specified
    if (this.config.pattern && this.config.pattern !== 'solid') {
      this.applyPatternToMaterial(material);
    }
    
    return material;
  }
  
  /**
   * Get fabric properties based on type
   */
  private getFabricProperties(): { roughness: number; metalness: number } {
    const fabricMap: Record<string, { roughness: number; metalness: number }> = {
      'cotton': { roughness: 0.8, metalness: 0.0 },
      'wool': { roughness: 0.9, metalness: 0.0 },
      'silk': { roughness: 0.3, metalness: 0.1 },
      'linen': { roughness: 0.75, metalness: 0.0 },
      'polyester': { roughness: 0.4, metalness: 0.05 },
      'denim': { roughness: 0.7, metalness: 0.0 },
      'leather': { roughness: 0.5, metalness: 0.1 }
    };
    
    return fabricMap[this.config.fabricType] || { roughness: 0.7, metalness: 0.0 };
  }
  
  /**
   * Apply pattern to material
   */
  private applyPatternToMaterial(material: THREE.MeshStandardMaterial): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return;
    
    // Fill background
    ctx.fillStyle = `#${this.config.primaryColor.getHexString()}`;
    ctx.fillRect(0, 0, 512, 512);
    
    // Draw pattern
    const secondaryColor = this.config.secondaryColor || new THREE.Color(0xffffff);
    ctx.strokeStyle = `#${secondaryColor.getHexString()}`;
    ctx.lineWidth = 2;
    
    switch (this.config.pattern) {
      case 'striped':
        for (let i = 0; i < 512; i += 20) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 512);
          ctx.stroke();
        }
        break;
        
      case 'checkered':
        const squareSize = 32;
        for (let x = 0; x < 512; x += squareSize * 2) {
          for (let y = 0; y < 512; y += squareSize * 2) {
            ctx.fillStyle = `#${secondaryColor.getHexString()}`;
            ctx.fillRect(x, y, squareSize, squareSize);
            ctx.fillRect(x + squareSize, y + squareSize, squareSize, squareSize);
          }
        }
        break;
        
      case 'polkadot':
        const dotRadius = 8;
        const dotSpacing = 30;
        for (let x = 0; x < 512; x += dotSpacing) {
          for (let y = 0; y < 512; y += dotSpacing) {
            ctx.beginPath();
            ctx.arc(x + dotSpacing / 2, y + dotSpacing / 2, dotRadius, 0, Math.PI * 2);
            ctx.fillStyle = `#${secondaryColor.getHexString()}`;
            ctx.fill();
          }
        }
        break;
        
      case 'floral':
        // Simple floral pattern
        for (let i = 0; i < 50; i++) {
          const x = Math.random() * 512;
          const y = Math.random() * 512;
          const radius = 10 + Math.random() * 15;
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `#${secondaryColor.getHexString()}`;
          ctx.fill();
        }
        break;
        
      case 'plaid':
        // Plaid pattern
        const lineSpacing = 40;
        for (let i = 0; i < 512; i += lineSpacing) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, 512);
          ctx.moveTo(0, i);
          ctx.lineTo(512, i);
          ctx.stroke();
        }
        break;
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    
    material.map = texture;
    material.needsUpdate = true;
  }
  
  /**
   * Apply wear effects to clothing
   */
  private applyWearEffects(mesh: THREE.Mesh): void {
    const material = mesh.material as THREE.MeshStandardMaterial;
    
    // Slightly fade color
    const fadedColor = material.color.clone().lerp(new THREE.Color(0x888888), this.config.wearLevel! * 0.3);
    material.color = fadedColor;
    
    // Increase roughness for worn areas
    material.roughness = Math.min(1.0, material.roughness + this.config.wearLevel! * 0.2);
    
    material.needsUpdate = true;
  }
  
  /**
   * Create hanger for clothing
   */
  private createHanger(): THREE.Mesh {
    const hookGeometry = new THREE.TorusGeometry(0.03, 0.005, 8, 16, Math.PI);
    hookGeometry.rotateX(Math.PI / 2);
    
    const barGeometry = new THREE.CylinderGeometry(0.003, 0.003, 0.25, 8);
    barGeometry.rotateZ(Math.PI / 2);
    
    const hookMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.3,
      metalness: 0.8
    });
    
    const hook = new THREE.Mesh(hookGeometry, hookMaterial);
    hook.position.y = 0.05;
    
    const bar = new THREE.Mesh(barGeometry, hookMaterial);
    bar.position.y = -0.02;
    
    const hangerGroup = new THREE.Group();
    hangerGroup.add(hook);
    hangerGroup.add(bar);
    
    // Return as a single mesh by merging (simplified)
    const combinedGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    
    const hookPos = hookGeometry.attributes.position.array;
    positions.push(...hookPos);
    
    const barPos = barGeometry.attributes.position.array;
    for (let i = 0; i < barPos.length; i += 3) {
      positions.push(barPos[i], barPos[i + 1] - 0.07, barPos[i + 2]);
    }
    
    combinedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    combinedGeometry.computeVertexNormals();
    
    const hangerMesh = new THREE.Mesh(combinedGeometry, hookMaterial);
    return hangerMesh;
  }
  
  /**
   * Generate folded clothing pile
   */
  public generateFoldedPile(count: number = 3): THREE.Group {
    const pile = new THREE.Group();
    
    for (let i = 0; i < count; i++) {
      const foldedPiece = this.createFoldedPiece();
      foldedPiece.position.y = i * 0.03;
      foldedPiece.rotation.z = (Math.random() - 0.5) * 0.3;
      foldedPiece.rotation.x = (Math.random() - 0.5) * 0.2;
      pile.add(foldedPiece);
    }
    
    return pile;
  }
  
  /**
   * Create a single folded piece of clothing
   */
  private createFoldedPiece(): THREE.Mesh {
    const foldStyle = this.config.foldStyle || 'neat';
    
    let width = 0.2;
    let height = 0.03;
    let depth = 0.15;
    
    if (foldStyle === 'casual') {
      height = 0.05;
      width *= 0.9;
    } else if (foldStyle === 'crumpled') {
      height = 0.06;
      width *= 0.85;
      depth *= 0.9;
    }
    
    const geometry = new THREE.BoxGeometry(width, height, depth);
    
    // Add some deformation for casual/crumpled styles
    if (foldStyle !== 'neat') {
      const positions = geometry.attributes.position.array;
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += (Math.random() - 0.5) * 0.02;
        positions[i + 1] += (Math.random() - 0.5) * 0.01;
        positions[i + 2] += (Math.random() - 0.5) * 0.02;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    
    const material = this.createFabricMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }
}

export default ClothingGenerator;
