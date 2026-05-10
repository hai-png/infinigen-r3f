/**
 * FaultLineGenerator — Geologically Accurate Fault System Generation
 *
 * Generates fault lines and associated terrain features based on
 * tectonic boundary classification. Each fault type produces distinct
 * geometry and terrain modification:
 *
 * - Convergent → Reverse/thrust faults (dip-slip)
 * - Divergent → Normal faults (dip-slip, extensional)
 * - Transform → Strike-slip faults (lateral)
 * - Oblique → Combined dip-slip + strike-slip
 *
 * Features generated:
 * - Fault trace geometry with proper segmentation
 * - Fracture zones around faults
 * - Pressure ridges (compressional)
 * - Sag ponds (extensional step-overs)
 * - Offset stream features
 * - Fault scarp profiles
 * - En echelon fracture arrays
 * - Horse-tail splay terminations
 *
 * Ported/inspired by: infinigen/terrain/tectonic/fault_generator.py
 */

import { Vector3, Matrix4 } from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NoiseUtils } from '@/core/util/math/noise';
import type {
  PlateBoundary,
  TectonicPlate,
  BoundaryType,
  ConvergentSubType,
  DivergentSubType,
} from './TectonicPlateSimulator';

// ============================================================================
// Configuration Types
// ============================================================================

/** Parameters for fault line generation. */
export interface FaultLineParams {
  /** Total length of the fault (km) */
  faultLength: number;
  /** Depth of the fault plane (km) */
  faultDepth: number;
  /** Dip angle of the fault plane (degrees) */
  dipAngle: number;
  /** Strike direction (degrees from north) */
  strikeAngle: number;
  /** Vertical displacement (m) */
  verticalSlip: number;
  /** Horizontal (strike-slip) displacement (m) */
  horizontalSlip: number;
  /** Variation in slip along fault (0-1) */
  slipVariation: number;
  /** Number of fault segments */
  numSegments: number;
  /** Variation in segment properties (0-1) */
  segmentVariation: number;
  /** Whether to generate pressure ridges */
  generatePressureRidges: boolean;
  /** Whether to generate sag ponds */
  generateSagPonds: boolean;
  /** Whether to generate offset stream features */
  generateOffsetStreams: boolean;
  /** Width of the fracture zone (km) */
  fractureWidth: number;
  /** Density of secondary fractures (0-1) */
  fractureDensity: number;
  /** Random seed */
  seed: number;
  /** Boundary type that spawned this fault */
  boundaryType: BoundaryType;
  /** Boundary sub-type */
  boundarySubType: ConvergentSubType | DivergentSubType | null;
  /** Convergence rate at the boundary */
  convergenceRate: number;
}

// ============================================================================
// Fault Data Types
// ============================================================================

/** Classification of fault segment types. */
export type FaultSegmentType = 'normal' | 'reverse' | 'strike-slip' | 'oblique' | 'thrust';

/** A single segment of a fault line. */
export interface FaultSegment {
  /** Start point of the segment */
  start: Vector3;
  /** End point of the segment */
  end: Vector3;
  /** Dip angle of this segment (degrees) */
  dipAngle: number;
  /** Net slip displacement (m) */
  slip: number;
  /** Vertical component of slip (m) */
  verticalSlip: number;
  /** Horizontal component of slip (m) */
  horizontalSlip: number;
  /** Fault segment type */
  type: FaultSegmentType;
  /** Segment length (m) */
  length: number;
  /** Local stress intensity (0-1) */
  stress: number;
  /** Curvature of the segment (0 = straight) */
  curvature: number;
}

/** Offset feature created by fault displacement. */
export interface OffsetFeature {
  /** Original feature positions */
  original: Vector3[];
  /** Displaced feature positions */
  displaced: Vector3[];
  /** Amount of offset (m) */
  offsetAmount: number;
  /** Direction of offset */
  offsetDirection: Vector3;
}

/** A pressure ridge formed by compressional faulting. */
export interface PressureRidge {
  /** Ridge crest line points */
  crest: Vector3[];
  /** Maximum ridge height (m) */
  height: number;
  /** Ridge width (m) */
  width: number;
  /** Ridge length (m) */
  length: number;
}

/** A sag pond formed in extensional step-overs. */
export interface SagPond {
  /** Center position */
  center: Vector3;
  /** Pond radius (m) */
  radius: number;
  /** Pond depth (m) */
  depth: number;
  /** Elongation direction */
  elongation: Vector3;
}

/** An en echelon fracture set. */
export interface EnEchelonFractures {
  /** Individual fracture line segments */
  fractures: Vector3[][];
  /** Overall trend direction */
  trend: Vector3;
  /** Spacing between fractures (m) */
  spacing: number;
  /** Overlap between adjacent fractures (0-1) */
  overlap: number;
}

