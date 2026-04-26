/**
 * OpenEXR Exporter for Infinigen R3F
 *
 * Implements EXR file format export for high dynamic range render outputs.
 * Supports multiple compression methods and metadata embedding.
 *
 * Based on: infinigen/core/rendering/render.py (EXR output configuration)
 *
 * @module io
 */
import { WebGLRenderTarget } from 'three';
/**
 * EXR compression methods
 */
export declare enum EXRCompression {
    /** No compression */
    NONE = "NONE",
    /** Run-length encoding (fast) */
    RLE = "RLE",
    /** ZIP compression per scanline */
    ZIP_SCANLINE = "ZIP_SCANLINE",
    /** ZIP compression per block */
    ZIP_BLOCK = "ZIP_BLOCK",
    /** PIZ wavelet compression (good balance) */
    PIZ = "PIZ",
    /** DCT-based compression */
    DWAA = "DWAA",
    /** DCT-based compression with larger blocks */
    DWAB = "DWAB"
}
/**
 * EXR pixel data types
 */
export declare enum EXRPixelType {
    /** 16-bit half float */
    HALF = "half",
    /** 32-bit float */
    FLOAT = "float",
    /** 32-bit unsigned int */
    UINT = "uint"
}
/**
 * EXR channel configuration
 */
export interface EXRChannel {
    /** Channel name (R, G, B, A, Z, etc.) */
    name: string;
    /** Pixel data type */
    pixelType: EXRPixelType;
    /** Sampling coordinates (0,0 for full resolution) */
    xSampling: number;
    ySampling: number;
}
/**
 * Metadata for EXR file
 */
export interface EXRMetadata {
    /** Image width */
    width?: number;
    /** Image height */
    height?: number;
    /** Data window [minX, minY, maxX, maxY] */
    dataWindow?: [number, number, number, number];
    /** Display window [minX, minY, maxX, maxY] */
    displayWindow?: [number, number, number, number];
    /** Channel names */
    channels?: string[];
    /** Compression method */
    compression?: EXRCompression;
    /** Frame rate */
    frameRate?: number;
    /** Frame number */
    frameNumber?: number;
    /** Camera transformation matrix (4x4 as flat array) */
    cameraMatrix?: number[];
    /** Projection matrix (4x4 as flat array) */
    projectionMatrix?: number[];
    /** World-to-camera matrix */
    worldToCamera?: number[];
    /** Screen window [left, right, bottom, top] */
    screenWindow?: [number, number, number, number];
    /** Pixel aspect ratio */
    pixelAspectRatio?: number;
    /** Line order (increasing Y, decreasing Y, random) */
    lineOrder?: 'INCREASING_Y' | 'DECREASING_Y' | 'RANDOM_Y';
    /** Tile size [width, height] */
    tileSize?: [number, number];
    /** Environment map type */
    envMap?: 'LATLONG' | 'CUBE';
    /** Capture environment map flag */
    capLongLat?: boolean;
    /** Custom key-value pairs */
    custom?: Record<string, string | number | number[]>;
}
/**
 * Configuration for EXR export
 */
export interface EXRExportConfig {
    /** Output filename (without extension) */
    filename: string;
    /** Output directory path */
    outputDir?: string;
    /** Compression method (default: PIZ) */
    compression?: EXRCompression;
    /** Pixel type (default: FLOAT) */
    pixelType?: EXRPixelType;
    /** Include alpha channel (default: true) */
    includeAlpha?: boolean;
    /** Flip vertically (default: false - WebGL coords) */
    flipY?: boolean;
    /** Metadata to embed */
    metadata?: EXRMetadata;
    /** Callback for progress updates */
    onProgress?: (progress: number) => void;
    /** Callback for completion */
    onComplete?: (path: string) => void;
    /** Callback for errors */
    onError?: (error: Error) => void;
}
/**
 * OpenEXR Exporter Class
 *
 * Provides functionality to export render targets to OpenEXR format.
 * Note: Full EXR encoding requires external libraries in browser environments.
 * This implementation provides the framework and Node.js support.
 */
export declare class EXRExporter {
    /** Default compression method */
    private defaultCompression;
    /** Default pixel type */
    private defaultPixelType;
    /** Whether running in Node.js environment */
    private isNode;
    constructor(defaultCompression?: EXRCompression, defaultPixelType?: EXRPixelType);
    /**
     * Export a render target to EXR format
     */
    export(renderTarget: WebGLRenderTarget, config: EXRExportConfig): Promise<string | ArrayBuffer>;
    /**
     * Export multiple render targets (multi-pass) to EXR
     */
    exportMultiPass(passes: Map<string, WebGLRenderTarget>, config: EXRExportConfig): Promise<string[] | ArrayBuffer[]>;
    /**
     * Extract pixel data from render target
     */
    private extractPixelData;
    /**
     * Build channel information
     */
    private buildChannels;
    /**
     * Populate EXR metadata
     */
    private populateMetadata;
    /**
     * Encode EXR file data to binary format
     *
     * Note: This is a simplified implementation. Full EXR encoding
     * requires proper compression algorithms which may need external libraries.
     */
    private encodeEXR;
    /**
     * Write metadata fields to buffer
     */
    private writeMetadata;
    /**
     * Get EXR type name for a JavaScript value
     */
    private getTypeName;
    /**
     * Write string to buffer
     */
    private writeString;
    /**
     * Write typed value to buffer
     */
    private writeTypedValue;
    /**
     * Flip pixel data vertically
     */
    private flipVertically;
    /**
     * Write EXR data to file (Node.js only)
     */
    private writeToFile;
    /**
     * Create downloadable blob for browser (utility function)
     */
    static createDownloadBlob(arrayBuffer: ArrayBuffer, filename: string): Blob;
    /**
     * Trigger download in browser (utility function)
     */
    static triggerDownload(blob: Blob, filename: string): void;
}
export default EXRExporter;
//# sourceMappingURL=exr-exporter.d.ts.map