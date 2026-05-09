/**
 * Python-Compatible API Module
 *
 * Provides a wrapper around the existing NodeWrangler that matches
 * infinigen's Python `NodeWrangler` API signature and auto-connecting
 * behaviour.
 *
 * ## Exports
 *
 * - **PythonCompatibleNodeWrangler** — Main class wrapping `NodeWrangler`
 *   with Python-style convenience methods that auto-connect their inputs.
 * - **PythonInputValue** — Union type for values accepted by Python-style
 *   methods (NodeInstance, NodeSocket, tuples, literals, arrays).
 * - **CaptureResult** — Return type of the `capture()` method.
 *
 * @module core/nodes/api
 */

export {
  PythonCompatibleNodeWrangler,
  type PythonInputValue,
  type CaptureResult,
} from './python-compatible-api';