/** A complete fault line system. */
export interface FaultLine {
  /** All segments of this fault */
  segments: FaultSegment[];
  /** Surface trace of the fault */
  trace: Vector3[];
  /** Fracture zone points around the fault */
  fractureZone: Vector3[];
  /** Pressure ridges (compressional features) */
  pressureRidges: PressureRidge[];
  /** Sag ponds (extensional features) */
  sagPonds: SagPond[];
  /** Offset features from fault displacement */
  offsetFeatures: OffsetFeature[];
  /** En echelon fracture arrays */
  enEchelonFractures: EnEchelonFractures[];
  /** Fault type classification */
  faultType: FaultSegmentType;
  /** Boundary type that created this fault */
  boundaryType: BoundaryType;
  /** Total fault length (m) */
  totalLength: number;
  /** Maximum displacement (m) */
  maxDisplacement: number;
  /** Average strike direction (radians) */
  averageStrike: number;
  /** Scarp profile heights along the fault */
  scarpProfile: Float32Array;
}

// ============================================================================
// FaultLineGenerator
// ============================================================================

/**
 * Generates geologically accurate fault line systems from tectonic boundary data.
 *
 * The generator takes a plate boundary (or standalone parameters) and produces
 * a complete fault system with associated features. The fault type, geometry,
 * and features are all derived from the boundary classification.
 *
 * Usage (from tectonic boundary):
 * ```typescript
 * const generator = new FaultLineGenerator({ seed: 42 });
 * const faultLine = generator.generateFromBoundary(boundary, plates, 256, 1000);
 * ```
 *
 * Usage (standalone):
 * ```typescript
 * const generator = new FaultLineGenerator({
 *   seed: 42,
 *   faultLength: 100,
 *   boundaryType: 'transform',
 * });
 * const faultLine = generator.generateFaultLine(origin, gridSize, resolution);
 * ```
 */
export class FaultLineGenerator {
  private params: FaultLineParams;
  private rng: SeededRandom;
  private noise: NoiseUtils;

  constructor(params?: Partial<FaultLineParams>) {
    this.params = {
      faultLength: 100,
      faultDepth: 15,
      dipAngle: 60,
      strikeAngle: 0,
      verticalSlip: 1000,
      horizontalSlip: 2000,
      slipVariation: 0.3,
      numSegments: 5,
      segmentVariation: 0.2,
      generatePressureRidges: true,
      generateSagPonds: true,
      generateOffsetStreams: true,
      fractureWidth: 5,
      fractureDensity: 0.4,
      seed: 42,
      boundaryType: 'transform',
      boundarySubType: null,
      convergenceRate: 0.5,
      ...params,
    };
    this.rng = new SeededRandom(this.params.seed);
    this.noise = new NoiseUtils(this.params.seed);
  }

  /**
   * Update parameters and re-seed the RNG.
   */
  updateParams(params: Partial<FaultLineParams>): void {
    this.params = { ...this.params, ...params };
    if (params.seed !== undefined) {
      this.rng = new SeededRandom(params.seed);
      this.noise = new NoiseUtils(params.seed);
    }
  }

  // ========================================================================
  // Generation from Tectonic Boundary
  // ========================================================================

  /**
   * Generate a fault line system from a tectonic plate boundary.
   *
   * Automatically determines fault type, orientation, and displacement
   * from the boundary classification and plate properties.
   *
   * @param boundary - The plate boundary to generate from
   * @param plates - Array of all plates (for property lookup)
   * @param gridSize - Grid size for heightmap coordinates
   * @param resolution - World-space resolution
   * @returns Complete fault line system
   */
  generateFromBoundary(
    boundary: PlateBoundary,
    plates: TectonicPlate[],
    gridSize: number,
    resolution: number
  ): FaultLine {
    const p1 = plates[boundary.plate1];
    const p2 = plates[boundary.plate2];

    // Calculate fault parameters from boundary properties
    const faultOrigin = p1.centroid.clone()
      .add(p2.centroid).multiplyScalar(0.5);

    // Strike direction: perpendicular to boundary normal
    const strikeAngle = Math.atan2(boundary.normal.z, boundary.normal.x) + Math.PI / 2;

    // Scale fault length by boundary cell count
    const cellSize = resolution / gridSize;
    const faultLength = Math.sqrt(boundary.cells.length) * cellSize * 0.01;

    // Scale displacement by convergence rate
    const convergenceFactor = 1 + Math.abs(boundary.convergenceRate) * 5;

    // Determine fault type and parameters from boundary classification
    let faultType: FaultSegmentType;
    let dipAngle: number;
    let verticalSlip: number;
    let horizontalSlip: number;

    switch (boundary.type) {
      case 'convergent':
        if (boundary.subType === 'continental_continental') {
          // Thrust faults in continental collision zones
          faultType = 'thrust';
          dipAngle = 20 + this.rng.nextFloat(0, 25); // Low angle: 20-45°
          verticalSlip = 3000 * convergenceFactor;
          horizontalSlip = 5000 * convergenceFactor;
        } else if (boundary.subType === 'oceanic_continental') {
          // Subduction zone thrust faults
          faultType = 'thrust';
          dipAngle = 15 + this.rng.nextFloat(0, 20); // Very low angle
          verticalSlip = 5000 * convergenceFactor;
          horizontalSlip = 8000 * convergenceFactor;
        } else {
          // Oceanic-oceanic: steep reverse faults
          faultType = 'reverse';
          dipAngle = 40 + this.rng.nextFloat(0, 30);
          verticalSlip = 2000 * convergenceFactor;
          horizontalSlip = 1500 * convergenceFactor;
        }
        break;

      case 'divergent':
        // Normal faults in extensional settings
        faultType = 'normal';
        dipAngle = 50 + this.rng.nextFloat(0, 25); // Steep: 50-75°
        verticalSlip = 1500 * (1 + Math.abs(boundary.convergenceRate) * 3);
        horizontalSlip = 500; // Minor horizontal component
        break;

      case 'transform':
        // Primarily strike-slip with minor dip-slip
        faultType = 'strike-slip';
        dipAngle = 80 + this.rng.nextFloat(0, 10); // Near-vertical
        verticalSlip = 200; // Minor vertical
        horizontalSlip = 3000 * convergenceFactor;
        break;

      default:
        faultType = 'oblique';
        dipAngle = 45 + this.rng.nextFloat(0, 20);
        verticalSlip = 1500 * convergenceFactor;
        horizontalSlip = 2500 * convergenceFactor;
    }

    // Configure parameters from boundary
    const faultParams: Partial<FaultLineParams> = {
      faultLength,
      strikeAngle: (strikeAngle * 180) / Math.PI,
      dipAngle,
      verticalSlip,
      horizontalSlip,
      boundaryType: boundary.type,
      boundarySubType: boundary.subType,
      convergenceRate: boundary.convergenceRate,
      numSegments: Math.max(3, Math.floor(faultLength / 15)),
    };

    this.updateParams(faultParams);

    return this.generateFaultLine(faultOrigin, gridSize, resolution);
  }

