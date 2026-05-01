/**
 * CollisionFilter - Determines which collision layers interact
 */
export class CollisionFilter {
  private rules: Map<number, number> = new Map();

  constructor() {
    // Default: all layers interact with each other
    this.rules.set(0x1, 0xFFFFFFFF); // Default layer
    this.rules.set(0x2, 0xFFFFFFFF); // Static layer
    this.rules.set(0x4, 0xFFFFFFFF); // Dynamic layer
  }

  /**
   * Set which layers a given layer can interact with
   */
  setInteractionMask(layer: number, mask: number): void {
    this.rules.set(layer, mask);
  }

  /**
   * Check if two colliders should collide based on their layers
   */
  shouldCollide(layersA: number, maskA: number, layersB: number, maskB: number): boolean {
    return (layersA & maskB) !== 0 && (layersB & maskA) !== 0;
  }

  /**
   * Get the interaction mask for a layer
   */
  getMask(layer: number): number {
    return this.rules.get(layer) ?? 0xFFFFFFFF;
  }
}

export default CollisionFilter;
