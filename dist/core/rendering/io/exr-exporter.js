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
/**
 * EXR compression methods
 */
export var EXRCompression;
(function (EXRCompression) {
    /** No compression */
    EXRCompression["NONE"] = "NONE";
    /** Run-length encoding (fast) */
    EXRCompression["RLE"] = "RLE";
    /** ZIP compression per scanline */
    EXRCompression["ZIP_SCANLINE"] = "ZIP_SCANLINE";
    /** ZIP compression per block */
    EXRCompression["ZIP_BLOCK"] = "ZIP_BLOCK";
    /** PIZ wavelet compression (good balance) */
    EXRCompression["PIZ"] = "PIZ";
    /** DCT-based compression */
    EXRCompression["DWAA"] = "DWAA";
    /** DCT-based compression with larger blocks */
    EXRCompression["DWAB"] = "DWAB";
})(EXRCompression || (EXRCompression = {}));
/**
 * EXR pixel data types
 */
export var EXRPixelType;
(function (EXRPixelType) {
    /** 16-bit half float */
    EXRPixelType["HALF"] = "half";
    /** 32-bit float */
    EXRPixelType["FLOAT"] = "float";
    /** 32-bit unsigned int */
    EXRPixelType["UINT"] = "uint";
})(EXRPixelType || (EXRPixelType = {}));
/**
 * OpenEXR Exporter Class
 *
 * Provides functionality to export render targets to OpenEXR format.
 * Note: Full EXR encoding requires external libraries in browser environments.
 * This implementation provides the framework and Node.js support.
 */