  // ========================================================================
  // Core Fault Generation
  // ========================================================================

  /**
   * Generate a complete fault line system.
   *
   * @param origin - Starting point of the fault
   * @param gridSize - Grid size for heightmap coordinates
   * @param resolution - World-space resolution
   * @returns Complete fault line with all associated features
   */
  generateFaultLine(
    origin: Vector3,
    gridSize: number,
    resolution: number
  ): FaultLine {
    const {
      faultLength, numSegments, segmentVariation,
      verticalSlip, horizontalSlip, slipVariation,
      dipAngle, strikeAngle,
    } = this.params;

    const cellSize = resolution / gridSize;
    const segments: FaultSegment[] = [];
    const trace: Vector3[] = [];

    // Calculate segment length in meters
    const segmentLength = (faultLength * 1000) / numSegments;

    // Generate fault segments with proper type-specific geometry
    let currentPosition = origin.clone();
    const strikeRad = (strikeAngle * Math.PI) / 180;

    for (let i = 0; i < numSegments; i++) {
      // Add stochastic variation to segment properties
      const variation = 1 + (this.rng.next() - 0.5) * 2 * segmentVariation;
      const segmentDip = dipAngle * (1 + (this.rng.next() - 0.5) * segmentVariation * 0.5);

      // Slip varies along the fault (maximum at center, tapers at ends)
      const centerFactor = 1 - Math.pow(2 * (i / numSegments - 0.5), 2);
      const slipVariationFactor = 1 + (this.rng.next() - 0.5) * 2 * slipVariation;
      const localVerticalSlip = verticalSlip * centerFactor * slipVariationFactor * variation;
      const localHorizontalSlip = horizontalSlip * centerFactor * slipVariationFactor * variation;
      const totalSlip = Math.sqrt(
        localVerticalSlip * localVerticalSlip + localHorizontalSlip * localHorizontalSlip
      );

      // Segment strike with random walk (simulates fault segmentation)
      const segmentStrike = strikeRad +
        (this.rng.next() - 0.5) * 0.3 * segmentVariation;

      const endPoint = new Vector3(
        currentPosition.x + Math.cos(segmentStrike) * segmentLength,
        currentPosition.y,
        currentPosition.z + Math.sin(segmentStrike) * segmentLength
      );

      // Determine detailed fault segment type
      const segmentType = this.determineSegmentType(
        localVerticalSlip, localHorizontalSlip, this.params.boundaryType
      );

      // Calculate segment curvature (change in strike direction)
      const curvature = i > 0
        ? Math.abs(segmentStrike - (segments[i - 1]?.length ?? 0) * 0.001)
        : 0;

      // Local stress from slip magnitude
      const stress = Math.min(1, totalSlip / (Math.max(verticalSlip, horizontalSlip) * 2));

      const segment: FaultSegment = {
        start: currentPosition.clone(),
        end: endPoint,
        dipAngle: segmentDip,
        slip: totalSlip,
        verticalSlip: localVerticalSlip,
        horizontalSlip: localHorizontalSlip,
        type: segmentType,
        length: segmentLength,
        stress,
        curvature,
      };

      segments.push(segment);
      trace.push(currentPosition.clone());
      currentPosition = endPoint;
    }

    // Add final point to trace
    trace.push(currentPosition.clone());

    // Generate all associated features
    const fractureZone = this.generateFractureZone(segments, cellSize);
    const pressureRidges = this.params.generatePressureRidges
      ? this.generatePressureRidges(segments)
      : [];
    const sagPonds = this.params.generateSagPonds
      ? this.generateSagPonds(segments)
      : [];
    const enEchelonFractures = this.generateEnEchelonFractures(segments);
    const scarpProfile = this.generateScarpProfile(segments);

    // Compute aggregate properties
    const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
    const maxDisplacement = Math.max(...segments.map(s => s.slip));
    const averageStrike = this.computeAverageStrike(segments);

    // Determine overall fault type
    const faultType = this.determineOverallFaultType(segments);

    return {
      segments,
      trace,
      fractureZone,
      pressureRidges,
      sagPonds,
      offsetFeatures: [],  // Populated separately via generateOffsetStreams
      enEchelonFractures,
      faultType,
      boundaryType: this.params.boundaryType,
      totalLength,
      maxDisplacement,
      averageStrike,
      scarpProfile,
    };
  }

