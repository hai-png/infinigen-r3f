/**
 * Room Solidification Module - Hybrid Implementation
 * 
 * Converts abstract constraint graph into concrete 3D room geometry.
 * 
 * Features:
 * 1. Graph Traversal & Layout Calculation
 * 2. Wall/Floor/Ceiling Generation
 * 3. Door/Window Placement based on connectivity
 * 4. Semantic Tagging of architectural elements
 */

import * as THREE from 'three';
import type { ConstraintGraph, Node, Edge } from '../domain/types';

export interface RoomConfig {
  wallHeight: number;
  wallThickness: number;
  floorThickness: number;
  doorWidth: number;
  doorHeight: number;
  windowWidth: number;
  windowHeight: number;
}

const DEFAULT_ROOM_CONFIG: RoomConfig = {
  wallHeight: 3.0,
  wallThickness: 0.2,
  floorThickness: 0.1,
  doorWidth: 0.9,
  doorHeight: 2.1,
  windowWidth: 1.5,
  windowHeight: 1.2,
};

export interface SolidifiedRoom {
  scene: THREE.Group;
  walls: THREE.Mesh[];
  floor: THREE.Mesh;
  ceiling?: THREE.Mesh;
  doors: Array<{ position: THREE.Vector3; rotation: number; target: string }>;
  windows: Array<{ position: THREE.Vector3; wall: THREE.Mesh }>;
  rooms: Array<{ id: string; bounds: THREE.Box3; center: THREE.Vector3 }>;
}

export class RoomSolidifier {
  private config: RoomConfig;

  constructor(config: Partial<RoomConfig> = {}) {
    this.config = { ...DEFAULT_ROOM_CONFIG, ...config };
  }

  /**
   * Main entry point: Converts constraint graph to 3D room
   */
  solidify(graph: ConstraintGraph): SolidifiedRoom {
    const scene = new THREE.Group();
    
    // 1. Calculate room layouts from graph
    const roomLayouts = this.calculateRoomLayouts(graph);
    
    // 2. Generate architectural elements
    const walls: THREE.Mesh[] = [];
    const doors: SolidifiedRoom['doors'] = [];
    const windows: SolidifiedRoom['windows'] = [];
    
    // 3. Create floor (unified or per-room)
    const floor = this.createFloor(roomLayouts);
    scene.add(floor);
    
    // 4. Build walls for each room
    roomLayouts.forEach((room, index) => {
      const roomWalls = this.createRoomWalls(room, graph, index);
      walls.push(...roomWalls.meshes);
      doors.push(...roomWalls.doors);
      windows.push(...roomWalls.windows);
      
      roomWalls.meshes.forEach(wall => scene.add(wall));
    });
    
    // 5. Optional ceiling
    const ceiling = this.createCeiling(roomLayouts);
    if (ceiling) {
      scene.add(ceiling);
    }
    
    return {
      scene,
      walls,
      floor,
      ceiling: ceiling || undefined,
      doors,
      windows,
      rooms: roomLayouts.map(r => ({
        id: r.id,
        bounds: r.bounds,
        center: r.center,
      })),
    };
  }

  /**
   * Calculates spatial layout from constraint graph
   * Uses simple grid-based placement for now (can be enhanced with solver)
   */
  private calculateRoomLayouts(graph: ConstraintGraph): Array<{
    id: string;
    bounds: THREE.Box3;
    center: THREE.Vector3;
    connections: string[];
    type?: string;
  }> {
    const layouts: Array<any> = [];
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    
    // Group nodes by room type or use explicit room nodes
    const roomNodes = nodes.filter(n => n.type === 'room' || n.tags?.includes('room'));
    
    if (roomNodes.length === 0) {
      // Fallback: Treat entire graph as one room
      const allBounds = this.calculateBoundsFromNodes(nodes);
      layouts.push({
        id: 'main_room',
        bounds: allBounds,
        center: new THREE.Vector3(),
        connections: [],
        type: 'general',
      });
    } else {
      // Create layout for each room node
      roomNodes.forEach((node, idx) => {
        const size = this.inferRoomSize(node);
        const position = new THREE.Vector3(idx * 6, 0, 0); // Simple grid placement
        
        const bounds = new THREE.Box3();
        bounds.min.copy(position).sub(new THREE.Vector3(size.x / 2, 0, size.z / 2));
        bounds.max.copy(position).add(new THREE.Vector3(size.x / 2, this.config.wallHeight, size.z / 2));
        
        const center = bounds.getCenter(new THREE.Vector3());
        
        // Find connected rooms
        const connections = edges
          .filter(e => 
            (e.source === node.id && e.target.startsWith('room')) ||
            (e.target === node.id && e.source.startsWith('room'))
          )
          .map(e => e.source === node.id ? e.target : e.source);
        
        layouts.push({
          id: node.id,
          bounds,
          center,
          connections,
          type: node.tags?.find(t => ['kitchen', 'bedroom', 'bathroom', 'living'].includes(t)),
        });
      });
    }
    
    return layouts;
  }

