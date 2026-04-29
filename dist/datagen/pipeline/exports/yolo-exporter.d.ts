/**
 * YOLO Format Exporter for Infinigen R3F
 *
 * Implements YOLO (You Only Look Once) object detection format export.
 * Supports YOLOv5, YOLOv8, and YOLOv11 variants.
 *
 * Based on: infinigen/tools/export.py (YOLO export section)
 * Reference: https://docs.ultralytics.com/yolov5/tutorials/train_custom_data/
 *
 * @module pipeline/exports
 */
/**
 * YOLO annotation line format:
 * <class_id> <x_center> <y_center> <width> <height>
 *
 * All coordinates are normalized to [0, 1] relative to image dimensions.
 */
/**
 * YOLO bounding box in normalized coordinates
 */
export interface YOLOBbox {
    /** Class ID */
    classId: number;
    /** X center (normalized 0-1) */
    xCenter: number;
    /** Y center (normalized 0-1) */
    yCenter: number;
    /** Width (normalized 0-1) */
    width: number;
    /** Height (normalized 0-1) */
    height: number;
}
/**
 * YOLO category definition
 */
export interface YOLOCategory {
    /** Category ID */
    id: number;
    /** Category name */
    name: string;
}
/**
 * Image with detections
 */
export interface YOLOImage {
    /** File path relative to images directory */
    path: string;
    /** Image width */
    width: number;
    /** Image height */
    height: number;
    /** Bounding boxes */
    bboxes: YOLOBbox[];
}
/**
 * YOLO dataset configuration (dataset.yaml)
 */
export interface YOLODatasetConfig {
    /** Dataset path (absolute or relative) */
    path: string;
    /** Training set images path */
    train: string;
    /** Validation set images path */
    val: string;
    /** Test set images path (optional) */
    test?: string;
    /** Number of classes */
    nc: number;
    /** Class names */
    names: string[];
    /** Download command (optional) */
    download?: string;
    /** Roboflow workspace (optional) */
    roboflow?: string;
}
/**
 * YOLO export configuration
 */
export interface YOLOExportConfig {
    /** Output directory */
    outputDir: string;
    /** Dataset name */
    datasetName: string;
    /** YOLO version ('v5', 'v8', 'v11') */
    yoloVersion?: 'v5' | 'v8' | 'v11';
    /** Train/val/test split ratios */
    splits?: [number, number, number];
    /** Include test set */
    includeTest?: boolean;
    /** Seed for reproducible splits */
    seed?: number;
    /** Min bbox area filter (pixels) */
    minBboxArea?: number;
    /** Clip bboxes to image bounds */
    clipBboxes?: boolean;
}
/**
 * Pixel-coordinate bounding box
 */
export interface PixelBbox {
    /** Class name */
    className: string;
    /** X coordinate (pixels) */
    x: number;
    /** Y coordinate (pixels) */
    y: number;
    /** Width (pixels) */
    width: number;
    /** Height (pixels) */
    height: number;
}
/**
 * YOLO Format Exporter
 *
 * Generates YOLO-format annotations and dataset structure.
 * Creates directory structure:
 *   dataset/
 *     images/
 *       train/
 *       val/
 *       test/
 *     labels/
 *       train/
 *       val/
 *       test/
 *     dataset.yaml
 */
export declare class YOLOExporter {
    /** Category name to ID mapping */
    private categoryMap;
    /** Registered categories */
    private categories;
    /** Collected images */
    private images;
    /** Current YOLO version */
    private yoloVersion;
    constructor(yoloVersion?: 'v5' | 'v8' | 'v11');
    /**
     * Register a category
     */
    registerCategory(name: string): number;
    /**
     * Add an image with detections
     */
    addImage(options: {
        path: string;
        width: number;
        height: number;
        bboxes: PixelBbox[];
        minBboxArea?: number;
        clipBboxes?: boolean;
    }): void;
    /**
     * Convert COCO-style bbox to YOLO format
     */
    convertCOCOBboxToYOLO(options: {
        bbox: [number, number, number, number];
        className: string;
        imageWidth: number;
        imageHeight: number;
    }): YOLOBbox;
    /**
     * Split images into train/val/test sets
     */
    splitDatasets(ratios?: [number, number, number], seed?: number): {
        train: YOLOImage[];
        val: YOLOImage[];
        test: YOLOImage[];
    };
    /**
     * Generate label file content for an image
     */
    generateLabelContent(image: YOLOImage): string;
    /**
     * Generate dataset.yaml configuration
     */
    generateDatasetConfig(config: {
        path: string;
        train: string;
        val: string;
        test?: string;
    }): YOLODatasetConfig;
    /**
     * Export dataset to directory structure
     */
    export(config: YOLOExportConfig): Promise<{
        trainCount: number;
        valCount: number;
        testCount: number;
    }>;
    /**
     * Write label files to disk (Node.js)
     */
    private writeLabelsToDisk;
    /**
     * Convert dataset config to YAML string
     */
    private convertToYAML;
    /**
     * Hash string for deterministic splitting
     */
    private hashString;
    /**
     * Export to JSON (for browser or inspection)
     */
    toJSON(): string;
    /**
     * Reset exporter state
     */
    reset(): void;
    /**
     * Get statistics
     */
    getStatistics(): {
        numImages: number;
        numCategories: number;
        numBboxes: number;
        categories: Array<{
            name: string;
            count: number;
        }>;
        avgBboxesPerImage: number;
    };
}
export default YOLOExporter;
//# sourceMappingURL=yolo-exporter.d.ts.map