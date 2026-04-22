import { MeshStandardMaterial } from 'three';
export class SkinGenerator {
  constructor(private seed?: number) {}
  generateFur(color: string, length: number): MeshStandardMaterial {
    return new MeshStandardMaterial({ color, roughness: 0.8 });
  }
  generateScales(color: string, pattern: string): MeshStandardMaterial {
    return new MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 });
  }
  generateFeathers(color: string, pattern: string): MeshStandardMaterial {
    return new MeshStandardMaterial({ color, roughness: 0.6 });
  }
  generateSmoothSkin(color: string): MeshStandardMaterial {
    return new MeshStandardMaterial({ color, roughness: 0.3 });
  }
}