  /**
   * Creates floor geometry for room layouts
   */
  private createFloor(layouts: Array<{ bounds: THREE.Box3 }>): THREE.Mesh {
    // Unified floor covering all rooms
    const totalBounds = new THREE.Box3();
    layouts.forEach(l => totalBounds.union(l.bounds));
    
    const size = totalBounds.getSize(new THREE.Vector3());
    const geometry = new THREE.BoxGeometry(size.x, this.config.floorThickness, size.z);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x8B4513, // Wood color
      roughness: 0.8,
    });
    
    const floor = new THREE.Mesh(geometry, material);
    floor.position.copy(totalBounds.getCenter(new THREE.Vector3()));
    floor.position.y = -this.config.floorThickness / 2;
    floor.receiveShadow = true;
    floor.userData.semanticType = 'floor';
    
    return floor;
  }

  /**
   * Creates ceiling geometry
   */
  private createCeiling(layouts: Array<{ bounds: THREE.Box3 }>): THREE.Mesh | null {
    const totalBounds = new THREE.Box3();
    layouts.forEach(l => totalBounds.union(l.bounds));
    
    const size = totalBounds.getSize(new THREE.Vector3());
    const geometry = new THREE.BoxGeometry(size.x, this.config.floorThickness, size.z);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,
      roughness: 0.9,
    });
    
    const ceiling = new THREE.Mesh(geometry, material);
    ceiling.position.copy(totalBounds.getCenter(new THREE.Vector3()));
    ceiling.position.y = this.config.wallHeight + this.config.floorThickness / 2;
    ceiling.receiveShadow = true;
    ceiling.userData.semanticType = 'ceiling';
    
    return ceiling;
  }

  /**
   * Creates walls for a single room with door/window cutouts
   */
  private createRoomWalls(
    room: { bounds: THREE.Box3; connections: string[]; id: string },
    graph: ConstraintGraph,
    index: number
  ): { meshes: THREE.Mesh[]; doors: SolidifiedRoom['doors']; windows: SolidifiedRoom['windows'] } {
    const meshes: THREE.Mesh[] = [];
    const doors: SolidifiedRoom['doors'] = [];
    const windows: SolidifiedRoom['windows'] = [];
    
    const size = room.bounds.getSize(new THREE.Vector3());
    const center = room.bounds.getCenter(new THREE.Vector3());
    
    // Create 4 walls (North, South, East, West)
    const wallConfigs = [
      { name: 'north', w: size.x, h: this.config.wallHeight, d: this.config.wallThickness, 
        pos: new THREE.Vector3(center.x, this.config.wallHeight / 2, center.z - size.z / 2), rot: 0 },
      { name: 'south', w: size.x, h: this.config.wallHeight, d: this.config.wallThickness, 
        pos: new THREE.Vector3(center.x, this.config.wallHeight / 2, center.z + size.z / 2), rot: Math.PI },
      { name: 'east', w: size.z, h: this.config.wallHeight, d: this.config.wallThickness, 
        pos: new THREE.Vector3(center.x + size.x / 2, this.config.wallHeight / 2, center.z), rot: Math.PI / 2 },
      { name: 'west', w: size.z, h: this.config.wallHeight, d: this.config.wallThickness, 
        pos: new THREE.Vector3(center.x - size.x / 2, this.config.wallHeight / 2, center.z), rot: -Math.PI / 2 },
    ];
    
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xdddddd,
      roughness: 0.9,
    });
    
    wallConfigs.forEach((config, i) => {
      // Simple wall without boolean cutouts for performance
      // Advanced version would use CSG for door/window holes
      const geometry = new THREE.BoxGeometry(config.w, config.h, config.d);
      const wall = new THREE.Mesh(geometry, material);
      wall.position.copy(config.pos);
      wall.rotation.y = config.rot;
      wall.castShadow = true;
      wall.receiveShadow = true;
      wall.userData.semanticType = 'wall';
      wall.userData.wallName = config.name;
      wall.userData.roomId = room.id;
      
      meshes.push(wall);
      
      // Add door if this wall connects to another room
      if (i < room.connections.length) {
        const targetRoom = room.connections[i];
        const doorPos = config.pos.clone();
        doorPos.y = this.config.doorHeight / 2;
        
        // Offset door position based on wall orientation
        if (config.name === 'north' || config.name === 'south') {
          doorPos.x += (i % 2 === 0 ? 1 : -1) * size.x / 4;
        } else {
          doorPos.z += (i % 2 === 0 ? 1 : -1) * size.z / 4;
        }
        
        doors.push({
          position: doorPos,
          rotation: config.rot,
          target: targetRoom,
        });
      }
      
      // Add windows on exterior walls (simplified logic)
      if (room.connections.length === 0 || i >= room.connections.length) {
        const windowPos = config.pos.clone();
        windowPos.y = this.config.windowHeight + 0.5;
        
        if (config.name === 'north' || config.name === 'south') {
          windowPos.x += size.x / 3;
        } else {
          windowPos.z += size.z / 3;
        }
        
        windows.push({
          position: windowPos,
          wall: wall,
        });
      }
    });
    
    return { meshes, doors, windows };
  }

  /**
   * Helper: Infer room size from tags or defaults
   */
  private inferRoomSize(node: Node): THREE.Vector3 {
    const tags = node.tags || [];
    
    if (tags.includes('kitchen')) return new THREE.Vector3(4, 3, 4);
    if (tags.includes('bedroom')) return new THREE.Vector3(5, 3, 5);
    if (tags.includes('bathroom')) return new THREE.Vector3(3, 3, 2);
    if (tags.includes('living')) return new THREE.Vector3(6, 3, 6);
    
    return new THREE.Vector3(4, 3, 4); // Default
  }

  /**
   * Helper: Calculate bounding box from all nodes
   */
  private calculateBoundsFromNodes(nodes: Node[]): THREE.Box3 {
    const bounds = new THREE.Box3();
    
    nodes.forEach(node => {
      if (node.position) {
        bounds.expandByPoint(node.position);
      }
    });
    
    if (bounds.isEmpty()) {
      bounds.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 3, 10));
    }
    
    return bounds;
  }
}

// Export singleton instance
export const defaultRoomSolidifier = new RoomSolidifier();
