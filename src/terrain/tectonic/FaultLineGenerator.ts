/**
 * Fault Line Generator
 * Generates geological fault lines and associated terrain features
 * 
 * Based on original Infinigen tectonic fault generation algorithms
 */

import { Vector3, Matrix4 } from 'three';

export interface FaultLineParams {
  // Fault geometry
  faultLength: number;         // Length of fault line (km)
  faultDepth: number;          // Depth of fault plane (km)
  dipAngle: number;            // Dip angle of fault (degrees)
  strikeAngle: number;         // Strike direction (degrees from north)
  
  // Displacement
  verticalSlip: number;        // Vertical displacement (m)
  horizontalSlip: number;      // Horizontal (strike-slip) displacement (m)
  slipVariation: number;       // Variation in slip along fault (0-1)
  
  // Segmentation
  numSegments: number;         // Number of fault segments
  segmentVariation: number;    // Variation in segment properties (0-1)
  
  // Associated features
  generatePressureRidges: boolean;
  generateSagPonds: boolean;
  generateOffsetStreams: boolean;
  
  // Fracture zone
  fractureWidth: number;       // Width of fracture zone (km)
  fractureDensity: number;     // Density of secondary fractures (0-1)
}

export interface FaultSegment {
  start: Vector3;
  end: Vector3;
  dipAngle: number;
  slip: number;
  type: 'normal' | 'reverse' | 'strike-slip' | 'oblique';
}

export interface FaultLine {
  segments: FaultSegment[];
  trace: Vector3[];
  fractureZone: Vector3[];
  pressureRidges?: Vector3[][];
  sagPonds?: Vector3[];
  offsetFeatures?: OffsetFeature[];
}

export interface OffsetFeature {
  original: Vector3[];
  displaced: Vector3[];
  offsetAmount: number;
}

export class FaultLineGenerator {
  private params: FaultLineParams;
  
  constructor(params?: Partial<FaultLineParams>) {
    this.params = {
      faultLength: 100,          // km
      faultDepth: 15,            // km
      dipAngle: 60,              // degrees
      strikeAngle: 0,            // degrees (north)
      verticalSlip: 1000,        // m
      horizontalSlip: 2000,      // m
      slipVariation: 0.3,
      numSegments: 5,
      segmentVariation: 0.2,
      generatePressureRidges: true,
      generateSagPonds: true,
      generateOffsetStreams: true,
      fractureWidth: 5,          // km
      fractureDensity: 0.4,
      ...params
    };
  }
  
  /**
   * Update parameters
   */
  updateParams(params: Partial<FaultLineParams>): void {
    this.params = { ...this.params, ...params };
  }
  
