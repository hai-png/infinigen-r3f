/**
 * AnnotationGenerator - Generate annotations for ML training data
 * 
 * Produces ground truth annotations including:
 * - 3D Bounding boxes (oriented and axis-aligned)
 * - 2D Bounding boxes (projected to image space)
 * - Semantic segmentation masks
 * - Instance segmentation masks
 * - Keypoints and skeletons
 * - COCO format export
 * - YOLO format export
 * - Pascal VOC format export
 * 
 * @see https://github.com/princeton-vl/infinigen/blob/main/infinigen/core/groundtruth/annotations.py
 */

import * as THREE from 'three';
import { GroundTruthGenerator, DepthData, SegmentationData } from './GroundTruthGenerator';

// ============================================================================
// Type Definitions
// ============================================================================

export interface BoundingBox3D {
  id: string;
  label: string;
  category: string;
  
  // Axis-aligned bounding box (AABB)
  aabb: {
    min: [number, number, number];
    max: [number, number, number];
  };
  
  // Oriented bounding box (OBB)
  obb?: {
    center: [number, number, number];
    size: [number, number, number];
    rotation: [number, number, number]; // Euler angles in radians
    quaternion: [number, number, number, number]; // [x, y, z, w]
  };
  
  // Confidence score (for detection results)
  confidence?: number;
}

export interface BoundingBox2D {
  id: string;
  label: string;
  category: string;
  
  // 2D bounding box in pixel coordinates
  bbox: [number, number, number, number]; // [x_min, y_min, width, height]
  
  // Normalized coordinates (0-1)
  bbox_normalized: [number, number, number, number];
  
  // Center point
  center: [number, number];
  
  // Area in pixels
  area: number;
  
  // Occlusion information
  occlusion?: {
    visible: number; // 0.0 to 1.0
    truncated: boolean;
  };
  
  confidence?: number;
}

export interface SegmentationMask {
  id: string;
  label: string;
  category: string;
  
  // RLE (Run-Length Encoding) for compact storage
  rle?: {
    counts: number[];
    size: [number, number]; // [height, width]
  };
  
  // Polygon representation
  polygon?: number[][]; // Array of [x, y] points
  
  // Binary mask (for small images or debugging)
  binary?: Uint8Array;
  
  area: number; // In pixels
  bbox: [number, number, number, number];
}

export interface Keypoint {
  id: number;
  label: string;
  position: [number, number]; // 2D image coordinates
  depth?: number; // Optional depth value
  visibility: 'visible' | 'occluded' | 'out_of_frame';
  confidence?: number;
}

export interface Skeleton {
  id: string;
  label: string;
  category: string;
  keypoints: Keypoint[];
  edges: [number, number][]; // Pairs of keypoint indices
}

export interface CocoAnnotation {
  info: {
    description: string;
    url: string;
    version: string;
    year: string;
    contributor: string;
    date_created: string;
  };
  licenses: Array<{
    id: number;
    name: string;
    url: string;
  }>;
  categories: Array<{
    id: number;
    name: string;
    supercategory: string;
  }>;
  images: Array<{
    id: number;
    file_name: string;
    width: number;
    height: number;
    date_captured: string;
    license: number;
  }>;
  annotations: Array<{
    id: number;
    image_id: number;
    category_id: number;
    bbox: [number, number, number, number];
    area: number;
    segmentation: { counts: number[]; size: [number, number] } | number[][];
    iscrowd: 0 | 1;
  }>;
}

export interface YoloAnnotation {
  className: string;
  classId: number;
  x_center: number; // Normalized 0-1
  y_center: number;
  width: number;
  height: number;
}

export interface PascalVocAnnotation {
  filename: string;
  folder: string;
  source: {
    database: string;
  };
  size: {
    width: number;
    height: number;
    depth: number;
  };
  objects: Array<{
    name: string;
    pose: string;
    truncated: boolean;
    difficult: boolean;
    bndbox: {
      xmin: number;
      ymin: number;
      xmax: number;
      ymax: number;
    };
  }>;
}

export interface AnnotationOptions {
  // Output formats
  formats: ('coco' | 'yolo' | 'pascal_voc' | 'custom')[];
  
  // Annotation types
  include3DBBoxes: boolean;
  include2DBBoxes: boolean;
  includeSegmentation: boolean;
  includeKeypoints: boolean;
  includeDepth: boolean;
  
