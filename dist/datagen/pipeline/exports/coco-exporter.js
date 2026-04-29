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
 * COCO Format Exporter
 *
 * Generates COCO-format JSON annotations for rendered scenes.
 * Supports object detection, instance segmentation, and keypoints.
 */
export class COCOExporter {
    constructor() {
        /** Current annotation ID counter */
        this.annotationIdCounter = 0;
        /** Current image ID counter */
        this.imageIdCounter = 0;
        /** Category name to ID mapping */
        this.categoryMap = new Map();
        /** Registered categories */
        this.categories = [];
        /** Collected images */
        this.images = [];
        /** Collected annotations */
        this.annotations = [];
    }
    /**
     * Register a category
     */
    registerCategory(name, supercategory) {
        if (!this.categoryMap.has(name)) {
            const id = this.categories.length + 1;
            const category = {
                id,
                name,
                supercategory,
            };
            this.categories.push(category);
            this.categoryMap.set(name, id);
        }
        return this.categoryMap.get(name);
    }
    /**
     * Add an image to the dataset
     */
    addImage(options) {
        const id = ++this.imageIdCounter;
        const image = {
            id,
            file_name: options.fileName,
            width: options.width,
            height: options.height,
            date_captured: options.captureDate,
        };
        this.images.push(image);
        return id;
    }
    /**
     * Add an annotation
     */
    addAnnotation(options) {
        const categoryId = this.categoryMap.get(options.category);
        if (categoryId === undefined) {
            throw new Error(`Category "${options.category}" not registered`);
        }
        const id = ++this.annotationIdCounter;
        // Calculate area from bbox
        const area = options.bbox[2] * options.bbox[3];
        const annotation = {
            id,
            image_id: options.imageId,
            category_id: categoryId,
            bbox: options.bbox,
            area,
            iscrowd: options.isCrowd ? 1 : 0,
        };
        if (options.segmentation) {
            annotation.segmentation = options.segmentation;
        }
        if (options.keypoints) {
            annotation.keypoints = options.keypoints;
            annotation.num_keypoints = options.keypoints.filter((_, i) => i % 3 === 2 && _ > 0).length;
        }
        this.annotations.push(annotation);
        return id;
    }
    /**
     * Convert detection results to COCO annotations
     */
    processDetections(options) {
        const annotationIds = [];
        for (const detection of options.detections) {
            // Filter by minimum area
            const area = detection.bbox[2] * detection.bbox[3];
            if (area < options.minBboxArea || 0) {
                continue;
            }
            const id = this.addAnnotation({
                imageId: options.imageId,
                category: detection.category,
                bbox: detection.bbox,
                segmentation: detection.segmentation,
            });
            annotationIds.push(id);
        }
        return annotationIds;
    }
    /**
     * Compute bounding box from segmentation polygon
     */
    computeBboxFromSegmentation(segmentation) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const polygon of segmentation) {
            for (let i = 0; i < polygon.length; i += 2) {
                const x = polygon[i];
                const y = polygon[i + 1];
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
            }
        }
        return [minX, minY, maxX - minX, maxY - minY];
    }
    /**
     * Convert mask to polygon segmentation
     */
    maskToPolygon(mask, width, height, simplifyTolerance = 1.0) {
        // Simple contour extraction (Marching Squares could be used for better quality)
        const polygons = [];
        // Find contours using simple edge following
        const visited = new Set();
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (mask[idx] && !visited.has(idx)) {
                    const polygon = this.traceContour(mask, width, height, x, y, visited);
                    if (polygon.length > 6) { // Minimum 3 points
                        polygons.push(polygon);
                    }
                }
            }
        }
        return polygons;
    }
    /**
     * Trace contour from a starting point
     */
    traceContour(mask, width, height, startX, startY, visited) {
        const polygon = [];
        let x = startX;
        let y = startY;
        // Simple contour tracing
        const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        let dirIndex = 0;
        do {
            const idx = y * width + x;
            if (mask[idx]) {
                visited.add(idx);
                polygon.push(x, y);
            }
            // Try to move in current direction
            let found = false;
            for (let i = 0; i < 4; i++) {
                const newDirIndex = (dirIndex + i) % 4;
                const dx = directions[newDirIndex][0];
                const dy = directions[newDirIndex][1];
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nidx = ny * width + nx;
                    if (mask[nidx]) {
                        x = nx;
                        y = ny;
                        dirIndex = newDirIndex;
                        found = true;
                        break;
                    }
                }
            }
            if (!found)
                break;
        } while ((x !== startX || y !== startY) && polygon.length < 10000);
        return polygon;
    }
    /**
     * Build final COCO dataset
     */
    buildDataset(config) {
        return {
            info: {
                year: config.year ?? new Date().getFullYear().toString(),
                version: config.version ?? '1.0',
                description: `${config.datasetName} - Generated by Infinigen R3F`,
                contributor: 'Infinigen R3F',
                date_created: new Date().toISOString(),
                url: 'https://github.com/princeton-vl/infinigen',
            },
            licenses: [{
                    id: 1,
                    name: 'CC BY-NC-SA 4.0',
                    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
                }],
            categories: this.categories,
            images: this.images,
            annotations: this.annotations,
        };
    }
    /**
     * Export dataset to JSON string
     */
    toJSON(dataset) {
        const data = dataset ?? this.buildDataset({ datasetName: 'dataset' });
        return JSON.stringify(data, null, 2);
    }
    /**
     * Export dataset to file (Node.js environment)
     */
    async exportToFile(outputPath, dataset) {
        const json = this.toJSON(dataset);
        // In Node.js environment
        if (typeof process !== 'undefined' && process.versions?.node) {
            const fs = await import('fs');
            const path = await import('path');
            // Ensure directory exists
            const dir = path.dirname(outputPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(outputPath, json, 'utf-8');
        }
        else {
            // Browser environment - trigger download
            this.downloadAsFile(json, outputPath.split('/').pop() ?? 'coco_annotations.json');
        }
    }
    /**
     * Download file in browser
     */
    downloadAsFile(content, fileName) {
        if (typeof window === 'undefined')
            return;
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    /**
     * Reset exporter state
     */
    reset() {
        this.annotationIdCounter = 0;
        this.imageIdCounter = 0;
        this.categoryMap.clear();
        this.categories = [];
        this.images = [];
        this.annotations = [];
    }
    /**
     * Get statistics about the dataset
     */
    getStatistics() {
        const categoryCounts = new Map();
        for (const ann of this.annotations) {
            categoryCounts.set(ann.category_id, (categoryCounts.get(ann.category_id) || 0) + 1);
        }
        const categories = this.categories.map(cat => ({
            name: cat.name,
            count: categoryCounts.get(cat.id) || 0,
        }));
        return {
            numImages: this.images.length,
            numAnnotations: this.annotations.length,
            numCategories: this.categories.length,
            categories,
            avgAnnotationsPerImage: this.images.length > 0
                ? this.annotations.length / this.images.length
                : 0,
        };
    }
}
export default COCOExporter;
//# sourceMappingURL=coco-exporter.js.map