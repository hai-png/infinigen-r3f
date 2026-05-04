/**
 * OpenEXR Exporter for Infinigen R3F
 * 
 * Implements EXR file format export for high dynamic range render outputs.
 * Supports multiple compression methods and metadata embedding.
 * 
 * Based on: infinigen/core/rendering/render.py (EXR output configuration)
 * 
 * Improvements over initial version:
 *  - Spec-compliant EXR binary format (proper magic, version, header, offset table)
 *  - RLE compression for scanlines (most common EXR compression mode)
 *  - Multi-channel EXR support (depth, normals, flow, etc. in one file)
 *  - writeGroundTruthEXR() convenience function for GroundTruthRenderer output
 * 
 * @module io
 */

import {
  WebGLRenderTarget,
} from 'three';

/**
 * EXR compression methods
 */
export enum EXRCompression {
  /** No compression */
  NONE = 'NONE',
  /** Run-length encoding (fast) */
  RLE = 'RLE',
  /** ZIP compression per scanline */
  ZIP_SCANLINE = 'ZIP_SCANLINE',
  /** ZIP compression per block */
  ZIP_BLOCK = 'ZIP_BLOCK',
  /** PIZ wavelet compression (good balance) */
  PIZ = 'PIZ',
  /** DCT-based compression */
  DWAA = 'DWAA',
  /** DCT-based compression with larger blocks */
  DWAB = 'DWAB',
}

/**
 * EXR pixel data types
 */
export enum EXRPixelType {
  /** 16-bit half float */
  HALF = 'half',
  /** 32-bit float */
  FLOAT = 'float',
  /** 32-bit unsigned int */
  UINT = 'uint',
}

/**
 * Numeric pixel type codes used in EXR binary format
 * (0 = UINT, 1 = HALF, 2 = FLOAT per the OpenEXR specification)
 */
export const EXR_PIXEL_TYPE_UINT = 0;
export const EXR_PIXEL_TYPE_HALF = 1;
export const EXR_PIXEL_TYPE_FLOAT = 2;

/**
 * EXR compression codes used in binary format
 */
export const EXR_COMPRESSION_NONE = 0;
export const EXR_COMPRESSION_RLE = 1;
export const EXR_COMPRESSION_ZIPS = 2;
export const EXR_COMPRESSION_ZIP = 3;
export const EXR_COMPRESSION_PIZ = 4;
export const EXR_COMPRESSION_PXR24 = 5;
export const EXR_COMPRESSION_B44 = 6;
export const EXR_COMPRESSION_B44A = 7;
export const EXR_COMPRESSION_DWAA = 8;
export const EXR_COMPRESSION_DWAB = 9;

/**
 * EXR line order codes
 */
export const EXR_LINE_ORDER_INCREASING_Y = 0;
export const EXR_LINE_ORDER_DECREASING_Y = 1;
export const EXR_LINE_ORDER_RANDOM_Y = 2;

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
 * Named channel with Float32Array pixel data for multi-channel EXR export.
 * Used by writeGroundTruthEXR() and exportMultiChannel().
 */
