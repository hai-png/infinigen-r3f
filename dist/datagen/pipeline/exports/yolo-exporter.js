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
export class YOLOExporter {
    constructor(yoloVersion = 'v8') {
        /** Category name to ID mapping */
        this.categoryMap = new Map();
        /** Registered categories */
        this.categories = [];
        /** Collected images */
        this.images = [];
        /** Current YOLO version */
        this.yoloVersion = 'v8';
        this.yoloVersion = yoloVersion;
    }
    /**
     * Register a category
     */
    registerCategory(name) {
        if (!this.categoryMap.has(name)) {
            const id = this.categories.length;
            const category = { id, name };
            this.categories.push(category);
            this.categoryMap.set(name, id);
        }
        return this.categoryMap.get(name);
    }
    /**
     * Add an image with detections
     */
    addImage(options) {
        const { minBboxArea = 0, clipBboxes = true } = options;
        // Convert pixel bboxes to normalized YOLO format
        const yoloBboxes = [];
        for (const bbox of options.bboxes) {
            // Filter by area
            const area = bbox.width * bbox.height;
            if (area < minBboxArea) {
                continue;
            }
            // Get or create category
            const classId = this.registerCategory(bbox.className);
            // Convert to normalized coordinates
            let xCenter = bbox.x + bbox.width / 2;
            let yCenter = bbox.y + bbox.height / 2;
            let width = bbox.width;
            let height = bbox.height;
            // Clip to image bounds if requested
            if (clipBboxes) {
                xCenter = Math.max(0, Math.min(xCenter, options.width));
                yCenter = Math.max(0, Math.min(yCenter, options.height));
                width = Math.min(width, options.width - (xCenter - width / 2));
                height = Math.min(height, options.height - (yCenter - height / 2));
            }
            // Normalize
            const normalizedBbox = {
                classId,
                xCenter: xCenter / options.width,
                yCenter: yCenter / options.height,
                width: width / options.width,
                height: height / options.height,
            };
            // Validate normalized coordinates
            if (normalizedBbox.xCenter >= 0 && normalizedBbox.xCenter <= 1 &&
                normalizedBbox.yCenter >= 0 && normalizedBbox.yCenter <= 1 &&
                normalizedBbox.width > 0 && normalizedBbox.width <= 1 &&
                normalizedBbox.height > 0 && normalizedBbox.height <= 1) {
                yoloBboxes.push(normalizedBbox);
            }
        }
        const image = {
            path: options.path,
            width: options.width,
            height: options.height,
            bboxes: yoloBboxes,
        };
        this.images.push(image);
    }
    /**
     * Convert COCO-style bbox to YOLO format
     */
    convertCOCOBboxToYOLO(options) {
        const [x, y, width, height] = options.bbox;
        const classId = this.registerCategory(options.className);
        return {
            classId,
            xCenter: (x + width / 2) / options.imageWidth,
            yCenter: (y + height / 2) / options.imageHeight,
            width: width / options.imageWidth,
            height: height / options.imageHeight,
        };
    }
    /**
     * Split images into train/val/test sets
     */
    splitDatasets(ratios = [0.8, 0.1, 0.1], seed = 42) {
        // Simple deterministic shuffle based on seed
        const shuffled = [...this.images].sort((a, b) => {
            const hashA = this.hashString(a.path + seed);
            const hashB = this.hashString(b.path + seed);
            return hashA - hashB;
        });
        const total = shuffled.length;
        const trainEnd = Math.floor(total * ratios[0]);
        const valEnd = Math.floor(total * (ratios[0] + ratios[1]));
        return {
            train: shuffled.slice(0, trainEnd),
            val: shuffled.slice(trainEnd, valEnd),
            test: shuffled.slice(valEnd),
        };
    }
    /**
     * Generate label file content for an image
     */
    generateLabelContent(image) {
        const lines = [];
        for (const bbox of image.bboxes) {
            // Validate bbox values
            if (bbox.xCenter >= 0 && bbox.xCenter <= 1 &&
                bbox.yCenter >= 0 && bbox.yCenter <= 1 &&
                bbox.width > 0 && bbox.width <= 1 &&
                bbox.height > 0 && bbox.height <= 1) {
                lines.push(`${bbox.classId} ${bbox.xCenter.toFixed(6)} ${bbox.yCenter.toFixed(6)} ${bbox.width.toFixed(6)} ${bbox.height.toFixed(6)}`);
            }
        }
        return lines.join('\n');
    }
    /**
     * Generate dataset.yaml configuration
     */
    generateDatasetConfig(config) {
        return {
            path: config.path,
            train: config.train,
            val: config.val,
            test: config.test,
            nc: this.categories.length,
            names: this.categories.map(c => c.name),
        };
    }
    /**
     * Export dataset to directory structure
     */
    async export(config) {
        const { outputDir, datasetName, splits = [0.8, 0.1, 0.1], includeTest = true, seed = 42, } = config;
        // Split datasets
        const splitData = this.splitDatasets(splits, seed);
        // Create directory structure
        const directories = [
            `${outputDir}/images/train`,
            `${outputDir}/images/val`,
            `${outputDir}/labels/train`,
            `${outputDir}/labels/val`,
        ];
        if (includeTest && splitData.test.length > 0) {
            directories.push(`${outputDir}/images/test`);
            directories.push(`${outputDir}/labels/test`);
        }
        // In Node.js environment, create directories
        if (typeof process !== 'undefined' && process.versions?.node) {
            const fs = await import('fs');
            const path = await import('path');
            for (const dir of directories) {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            }
            // Write label files
            this.writeLabelsToDisk(splitData.train, `${outputDir}/labels/train`, fs, path);
            this.writeLabelsToDisk(splitData.val, `${outputDir}/labels/val`, fs, path);
            if (includeTest && splitData.test.length > 0) {
                this.writeLabelsToDisk(splitData.test, `${outputDir}/labels/test`, fs, path);
            }
            // Write dataset.yaml
            const datasetConfig = this.generateDatasetConfig({
                path: outputDir,
                train: 'images/train',
                val: 'images/val',
                test: includeTest ? 'images/test' : undefined,
            });
            const yamlContent = this.convertToYAML(datasetConfig);
            fs.writeFileSync(`${outputDir}/dataset.yaml`, yamlContent, 'utf-8');
        }
        return {
            trainCount: splitData.train.length,
            valCount: splitData.val.length,
            testCount: splitData.test.length,
        };
    }
    /**
     * Write label files to disk (Node.js)
     */
    async writeLabelsToDisk(images, outputDir, fs, path) {
        for (const image of images) {
            const labelContent = this.generateLabelContent(image);
            const fileName = path.basename(image.path, path.extname(image.path)) + '.txt';
            const filePath = path.join(outputDir, fileName);
            fs.writeFileSync(filePath, labelContent, 'utf-8');
        }
    }
    /**
     * Convert dataset config to YAML string
     */
    convertToYAML(config) {
        const lines = [];
        lines.push(`path: ${config.path}`);
        lines.push(`train: ${config.train}`);
        lines.push(`val: ${config.val}`);
        if (config.test) {
            lines.push(`test: ${config.test}`);
        }
        lines.push(`nc: ${config.nc}`);
        lines.push('names:');
        for (let i = 0; i < config.names.length; i++) {
            lines.push(`  ${i}: ${config.names[i]}`);
        }
        if (config.download) {
            lines.push(`download: ${config.download}`);
        }
        return lines.join('\n');
    }
    /**
     * Hash string for deterministic splitting
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    /**
     * Export to JSON (for browser or inspection)
     */
    toJSON() {
        const data = {
            categories: this.categories,
            images: this.images.map(img => ({
                path: img.path,
                width: img.width,
                height: img.height,
                bboxes: img.bboxes,
            })),
        };
        return JSON.stringify(data, null, 2);
    }
    /**
     * Reset exporter state
     */
    reset() {
        this.categoryMap.clear();
        this.categories = [];
        this.images = [];
    }
    /**
     * Get statistics
     */
    getStatistics() {
        const categoryCounts = new Map();
        let totalBboxes = 0;
        for (const image of this.images) {
            for (const bbox of image.bboxes) {
                categoryCounts.set(bbox.classId, (categoryCounts.get(bbox.classId) || 0) + 1);
                totalBboxes++;
            }
        }
        const categories = this.categories.map(cat => ({
            name: cat.name,
            count: categoryCounts.get(cat.id) || 0,
        }));
        return {
            numImages: this.images.length,
            numCategories: this.categories.length,
            numBboxes: totalBboxes,
            categories,
            avgBboxesPerImage: this.images.length > 0 ? totalBboxes / this.images.length : 0,
        };
    }
}
export default YOLOExporter;
//# sourceMappingURL=yolo-exporter.js.map