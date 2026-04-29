/**
 * COCO Format Exporter for Infinigen R3F
 *
 * Implements COCO (Common Objects in Context) dataset format export
 * for object detection, instance segmentation, and keypoint detection.
 *
 * Based on: infinigen/tools/export.py (COCO export section)
 * Reference: https://cocodataset.org/#format-data
 *
 * @module pipeline/exports
 */
/**
 * COCO category definition
 */
export interface COCOCategory {
    /** Category ID */
    id: number;
    /** Category name */
    name: string;
    /** Super category (optional) */
    supercategory?: string;
}
/**
 * COCO image metadata
 */
export interface COCOImage {
    /** Image ID */
    id: number;
    /** File name */
    file_name: string;
    /** Image width */
    width: number;
    /** Image height */
    height: number;
    /** License ID (optional) */
    license?: number;
    /** Flickr URL (optional) */
    flickr_url?: string;
    /** COCO URL (optional) */
    coco_url?: string;
    /** Capture date (optional) */
    date_captured?: string;
}
/**
 * COCO annotation for bounding boxes and segmentation
 */
export interface COCOAnnotation {
    /** Annotation ID */
    id: number;
    /** Image ID */
    image_id: number;
    /** Category ID */
    category_id: number;
    /** Bounding box [x, y, width, height] */
    bbox: [number, number, number, number];
    /** Segmentation polygon or RLE */
    segmentation?: number[][] | Record<string, any>;
    /** Area of the segmentation */
    area: number;
    /** Is crowd annotation */
    iscrowd: number;
    /** Keypoints (optional) */
    keypoints?: number[];
    /** Number of keypoints */
    num_keypoints?: number;
}
/**
 * COCO license information
 */
export interface COCOLicense {
    /** License ID */
    id: number;
    /** License name */
    name: string;
    /** License URL */
    url: string;
}
/**
 * COCO info metadata
 */
export interface COCOInfo {
    /** Dataset year */
    year?: string;
    /** Dataset version */
    version?: string;
    /** Description */
    description?: string;
    /** Contributor */
    contributor?: string;
    /** Date created */
    date_created?: string;
    /** URL */
    url?: string;
}
/**
 * Complete COCO dataset structure
 */
export interface COCODataset {
    /** Dataset info */
    info: COCOInfo;
    /** Licenses */
    licenses: COCOLicense[];
    /** Categories */
    categories: COCOCategory[];
    /** Images */
    images: COCOImage[];
    /** Annotations */
    annotations: COCOAnnotation[];
}
/**
 * Object detection result
 */
export interface DetectionResult {
    /** Object category name */
    category: string;
    /** Bounding box [x, y, width, height] in pixel coordinates */
    bbox: [number, number, number, number];
    /** Segmentation mask as 2D array of points */
    segmentation?: number[][];
    /** Confidence score (0-1) */
    confidence?: number;
    /** Instance ID */
    instanceId?: number;
}
/**
 * Configuration for COCO export
 */
export interface COCOExportConfig {
    /** Output directory path */
    outputDir: string;
    /** Dataset name */
    datasetName: string;
    /** Year */
    year?: string;
    /** Version */
    version?: string;
    /** Include segmentation masks */
    includeSegmentation: boolean;
    /** Include keypoints */
    includeKeypoints: boolean;
    /** Keypoint names */
    keypointNames?: string[];
    /** Image prefix */
    imagePrefix?: string;
    /** Image extension */
    imageExtension?: string;
    /** Min bbox area filter */
    minBboxArea?: number;
    /** Split ratios [train, val, test] */
    splits?: [number, number, number];
}
/**
 * COCO Format Exporter
 *
 * Generates COCO-format JSON annotations for rendered scenes.
 * Supports object detection, instance segmentation, and keypoints.
 */
export declare class COCOExporter {
    /** Current annotation ID counter */
    private annotationIdCounter;
    /** Current image ID counter */
    private imageIdCounter;
    /** Category name to ID mapping */
    private categoryMap;
    /** Registered categories */
    private categories;
    /** Collected images */
    private images;
    /** Collected annotations */
    private annotations;
    /**
     * Register a category
     */
    registerCategory(name: string, supercategory?: string): number;
    /**
     * Add an image to the dataset
     */
    addImage(options: {
        fileName: string;
        width: number;
        height: number;
        captureDate?: string;
    }): number;
    /**
     * Add an annotation
     */
    addAnnotation(options: {
        imageId: number;
        category: string;
        bbox: [number, number, number, number];
        segmentation?: number[][];
        isCrowd?: boolean;
        keypoints?: number[];
    }): number;
    /**
     * Convert detection results to COCO annotations
     */
    processDetections(options: {
        imageId: number;
        detections: DetectionResult[];
    }): number[];
    /**
     * Compute bounding box from segmentation polygon
     */
    computeBboxFromSegmentation(segmentation: number[][]): [number, number, number, number];
    /**
     * Convert mask to polygon segmentation
     */
    maskToPolygon(mask: Uint8Array | boolean[], width: number, height: number, simplifyTolerance?: number): number[][];
    /**
     * Trace contour from a starting point
     */
    private traceContour;
    /**
     * Build final COCO dataset
     */
    buildDataset(config: {
        datasetName: string;
        year?: string;
        version?: string;
    }): COCODataset;
    /**
     * Export dataset to JSON string
     */
    toJSON(dataset?: COCODataset): string;
    /**
     * Export dataset to file (Node.js environment)
     */
    exportToFile(outputPath: string, dataset?: COCODataset): Promise<void>;
    /**
     * Download file in browser
     */
    private downloadAsFile;
    /**
     * Reset exporter state
     */
    reset(): void;
    /**
     * Get statistics about the dataset
     */
    getStatistics(): {
        numImages: number;
        numAnnotations: number;
        numCategories: number;
        categories: Array<{
            name: string;
            count: number;
        }>;
        avgAnnotationsPerImage: number;
    };
}
export default COCOExporter;
//# sourceMappingURL=coco-exporter.d.ts.map