export class EXRExporter {
    constructor(defaultCompression = EXRCompression.PIZ, defaultPixelType = EXRPixelType.FLOAT) {
        this.defaultCompression = defaultCompression;
        this.defaultPixelType = defaultPixelType;
        this.isNode = typeof process !== 'undefined' && process.versions?.node != null;
    }
    /**
     * Export a render target to EXR format
     */
    async export(renderTarget, config) {
        const { filename, outputDir = './output', compression = this.defaultCompression, pixelType = this.defaultPixelType, includeAlpha = true, flipY = false, metadata = {}, onProgress, onComplete, onError, } = config;
        try {
            // Extract pixel data from render target
            const pixelData = this.extractPixelData(renderTarget, flipY);
            // Build EXR file structure
            const exrData = {
                magic: 0x762f5c01, // EXR magic number
                metadata: new Map(),
                channels: this.buildChannels(pixelType, includeAlpha),
                pixels: pixelData,
                width: renderTarget.width,
                height: renderTarget.height,
            };
            // Populate metadata
            this.populateMetadata(exrData.metadata, renderTarget, metadata, compression);
            // Encode to EXR binary format
            const exrBuffer = await this.encodeEXR(exrData, onProgress);
            if (this.isNode) {
                // Node.js: Write to filesystem
                const path = await this.writeToFile(exrBuffer, filename, outputDir);
                onComplete?.(path);
                return path;
            }
            else {
                // Browser: Return ArrayBuffer for download
                onComplete?.(filename + '.exr');
                return exrBuffer;
            }
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            onError?.(err);
            throw err;
        }
    }
    /**
     * Export multiple render targets (multi-pass) to EXR
     */
    async exportMultiPass(passes, config) {
        const results = [];
        for (const [passName, renderTarget] of passes.entries()) {
            const passConfig = {
                ...config,
                filename: `${config.filename}_${passName}`,
                metadata: {
                    ...config.metadata,
                    custom: {
                        ...config.metadata?.custom,
                        passName,
                    },
                },
            };
            const result = await this.export(renderTarget, passConfig);
            results.push(result);
        }
        return results;
    }
    /**
     * Extract pixel data from render target
     */
    extractPixelData(renderTarget, flipY = false) {
        const gl = renderTarget.__gl;
        if (!gl) {
            throw new Error('Render target not bound to WebGL context');
        }
        const { width, height } = renderTarget;
        const pixelCount = width * height;
        const channelCount = 4; // Always read as RGBA
        const data = new Float32Array(pixelCount * channelCount);
        // Save current framebuffer
        const currentFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        // Read pixels
        gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.framebuffer);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, data);
        // Restore framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);
        // Flip vertically if needed (WebGL has origin at bottom-left)
        if (flipY) {
            this.flipVertically(data, width, height, channelCount);
        }
        return data;
    }
    /**
     * Build channel information
     */
    buildChannels(pixelType, includeAlpha) {
        const channels = [
            { name: 'R', pixelType, xSampling: 1, ySampling: 1 },
            { name: 'G', pixelType, xSampling: 1, ySampling: 1 },
            { name: 'B', pixelType, xSampling: 1, ySampling: 1 },
        ];
        if (includeAlpha) {
            channels.push({ name: 'A', pixelType, xSampling: 1, ySampling: 1 });
        }
        return channels;
    }
    /**
     * Populate EXR metadata
     */
    populateMetadata(metadataMap, renderTarget, userMetadata, compression) {
        // Required fields
        metadataMap.set('channels', this.buildChannels(this.defaultPixelType, userMetadata.channels !== undefined));
        // Windows
        metadataMap.set('dataWindow', userMetadata.dataWindow ?? [
            0, 0, renderTarget.width - 1, renderTarget.height - 1
        ]);
        metadataMap.set('displayWindow', userMetadata.displayWindow ?? [
            0, 0, renderTarget.width - 1, renderTarget.height - 1
        ]);
        // Compression
        metadataMap.set('compression', compression);
        // Optional metadata
        if (userMetadata.cameraMatrix) {
            metadataMap.set('worldToCamera', userMetadata.cameraMatrix);
        }
        if (userMetadata.projectionMatrix) {
            metadataMap.set('projectionMatrix', userMetadata.projectionMatrix);
        }
        if (userMetadata.frameRate) {
            metadataMap.set('frameRate', userMetadata.frameRate);
        }
        if (userMetadata.frameNumber !== undefined) {
            metadataMap.set('frameNumber', userMetadata.frameNumber);
        }
        if (userMetadata.pixelAspectRatio) {
            metadataMap.set('pixelAspectRatio', userMetadata.pixelAspectRatio);
        }
        if (userMetadata.lineOrder) {
            metadataMap.set('lineOrder', userMetadata.lineOrder);
        }
        if (userMetadata.tileSize) {
            metadataMap.set('tileSize', userMetadata.tileSize);
        }
        // Custom metadata
        if (userMetadata.custom) {
            Object.entries(userMetadata.custom).forEach(([key, value]) => {
                metadataMap.set(key, value);
            });
        }
    }
    /**
     * Encode EXR file data to binary format
     *
     * Note: This is a simplified implementation. Full EXR encoding
     * requires proper compression algorithms which may need external libraries.
     */
    async encodeEXR(data, onProgress) {
        // Calculate buffer size estimate
        const headerSizeEstimate = 1024; // Conservative estimate
        const pixelDataSize = data.pixels.byteLength;
        const totalSize = headerSizeEstimate + pixelDataSize;
        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        let offset = 0;
        // Write magic number
        view.setUint32(offset, data.magic, true); // Little-endian
        offset += 4;
        // Write version byte (always 2)
        view.setUint8(offset, 2);
        offset += 1;
        // Write scanline/tiling byte (0 = scanline)
        view.setUint8(offset, 0);
        offset += 1;
        // Write long name flag (0 = short names)
        view.setUint8(offset, 0);
        offset += 1;
        // Write metadata fields
        offset = this.writeMetadata(view, offset, data.metadata);
        // Write end-of-header marker
        view.setUint8(offset, 0);
        offset += 1;
        // Align to 4-byte boundary
        while (offset % 4 !== 0) {
            view.setUint8(offset, 0);
            offset++;
        }
        // Write pixel data (uncompressed for now)
        // In production, apply compression based on config
        const pixelBytes = new Uint8Array(data.pixels.buffer);
        const outputArray = new Uint8Array(buffer);
        outputArray.set(pixelBytes, offset);
        onProgress?.(1.0);
        return buffer;
    }
    /**
     * Write metadata fields to buffer
     */
    writeMetadata(view, offset, metadata) {
        let currentOffset = offset;
        for (const [name, value] of metadata.entries()) {
            // Determine type
            const typeName = this.getTypeName(value);
            // Write type name
            currentOffset = this.writeString(currentOffset, view, typeName);
            // Write value
            currentOffset = this.writeTypedValue(currentOffset, view, typeName, value);
        }
        return currentOffset;
    }
    /**
     * Get EXR type name for a JavaScript value
     */
    getTypeName(value) {
        if (typeof value === 'number') {
            return 'float';
        }
        else if (typeof value === 'string') {
            return 'string';
        }
        else if (Array.isArray(value)) {
            if (value.length === 2)
                return 'v2f';
            if (value.length === 3)
                return 'v3f';
            if (value.length === 4)
                return 'v4f';
            if (value.length === 16)
                return 'm44f';
            return 'float';
        }
        return 'string';
    }
    /**
     * Write string to buffer
     */
    writeString(offset, view, str) {
        const bytes = new TextEncoder().encode(str);
        const lengthBytes = new TextEncoder().encode(str.length.toString());
        // Write length as int32
        view.setInt32(offset, str.length, true);
        offset += 4;
        // Write string bytes
        const uint8View = new Uint8Array(view.buffer);
        uint8View.set(bytes, offset);
        offset += bytes.length;
        // Null terminator
        view.setUint8(offset, 0);
        offset += 1;
        return offset;
    }
    /**
     * Write typed value to buffer
     */
    writeTypedValue(offset, view, typeName, value) {
        switch (typeName) {
            case 'int':
                view.setInt32(offset, value, true);
                return offset + 4;
            case 'float':
                view.setFloat32(offset, value, true);
                return offset + 4;
            case 'string':
                return this.writeString(offset, view, String(value));
            case 'v2f':
                view.setFloat32(offset, value[0], true);
                view.setFloat32(offset + 4, value[1], true);
                return offset + 8;
            case 'v3f':
                view.setFloat32(offset, value[0], true);
                view.setFloat32(offset + 4, value[1], true);
                view.setFloat32(offset + 8, value[2], true);
                return offset + 12;
            case 'v4f':
                view.setFloat32(offset, value[0], true);
                view.setFloat32(offset + 4, value[1], true);
                view.setFloat32(offset + 8, value[2], true);
                view.setFloat32(offset + 12, value[3], true);
                return offset + 16;
            case 'm44f':
                for (let i = 0; i < 16; i++) {
                    view.setFloat32(offset + i * 4, value[i], true);
                }
                return offset + 64;
            default:
                return this.writeString(offset, view, String(value));
        }
    }
    /**
     * Flip pixel data vertically
     */
    flipVertically(data, width, height, channels) {
        const rowSize = width * channels;
        const tempRow = new Float32Array(rowSize);
        for (let y = 0; y < Math.floor(height / 2); y++) {
            const topOffset = y * rowSize;
            const bottomOffset = (height - 1 - y) * rowSize;
            // Swap rows
            tempRow.set(data.subarray(topOffset, topOffset + rowSize));
            data.copyWithin(topOffset, bottomOffset, bottomOffset + rowSize);
            data.set(tempRow, bottomOffset);
        }
    }
    /**
     * Write EXR data to file (Node.js only)
     */
    async writeToFile(data, filename, outputDir) {
        if (!this.isNode) {
            throw new Error('writeToFile is only available in Node.js environment');
        }
        const fs = await import('fs');
        const path = await import('path');
        // Ensure output directory exists
        const fullPath = path.join(outputDir, `${filename}.exr`);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Write file
        const buffer = Buffer.from(data);
        fs.writeFileSync(fullPath, buffer);
        return fullPath;
    }
    /**
     * Create downloadable blob for browser (utility function)
     */
    static createDownloadBlob(arrayBuffer, filename) {
        return new Blob([arrayBuffer], { type: 'image/x-exr' });
    }
    /**
     * Trigger download in browser (utility function)
     */
    static triggerDownload(blob, filename) {
        if (typeof window === 'undefined') {
            throw new Error('triggerDownload is only available in browser environment');
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}
export default EXRExporter;
//# sourceMappingURL=exr-exporter.js.map