  /**
   * Generate fault line system
   */
  generateFaultLine(
    origin: Vector3,
    gridSize: number,
    resolution: number
  ): FaultLine {
    const {
      faultLength, numSegments, segmentVariation,
      verticalSlip, horizontalSlip, slipVariation,
      dipAngle, strikeAngle
    } = this.params;
    
    const cellSize = resolution / gridSize;
    const segments: FaultSegment[] = [];
    const trace: Vector3[] = [];
    
    // Calculate segment length
    const segmentLength = (faultLength * 1000) / numSegments; // Convert to meters
    
    // Generate fault segments
    let currentPosition = origin.clone();
    const strikeRad = (strikeAngle * Math.PI) / 180;
    
    for (let i = 0; i < numSegments; i++) {
      // Add variation to segment properties
      const variation = 1 + (Math.random() - 0.5) * 2 * segmentVariation;
      const segmentDip = dipAngle * (1 + (Math.random() - 0.5) * segmentVariation);
      const segmentSlip = (verticalSlip + horizontalSlip) * 0.5 * variation;
      
      // Calculate segment end position with slight random walk
      const segmentStrike = strikeRad + (Math.random() - 0.5) * 0.2; // ±10 degrees variation
      const endPoint = new Vector3(
        currentPosition.x + Math.sin(segmentStrike) * segmentLength,
        currentPosition.y,
        currentPosition.z + Math.cos(segmentStrike) * segmentLength
      );
      
      // Determine fault type based on slip components
      const verticalComponent = verticalSlip * variation;
      const horizontalComponent = horizontalSlip * variation;
      let faultType: FaultSegment['type'];
      
      if (Math.abs(verticalComponent) > Math.abs(horizontalComponent) * 2) {
        faultType = verticalComponent > 0 ? 'reverse' : 'normal';
      } else if (Math.abs(horizontalComponent) > Math.abs(verticalComponent) * 2) {
        faultType = 'strike-slip';
      } else {
        faultType = 'oblique';
      }
      
      const segment: FaultSegment = {
        start: currentPosition.clone(),
        end: endPoint,
        dipAngle: segmentDip,
        slip: segmentSlip,
        type: faultType
      };
      
      segments.push(segment);
      trace.push(currentPosition.clone());
      
      currentPosition = endPoint;
    }
    
    // Add final point
    trace.push(currentPosition);
    
    // Generate fracture zone
    const fractureZone = this.generateFractureZone(segments, cellSize);
    
    // Generate associated features
    const faultLine: FaultLine = {
      segments,
      trace,
      fractureZone
    };
    
    if (this.params.generatePressureRidges) {
      faultLine.pressureRidges = this.generatePressureRidges(segments);
    }
    
    if (this.params.generateSagPonds) {
      faultLine.sagPonds = this.generateSagPonds(segments);
    }
    
    return faultLine;
  }
  
  /**
   * Generate fracture zone around fault
   */
  private generateFractureZone(
    segments: FaultSegment[],
    cellSize: number
  ): Vector3[] {
    const { fractureWidth, fractureDensity } = this.params;
    const fracturePoints: Vector3[] = [];
    const halfWidth = (fractureWidth * 1000) / 2; // Convert to meters
    
    for (const segment of segments) {
      const segmentDir = new Vector3().subVectors(segment.end, segment.start).normalize();
      const segmentLength = segment.start.distanceTo(segment.end);
      const numPoints = Math.floor(segmentLength / cellSize);
      
      // Generate points along segment
      for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const centerPoint = new Vector3().lerpVectors(segment.start, segment.end, t);
        
        // Add points perpendicular to segment
        const perpDir = new Vector3(-segmentDir.z, 0, segmentDir.x);
        const numFractures = Math.floor(fractureDensity * 10);
        
        for (let j = 0; j < numFractures; j++) {
          const offset = (Math.random() - 0.5) * 2 * halfWidth;
          const fracturePoint = centerPoint.clone().add(perpDir.clone().multiplyScalar(offset));
          fracturePoints.push(fracturePoint);
        }
      }
    }
    