  // Image settings
  imageWidth: number;
  imageHeight: number;
  /** Alias for imageWidth */  
  width?: number;
  /** Alias for imageHeight */
  height?: number;
  
  // Category mapping
  categoryMap?: Map<string, number>;
  
  // Output directory
  outputDir?: string;
  
  // Filename prefix
  filenamePrefix?: string;
}

export interface AnnotationResult {
  success: boolean;
  bboxes3D: BoundingBox3D[];
  bboxes2D: BoundingBox2D[];
  segmentations: SegmentationMask[];
  skeletons: Skeleton[];
  
  // Exported files
  cocoFile?: string;
  yoloFiles?: string[];
  pascalVocFile?: string;
  customFile?: string;
  
  statistics: {
    totalObjects: number;
    categoryCounts: Record<string, number>;
    averageObjectSize: number;
    occlusionRate: number;
  };
}

// ============================================================================
// Main AnnotationGenerator Class
// ============================================================================

export class AnnotationGenerator {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private groundTruthGen: GroundTruthGenerator;
  private options: AnnotationOptions;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    groundTruthGen: GroundTruthGenerator
  ) {
    this.scene = scene;
    this.camera = camera;
    this.groundTruthGen = groundTruthGen;
    this.options = {
      formats: ['coco'],
      include3DBBoxes: true,
      include2DBBoxes: true,
      includeSegmentation: true,
      includeKeypoints: false,
      includeDepth: false,
      imageWidth: 1920,
      imageHeight: 1080,
    };
  }

  /**
   * Configure annotation generation options
   */
  setOptions(options: Partial<AnnotationOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Generate all annotations for the current scene
   */
  async generate(sceneObjects?: THREE.Object3D[]): Promise<AnnotationResult> {
    const objects = sceneObjects || this.collectSceneObjects();
    
    const bboxes3D: BoundingBox3D[] = [];
    const bboxes2D: BoundingBox2D[] = [];
    const segmentations: SegmentationMask[] = [];
    const skeletons: Skeleton[] = [];

    // Generate 3D bounding boxes
    if (this.options.include3DBBoxes) {
      bboxes3D.push(...this.generateBoundingBoxes3D(objects));
    }

    // Generate 2D bounding boxes
    if (this.options.include2DBBoxes) {
      bboxes2D.push(...await this.generateBoundingBoxes2D(objects));
    }

    // Generate segmentation masks
    if (this.options.includeSegmentation) {
      segmentations.push(...await this.generateSegmentations(objects));
    }

    // Generate skeletons/keypoints
    if (this.options.includeKeypoints) {
      skeletons.push(...await this.generateSkeletons(objects));
    }

    // Export to requested formats
    const result: AnnotationResult = {
      success: true,
      bboxes3D,
      bboxes2D,
      segmentations,
      skeletons,
      statistics: this.computeStatistics(bboxes3D, bboxes2D, segmentations),
    };

    // Export to COCO format
    if (this.options.formats.includes('coco')) {
      result.cocoFile = await this.exportCOCO(result);
    }

    // Export to YOLO format
    if (this.options.formats.includes('yolo')) {
      result.yoloFiles = await this.exportYOLO(result);
    }

    // Export to Pascal VOC format
    if (this.options.formats.includes('pascal_voc')) {
      result.pascalVocFile = await this.exportPascalVOC(result);
    }

    return result;
  }

  /**
   * Collect all renderable objects from scene
   */
  private collectSceneObjects(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = [];
    
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData?.label) {
        objects.push(object);
      }
    });

    return objects;
  }

  /**
   * Generate 3D bounding boxes for all objects
   */
  private generateBoundingBoxes3D(objects: THREE.Object3D[]): BoundingBox3D[] {
    const bboxes: BoundingBox3D[] = [];

    objects.forEach((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      const mesh = object;
      const box = new THREE.Box3().setFromObject(mesh);
      
      if (!box.isEmpty()) {
        const label = mesh.userData?.label || 'unknown';
        const category = mesh.userData?.category || 'object';

        // AABB
        const aabb = {
          min: [box.min.x, box.min.y, box.min.z] as [number, number, number],
          max: [box.max.x, box.max.y, box.max.z] as [number, number, number],
        };

        // OBB (oriented bounding box)
        const obb = this.computeOBB(mesh);

        bboxes.push({
          id: mesh.uuid,
          label,
          category,
          aabb,
          obb,
        });
      }
    });

    return bboxes;
  }

  /**
   * Compute oriented bounding box for a mesh
   */
  private computeOBB(mesh: THREE.Mesh): BoundingBox3D['obb'] {
    const geometry = mesh.geometry;
    const positions = geometry.attributes.position.array;
    
    // Simple OBB computation using PCA would go here
    // For now, we'll use the object's local bounding box transformed to world space
    
    const box = new THREE.Box3().setFromObject(mesh);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const size = new THREE.Vector3();
    box.getSize(size);

    const quaternion = new THREE.Quaternion();
    mesh.getWorldQuaternion(quaternion);

    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    return {
      center: [center.x, center.y, center.z],
      size: [size.x, size.y, size.z],
      rotation: [euler.x, euler.y, euler.z],
      quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
    };
  }

  /**
   * Generate 2D bounding boxes by projecting 3D boxes to image plane
   */
  private async generateBoundingBoxes2D(objects: THREE.Object3D[]): Promise<BoundingBox2D[]> {
    const bboxes: BoundingBox2D[] = [];

    objects.forEach((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      const mesh = object;
      const box = new THREE.Box3().setFromObject(mesh);
      
      if (!box.isEmpty()) {
        const corners = this.getBoxCorners(box);
        const projectedCorners = corners.map((corner) => 
          this.projectToScreen(corner)
        );

        // Filter out points behind camera
        const validPoints = projectedCorners.filter((p) => p !== null);
        
        if (validPoints.length > 0) {
          const xs = validPoints.map((p) => p![0]);
          const ys = validPoints.map((p) => p![1]);

          const xMin = Math.min(...xs);
          const yMin = Math.min(...ys);
          const xMax = Math.max(...xs);
          const yMax = Math.max(...ys);

          const width = xMax - xMin;
          const height = yMax - yMin;

          const label = mesh.userData?.label || 'unknown';
          const category = mesh.userData?.category || 'object';

          bboxes.push({
            id: mesh.uuid,
            label,
            category,
            bbox: [xMin, yMin, width, height],
            bbox_normalized: [
              xMin / this.options.imageWidth,
              yMin / this.options.imageHeight,
              width / this.options.imageWidth,
              height / this.options.imageHeight,
            ],
            center: [(xMin + xMax) / 2, (yMin + yMax) / 2],
            area: width * height,
            occlusion: this.computeOcclusion(mesh),
          });
        }
      }
    });

    return bboxes;
  }

  /**
   * Get 8 corners of a 3D bounding box
   */
  private getBoxCorners(box: THREE.Box3): THREE.Vector3[] {
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ];

    return corners;
  }

  /**
   * Project 3D point to 2D screen coordinates
   */
  private projectToScreen(point: THREE.Vector3): [number, number] | null {
    const vector = point.clone();
    vector.project(this.camera);

    // Check if point is behind camera
    if (vector.z > 1) return null;

    const x = (vector.x * 0.5 + 0.5) * this.options.imageWidth;
    const y = (-vector.y * 0.5 + 0.5) * this.options.imageHeight;

    return [x, y];
  }

  /**
   * Compute occlusion information for an object
   */
  private computeOcclusion(mesh: THREE.Mesh): BoundingBox2D['occlusion'] {
    // Simplified occlusion detection
    // Full implementation would use depth buffer comparison
    
    return {
      visible: 1.0,
      truncated: false,
    };
  }

  /**
   * Generate segmentation masks for all objects
   */
  private async generateSegmentations(objects: THREE.Object3D[]): Promise<SegmentationMask[]> {
    const masks: SegmentationMask[] = [];

    // Use GroundTruthGenerator to render segmentation
    const segData = await this.groundTruthGen.generateSegmentation({
      width: this.options.imageWidth,
      height: this.options.imageHeight,
      camera: this.camera,
    });

    objects.forEach((object, index) => {
      if (!(object instanceof THREE.Mesh)) return;

      const mesh = object;
      const label = mesh.userData?.label || 'unknown';
      const category = mesh.userData?.category || 'object';

      // Extract individual mask for this object
      const instanceId = index + 1; // Instance IDs start at 1
      const binaryMask = this.extractInstanceMask(segData as any as SegmentationData, instanceId);

      if (binaryMask) {
        const bbox = this.computeMaskBBox(binaryMask);
        const area = this.computeMaskArea(binaryMask);
        const polygon = this.contourToPolygon(binaryMask);

        masks.push({
          id: mesh.uuid,
          label,
          category,
          binary: binaryMask,
          area,
          bbox,
          polygon,
        });
      }
    });

    return masks;
  }

  /**
   * Extract binary mask for a specific instance
   */
  private extractInstanceMask(segData: SegmentationData, instanceId: number): Uint8Array {
    const { data, width, height } = segData;
    const binary = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i++) {
      binary[i] = data[i] === instanceId ? 255 : 0;
    }

    return binary;
  }

  /**
   * Compute bounding box of a binary mask
   */
  private computeMaskBBox(mask: Uint8Array): [number, number, number, number] {
    const { width, height } = this.options;
    let minX = width, minY = height, maxX = 0, maxY = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x] > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    return [minX, minY, maxX - minX, maxY - minY];
  }

  /**
   * Compute area of a binary mask
   */
  private computeMaskArea(mask: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > 0) count++;
    }
    return count;
  }

  /**
   * Convert binary mask contour to polygon
   */
  private contourToPolygon(mask: Uint8Array): number[][] {
    // Simplified contour extraction
    // Full implementation would use marching squares or similar algorithm
    
    const { width, height } = this.options;
    const polygon: number[][] = [];

    // Find boundary pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx] > 0) {
          // Check if on boundary
          const neighbors = [
            mask[idx - 1] || 0,
            mask[idx + 1] || 0,
            mask[idx - width] || 0,
            mask[idx + width] || 0,
          ];
          
          if (neighbors.some((n) => n === 0)) {
            polygon.push([x, y]);
          }
        }
      }
    }

    return polygon;
  }

  /**
   * Generate skeletons/keypoints for articulated objects
   */
  private async generateSkeletons(objects: THREE.Object3D[]): Promise<Skeleton[]> {
    const skeletons: Skeleton[] = [];

    // This would require predefined skeleton templates for different object categories
    // For now, return empty array as placeholder
    
    return skeletons;
  }

  /**
   * Export annotations to COCO format
   */
  private async exportCOCO(result: AnnotationResult): Promise<string> {
    const categories = new Map<string, { id: number; name: string; supercategory: string }>();
    let categoryId = 1;

    // Build category map
    [...result.bboxes2D, ...result.segmentations].forEach((item) => {
      if (!categories.has(item.category)) {
        categories.set(item.category, {
          id: categoryId++,
          name: item.category,
          supercategory: 'none',
        });
      }
    });

    const coco: CocoAnnotation = {
      info: {
        description: 'InfiniGen R3F Generated Dataset',
        url: 'https://github.com/princeton-vl/infinigen',
        version: '1.0.0',
        year: new Date().getFullYear().toString(),
        contributor: 'InfiniGen R3F',
        date_created: new Date().toISOString(),
      },
      licenses: [{
        id: 1,
        name: 'CC BY-NC-SA 4.0',
        url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      }],
      categories: Array.from(categories.values()),
      images: [{
        id: 1,
        file_name: `${this.options.filenamePrefix || 'scene'}_image.png`,
        width: this.options.imageWidth,
        height: this.options.imageHeight,
        date_captured: new Date().toISOString(),
        license: 1,
      }],
      annotations: [],
    };

    // Add segmentation annotations
    result.segmentations.forEach((seg, index) => {
      const category = categories.get(seg.category);
      if (!category) return;

      coco.annotations.push({
        id: index + 1,
        image_id: 1,
        category_id: category.id,
        bbox: seg.bbox,
        area: seg.area,
        segmentation: seg.polygon || { counts: [], size: [this.options.imageHeight, this.options.imageWidth] },
        iscrowd: 0,
      });
    });

    // Export as JSON
    const jsonStr = JSON.stringify(coco, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const filename = `${this.options.filenamePrefix || 'scene'}_coco.json`;
    
    return URL.createObjectURL(blob);
  }

  /**
   * Export annotations to YOLO format
   */
  private async exportYOLO(result: AnnotationResult): Promise<string[]> {
    const files: string[] = [];
    const categoryMap = new Map<string, number>();
    let classId = 0;

    // Build class map
    result.bboxes2D.forEach((bbox) => {
      if (!categoryMap.has(bbox.category)) {
        categoryMap.set(bbox.category, classId++);
      }
    });

    // Create YOLO format text file
    let content = '';
    result.bboxes2D.forEach((bbox) => {
      const classId = categoryMap.get(bbox.category);
      if (classId === undefined) return;

      const [x, y, w, h] = bbox.bbox_normalized;
      const xCenter = x + w / 2;
      const yCenter = y + h / 2;

      content += `${classId} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${w.toFixed(6)} ${h.toFixed(6)}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const filename = `${this.options.filenamePrefix || 'scene'}_labels.txt`;
    files.push(URL.createObjectURL(blob));

    // Create classes.txt file
    const classesContent = Array.from(categoryMap.entries())
      .map(([name, id]) => `${name}`)
      .join('\n');

    const classesBlob = new Blob([classesContent], { type: 'text/plain' });
    files.push(URL.createObjectURL(classesBlob));

    return files;
  }

  /**
   * Export annotations to Pascal VOC format
   */
  private async exportPascalVOC(result: AnnotationResult): Promise<string> {
    const voc: PascalVocAnnotation = {
      filename: `${this.options.filenamePrefix || 'scene'}_image.png`,
      folder: 'InfiniGen',
      source: {
        database: 'InfiniGen R3F',
      },
      size: {
        width: this.options.imageWidth,
        height: this.options.imageHeight,
        depth: 3,
      },
      objects: result.bboxes2D.map((bbox) => ({
        name: bbox.category,
        pose: 'Unspecified',
        truncated: bbox.occlusion?.truncated || false,
        difficult: 0,
        bndbox: {
          xmin: Math.round(bbox.bbox[0]),
          ymin: Math.round(bbox.bbox[1]),
          xmax: Math.round(bbox.bbox[0] + bbox.bbox[2]),
          ymax: Math.round(bbox.bbox[1] + bbox.bbox[3]),
        },
      })),
    };

    // Convert to XML (simplified - full implementation would use proper XML library)
    let xml = '<?xml version="1.0"?>\n';
    xml += '<annotation>\n';
    xml += `  <folder>${voc.folder}</folder>\n`;
    xml += `  <filename>${voc.filename}</filename>\n`;
    xml += '  <source>\n';
    xml += `    <database>${voc.source.database}</database>\n`;
    xml += '  </source>\n';
    xml += '  <size>\n';
    xml += `    <width>${voc.size.width}</width>\n`;
    xml += `    <height>${voc.size.height}</height>\n`;
    xml += `    <depth>${voc.size.depth}</depth>\n`;
    xml += '  </size>\n';

    voc.objects.forEach((obj) => {
      xml += '  <object>\n';
      xml += `    <name>${obj.name}</name>\n`;
      xml += `    <pose>${obj.pose}</pose>\n`;
      xml += `    <truncated>${obj.truncated ? 1 : 0}</truncated>\n`;
      xml += `    <difficult>${obj.difficult ? 1 : 0}</difficult>\n`;
      xml += '    <bndbox>\n';
      xml += `      <xmin>${obj.bndbox.xmin}</xmin>\n`;
      xml += `      <ymin>${obj.bndbox.ymin}</ymin>\n`;
      xml += `      <xmax>${obj.bndbox.xmax}</xmax>\n`;
      xml += `      <ymax>${obj.bndbox.ymax}</ymax>\n`;
      xml += '    </bndbox>\n';
      xml += '  </object>\n';
    });

    xml += '</annotation>';

    const blob = new Blob([xml], { type: 'application/xml' });
    const filename = `${this.options.filenamePrefix || 'scene'}_voc.xml`;
    
    return URL.createObjectURL(blob);
  }

  /**
   * Compute statistics about generated annotations
   */
  private computeStatistics(
    bboxes3D: BoundingBox3D[],
    bboxes2D: BoundingBox2D[],
    segmentations: SegmentationMask[]
  ): AnnotationResult['statistics'] {
    const categoryCounts: Record<string, number> = {};
    let totalSize = 0;
    let occludedCount = 0;

    bboxes2D.forEach((bbox) => {
      categoryCounts[bbox.category] = (categoryCounts[bbox.category] || 0) + 1;
      totalSize += bbox.area;
      if (bbox.occlusion && bbox.occlusion.visible < 1.0) {
        occludedCount++;
      }
    });

    return {
      totalObjects: bboxes2D.length,
      categoryCounts,
      averageObjectSize: bboxes2D.length > 0 ? totalSize / bboxes2D.length : 0,
      occlusionRate: bboxes2D.length > 0 ? occludedCount / bboxes2D.length : 0,
    };
  }

  /**
   * Generate segmentation annotations (public API alias)
   */
  async generateSegmentation(): Promise<SegmentationMask[]> {
    const objects = this.collectSceneObjects();
    return this.generateSegmentations(objects);
  }
}

export default AnnotationGenerator;
