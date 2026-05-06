/**
 * Annotation Integration — Bridge between GroundTruthRenderer and COCO/YOLO exporters
 *
 * Provides `generateAnnotations(result: GTRenderResult)` that consumes
 * segmentation output from GroundTruthRenderer and produces both COCO
 * and YOLO format annotations.
 *
 * @module pipeline/exports
 */

import { COCOExporter, type COCODataset } from './coco-exporter';
import { YOLOExporter, type YOLOBbox } from './yolo-exporter';
import type { GTRenderResult } from '../GroundTruthRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnnotationPair {
  /** COCO-format dataset (JSON-serializable) */
  coco: COCODataset;
  /** YOLO-format data (one label per image) */
  yolo: {
    categories: Array<{ id: number; name: string }>;
    labels: Array<{
      imagePath: string;
      width: number;
      height: number;
      bboxes: YOLOBbox[];
    }>;
  };
}

export interface AnnotationIntegrationOptions {
  /** Minimum bounding-box area in pixels² (default 0) */
  minBboxArea?: number;
  /** Image file name for COCO/YOLO references (default 'image.png') */
  imageFileName?: string;
  /** Dataset name for COCO info (default 'infinigen-r3f') */
  datasetName?: string;
  /** Whether to include segmentation polygons in COCO output (default true) */
  includeSegmentation?: boolean;
  /** Whether to clip YOLO bboxes to image bounds (default true) */
  clipBboxes?: boolean;
}

// ---------------------------------------------------------------------------
// Helper: compute 2D bounding box from a segmentation mask
// ---------------------------------------------------------------------------

/**
 * Given a flat segmentation mask (one object ID per pixel) and a
 * specific object ID, compute the axis-aligned bounding box in pixel
 * coordinates.
 *
 * @returns [x, y, width, height] or null if the object is not present
 */
function bboxFromMask(
  mask: Uint8Array | number[],
  objectId: number,
  width: number,
  height: number,
): [number, number, number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === objectId) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return null;
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}

/**
 * Extract a binary mask for a specific object ID from a segmentation mask.
 */
function extractBinaryMask(
  mask: Uint8Array | number[],
  objectId: number,
  width: number,
  height: number,
): boolean[] {
  const binary = new Array<boolean>(width * height);
  for (let i = 0; i < width * height; i++) {
    binary[i] = mask[i] === objectId;
  }
  return binary;
}

// ---------------------------------------------------------------------------
// Main integration function
// ---------------------------------------------------------------------------

/**
 * Generate both COCO and YOLO annotations from a GroundTruthRenderer result.
 *
 * Uses the `objectSegmentation` mask and `objectMap` from GTRenderResult
 * to identify objects, compute bounding boxes, and produce annotations in
 * both formats.
 *
 * @param result  - Output from GroundTruthRenderer.render()
 * @param options - Configuration for annotation generation
 * @returns Object with `coco` (COCODataset) and `yolo` annotation data
 */
export function generateAnnotations(
  result: GTRenderResult,
  options: AnnotationIntegrationOptions = {},
): AnnotationPair {
  const {
    minBboxArea = 0,
    imageFileName = 'image.png',
    datasetName = 'infinigen-r3f',
    includeSegmentation = true,
    clipBboxes = true,
  } = options;

  const cocoExporter = new COCOExporter();
  const yoloExporter = new YOLOExporter();

  const { width, height, objectSegmentation, objectMap } = result;

  // Register all categories from the object map
  for (const [objectId, label] of objectMap.entries()) {
    cocoExporter.registerCategory(label);
    yoloExporter.registerCategory(label);
  }

  // Add the image
  const imageId = cocoExporter.addImage({
    fileName: imageFileName,
    width,
    height,
  });

  // Collect pixel bboxes for YOLO
  const yoloBboxes: Array<{
    className: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];

  // Process each object
  for (const [objectId, label] of objectMap.entries()) {
    const bbox = bboxFromMask(objectSegmentation ?? new Uint8Array(0), objectId, width, height);
    if (!bbox) continue;

    const [x, y, w, h] = bbox;
    const area = w * h;
    if (area < minBboxArea) continue;

    // COCO segmentation (polygon from mask)
    let segmentation: number[][] | undefined;
    if (includeSegmentation && objectSegmentation) {
      const binaryMask = extractBinaryMask(objectSegmentation, objectId, width, height);
      segmentation = cocoExporter.maskToPolygon(binaryMask, width, height);
      if (segmentation.length === 0) {
        segmentation = undefined;
      }
    }

    cocoExporter.addAnnotation({
      imageId,
      category: label,
      bbox: [x, y, w, h],
      segmentation,
    });

    yoloBboxes.push({ className: label, x, y, width: w, height: h });
  }

  // Add image with bboxes to YOLO exporter
  yoloExporter.addImage({
    path: imageFileName,
    width,
    height,
    bboxes: yoloBboxes,
    clipBboxes,
  });

  // Build COCO dataset
  const cocoDataset = cocoExporter.buildDataset({ datasetName });

  // Build YOLO data
  const yoloCategories = yoloExporter['categories'].map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const yoloLabels = yoloExporter['images'].map((img) => ({
    imagePath: img.path,
    width: img.width,
    height: img.height,
    bboxes: img.bboxes,
  }));

  return {
    coco: cocoDataset,
    yolo: {
      categories: yoloCategories,
      labels: yoloLabels,
    },
  };
}

export default generateAnnotations;
