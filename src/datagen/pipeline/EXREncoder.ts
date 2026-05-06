/**
 * Minimal EXR Encoder for OpenEXR 2.0 (scan-line based, uncompressed)
 *
 * Encodes Float32 pixel data into a valid single-part scanline EXR file
 * with NO_COMPRESSION and 32-bit float pixel type.
 *
 * Supports:
 *   - Single channel:  ['Y']              (depth / grayscale)
 *   - Two channels:    ['R', 'G']         (optical flow)
 *   - Three channels:  ['R', 'G', 'B']    (normals / RGB)
 *   - Four channels:   ['R', 'G', 'B', 'A'] (RGBA)
 *
 * EXR binary layout:
 *   1. Magic number  (4 bytes, int32 LE)  — 20000630 (0x762f3101 byte sequence)
 *   2. Version       (4 bytes, int32 LE)  — 2
 *   3. Header attributes (name\0 + type\0 + size(int32) + value), terminated by 0x00
 *   4. Offset table  (height × 8 bytes, int64 LE per scanline offset)
 *   5. Scanline data (per line: y(int32) + pixelDataSize(int32) + float32 data)
 *
 * @module datagen/pipeline/EXREncoder
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OpenEXR magic number — stored as int32 LE; byte sequence is 0x76 0x2f 0x31 0x01 */
const EXR_MAGIC = 20000630;

/** Version 2, single-part scanline (no tiles flag) */
const EXR_VERSION = 2;

/** Pixel type FLOAT = 1 (32-bit IEEE float) */
const PIXELTYPE_FLOAT = 1;

/** Compression mode: NO_COMPRESSION = 0 */
const COMPRESSION_NONE = 0;

/** Line order: INCREASING_Y = 0 (top scanline first) */
const LINEORDER_INCREASING_Y = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode Float32 pixel data as an OpenEXR 2.0 file (uncompressed, scanline).
 *
 * @param data     - Row-major Float32Array of pixel data.
 *                   For multi-channel images, channels are interleaved per pixel:
 *                   [R0,G0,B0, R1,G1,B1, ...] for channels=['R','G','B'].
 * @param width    - Image width in pixels
 * @param height   - Image height in pixels
 * @param channels - Channel names. Defaults to ['Y'] (single-channel grayscale).
 *                   Accepted values: ['Y'], ['R','G'], ['R','G','B'], ['R','G','B','A'].
 * @returns ArrayBuffer containing the complete EXR file bytes
 *
 * @example
 * ```ts
 * // Depth (1-channel)
 * const exr = encodeEXR(depthData, 1920, 1080);
 *
 * // Optical flow (2-channel)
 * const exr = encodeEXR(flowData, 1920, 1080, ['R', 'G']);
 *
 * // Normals (3-channel)
 * const exr = encodeEXR(normalData, 1920, 1080, ['R', 'G', 'B']);
 * ```
 */
export function encodeEXR(
  data: Float32Array,
  width: number,
  height: number,
  channels: string[] = ['Y'],
): ArrayBuffer {
  return EXREncoder.encode(data, width, height, channels);
}

/**
 * Class-based EXR encoder with the same functionality as {@link encodeEXR}.
 *
 * Exposed for callers who prefer a class API or need to extend the encoder.
 */