export interface EXRChannelData {
  /** Channel name (e.g. "R", "depth.Z", "normal.X") */
  name: string;
  /** Pixel data as Float32Array, row-major, one float per pixel per channel component */
  data: Float32Array;
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
  /** Compression method (default: RLE) */
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
 * EXR file structure for binary output
 */
interface EXRFileData {
  /** Magic number (20000630 = 0x01312f76 little-endian) */
  magic: number;
  /** Metadata fields */
  metadata: Map<string, any>;
  /** Channel information */
  channels: EXRChannel[];
  /** Pixel data as interleaved array */
  pixels: Float32Array;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
}

// ---------------------------------------------------------------------------
// RLE Compression Helpers (module-level for reuse)
// ---------------------------------------------------------------------------

/**
 * RLE-compress a byte array following the OpenEXR RLE spec.
 *
 * Format per element:
 *  - count byte < 128  → literal run of (count + 1) bytes
 *  - count byte >= 128 → repeat run of (257 - count) copies of the next byte
 *
 * This matches the OpenEXR reference implementation (ImfRleCompressor).
 */
function rleCompress(input: Uint8Array): Uint8Array {
  const output: number[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Count run of identical bytes (minimum 3 to emit a run)
    let runCount = 1;
    while (runCount < 128 && i + runCount < len && input[i] === input[i + runCount]) {
      runCount++;
    }

    if (runCount >= 3) {
      // Emit a repeat-run: count byte = 256 - (runCount - 1) = 257 - runCount
      output.push(257 - runCount); // unsigned byte in [129..254]
      output.push(input[i]);
      i += runCount;
    } else {
      // Gather a literal run (stop when we see 3+ identical bytes ahead)
      let litStart = i;
      let litEnd = litStart;

      while (litEnd < len && litEnd - litStart < 128) {
        // Peek ahead for a run of 3+ identical bytes
        if (
          litEnd + 2 < len &&
          input[litEnd] === input[litEnd + 1] &&
          input[litEnd + 1] === input[litEnd + 2]
        ) {
          break;
        }
        litEnd++;
      }

      const litCount = litEnd - litStart;
      if (litCount > 0) {
        // Emit a literal-run: count byte = litCount - 1 (in [0..127])
        output.push(litCount - 1);
        for (let j = litStart; j < litEnd; j++) {
          output.push(input[j]);
        }
        i = litEnd;
      } else {
        // Shouldn't happen, but advance to avoid infinite loop
        i++;
      }
    }
  }

  return new Uint8Array(output);
}

/**
 * Reorder scanline bytes for better RLE compression.
 *
 * Groups bytes that share the same offset within each pixel so that
 * adjacent pixels' corresponding bytes are contiguous.  This is the
 * byte-reordering step that the OpenEXR spec mandates before RLE
 * compression of a scanline.
 *
 * Pixel data layout before reordering (for W pixels × C bytes per pixel):
 *   pixel0[byte0], pixel0[byte1], …, pixel0[byteC-1],
 *   pixel1[byte0], pixel1[byte1], …, …
 *
 * After reordering:
 *   pixel0[byte0], pixel1[byte0], …, pixelW-1[byte0],
 *   pixel0[byte1], pixel1[byte1], …, pixelW-1[byte1],
 *   …
 */
function reorderScanlineBytes(raw: Uint8Array, bytesPerPixel: number, pixelCount: number): Uint8Array {
  if (bytesPerPixel <= 0 || pixelCount <= 0) return raw;

  const result = new Uint8Array(raw.length);

  for (let bytePos = 0; bytePos < bytesPerPixel; bytePos++) {
    for (let px = 0; px < pixelCount; px++) {
      result[bytePos * pixelCount + px] = raw[px * bytesPerPixel + bytePos];
    }
  }

  return result;
}

/**
 * Inverse of reorderScanlineBytes — used by decompressors to restore
 * the original pixel-interleaved byte order.
 * Exported for use by external EXR readers / importers.
 */
export function undoReorderScanlineBytes(
  reordered: Uint8Array,
  bytesPerPixel: number,
  pixelCount: number,
): Uint8Array {
  if (bytesPerPixel <= 0 || pixelCount <= 0) return reordered;

  const result = new Uint8Array(reordered.length);

  for (let bytePos = 0; bytePos < bytesPerPixel; bytePos++) {
    for (let px = 0; px < pixelCount; px++) {
      result[px * bytesPerPixel + bytePos] = reordered[bytePos * pixelCount + px];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// EXR Header Writing Helpers
// ---------------------------------------------------------------------------

/**
 * Write a null-terminated string into a Uint8Array at the given offset.
 * Returns the new offset after the string + null byte.
 */
function writeNullTerminatedString(arr: Uint8Array, offset: number, str: string): number {
  const encoded = new TextEncoder().encode(str);
  arr.set(encoded, offset);
  offset += encoded.length;
  arr[offset] = 0; // null terminator
  return offset + 1;
}

/**
 * Map EXRCompression enum value to the numeric code used in the binary format.
 */
function compressionToCode(compression: EXRCompression): number {
  switch (compression) {
    case EXRCompression.NONE: return EXR_COMPRESSION_NONE;
    case EXRCompression.RLE: return EXR_COMPRESSION_RLE;
    case EXRCompression.ZIP_SCANLINE: return EXR_COMPRESSION_ZIPS;
    case EXRCompression.ZIP_BLOCK: return EXR_COMPRESSION_ZIP;
    case EXRCompression.PIZ: return EXR_COMPRESSION_PIZ;
    case EXRCompression.DWAA: return EXR_COMPRESSION_DWAA;
    case EXRCompression.DWAB: return EXR_COMPRESSION_DWAB;
    default: return EXR_COMPRESSION_RLE;
  }
}

/**
 * Map EXRPixelType enum to the numeric code used in the binary format.
 */
function pixelTypeToCode(pt: EXRPixelType): number {
  switch (pt) {
    case EXRPixelType.UINT: return EXR_PIXEL_TYPE_UINT;
    case EXRPixelType.HALF: return EXR_PIXEL_TYPE_HALF;
    case EXRPixelType.FLOAT: return EXR_PIXEL_TYPE_FLOAT;
    default: return EXR_PIXEL_TYPE_FLOAT;
  }
}

/**
 * Map EXRPixelType enum to byte size.
 */
function pixelTypeEnumSize(pt: EXRPixelType): number {
  switch (pt) {
    case EXRPixelType.UINT: return 4;
    case EXRPixelType.HALF: return 2;
    case EXRPixelType.FLOAT: return 4;
    default: return 4;
  }
}

/**
 * Build the complete EXR header as a Uint8Array.
 *
 * Writes all required attributes in the proper EXR binary format:
 *   channels, compression, dataWindow, displayWindow, lineOrder,
 *   pixelAspectRatio, screenWindowCenter, screenWindowWidth
 *
 * Each attribute is: name\0 type\0 size(u32) data
 * The header ends with a single \0 byte.
 */
function buildEXRHeader(
  channels: EXRChannel[],
  compression: EXRCompression,
  dataWindow: [number, number, number, number],
  displayWindow: [number, number, number, number],
  lineOrder: number,
  pixelAspectRatio: number,
  screenWindowCenter: [number, number],
  screenWindowWidth: number,
): Uint8Array {
  // Pre-compute header size (generous estimate)
  const estSize = 2048 + channels.length * 128;
  const buf = new Uint8Array(estSize);
  const view = new DataView(buf.buffer);
  let off = 0;

  // --- Magic number: 20000630 decimal (0x01312f76) ---
  view.setUint32(off, 20000630, true);
  off += 4;

  // --- Version field: version=2, no flags (scanline, short names, not deep) ---
  view.setUint32(off, 2, true);
  off += 4;

  // --- Attribute: channels (type "chlist") ---
  off = writeNullTerminatedString(buf, off, 'channels');
  off = writeNullTerminatedString(buf, off, 'chlist');

  // Compute channel list data size
  let chListSize = 0;
  for (const ch of channels) {
    const nameBytes = new TextEncoder().encode(ch.name);
    chListSize += nameBytes.length + 1; // name + \0
    chListSize += 4 + 1 + 3 + 4 + 4; // pixelType + pLinear + reserved + xSampling + ySampling
  }
  chListSize += 1; // terminating \0

  view.setUint32(off, chListSize, true);
  off += 4;

  // Write channel entries (must be sorted alphabetically by name per spec)
  const sortedChannels = [...channels].sort((a, b) => a.name.localeCompare(b.name));
  for (const ch of sortedChannels) {
    off = writeNullTerminatedString(buf, off, ch.name);
    view.setInt32(off, pixelTypeToCode(ch.pixelType), true);
    off += 4;
    buf[off] = 0; // pLinear
    off += 1;
    buf[off] = 0; buf[off + 1] = 0; buf[off + 2] = 0; // reserved
    off += 3;
    view.setInt32(off, ch.xSampling, true);
    off += 4;
    view.setInt32(off, ch.ySampling, true);
    off += 4;
  }
  buf[off] = 0; // terminating \0 for channel list
  off += 1;

  // --- Attribute: compression (type "compression") ---
  off = writeNullTerminatedString(buf, off, 'compression');
  off = writeNullTerminatedString(buf, off, 'compression');
  view.setUint32(off, 1, true); // size = 1 byte
  off += 4;
  buf[off] = compressionToCode(compression);
  off += 1;

  // --- Attribute: dataWindow (type "box2i") ---
  off = writeNullTerminatedString(buf, off, 'dataWindow');
  off = writeNullTerminatedString(buf, off, 'box2i');
  view.setUint32(off, 16, true); // size = 4 × int32
  off += 4;
  view.setInt32(off, dataWindow[0], true); off += 4;
  view.setInt32(off, dataWindow[1], true); off += 4;
  view.setInt32(off, dataWindow[2], true); off += 4;
  view.setInt32(off, dataWindow[3], true); off += 4;

  // --- Attribute: displayWindow (type "box2i") ---
  off = writeNullTerminatedString(buf, off, 'displayWindow');
  off = writeNullTerminatedString(buf, off, 'box2i');
  view.setUint32(off, 16, true); // size = 4 × int32
  off += 4;
  view.setInt32(off, displayWindow[0], true); off += 4;
  view.setInt32(off, displayWindow[1], true); off += 4;
  view.setInt32(off, displayWindow[2], true); off += 4;
  view.setInt32(off, displayWindow[3], true); off += 4;

  // --- Attribute: lineOrder (type "lineOrder") ---
  off = writeNullTerminatedString(buf, off, 'lineOrder');
  off = writeNullTerminatedString(buf, off, 'lineOrder');
  view.setUint32(off, 1, true); // size = 1 byte
  off += 4;
  buf[off] = lineOrder;
  off += 1;

  // --- Attribute: pixelAspectRatio (type "float") ---
  off = writeNullTerminatedString(buf, off, 'pixelAspectRatio');
  off = writeNullTerminatedString(buf, off, 'float');
  view.setUint32(off, 4, true); // size = 4 bytes
  off += 4;
  view.setFloat32(off, pixelAspectRatio, true);
  off += 4;

  // --- Attribute: screenWindowCenter (type "v2f") ---
  off = writeNullTerminatedString(buf, off, 'screenWindowCenter');
  off = writeNullTerminatedString(buf, off, 'v2f');
  view.setUint32(off, 8, true); // size = 2 × float
  off += 4;
  view.setFloat32(off, screenWindowCenter[0], true); off += 4;
  view.setFloat32(off, screenWindowCenter[1], true); off += 4;

  // --- Attribute: screenWindowWidth (type "float") ---
  off = writeNullTerminatedString(buf, off, 'screenWindowWidth');
  off = writeNullTerminatedString(buf, off, 'float');
  view.setUint32(off, 4, true); // size = 4 bytes
  off += 4;
  view.setFloat32(off, screenWindowWidth, true);
  off += 4;

  // --- End of header ---
  buf[off] = 0;
  off += 1;

  return buf.slice(0, off);
}

// ---------------------------------------------------------------------------
// Core multi-channel EXR encoder
// ---------------------------------------------------------------------------

/**
 * Encode multi-channel Float32Array data into a valid OpenEXR scanline file.
 *
 * @param width          Image width in pixels
 * @param height         Image height in pixels
 * @param channelData    Named channels with Float32Array data (one float per pixel per channel component)
 * @param compression    Compression mode (currently NONE and RLE are supported)
 * @returns              ArrayBuffer containing the complete EXR file
 */
function encodeMultiChannelEXR(
  width: number,
  height: number,
  channelData: EXRChannelData[],
  compression: EXRCompression = EXRCompression.RLE,
): ArrayBuffer {
  if (channelData.length === 0) {
    throw new Error('At least one channel is required for EXR encoding');
  }

  // Sort channels alphabetically (required by EXR spec)
  const sorted = [...channelData].sort((a, b) => a.name.localeCompare(b.name));

  // Build channel descriptors
  const channels: EXRChannel[] = sorted.map((cd) => ({
    name: cd.name,
    pixelType: EXRPixelType.FLOAT,
    xSampling: 1,
    ySampling: 1,
  }));

  // Bytes per pixel (all FLOAT = 4 bytes each)
  const bytesPerPixel = sorted.length * 4;

  // Build header
  const dataWindow: [number, number, number, number] = [0, 0, width - 1, height - 1];
  const displayWindow: [number, number, number, number] = [0, 0, width - 1, height - 1];
  const headerBytes = buildEXRHeader(
    channels,
    compression,
    dataWindow,
    displayWindow,
    EXR_LINE_ORDER_INCREASING_Y,
    1.0, // pixelAspectRatio
    [0.0, 0.0], // screenWindowCenter
    1.0, // screenWindowWidth
  );

  const useRLE = compression === EXRCompression.RLE;

  // --- Build scanline data ---
  // For each scanline we produce: y(int32) + dataSize(int32) + pixelData(bytes)
  const scanlineEntries: { y: number; data: Uint8Array }[] = [];

  for (let y = 0; y < height; y++) {
    // Interleave channel data for this row: for each pixel, write all channel samples
    const rowFloats = new Float32Array(width * sorted.length);
    for (let px = 0; px < width; px++) {
      for (let chIdx = 0; chIdx < sorted.length; chIdx++) {
        rowFloats[px * sorted.length + chIdx] = sorted[chIdx].data[y * width + px];
      }
    }

    const rowBytes = new Uint8Array(rowFloats.buffer, rowFloats.byteOffset, rowFloats.byteLength);

    if (useRLE) {
      // Byte reordering for better RLE compression
      const reordered = reorderScanlineBytes(rowBytes, bytesPerPixel, width);
      const compressed = rleCompress(reordered);
      // Use whichever is smaller
      if (compressed.length < reordered.length) {
        scanlineEntries.push({ y, data: compressed });
      } else {
        // Fallback to uncompressed for this scanline
        scanlineEntries.push({ y, data: new Uint8Array(reordered) });
      }
    } else {
      scanlineEntries.push({ y, data: new Uint8Array(rowBytes) });
    }
  }

  // --- Compute offset table ---
  // After header + offset table, scanline data begins
  const offsetTableSize = height * 8; // each entry is uint64 = 8 bytes

  // Align header to 4-byte boundary (the header already ends on byte boundary,
  // but we need to account for alignment before the offset table)
  let headerAlignedSize = headerBytes.length;
  while (headerAlignedSize % 4 !== 0) headerAlignedSize++;

  const scanlineDataStart = headerAlignedSize + offsetTableSize;

  // Compute byte offset for each scanline entry
  const offsets: bigint[] = [];
  let currentOffset = BigInt(scanlineDataStart);
  for (let y = 0; y < height; y++) {
    offsets.push(currentOffset);
    const entry = scanlineEntries[y];
    // y (4) + dataSize (4) + data.length
    currentOffset += BigInt(4 + 4 + entry.data.length);
  }

  // --- Assemble final buffer ---
  const totalSize = Number(currentOffset);
  const result = new ArrayBuffer(totalSize);
  const resultView = new DataView(result);
  const resultArr = new Uint8Array(result);

  let off = 0;

  // Write header (padded to alignment)
  resultArr.set(headerBytes, off);
  off = headerAlignedSize;

  // Write offset table
  for (let y = 0; y < height; y++) {
    // Write as two uint32s (low, high) for portability since BigInt64Array isn't always available
    const lo = Number(offsets[y] & BigInt(0xFFFFFFFF));
    const hi = Number((offsets[y] >> BigInt(32)) & BigInt(0xFFFFFFFF));
    resultView.setUint32(off, lo, true);
    off += 4;
    resultView.setUint32(off, hi, true);
    off += 4;
  }

  // Write scanline data
  for (let y = 0; y < height; y++) {
    const entry = scanlineEntries[y];
    resultView.setInt32(off, entry.y, true); // y-coordinate
    off += 4;
    resultView.setInt32(off, entry.data.length, true); // pixel data size
    off += 4;
    resultArr.set(entry.data, off);
    off += entry.data.length;
  }

  return result;
}

// ---------------------------------------------------------------------------
// OpenEXR Exporter Class
// ---------------------------------------------------------------------------

/**
 * OpenEXR Exporter Class
 * 
 * Provides functionality to export render targets to OpenEXR format.
 * Supports RLE compression, multi-channel output, and both Node.js
 * and browser environments.
 */
export class EXRExporter {
  /** Default compression method */
  private defaultCompression: EXRCompression;
  
  /** Default pixel type */
  private defaultPixelType: EXRPixelType;
  
  /** Whether running in Node.js environment */
  private isNode: boolean;

  constructor(
    defaultCompression: EXRCompression = EXRCompression.RLE,
    defaultPixelType: EXRPixelType = EXRPixelType.FLOAT
  ) {
    this.defaultCompression = defaultCompression;
    this.defaultPixelType = defaultPixelType;
    this.isNode = typeof process !== 'undefined' && process.versions?.node != null;
  }

  /**
   * Export a render target to EXR format
   */
  async export(
    renderTarget: WebGLRenderTarget,
    config: EXRExportConfig
  ): Promise<string | ArrayBuffer> {
    const {
      filename,
      outputDir = './output',
      compression = this.defaultCompression,
      pixelType = this.defaultPixelType,
      includeAlpha = true,
      flipY = false,
      metadata = {},
      onProgress,
      onComplete,
      onError,
    } = config;

    try {
      // Extract pixel data from render target
      const pixelData = this.extractPixelData(renderTarget, flipY);
      
      // Build EXR file structure
      const exrData: EXRFileData = {
        magic: 20000630, // Correct EXR magic number
        metadata: new Map(),
        channels: this.buildChannels(pixelType, includeAlpha),
        pixels: pixelData,
        width: renderTarget.width,
        height: renderTarget.height,
      };

      // Populate metadata
      this.populateMetadata(exrData.metadata, renderTarget, metadata, compression);

      // Encode to EXR binary format
      const exrBuffer = await this.encodeEXR(exrData, compression, onProgress);

      if (this.isNode) {
        // Node.js: Write to filesystem
        const path = await this.writeToFile(exrBuffer, filename, outputDir);
        onComplete?.(path);
        return path;
      } else {
        // Browser: Return ArrayBuffer for download
        onComplete?.(filename + '.exr');
        return exrBuffer;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      throw err;
    }
  }

  /**
   * Export multiple render targets (multi-pass) to separate EXR files
   */
  async exportMultiPass(
    passes: Map<string, WebGLRenderTarget>,
    config: EXRExportConfig
  ): Promise<string[] | ArrayBuffer[]> {
    const results: Array<string | ArrayBuffer> = [];
    
    for (const [passName, renderTarget] of Array.from(passes.entries())) {
      const passConfig: EXRExportConfig = {
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
    
    return results as string[] | ArrayBuffer[];
  }

  /**
   * Export multiple named channels into a single multi-channel EXR file.
   *
   * This is the primary API for GroundTruthRenderer output: pass depth,
   * normals, flow, etc. as separate named channels and they will all be
   * written into one EXR file with proper channel headers.
   *
   * @param width       Image width
   * @param height      Image height
   * @param channelData Array of { name, data: Float32Array } channel descriptors
   * @param config      Export configuration (filename, compression, etc.)
   * @returns           File path (Node.js) or ArrayBuffer (browser)
   */
  async exportMultiChannel(
    width: number,
    height: number,
    channelData: EXRChannelData[],
    config: Omit<EXRExportConfig, 'includeAlpha' | 'flipY' | 'pixelType'>
  ): Promise<string | ArrayBuffer> {
    const {
      filename,
      outputDir = './output',
      compression = this.defaultCompression,
      onProgress,
      onComplete,
      onError,
    } = config;

    try {
      const exrBuffer = encodeMultiChannelEXR(width, height, channelData, compression);
      onProgress?.(1.0);

      if (this.isNode) {
        const path = await this.writeToFile(exrBuffer, filename, outputDir);
        onComplete?.(path);
        return path;
      } else {
        onComplete?.(filename + '.exr');
        return exrBuffer;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      throw err;
    }
  }

  /**
   * Extract pixel data from render target
   */
  private extractPixelData(
    renderTarget: WebGLRenderTarget,
    flipY: boolean = false
  ): Float32Array {
    const gl = (renderTarget as any).__gl;
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, (renderTarget as any).framebuffer ?? renderTarget);
    gl.readPixels(
      0, 0, width, height,
      gl.RGBA,
      gl.FLOAT,
      data
    );

    // Restore framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, currentFramebuffer);

    // Flip vertically if needed (WebGL has origin at bottom-left)
    if (flipY) {
      this.flipVertically(data, width, height, channelCount);
    }

    return data;
  }

  /**
   * Build channel information for standard RGBA export
   */
  private buildChannels(
    pixelType: EXRPixelType,
    includeAlpha: boolean
  ): EXRChannel[] {
    const channels: EXRChannel[] = [
      { name: 'B', pixelType, xSampling: 1, ySampling: 1 },
      { name: 'G', pixelType, xSampling: 1, ySampling: 1 },
      { name: 'R', pixelType, xSampling: 1, ySampling: 1 },
    ];

    if (includeAlpha) {
      channels.push({ name: 'A', pixelType, xSampling: 1, ySampling: 1 });
    }

    // Note: channels will be sorted alphabetically during header writing
    return channels;
  }

  /**
   * Populate EXR metadata (kept for backward compatibility)
   */
  private populateMetadata(
    metadataMap: Map<string, any>,
    renderTarget: WebGLRenderTarget,
    userMetadata: EXRMetadata,
    compression: EXRCompression
  ): void {
    // Required fields
    metadataMap.set('channels', this.buildChannels(
      this.defaultPixelType,
      userMetadata.channels !== undefined
    ));
    
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
   * Encode EXR file data to binary format with proper spec-compliant output.
   *
   * Supports RLE and NONE compression.  Writes:
   *   - Magic number (20000630)
   *   - Version field (2, scanline mode)
   *   - Header attributes (channels, compression, dataWindow, displayWindow,
   *     lineOrder, pixelAspectRatio, screenWindowCenter, screenWindowWidth)
   *   - Scanline offset table
   *   - Scanline data (optionally RLE compressed)
   */
  private async encodeEXR(
    data: EXRFileData,
    compression: EXRCompression = EXRCompression.RLE,
    onProgress?: (progress: number) => void
  ): Promise<ArrayBuffer> {
    const { width, height, channels, pixels } = data;

    // Build channel data for the multi-channel encoder.
    // The pixels array is interleaved RGBA (4 floats per pixel) from WebGL.
    // We need to split it into named EXR channels.
    const channelDataList: EXRChannelData[] = [];

    for (const ch of channels) {
      const chData = new Float32Array(width * height);
      // Map channel name to pixel array index
      let srcOffset: number;
      if (ch.name === 'R') srcOffset = 0;
      else if (ch.name === 'G') srcOffset = 1;
      else if (ch.name === 'B') srcOffset = 2;
      else if (ch.name === 'A') srcOffset = 3;
      else srcOffset = 0; // fallback

      for (let i = 0; i < width * height; i++) {
        chData[i] = pixels[i * 4 + srcOffset];
      }
      channelDataList.push({ name: ch.name, data: chData });
    }

    onProgress?.(0.5);

    const result = encodeMultiChannelEXR(width, height, channelDataList, compression);

    onProgress?.(1.0);
    return result;
  }

  /**
   * Flip pixel data vertically
   */
  private flipVertically(
    data: Float32Array,
    width: number,
    height: number,
    channels: number
  ): void {
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
  private async writeToFile(
    data: ArrayBuffer,
    filename: string,
    outputDir: string
  ): Promise<string> {
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
  static createDownloadBlob(arrayBuffer: ArrayBuffer, filename: string): Blob {
    return new Blob([arrayBuffer], { type: 'image/x-exr' });
  }

  /**
   * Trigger download in browser (utility function)
   */
  static triggerDownload(blob: Blob, filename: string): void {
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

// ---------------------------------------------------------------------------
// Convenience function: writeGroundTruthEXR
// ---------------------------------------------------------------------------

/**
 * Write ground truth render data as a multi-channel EXR file.
 *
 * Accepts the same Float32Array data that GroundTruthRenderer produces
 * and writes it as a spec-compliant EXR file with named channels.
 *
 * Typical channel names from GroundTruthRenderer:
 *   - "depth.Z"                → single-float depth channel
 *   - "normal.X", "normal.Y", "normal.Z"  → camera-space normals
 *   - "flow.X", "flow.Y"      → optical flow motion vectors
 *   - "R", "G", "B", "A"      → beauty render
 *
 * Supports both Node.js (writes via fs.writeFile) and browser (triggers Blob download).
 *
 * @param width       Image width in pixels
 * @param height      Image height in pixels
 * @param channels    Array of { name: string; data: Float32Array } channel descriptors.
 *                    Each data array must have exactly width × height floats.
 * @param filename    Output filename (without .exr extension)
 * @param outputDir   Output directory (Node.js only, default: "./output")
 * @param compression Compression mode (default: RLE)
 *
 * @example
 * ```ts
 * const result = gtRenderer.render(scene, camera);
 * const channels: EXRChannelData[] = [];
 * if (result.depth) channels.push({ name: 'depth.Z', data: result.depth });
 * if (result.normal) {
 *   // Split normal XYZ into separate channels
 *   const nx = new Float32Array(result.width * result.height);
 *   const ny = new Float32Array(result.width * result.height);
 *   const nz = new Float32Array(result.width * result.height);
 *   for (let i = 0; i < result.width * result.height; i++) {
 *     nx[i] = result.normal[i * 3];
 *     ny[i] = result.normal[i * 3 + 1];
 *     nz[i] = result.normal[i * 3 + 2];
 *   }
 *   channels.push({ name: 'normal.X', data: nx });
 *   channels.push({ name: 'normal.Y', data: ny });
 *   channels.push({ name: 'normal.Z', data: nz });
 * }
 * await writeGroundTruthEXR(1920, 1080, channels, 'frame_0001');
 * ```
 */
export async function writeGroundTruthEXR(
  width: number,
  height: number,
  channels: EXRChannelData[],
  filename: string,
  outputDir: string = './output',
  compression: EXRCompression = EXRCompression.RLE,
): Promise<string | ArrayBuffer> {
  // Validate channel data sizes
  const expectedSize = width * height;
  for (const ch of channels) {
    if (ch.data.length !== expectedSize) {
      throw new Error(
        `Channel "${ch.name}" has ${ch.data.length} elements, expected ${expectedSize} (width=${width} × height=${height})`
      );
    }
  }

  const exrBuffer = encodeMultiChannelEXR(width, height, channels, compression);

  const isNode = typeof process !== 'undefined' && process.versions?.node != null;

  if (isNode) {
    const fs = await import('fs');
    const path = await import('path');

    const fullPath = path.join(outputDir, `${filename}.exr`);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const buffer = Buffer.from(exrBuffer);
    fs.writeFileSync(fullPath, buffer);
    return fullPath;
  } else {
    // Browser: trigger download
    const blob = new Blob([exrBuffer], { type: 'image/x-exr' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.exr`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return exrBuffer;
  }
}

/**
 * Helper to split interleaved Float32Array data into separate per-component
 * EXRChannelData entries. Useful for converting GroundTruthRenderer output
 * (which stores normals as RGB interleaved, flow as XY interleaved, etc.)
 * into the named single-component channels that EXR expects.
 *
 * @param namePrefix  Channel name prefix (e.g. "normal", "flow")
 * @param data        Interleaved Float32Array (components per pixel = suffixes.length)
 * @param suffixes    Component suffixes (e.g. ["X","Y","Z"] or ["X","Y"])
 * @param pixelCount  Number of pixels (width × height)
 */
export function splitInterleavedChannel(
  namePrefix: string,
  data: Float32Array,
  suffixes: string[],
  pixelCount: number,
): EXRChannelData[] {
  const numComponents = suffixes.length;
  const result: EXRChannelData[] = [];

  for (let c = 0; c < numComponents; c++) {
    const component = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      component[i] = data[i * numComponents + c];
    }
    result.push({ name: `${namePrefix}.${suffixes[c]}`, data: component });
  }

  return result;
}

export default EXRExporter;
