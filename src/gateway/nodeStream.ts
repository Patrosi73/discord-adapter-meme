import assert from "node:assert";
import * as stream from "node:stream";
import { isAnyArrayBuffer, isArrayBufferView } from "node:util/types";
import * as zlib from "node:zlib";

// THIS IS VERY NODE INTERNALS SPECIFIC

const symbols = Object.getOwnPropertySymbols(zlib.createDeflate());

const kError: unique symbol = symbols.find(
  (s) => s.toString() === "Symbol(kError)",
) as any;

if (!kError) {
  throw new Error("zlib: missing kError symbol, internals changed??");
}

interface ZlibInternal extends stream.Transform, zlib.Zlib {
  bytesWritten: number;
  _outBuffer: Buffer;
  _outOffset: number;
  _chunkSize: number;
  _defaultFlushFlag: number;
  _finishFlushFlag: number;
  _defaultFullFlushFlag: number;
  _info?: boolean | undefined;
  _maxOutputLength: number;
  _handle: any; // ZCtx
  _writeState: Uint32Array;
  [kError]: Error | null;
}

// Copypasted from https://github.com/nodejs/node/blob/c1354ffec367b64cc6e69e405168d2df609c5e94/lib/zlib.js
export function zlibBufferSync(
  engine: zlib.Zlib,
  buffer: string | Buffer | DataView | ArrayBuffer,
): Buffer {
  if (typeof buffer === "string") {
    buffer = Buffer.from(buffer);
  } else if (!isArrayBufferView(buffer)) {
    if (isAnyArrayBuffer(buffer)) {
      buffer = Buffer.from(buffer);
    } else {
      // throw new ERR_INVALID_ARG_TYPE(
      //   'buffer',
      //   ['string', 'Buffer', 'TypedArray', 'DataView', 'ArrayBuffer'],
      //   buffer
      // );
      throw new TypeError(
        '[ERR_INVALID_ARG_TYPE]: The "buffer" argument must be of type string or an instance of Buffer, TypedArray, DataView, or ArrayBuffer.',
      );
    }
  }

  return processChunkSync(
    engine as ZlibInternal,
    buffer as Buffer,
    (engine as any)._finishFlushFlag,
  );
}

function processChunkSync(
  self: ZlibInternal,
  chunk: Buffer,
  flushFlag: number,
): Buffer {
  let availInBefore = chunk.byteLength;
  let availOutBefore = self._chunkSize - self._outOffset;
  let inOff = 0;
  let availOutAfter;
  let availInAfter;

  const buffers: Buffer[] = [];
  let nread = 0;
  let inputRead = 0;
  const state = self._writeState;
  const handle = self._handle;
  let buffer = self._outBuffer;
  let offset = self._outOffset;
  const chunkSize = self._chunkSize;

  let error;

  const errorCb = (err: Error) => {
    error = err;
  };

  self.on("error", errorCb);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    handle.writeSync(
      flushFlag,
      chunk, // in
      inOff, // in_off
      availInBefore, // in_len
      buffer, // out
      offset, // out_off
      availOutBefore,
    ); // out_len
    if (error) throw error;
    else if (self[kError]) throw self[kError];

    availOutAfter = state[0];
    availInAfter = state[1];

    const inDelta = availInBefore - availInAfter;
    inputRead += inDelta;

    const have = availOutBefore - availOutAfter;
    if (have > 0) {
      const out = buffer.slice(offset, offset + have);
      offset += have;
      buffers.push(out);
      nread += out.byteLength;

      if (nread > self._maxOutputLength) {
        _close(self);
        throw new RangeError(`ERR_BUFFER_TOO_LARGE: ${self._maxOutputLength}`);
      }
    } else {
      assert(have === 0, "have should not go down");
    }

    // Exhausted the output buffer, or used all the input create a new one.
    if (availOutAfter === 0 || offset >= chunkSize) {
      availOutBefore = chunkSize;
      offset = 0;
      buffer = Buffer.allocUnsafe(chunkSize);
    }

    if (availOutAfter === 0) {
      // Not actually done. Need to reprocess.
      // Also, update the availInBefore to the availInAfter value,
      // so that if we have to hit it a third (fourth, etc.) time,
      // it'll have the correct byte counts.
      inOff += inDelta;
      availInBefore = availInAfter;
    } else {
      break;
    }
  }

  self.bytesWritten = inputRead;
  // _close(self);

  if (nread === 0) return Buffer.alloc(0);

  self.removeListener("error", errorCb);

  return buffers.length === 1 ? buffers[0] : Buffer.concat(buffers, nread);
}

function _close(engine: ZlibInternal) {
  // Caller may invoke .close after a zlib error (which will null _handle).
  if (!engine._handle) return;

  engine._handle.close();
  engine._handle = null;
}