  /**
   * Determine the fault segment type from slip components and boundary type.
   */
  private determineSegmentType(
    vertSlip: number,
    horizSlip: number,
    boundaryType: BoundaryType
  ): FaultSegmentType {
    const absVert = Math.abs(vertSlip);
    const absHoriz = Math.abs(horizSlip);
    const ratio = absHoriz > 0 ? absVert / absHoriz : Infinity;

    // Use boundary type as primary classifier
    switch (boundaryType) {
      case 'convergent':
        if (ratio > 3) return 'thrust';
        if (ratio > 1.5) return 'reverse';
        return 'oblique';

      case 'divergent':
        return 'normal';

      case 'transform':
        if (ratio < 0.3) return 'strike-slip';
        return 'oblique';

      default:
        // Fall back to slip-component classification
        if (absVert > absHoriz * 2) {
          return vertSlip > 0 ? 'reverse' : 'normal';
        } else if (absHoriz > absVert * 2) {
          return 'strike-slip';
        }
        return 'oblique';
    }
  }

  /**
   * Determine the overall fault type from its segments.
   */
  private determineOverallFaultType(segments: FaultSegment[]): FaultSegmentType {
    const typeCounts = new Map<FaultSegmentType, number>();
    for (const seg of segments) {
      typeCounts.set(seg.type, (typeCounts.get(seg.type) ?? 0) + 1);
    }

    let maxCount = 0;
    let dominantType: FaultSegmentType = 'oblique';
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }

