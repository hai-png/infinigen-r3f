/**
 * Infinigen R3F Port - Contour Operations
 * Ports: core/indoor/contour.py
 */

import { Vector2 } from 'three';

export interface Contour {
  vertices: Vector2[];
  holes: Contour[];
  isHole: boolean;
}

export class ContourOperations {
  simplify(vertices: Vector2[], epsilon = 0.1): Vector2[] {
    if (vertices.length <= 2) return vertices;
    let maxDist = 0, maxIndex = 0;
    const start = vertices[0], end = vertices[vertices.length - 1];
    for (let i = 1; i < vertices.length - 1; i++) {
      const dist = this.perpDistance(vertices[i], start, end);
      if (dist > maxDist) { maxDist = dist; maxIndex = i; }
    }
    if (maxDist > epsilon) {
      const left = this.simplify(vertices.slice(0, maxIndex + 1), epsilon);
      const right = this.simplify(vertices.slice(maxIndex), epsilon);
      return [...left.slice(0, -1), ...right];
    }
    return [start, end];
  }

  private perpDistance(p: Vector2, a: Vector2, b: Vector2): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return p.distanceTo(a);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const proj = new Vector2(a.x + t * dx, a.y + t * dy);
    return p.distanceTo(proj);
  }

  convexHull(points: Vector2[]): Vector2[] {
    if (points.length < 3) return points;
    let lowest = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < points[lowest].y || (points[i].y === points[lowest].y && points[i].x < points[lowest].x)) {
        lowest = i;
      }
    }
    [points[0], points[lowest]] = [points[lowest], points[0]];
    const pivot = points[0];
    points.sort((a, b) => {
      if (a === pivot) return -1;
      if (b === pivot) return 1;
      const angA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
      const angB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
      if (angA !== angB) return angA - angB;
      return a.distanceTo(pivot) - b.distanceTo(pivot);
    });
    const hull: Vector2[] = [];
    for (const pt of points) {
      while (hull.length >= 2) {
        const top = hull[hull.length - 1], second = hull[hull.length - 2];
        if (this.cross(second, top, pt) >= 0) break;
        hull.pop();
      }
      hull.push(pt);
    }
    return hull;
  }

  private cross(o: Vector2, a: Vector2, b: Vector2): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  area(vertices: Vector2[]): number {
    let sum = 0;
    for (let i = 0; i < vertices.length; i++) {
      const j = (i + 1) % vertices.length;
      sum += vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    }
    return Math.abs(sum) / 2;
  }

  containsPoint(vertices: Vector2[], point: Vector2): boolean {
    let inside = false;
    const n = vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = vertices[i].y, yi = vertices[i].x;
      const xj = vertices[j].y, yj = vertices[j].x;
      if (((yi > point.y) !== (xj > point.y)) && (point.x < (yj - yi) * (point.y - xi) / (xj - xi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }
}