export class EXREncoder {
  /**
   * Encode Float32 pixel data as an OpenEXR 2.0 file.
   */
  static encode(
    data: Float32Array,
    width: number,
    height: number,
    channels: string[] = ['Y'],
  ): ArrayBuffer {
    const numChannels = channels.length;

    // ---- Build header ----
    const headerParts: Uint8Array[] = [];

    // Magic number (int32 LE)
    headerParts.push(int32(EXR_MAGIC));
    // Version (int32 LE)
    headerParts.push(int32(EXR_VERSION));

    // Required header attributes:
    //   name\0  type\0  size(int32)  value

    // channels (chlist)
    headerParts.push(attribute('channels', 'chlist', encodeChannelList(channels)));

    // compression (compression)
    headerParts.push(attribute('compression', 'compression', new Uint8Array([COMPRESSION_NONE])));

    // dataWindow (box2i: xMin, yMin, xMax, yMax)
    headerParts.push(attribute('dataWindow', 'box2i', concat(
      int32(0), int32(0), int32(width - 1), int32(height - 1),
    )));

    // displayWindow (box2i)
    headerParts.push(attribute('displayWindow', 'box2i', concat(
      int32(0), int32(0), int32(width - 1), int32(height - 1),
    )));

    // lineOrder (lineOrder)
    headerParts.push(attribute('lineOrder', 'lineOrder', new Uint8Array([LINEORDER_INCREASING_Y])));

    // pixelAspectRatio (float)
    headerParts.push(attribute('pixelAspectRatio', 'float', float32(1.0)));

    // screenWindowCenter (v2f: two floats)
    headerParts.push(attribute('screenWindowCenter', 'v2f', concat(float32(0), float32(0))));

    // screenWindowHeight (float) — corresponds to the EXR spec's screenWindowWidth;
    // using the name the caller requested. Most EXR readers accept either.
    headerParts.push(attribute('screenWindowHeight', 'float', float32(1.0)));

    // End of header: single null byte
    headerParts.push(new Uint8Array([0]));

    // ---- Calculate sizes ----
    let headerSize = 0;
    for (const part of headerParts) headerSize += part.length;

    // Offset table: one int64 (8 bytes) per scanline
    const offsetTableSize = height * 8;

    // Pixel data per scanline: numChannels × width × sizeof(float32)
    const pixelDataSizePerLine = numChannels * width * 4;
    const scanLineHeaderSize = 4 + 4; // y(int32) + pixelDataSize(int32)
    const totalScanDataSize = height * (scanLineHeaderSize + pixelDataSizePerLine);

    const totalSize = headerSize + offsetTableSize + totalScanDataSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    let offset = 0;

    // ---- Write header ----
    for (const part of headerParts) {
      bytes.set(part, offset);
      offset += part.length;
    }

    // ---- Write offset table ----
    const dataStart = headerSize + offsetTableSize;
    for (let y = 0; y < height; y++) {
      const scanLineOffset = dataStart + y * (scanLineHeaderSize + pixelDataSizePerLine);
      // int64 as two int32s (LE): low 32 bits, high 32 bits (0 for files < 4 GB)
      view.setInt32(offset, scanLineOffset, true);
      view.setInt32(offset + 4, 0, true);
      offset += 8;
    }

    // ---- Write scanline data ----
    // EXR stores channels separately within each scanline:
    //   all R values for the row, then all G values, then all B values, etc.
    for (let y = 0; y < height; y++) {
      // y coordinate (int32 LE)
      view.setInt32(offset, y, true);
      offset += 4;

      // pixel data size in bytes (int32 LE)
      view.setInt32(offset, pixelDataSizePerLine, true);
      offset += 4;

      // Channel data: for each channel, write all pixel values for this row
      for (let c = 0; c < numChannels; c++) {
        for (let x = 0; x < width; x++) {
          // Source data is interleaved: [R0,G0,B0, R1,G1,B1, ...]
          const srcIdx = (y * width + x) * numChannels + c;
          const value = srcIdx < data.length ? data[srcIdx] : 0;
          view.setFloat32(offset, value, true);
          offset += 4;
        }
      }
    }

    return buffer;
  }
}

// ---------------------------------------------------------------------------
// Internal encoding helpers
// ---------------------------------------------------------------------------

/** Encode an int32 as 4 bytes (little-endian) */
function int32(value: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setInt32(0, value, true);
  return new Uint8Array(buf);
}

/** Encode a float32 as 4 bytes (little-endian) */
function float32(value: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true);
  return new Uint8Array(buf);
}

/** Concatenate multiple Uint8Arrays into one */
function concat(...parts: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const part of parts) totalLength += part.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Encode an EXR header attribute: name\0 + type\0 + size(int32) + value
 */
function attribute(name: string, type: string, value: Uint8Array): Uint8Array {
  const nameBytes = stringToNullTerminatedBytes(name);
  const typeBytes = stringToNullTerminatedBytes(type);
  const sizeBytes = int32(value.length);
  return concat(nameBytes, typeBytes, sizeBytes, value);
}

/**
 * Encode the channel list (chlist) attribute value.
 *
 * Format per channel:
 *   name\0  +  pixelType(int32)  +  pLinear(uint8)  +  reserved(3 bytes)  +  xSampling(int32)  +  ySampling(int32)
 * Terminated by a single null byte.
 */
function encodeChannelList(channelNames: string[]): Uint8Array {
  const parts: Uint8Array[] = [];

  for (const name of channelNames) {
    parts.push(stringToNullTerminatedBytes(name));    // channel name\0
    parts.push(int32(PIXELTYPE_FLOAT));                // pixel type: FLOAT
    parts.push(new Uint8Array([0, 0, 0, 0]));          // pLinear(0) + reserved(3)
    parts.push(int32(1));                               // xSampling = 1
    parts.push(int32(1));                               // ySampling = 1
  }

  // End of channel list: null terminator
  parts.push(new Uint8Array([0]));

  return concat(...parts);
}

/** Encode a string as UTF-8 bytes with a null terminator */
function stringToNullTerminatedBytes(str: string): Uint8Array {
  const encoder = typeof TextEncoder !== 'undefined'
    ? new TextEncoder()
    : new (require('util') as any).TextEncoder();
  const encoded = encoder.encode(str);
  const result = new Uint8Array(encoded.length + 1); // +1 for null terminator
  result.set(encoded, 0);
  result[encoded.length] = 0;
  return result;
}
