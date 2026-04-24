/**
 * Infinigen R3F Port - Floor Plan Generation
 * Ports: core/indoor/floor_plan.py
 */

import { RoomGraph } from './base.js';
import { Vector2 } from 'three';

export interface FloorPlanParams {
  minRoomArea: number;
  maxRoomArea: number;
  aspectRatioMin: number;
  aspectRatioMax: number;
}

export interface RoomContour {
  vertices: Vector2[];
  area: number;
  centroid: Vector2;
  roomId: string;
}

export class FloorPlanGenerator {
  private params: FloorPlanParams;

  constructor(params: Partial<FloorPlanParams> = {}) {
    this.params = {
      minRoomArea: params.minRoomArea ?? 4.0,
      maxRoomArea: params.maxRoomArea ?? 50.0,
      aspectRatioMin: params.aspectRatioMin ?? 0.5,
      aspectRatioMax: params.aspectRatioMax ?? 2.0,
    };
  }

  generate(roomGraph: RoomGraph): RoomContour[] {
    const contours: RoomContour[] = [];
    const cycles = roomGraph.computeCycleBasis();
    
    for (let i = 0; i < Math.min(roomGraph.rooms.length, cycles.length); i++) {
      const room = roomGraph.rooms[i];
      const cycle = cycles[i];
      const contour = this.generateRoomContour(room.id, cycle);
      if (contour && this.validateContour(contour)) {
        contours.push(contour);
      }
    }
    return contours;
  }

  private generateRoomContour(roomId: string, cycle: string[]): RoomContour | null {
    if (cycle.length < 3) return null;
    const vertices = cycle.map((_, i) => {
      const angle = (2 * Math.PI * i) / cycle.length;
      return new Vector2(Math.cos(angle) * 5, Math.sin(angle) * 5);
    });
    
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      area += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    }
    area = Math.abs(area) / 2;
    
    const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
    const cy = vertices.reduce((s, v) => s + v.y, 0) / vertices.length;
    
    return { vertices, area, centroid: new Vector2(cx, cy), roomId };
  }

  private validateContour(contour: RoomContour): boolean {
    if (contour.area < this.params.minRoomArea || contour.area > this.params.maxRoomArea) return false;
    const xs = contour.vertices.map(v => v.x);
    const ys = contour.vertices.map(v => v.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w === 0 || h === 0) return false;
    const ar = Math.max(w, h) / Math.min(w, h);
    return ar >= this.params.aspectRatioMin && ar <= this.params.aspectRatioMax;
  }
}
