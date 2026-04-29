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
import { GroundTruthGenerator } from './GroundTruthGenerator';
export interface BoundingBox3D {
    id: string;
    label: string;
    category: string;
    aabb: {
        min: [number, number, number];
        max: [number, number, number];
    };
    obb?: {
        center: [number, number, number];
        size: [number, number, number];
        rotation: [number, number, number];
        quaternion: [number, number, number, number];
    };
    confidence?: number;
}
export interface BoundingBox2D {
    id: string;
    label: string;
    category: string;
    bbox: [number, number, number, number];
    bbox_normalized: [number, number, number, number];
    center: [number, number];
    area: number;
    occlusion?: {
        visible: number;
        truncated: boolean;
    };
    confidence?: number;
}
export interface SegmentationMask {
    id: string;
    label: string;
    category: string;
    rle?: {
        counts: number[];
        size: [number, number];
    };
    polygon?: number[][];
    binary?: Uint8Array;
    area: number;
    bbox: [number, number, number, number];
}
export interface Keypoint {
    id: number;
    label: string;
    position: [number, number];
    depth?: number;
    visibility: 'visible' | 'occluded' | 'out_of_frame';
    confidence?: number;
}
export interface Skeleton {
    id: string;
    label: string;
    category: string;
    keypoints: Keypoint[];
    edges: [number, number][];
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
        segmentation: {
            counts: number[];
            size: [number, number];
        } | number[][];
        iscrowd: 0 | 1;
    }>;
}
export interface YoloAnnotation {
    className: string;
    classId: number;
    x_center: number;
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
    formats: ('coco' | 'yolo' | 'pascal_voc' | 'custom')[];
    include3DBBoxes: boolean;
    include2DBBoxes: boolean;
    includeSegmentation: boolean;
    includeKeypoints: boolean;
    includeDepth: boolean;
    imageWidth: number;
    imageHeight: number;
    categoryMap?: Map<string, number>;
    outputDir?: string;
    filenamePrefix?: string;
}
export interface AnnotationResult {
    success: boolean;
    bboxes3D: BoundingBox3D[];
    bboxes2D: BoundingBox2D[];
    segmentations: SegmentationMask[];
    skeletons: Skeleton[];
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
export declare class AnnotationGenerator {
    private scene;
    private camera;
    private groundTruthGen;
    private options;
    constructor(scene: THREE.Scene, camera: THREE.Camera, groundTruthGen: GroundTruthGenerator);
    /**
     * Configure annotation generation options
     */
    setOptions(options: Partial<AnnotationOptions>): void;
    /**
     * Generate all annotations for the current scene
     */
    generate(sceneObjects?: THREE.Object3D[]): Promise<AnnotationResult>;
    /**
     * Collect all renderable objects from scene
     */
    private collectSceneObjects;
    /**
     * Generate 3D bounding boxes for all objects
     */
    private generateBoundingBoxes3D;
    /**
     * Compute oriented bounding box for a mesh
     */
    private computeOBB;
    /**
     * Generate 2D bounding boxes by projecting 3D boxes to image plane
     */
    private generateBoundingBoxes2D;
    /**
     * Get 8 corners of a 3D bounding box
     */
    private getBoxCorners;
    /**
     * Project 3D point to 2D screen coordinates
     */
    private projectToScreen;
    /**
     * Compute occlusion information for an object
     */
    private computeOcclusion;
    /**
     * Generate segmentation masks for all objects
     */
    private generateSegmentations;
    /**
     * Extract binary mask for a specific instance
     */
    private extractInstanceMask;
    /**
     * Compute bounding box of a binary mask
     */
    private computeMaskBBox;
    /**
     * Compute area of a binary mask
     */
    private computeMaskArea;
    /**
     * Convert binary mask contour to polygon
     */
    private contourToPolygon;
    /**
     * Generate skeletons/keypoints for articulated objects
     */
    private generateSkeletons;
    /**
     * Export annotations to COCO format
     */
    private exportCOCO;
    /**
     * Export annotations to YOLO format
     */
    private exportYOLO;
    /**
     * Export annotations to Pascal VOC format
     */
    private exportPascalVOC;
    /**
     * Compute statistics about generated annotations
     */
    private computeStatistics;
}
export default AnnotationGenerator;
//# sourceMappingURL=AnnotationGenerator.d.ts.map