    return dominantType;
  }

  /**
   * Compute the average strike direction across all segments.
   */
  private computeAverageStrike(segments: FaultSegment[]): number {
    let sumX = 0;
    let sumZ = 0;
    for (const seg of segments) {
      const dir = new Vector3().subVectors(seg.end, seg.start).normalize();
      sumX += dir.x;
      sumZ += dir.z;
    }
    return Math.atan2(sumZ / segments.length, sumX / segments.length);
  }

  // ========================================================================
  // Fracture Zone Generation
  // ========================================================================

  /**
   * Generate fracture zone around the fault trace.
   *
   * The fracture zone consists of secondary fractures, joints, and
   * small faults that form in the rock volume around the main fault.
   * The density and extent depend on the fault type and displacement.
   */
  private generateFractureZone(
    segments: FaultSegment[],
    cellSize: number
  ): Vector3[] {
    const { fractureWidth, fractureDensity } = this.params;
    const fracturePoints: Vector3[] = [];
    const halfWidth = (fractureWidth * 1000) / 2;

    for (const segment of segments) {
      const segmentDir = new Vector3()
        .subVectors(segment.end, segment.start).normalize();
      const segmentLength = segment.start.distanceTo(segment.end);
      const numPoints = Math.max(2, Math.floor(segmentLength / cellSize));

      // Perpendicular direction for fracture zone spread
      const perpDir = new Vector3(-segmentDir.z, 0, segmentDir.x);

      // Fracture density scales with segment stress
      const localDensity = fractureDensity * (0.5 + segment.stress * 0.5);

      for (let i = 0; i <= numPoints; i++) {
        const t = i / numPoints;
        const centerPoint = new Vector3()
          .lerpVectors(segment.start, segment.end, t);

        // Generate fractures perpendicular to fault
        const numFractures = Math.floor(localDensity * 12);
        for (let j = 0; j < numFractures; j++) {
          // Gaussian distribution of fracture positions around fault
          const offset = this.rng.gaussian(0, halfWidth * 0.4);
          const clampedOffset = Math.max(-halfWidth, Math.min(halfWidth, offset));

          const fracturePoint = centerPoint.clone()
            .add(perpDir.clone().multiplyScalar(clampedOffset));

          // Add minor random jitter
          fracturePoint.x += (this.rng.next() - 0.5) * cellSize;
          fracturePoint.z += (this.rng.next() - 0.5) * cellSize;

          fracturePoints.push(fracturePoint);
        }
      }
    }

    return fracturePoints;
  }

  // ========================================================================
  // Pressure Ridge Generation
  // ========================================================================

  /**
   * Generate pressure ridges along compressional fault segments.
   *
   * Pressure ridges form where compressional forces push rock upward
   * adjacent to the fault. They are characteristic of reverse and
   * thrust faults.
   */
  private generatePressureRidges(segments: FaultSegment[]): PressureRidge[] {
    const ridges: PressureRidge[] = [];

    for (const segment of segments) {
      // Pressure ridges form on reverse/thrust/oblique segments
      if (segment.type !== 'reverse' && segment.type !== 'thrust' &&
          segment.type !== 'oblique') {
        continue;
      }

      const segmentDir = new Vector3()
        .subVectors(segment.end, segment.start).normalize();
      const segmentLength = segment.start.distanceTo(segment.end);

      // Ridges form on the hanging wall side (upthrown block)
      const ridgeDir = new Vector3(-segmentDir.z, 0, segmentDir.x);

      // Number of ridges depends on segment length and stress
      const numRidges = Math.max(1, Math.floor(segmentLength / 3000));

      for (let i = 0; i < numRidges; i++) {
        const t = (i + 0.5) / numRidges;
        const ridgeCenter = new Vector3()
          .lerpVectors(segment.start, segment.end, t);

        // Ridge crest follows the fault with slight offset
        const crestPoints: Vector3[] = [];
        const ridgeLength = segmentLength * (0.3 + this.rng.next() * 0.4);
        const numCrestPoints = 10;

        for (let j = 0; j < numCrestPoints; j++) {
          const u = j / (numCrestPoints - 1);
          const alongFault = ridgeCenter.clone()
            .add(segmentDir.clone().multiplyScalar((u - 0.5) * ridgeLength));

          // Offset perpendicular to fault
          const perpOffset = ridgeDir.clone().multiplyScalar(
            segment.verticalSlip * 0.01 + this.rng.gaussian(0, 5)
          );
          alongFault.add(perpOffset);

          // Height profile: arch shape
          const heightProfile = Math.sin(u * Math.PI);
          alongFault.y = segment.verticalSlip * 0.1 * heightProfile;

          crestPoints.push(alongFault);
        }

        ridges.push({
          crest: crestPoints,
          height: segment.verticalSlip * 0.1 * (0.5 + this.rng.next() * 0.5),
          width: 50 + this.rng.next() * 150,
          length: ridgeLength,
        });
      }
    }

    return ridges;
  }

  // ========================================================================
  // Sag Pond Generation
  // ========================================================================

  /**
   * Generate sag ponds in extensional step-overs.
   *
   * Sag ponds form where two fault segments step over (overlap)
   * creating a localized zone of extension. These depressions
   * fill with water to form ponds.
   */
  private generateSagPonds(segments: FaultSegment[]): SagPond[] {
    const ponds: SagPond[] = [];

    for (let i = 0; i < segments.length - 1; i++) {
      const seg1 = segments[i];
      const seg2 = segments[i + 1];

      // Check for step-over (gap or overlap between segments)
      const dir1 = new Vector3()
        .subVectors(seg1.end, seg1.start).normalize();
      const dir2 = new Vector3()
        .subVectors(seg2.end, seg2.start).normalize();

      // Cross product indicates bend direction
      const cross = new Vector3().crossVectors(dir1, dir2);

      // Significant bend creates either releasing or restraining step-over
      if (Math.abs(cross.y) > 0.05) {
        // Determine if releasing (extension) or restraining (compression)
        const isReleasing = cross.y > 0; // Depends on sense of slip

        if (isReleasing || this.params.boundaryType === 'divergent') {
          // Releasing step-over → sag pond
          const pondLocation = seg1.end.clone()
            .add(seg2.start).multiplyScalar(0.5);

          // Add perpendicular offset for the pond
          const perpDir = new Vector3(-dir1.z, 0, dir1.x);
          const offset = this.rng.nextFloat(50, 200);
          pondLocation.add(perpDir.multiplyScalar(offset));

          ponds.push({
            center: pondLocation,
            radius: 20 + this.rng.next() * 80,
            depth: 2 + this.rng.next() * 8,
            elongation: dir1.clone(),
          });
        }
      }
    }

    // Additional sag ponds along divergent fault segments
    if (this.params.boundaryType === 'divergent') {
      for (const segment of segments) {
        if (this.rng.next() > 0.3) continue; // 30% chance per segment

        const segDir = new Vector3()
          .subVectors(segment.end, segment.start).normalize();
        const t = this.rng.nextFloat(0.2, 0.8);
        const pondPos = new Vector3()
          .lerpVectors(segment.start, segment.end, t);

        // Offset into the down-dropped block
        const perpDir = new Vector3(-segDir.z, 0, segDir.x);
        pondPos.add(perpDir.multiplyScalar(this.rng.nextFloat(20, 100)));

        ponds.push({
          center: pondPos,
          radius: 15 + this.rng.next() * 60,
          depth: 1 + this.rng.next() * 5,
          elongation: segDir.clone(),
        });
      }
    }

    return ponds;
  }

  // ========================================================================
  // En Echelon Fracture Generation
  // ========================================================================

  /**
   * Generate en echelon fracture arrays along the fault.
   *
   * En echelon fractures are sets of parallel fractures that step
   * sideways along the fault trend. They indicate shear stress and
   * are common at all fault types, especially at fault tips.
   */
  private generateEnEchelonFractures(segments: FaultSegment[]): EnEchelonFractures[] {
    const fractureSets: EnEchelonFractures[] = [];

    for (const segment of segments) {
      // En echelon fractures are most common at segment tips
      // and along strike-slip segments
      const isStrikeSlip = segment.type === 'strike-slip';
      const isSegmentTip = segment === segments[0] || segment === segments[segments.length - 1];

      if (!isStrikeSlip && !isSegmentTip) continue;
      if (this.rng.next() > 0.6) continue; // 60% chance

      const segmentDir = new Vector3()
        .subVectors(segment.end, segment.start).normalize();

      // Fracture trend is typically 15-45° from main fault
      const trendAngle = Math.atan2(segmentDir.z, segmentDir.x) +
        (this.rng.next() - 0.5) * Math.PI / 4;

      const trend = new Vector3(
        Math.cos(trendAngle), 0, Math.sin(trendAngle)
      );

      const numFractures = 3 + this.rng.nextInt(0, 5);
      const fractures: Vector3[][] = [];
      const spacing = 30 + this.rng.next() * 100;

      const perpDir = new Vector3(-segmentDir.z, 0, segmentDir.x);

      for (let i = 0; i < numFractures; i++) {
        const fractureLine: Vector3[] = [];
        const fractureLength = segment.length * (0.2 + this.rng.next() * 0.3);

        // Position along the fault
        const alongFault = (i / numFractures) * segment.length;
        const centerPoint = segment.start.clone()
          .add(segmentDir.clone().multiplyScalar(alongFault))
          .add(perpDir.clone().multiplyScalar(
            (i - numFractures / 2) * spacing
          ));

        // Create fracture line
        const numPoints = 5;
        for (let j = 0; j < numPoints; j++) {
          const u = j / (numPoints - 1);
          const point = centerPoint.clone()
            .add(trend.clone().multiplyScalar((u - 0.5) * fractureLength));
          fractureLine.push(point);
        }

        fractures.push(fractureLine);
      }

      fractureSets.push({
        fractures,
        trend,
        spacing,
        overlap: 0.2 + this.rng.next() * 0.4,
      });
    }

    return fractureSets;
  }

  // ========================================================================
  // Scarp Profile Generation
  // ========================================================================

  /**
   * Generate fault scarp height profile along the fault trace.
   *
   * The scarp profile represents the vertical displacement along
   * the fault. It varies along strike with maximum displacement
   * near the center, tapering toward the tips (elliptical profile).
   */
  private generateScarpProfile(segments: FaultSegment[]): Float32Array {
    const totalLength = segments.reduce((sum, s) => sum + s.length, 0);
    const numSamples = Math.max(50, segments.length * 10);
    const profile = new Float32Array(numSamples);

    let cumulativeLength = 0;
    let segIdx = 0;

    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const targetLength = t * totalLength;

      // Find which segment we're in
      while (segIdx < segments.length - 1 &&
             cumulativeLength + segments[segIdx].length < targetLength) {
        cumulativeLength += segments[segIdx].length;
        segIdx++;
      }

      const seg = segments[segIdx];
      const localT = (targetLength - cumulativeLength) / seg.length;

      // Elliptical displacement profile: max at center, zero at tips
      const displacementProfile = Math.sqrt(
        Math.max(0, 1 - Math.pow(2 * t - 1, 2))
      );

      // Add noise for realistic variation
      const noiseVal = this.noise.fbm(t * 10, 0, this.params.seed * 0.1, 3);

      // Scarp height = displacement × profile × (1 + noise)
      profile[i] = seg.verticalSlip * displacementProfile * (1 + noiseVal * 0.2);
    }

    return profile;
  }

  // ========================================================================
  // Displacement Application
  // ========================================================================

  /**
   * Apply fault displacement to an elevation map.
   *
   * The displacement pattern depends on the fault type:
   * - Normal: hanging wall drops, footwall rises
   * - Reverse/Thrust: hanging wall rises, footwall drops
   * - Strike-slip: lateral offset with minor vertical
   *
   * @param elevationMap - Heightmap to modify (in-place)
   * @param faultLine - Fault line system with displacement data
   * @param gridSize - Grid dimensions
   * @param resolution - World-space resolution
   */
  applyDisplacementToElevation(
    elevationMap: Float32Array,
    faultLine: FaultLine,
    gridSize: number,
    resolution: number
  ): void {
    const cellSize = resolution / gridSize;

    for (const segment of faultLine.segments) {
      const segmentDir = new Vector3()
        .subVectors(segment.end, segment.start).normalize();
      const normalDir = new Vector3(-segmentDir.z, 0, segmentDir.x);

      // Calculate fault plane normal (3D)
      const dipRad = (segment.dipAngle * Math.PI) / 180;
      const faultNormal = new Vector3(
        normalDir.x * Math.sin(dipRad),
        Math.cos(dipRad),
        normalDir.z * Math.sin(dipRad)
      ).normalize();

      // Determine which side is hanging wall (depends on fault type)
      const hangingWallDir = segment.type === 'normal'
        ? normalDir.clone().multiplyScalar(-1)   // Normal: HW is in dip direction
        : normalDir.clone();                      // Reverse: HW is opposite dip

      for (let y = 0; y < gridSize; y++) {
        for (let x = 0; x < gridSize; x++) {
          const worldX = x * cellSize;
          const worldZ = y * cellSize;
          const pos = new Vector3(worldX, 0, worldZ);

          // Find closest point on segment
          const closestPoint = this.closestPointOnSegment(pos, segment);
          const distanceFromFault = pos.distanceTo(closestPoint);

          // Determine if point is on hanging wall side
          const vectorToSegment = new Vector3()
            .subVectors(pos, closestPoint);
          const isInHangingWall = vectorToSegment.dot(hangingWallDir) > 0;

          // Displacement with exponential distance falloff
          const influenceWidth = this.computeInfluenceWidth(segment);
          const falloff = Math.exp(-distanceFromFault / influenceWidth);

          if (isInHangingWall) {
            // Hanging wall displacement
            const verticalDisp = this.computeHangingWallDisplacement(
              segment, dipRad, falloff
            );
            elevationMap[y * gridSize + x] += verticalDisp;
          } else {
            // Footwall gets minor compensating displacement
            const footwallDisp = this.computeFootwallDisplacement(
              segment, dipRad, falloff
            );
            elevationMap[y * gridSize + x] += footwallDisp;
          }
        }
      }
    }
  }

  /**
   * Compute the influence width for displacement falloff.
   */
  private computeInfluenceWidth(segment: FaultSegment): number {
    // Influence scales with displacement magnitude
    const baseWidth = 5000; // 5 km base
    const displacementScale = segment.slip * 2;

    switch (segment.type) {
      case 'thrust':
        return baseWidth + displacementScale * 3; // Wide influence for thrusts
      case 'reverse':
        return baseWidth + displacementScale * 2;
      case 'normal':
        return baseWidth + displacementScale * 1.5;
      case 'strike-slip':
        return baseWidth * 0.5 + displacementScale * 0.5; // Narrow for strike-slip
      default:
        return baseWidth + displacementScale;
    }
  }

  /**
   * Compute vertical displacement on the hanging wall.
   */
  private computeHangingWallDisplacement(
    segment: FaultSegment,
    dipRad: number,
    falloff: number
  ): number {
    switch (segment.type) {
      case 'normal':
        // Hanging wall drops down
        return -segment.verticalSlip * Math.sin(dipRad) * falloff;
      case 'reverse':
      case 'thrust':
        // Hanging wall pushed up
        return segment.verticalSlip * Math.sin(dipRad) * falloff;
      case 'strike-slip':
        // Minor vertical component
        return segment.verticalSlip * Math.sin(dipRad) * falloff * 0.2;
      default:
        return segment.verticalSlip * Math.sin(dipRad) * falloff * 0.5;
    }
  }

  /**
   * Compute vertical displacement on the footwall.
   */
  private computeFootwallDisplacement(
    segment: FaultSegment,
    dipRad: number,
    falloff: number
  ): number {
    switch (segment.type) {
      case 'normal':
        // Footwall may rise slightly (isostatic rebound)
        return segment.verticalSlip * Math.sin(dipRad) * falloff * 0.15;
      case 'reverse':
      case 'thrust':
        // Footwall may subside slightly
        return -segment.verticalSlip * Math.sin(dipRad) * falloff * 0.1;
      default:
        return 0;
    }
  }

  // ========================================================================
  // Offset Stream Generation
  // ========================================================================

  /**
   * Generate offset stream features where streams cross the fault.
   *
   * Streams that cross strike-slip faults are laterally offset
   * by the cumulative horizontal displacement.
   *
   * @param streams - Array of stream polyline positions
   * @param faultLine - The fault causing displacement
   * @returns Array of offset features
   */
  generateOffsetStreams(
    streams: Vector3[][],
    faultLine: FaultLine
  ): OffsetFeature[] {
    const offsetFeatures: OffsetFeature[] = [];

    for (const stream of streams) {
      for (const segment of faultLine.segments) {
        // Only strike-slip and oblique faults offset streams significantly
        if (segment.type !== 'strike-slip' && segment.type !== 'oblique') continue;

        let crossesFault = false;
        let crossingPoint: Vector3 | null = null;

        for (let i = 0; i < stream.length - 1; i++) {
          if (this.segmentsIntersect(
            stream[i], stream[i + 1], segment.start, segment.end
          )) {
            crossesFault = true;
            crossingPoint = this.findIntersection(
              stream[i], stream[i + 1], segment.start, segment.end
            );
            break;
          }
        }

        if (crossesFault && crossingPoint) {
          // Find the split point in the stream
          const splitIndex = stream.findIndex(p =>
            p.distanceTo(crossingPoint!) < 100
          );

          if (splitIndex > 0 && splitIndex < stream.length - 1) {
            const original = [...stream];
            const faultDir = new Vector3()
              .subVectors(segment.end, segment.start).normalize();
            const offsetDir = new Vector3(-faultDir.z, 0, faultDir.x);

            const displaced = stream.slice(splitIndex).map(p => {
              // Offset decreases with distance from fault
              const distFromCrossing = p.distanceTo(crossingPoint!);
              const offsetFalloff = Math.exp(-distFromCrossing / 2000);
              return p.clone().add(
                offsetDir.clone().multiplyScalar(
                  segment.horizontalSlip * offsetFalloff
                )
              );
            });

            offsetFeatures.push({
              original,
              displaced,
              offsetAmount: segment.horizontalSlip,
              offsetDirection: offsetDir,
            });
          }
        }
      }
    }

    // Update the fault line's offset features
    faultLine.offsetFeatures = offsetFeatures;
    return offsetFeatures;
  }

  // ========================================================================
  // Geometry Helpers
  // ========================================================================

  /**
   * Find the closest point on a fault segment to a given point.
   */
  private closestPointOnSegment(
    point: Vector3,
    segment: FaultSegment
  ): Vector3 {
    const segmentVec = new Vector3()
      .subVectors(segment.end, segment.start);
    const pointVec = new Vector3()
      .subVectors(point, segment.start);

    const segmentLengthSq = segmentVec.lengthSq();
    if (segmentLengthSq === 0) return segment.start.clone();

    let t = pointVec.dot(segmentVec) / segmentLengthSq;
    t = Math.max(0, Math.min(1, t));

    return new Vector3().lerpVectors(segment.start, segment.end, t);
  }

  /**
   * Check if two 2D line segments intersect.
   */
  private segmentsIntersect(
    p1: Vector3, p2: Vector3,
    p3: Vector3, p4: Vector3
  ): boolean {
    const det = (p2.x - p1.x) * (p4.z - p3.z) - (p4.x - p3.x) * (p2.z - p1.z);
    if (Math.abs(det) < 1e-10) return false;

    const lambda = ((p4.z - p3.z) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.z - p1.z)) / det;
    const gamma = ((p1.z - p2.z) * (p4.x - p1.x) + (p2.x - p1.x) * (p4.z - p1.z)) / det;

    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
  }

  /**
   * Find the intersection point of two 2D line segments.
   */
  private findIntersection(
    p1: Vector3, p2: Vector3,
    p3: Vector3, p4: Vector3
  ): Vector3 {
    const det = (p2.x - p1.x) * (p4.z - p3.z) - (p4.x - p3.x) * (p2.z - p1.z);
    if (Math.abs(det) < 1e-10) return new Vector3();

    const lambda = ((p4.z - p3.z) * (p4.x - p1.x) + (p3.x - p4.x) * (p4.z - p1.z)) / det;

    return new Vector3(
      p1.x + lambda * (p2.x - p1.x),
      0,
      p1.z + lambda * (p2.z - p1.z)
    );
  }

  // ========================================================================
  // Geometry Export
  // ========================================================================

  /**
   * Create Three.js geometry from a fault line system.
   *
   * Generates renderable line geometry for the fault trace,
   * pressure ridges, and fracture zone.
   */
  createFaultGeometry(faultLine: FaultLine): {
    positions: Float32Array;
    indices: Uint32Array;
  } {
    const positions: number[] = [];
    const indices: number[] = [];

    // Fault trace line strip
    for (const point of faultLine.trace) {
      positions.push(point.x, point.y, point.z);
    }
    for (let i = 0; i < faultLine.trace.length; i++) {
      indices.push(i);
    }

    // Pressure ridges as triangle strips
    if (faultLine.pressureRidges) {
      for (const ridge of faultLine.pressureRidges) {
        const ridgeIndexStart = positions.length / 3;

        for (const point of ridge.crest) {
          positions.push(point.x, point.y, point.z);
        }

        for (let i = 0; i < ridge.crest.length - 2; i++) {
          indices.push(
            ridgeIndexStart + i,
            ridgeIndexStart + i + 1,
            ridgeIndexStart + i + 2
          );
        }
      }
    }

    return {
      positions: new Float32Array(positions),
      indices: new Uint32Array(indices),
    };
  }
}