    return fracturePoints;
  }
  
  /**
   * Generate pressure ridges along strike-slip faults
   */
  private generatePressureRidges(segments: FaultSegment[]): Vector3[][] {
    const ridges: Vector3[][] = [];
    
    for (const segment of segments) {
      if (segment.type === 'strike-slip' || segment.type === 'oblique') {
        const segmentDir = new Vector3().subVectors(segment.end, segment.start).normalize();
        const segmentLength = segment.start.distanceTo(segment.end);
        
        // Create ridge perpendicular to fault
        const ridgeDir = new Vector3(-segmentDir.z, 0, segmentDir.x);
        const ridgeLength = segmentLength * 0.1; // 10% of segment length
        const numRidges = Math.floor(segmentLength / 5000); // One ridge every 5km
        
        for (let i = 0; i < numRidges; i++) {
          const t = i / numRidges;
          const centerPoint = new Vector3().lerpVectors(segment.start, segment.end, t);
          
          const ridge: Vector3[] = [];
          const numPoints = 10;
          for (let j = 0; j < numPoints; j++) {
            const u = j / (numPoints - 1);
            const height = Math.sin(u * Math.PI) * ridgeLength * 0.3; // Arch shape
            const point = centerPoint.clone()
              .add(ridgeDir.clone().multiplyScalar((u - 0.5) * ridgeLength))
              .setY(height);
            ridge.push(point);
          }
          
          ridges.push(ridge);
        }
      }
    }
    
    return ridges;
  }
  
  /**
   * Generate sag ponds in releasing bends
   */
  private generateSagPonds(segments: FaultSegment[]): Vector3[] {
    const ponds: Vector3[] = [];
    
    for (let i = 0; i < segments.length - 1; i++) {
      const seg1 = segments[i];
      const seg2 = segments[i + 1];
      
      // Check for releasing bend (step-over that creates depression)
      const dir1 = new Vector3().subVectors(seg1.end, seg1.start).normalize();
      const dir2 = new Vector3().subVectors(seg2.end, seg2.start).normalize();
      
      // Cross product indicates bend direction
      const cross = new Vector3().crossVectors(dir1, dir2);
      
      // If bend creates extension, form sag pond
      if (cross.y < -0.1 || cross.y > 0.1) { // Significant bend
        const pondLocation = seg1.end.clone();
        ponds.push(pondLocation);
      }
    }
    
    return ponds;
  }
  
  /**
   * Apply fault displacement to elevation map
   */
  applyDisplacementToElevation(
    elevationMap: Float32Array,
    faultLine: FaultLine,
    gridSize: number,
    resolution: number
  ): void {
    const cellSize = resolution / gridSize;
    
    for (const segment of faultLine.segments) {
      const segmentDir = new Vector3().subVectors(segment.end, segment.start).normalize();
      const normalDir = new Vector3(-segmentDir.z, 0, segmentDir.x);
      
      // Calculate fault plane
      const dipRad = (segment.dipAngle * Math.PI) / 180;
      const faultNormal = new Vector3(
        normalDir.x * Math.sin(dipRad),
        Math.cos(dipRad),
        normalDir.z * Math.sin(dipRad)
      ).normalize();
      
      // Apply displacement to hanging wall
      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const worldX = x * cellSize;
          const worldZ = y * cellSize;
          const pos = new Vector3(worldX, 0, worldZ);
          
          // Find closest point on segment
          const closestPoint = this.closestPointOnSegment(pos, segment);
          const distanceFromFault = pos.distanceTo(closestPoint);
          
          // Determine if point is in hanging wall
          const vectorToSegment = new Vector3().subVectors(pos, closestPoint);
          const isInHangingWall = vectorToSegment.dot(faultNormal) > 0;
          
          if (isInHangingWall) {
            // Calculate displacement with distance falloff
            const influenceWidth = 10000; // 10 km
            const falloff = Math.exp(-distanceFromFault / influenceWidth);
            
            // Vertical displacement
            const verticalDisp = segment.slip * Math.sin(dipRad) * falloff;
            
            // Horizontal displacement (strike-slip)
            const horizontalDisp = segment.slip * Math.cos(dipRad) * falloff * 0.5;
            
            // Apply to elevation
            const index = y * gridSize + x;
            elevationMap[index] += verticalDisp;
            
            // Note: Horizontal displacement would require remeshing
            // For now, we just note it could be implemented
          }
        }
      }
    }
  }
  
  /**
   * Find closest point on fault segment
   */
  private closestPointOnSegment(point: Vector3, segment: FaultSegment): Vector3 {
    const segmentVec = new Vector3().subVectors(segment.end, segment.start);
    const pointVec = new Vector3().subVectors(point, segment.start);
    
    const segmentLengthSq = segmentVec.lengthSq();
    if (segmentLengthSq === 0) return segment.start.clone();
    
    let t = pointVec.dot(segmentVec) / segmentLengthSq;
    t = Math.max(0, Math.min(1, t)); // Clamp to segment
    
    return new Vector3().lerpVectors(segment.start, segment.end, t);
  }
  
  /**
   * Generate offset stream features
   */
  generateOffsetStreams(
    streams: Vector3[][],
    faultLine: FaultLine
  ): OffsetFeature[] {
    const offsetFeatures: OffsetFeature[] = [];
    
    for (const stream of streams) {
      // Check if stream crosses fault
      let crossesFault = false;
      let crossingPoint: Vector3 | null = null;
      
      for (const segment of faultLine.segments) {
        for (let i = 0; i < stream.length - 1; i++) {
          const p1 = stream[i];
          const p2 = stream[i + 1];
          
          // Simple intersection test
          if (this.segmentsIntersect(p1, p2, segment.start, segment.end)) {
            crossesFault = true;
            crossingPoint = this.findIntersection(p1, p2, segment.start, segment.end);
            break;
          }
        }
        if (crossesFault) break;
      }
      
      if (crossesFault && crossingPoint) {
        // Create offset feature
        const splitIndex = stream.findIndex(p => 
          p.distanceTo(crossingPoint!) < 100 // Within 100m of crossing
        );
        
        if (splitIndex > 0) {
          const original = [...stream];
          const displaced = stream.slice(splitIndex).map(p => {
            const offset = new Vector3(
              this.params.horizontalSlip,
              0,
              0
            );
            return p.clone().add(offset);
          });
          
          offsetFeatures.push({
            original,
            displaced,
            offsetAmount: this.params.horizontalSlip
          });
        }
      }
    }
    
    return offsetFeatures;
  }
  
  /**
   * Check if two 2D line segments intersect
   */
  private segmentsIntersect(
    p1: Vector3, p2: Vector3,
    p3: Vector3, p4: Vector3
  ): boolean {
    const det = (p2.x - p1.x) * (p4.z - p3.z) - (p4.x - p3.x) * (p2.z - p1.z);
    if (det === 0) return false;
    
    const lambda = ((p4.z - p3.z) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.z - p1.z)) / det;
    const gamma = ((p1.z - p2.z) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.z - p1.z)) / det;
    
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
  }
  
  /**
   * Find intersection point of two 2D lines
   */
  private findIntersection(
    p1: Vector3, p2: Vector3,
    p3: Vector3, p4: Vector3
  ): Vector3 {
    const det = (p2.x - p1.x) * (p4.z - p3.z) - (p4.x - p3.x) * (p2.z - p1.z);
    if (det === 0) return new Vector3();
    
    const lambda = ((p4.z - p3.z) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.z - p1.z)) / det;
    
    return new Vector3(
      p1.x + lambda * (p2.x - p1.x),
      0,
      p1.z + lambda * (p2.z - p1.z)
    );
  }
  
  /**
   * Render fault line as Three.js geometry
   */
  createFaultGeometry(faultLine: FaultLine): { positions: Float32Array; indices: Uint32Array } {
    const positions: number[] = [];
    const indices: number[] = [];
    
    // Create line geometry for fault trace
    for (const point of faultLine.trace) {
      positions.push(point.x, point.y, point.z);
    }
    
    // Create indices for line strip
    for (let i = 0; i < faultLine.trace.length; i++) {
      indices.push(i);
    }
    
    // Add pressure ridges if present
    if (faultLine.pressureRidges) {
      const ridgeStartIndex = positions.length / 3;
      
      for (const ridge of faultLine.pressureRidges) {
        const ridgeIndexStart = positions.length / 3;
        
        for (const point of ridge) {
          positions.push(point.x, point.y, point.z);
        }
        
        // Create triangle strip for ridge
        for (let i = 0; i < ridge.length - 2; i++) {
          indices.push(ridgeIndexStart + i, ridgeIndexStart + i + 1, ridgeIndexStart + i + 2);
        }
      }
    }
    
    return {
      positions: new Float32Array(positions),
      indices: new Uint32Array(indices)
    };
  }
}
