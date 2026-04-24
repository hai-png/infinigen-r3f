/**
 * Infinigen R3F Port - Segment Division
 * Ports: core/indoor/segment.py
 */

import { Vector2 } from 'three';

export interface Segment {
  start: Vector2;
  end: Vector2;
  length: number;
  type: 'wall' | 'door' | 'window' | 'opening';
}

export interface RoomSegment {
  segments: Segment[];
  roomId: string;
}

export class SegmentDivider {
  divideIntoSegments(vertices: Vector2[], roomId: string, maxLen = 5.0): RoomSegment {
    const segments: Segment[] = [];
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const start = vertices[i], end = vertices[(i + 1) % n];
      const edgeSegs = this.subdivideEdge(start, end, maxLen);
      for (const seg of edgeSegs) segments.push({ ...seg, type: 'wall' });
    }
    return { segments, roomId };
  }

  private subdivideEdge(start: Vector2, end: Vector2, maxLen: number): Segment[] {
    const dist = start.distanceTo(end);
    if (dist <= maxLen) return [{ start: start.clone(), end: end.clone(), length: dist, type: 'wall' }];
    const num = Math.ceil(dist / maxLen);
    const step = new Vector2().subVectors(end, start).multiplyScalar(1 / num);
    const segs: Segment[] = [];
    for (let i = 0; i < num; i++) {
      const s = new Vector2(start.x + step.x * i, start.y + step.y * i);
      const e = new Vector2(start.x + step.x * (i + 1), start.y + step.y * (i + 1));
      segs.push({ start: s, end: e, length: s.distanceTo(e), type: 'wall' });
    }
    return segs;
  }

  addDoor(segment: Segment, width: number, pos = 0.5): Segment[] {
    if (segment.length < width) return [segment];
    const dir = new Vector2().subVectors(segment.end, segment.start).normalize();
    const ds = new Vector2().addVectors(segment.start, dir.clone().multiplyScalar(pos * (segment.length - width)));
    const de = new Vector2().addVectors(ds, dir.clone().multiplyScalar(width));
    const result: Segment[] = [];
    if (ds.distanceTo(segment.start) > 0.1) result.push({ start: segment.start, end: ds, length: segment.start.distanceTo(ds), type: 'wall' });
    result.push({ start: ds, end: de, length: width, type: 'door' });
    if (segment.end.distanceTo(de) > 0.1) result.push({ start: de, end: segment.end, length: de.distanceTo(segment.end), type: 'wall' });
    return result;
  }

  getMidpoint(seg: Segment): Vector2 {
    return new Vector2().addVectors(seg.start, seg.end).multiplyScalar(0.5);
  }

  getNormal(seg: Segment, inward = true): Vector2 {
    const dir = new Vector2().subVectors(seg.end, seg.start).normalize();
    const norm = new Vector2(-dir.y, dir.x);
    return inward ? norm : norm.negate();
  }
}
