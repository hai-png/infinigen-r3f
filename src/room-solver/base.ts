/**
 * Room Graph - Indoor Scene Layout Representation
 * 
 * Ports: infinigen/core/constraints/example_solver/room/base.py
 * 
 * Represents room adjacency graphs for indoor scene generation.
 */

import { Semantics } from '../tags/index.js';
import { intHash } from '../math/index.js';

export interface RoomGraphData {
  neighbours: Map<string, Set<string>>;
  rooms: string[];
  entrance: string | null;
}

export class RoomGraph {
  public ns: number[][]; // Neighbour indices
  public names: string[]; // Room names
  private _entrance: number | null;
  public invalidIndices: Set<number>;

  constructor(children: number[][], names: string[], entrance?: number | null) {
    this.ns = Array.from({ length: children.length }, () => [] as number[]);
    this.names = names;
    this._entrance = entrance ?? null;

    // Build bidirectional neighbour list
    for (let i = 0; i < children.length; i++) {
      const cs = children[i];
      for (const c of cs) {
        if (!this.ns[i].includes(c)) {
          this.ns[i].push(c);
        }
        if (!this.ns[c].includes(i)) {
          this.ns[c].push(i);
        }
      }
    }

    // Mark invalid indices (exterior and entrance rooms)
    this.invalidIndices = new Set<number>();
    for (let i = 0; i < this.names.length; i++) {
      const roomType = getRoomType(this.names[i]);
      if (roomType === Semantics.Exterior || roomType === Semantics.Entrance) {
        this.invalidIndices.add(i);
      }
    }
  }

  /**
   * Check if the graph is planar
   */
  get isPlanar(): boolean {
    try {
      // Simple planarity check - would need full implementation
      // For now, use a heuristic based on edge count
      const nodeCount = this.names.length;
      const edgeCount = this.ns.reduce((sum, neighbours) => sum + neighbours.length, 0) / 2;
      
      // Planar graph: E <= 3V - 6 (for V >= 3)
      if (nodeCount >= 3) {
        return edgeCount <= 3 * nodeCount - 6;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get cycle basis of the graph
   */
  get cycleBasis(): number[][] {
    // TODO: Implement proper cycle detection
    // For now, return empty array
    return [];
  }

  /**
   * Get rooms by type
   */
  getByType(type: Semantics): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.names.length; i++) {
      if (getRoomType(this.names[i]) === type) {
        result.push(i);
      }
    }
    return result;
  }

  /**
   * Get number of valid rooms (excluding exterior/entrance)
   */
  get length(): number {
    return this.names.length - 1;
  }

  /**
   * String representation
   */
  toString(): string {
    return JSON.stringify({
      neighbours: this.ns,
      rooms: this.names,
      entrance: this._entrance
    });
  }

  /**
   * Hash code
   */
  hashCode(): number {
    return intHash(this.toString());
  }

  /**
   * Get neighbours map
   */
  get neighbours(): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (let i = 0; i < this.names.length; i++) {
      const name = this.names[i];
      const neighbourSet = new Set<string>();
      for (const n of this.ns[i]) {
        neighbourSet.add(this.names[n]);
      }
      result.set(name, neighbourSet);
    }
    return result;
  }

  /**
   * Get valid neighbours (excluding invalid indices)
   */
  get validNeighbours(): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (let i = 0; i < this.names.length; i++) {
      if (this.invalidIndices.has(i)) continue;
      
      const name = this.names[i];
      const neighbourSet = new Set<string>();
      for (const n of this.ns[i]) {
        if (!this.invalidIndices.has(n)) {
          neighbourSet.add(this.names[n]);
        }
      }
      result.set(name, neighbourSet);
    }
    return result;
  }

  /**
   * Get valid neighbour indices
   */
  get validNs(): Map<number, Set<number>> {
    const result = new Map<number, Set<number>>();
    for (let i = 0; i < this.ns.length; i++) {
      if (this.invalidIndices.has(i)) continue;
      
      const neighbourSet = new Set<number>();
      for (const n of this.ns[i]) {
        if (!this.invalidIndices.has(n)) {
          neighbourSet.add(n);
        }
      }
      result.set(i, neighbourSet);
    }
    return result;
  }

  /**
   * Get entrance room name
   */
  get entrance(): string | null {
    if (this._entrance === null) return null;
    return this.names[this._entrance];
  }

  /**
   * Get root room (entrance or staircase)
   */
  get root(): string {
    if (this.entrance !== null) {
      return this.entrance;
    }
    
    const staircases = this.getByType(Semantics.StaircaseRoom);
    if (staircases.length > 0) {
      return this.names[staircases[0]];
    }
    
    return this.names[0];
  }

  /**
   * Serialize to plain object
   */
  toJSON(): RoomGraphData {
    return {
      neighbours: this.neighbours,
      rooms: this.names,
      entrance: this.entrance
    };
  }

  /**
   * Create from plain object
   */
  static fromJSON(data: RoomGraphData): RoomGraph {
    // Reconstruct children array from neighbours
    const nameToIndex = new Map<string, number>();
    data.rooms.forEach((name, i) => nameToIndex.set(name, i));
    
    const children: number[][] = [];
    for (const room of data.rooms) {
      const neighs = data.neighbours.get(room) ?? new Set();
      children.push(Array.from(neighs).map(n => nameToIndex.get(n)!));
    }
    
    const entranceIndex = data.entrance ? nameToIndex.get(data.entrance) ?? null : null;
    
    return new RoomGraph(children, data.rooms, entranceIndex);
  }
}

/**
 * Extract room type from name
 */
export function getRoomType(name: string): Semantics {
  const parts = name.split('_');
  const typeStr = parts[0];
  return Semantics[typeStr as keyof typeof Semantics] || Semantics.Room;
}

/**
 * Extract room level from name
 */
export function getRoomLevel(name: string): number {
  const parts = name.split('/')[0].split('_');
  return parseInt(parts[1], 10) || 0;
}

/**
 * Generate room name
 */
export function generateRoomName(
  type: Semantics,
  level: number,
  n: number = 0
): string {
  return `${Semantics[type]}_${level}/${n}`;
}

/**
 * Get valid rooms from state (excluding exterior/staircase)
 */
export function* getValidRooms(state: any): Generator<[string, any]> {
  for (const [name, objSt] of state.objs.entries()) {
    const roomType = getRoomType(name);
    if (roomType !== Semantics.Exterior && roomType !== Semantics.Staircase) {
      yield [name, objSt];
    }
  }
}
