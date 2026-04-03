import * as zlib from "zlib";
import { createRequire } from "node:module";
import { zlibBufferSync } from "./nodeStream.ts";

export type GatewayCompression = "none" | "zlib-stream" | "zstd-stream";
export type GatewayEncoding = "json" | "etf";

export interface GatewayCodec {
  encode<T = any>(payload: T): string | Buffer;
  decode<T = any>(payload: string | Buffer): T;
}

const require = createRequire(__filename);
let warnedAboutErlpack = false;

function getErlpack() {
  try {
    return require("erlpack") as {
      pack(payload: unknown): ArrayBufferView;
      unpack(payload: Buffer): unknown;
    };
  } catch (error) {
    if (!warnedAboutErlpack) {
      warnedAboutErlpack = true;
      console.warn(
        "[Gateway] erlpack unavailable, falling back to JSON codec:",
        error,
      );
    }

    return null;
  }
}

export class ETFGatewayCodec implements GatewayCodec {
  public encode<T = any>(payload: T): string | Buffer {
    const erlpack = getErlpack();
    if (!erlpack) {
      return JSON.stringify(payload);
    }

    return Buffer.from(erlpack.pack(payload).buffer);
  }

  public decode<T = any>(payload: string | Buffer): T {
    const erlpack = getErlpack();
    if (!erlpack) {
      return JSON.parse(payload.toString()) as T;
    }

    return erlpack.unpack(Buffer.from(payload)) as T;
  }
}

export class JsonGatewayCodec implements GatewayCodec {
  public encode<T = any>(payload: T): string | Buffer {
    return JSON.stringify(payload, (_key, value) => {
      if (value instanceof BigInt) {
        return value.toString();
      }

      return value;
    });
  }

  public decode<T = any>(payload: string | Buffer): T {
    return JSON.parse(payload.toString()) as T;
  }
}

export class ZlibGatewayCodec implements GatewayCodec {
  private downstream: GatewayCodec;

  private deflate: zlib.Deflate;

  constructor(downstream: GatewayCodec) {
    this.downstream = downstream;
    this.deflate = zlib.createDeflate({
      flush: zlib.constants.Z_SYNC_FLUSH,
      finishFlush: zlib.constants.Z_SYNC_FLUSH,
    });
  }

  public encode<T = any>(payload: T): string | Buffer {
    return zlibBufferSync(this.deflate, this.downstream.encode(payload));
  }

  public decode<T = any>(payload: string | Buffer): T {
    return this.downstream.decode(payload) as T;
  }
}

export class ZstdGatewayCodec implements GatewayCodec {
  private downstream: GatewayCodec;

  constructor(downstream: GatewayCodec) {
    this.downstream = downstream;
  }

  public encode<T = any>(payload: T): string | Buffer {
    return zlib.deflateSync(this.downstream.encode(payload));
  }

  public decode<T = any>(payload: string | Buffer): T {
    return this.downstream.decode(zlib.inflateSync(payload));
  }
}

const etfCodec = new ETFGatewayCodec();
const jsonCodec = new JsonGatewayCodec();

export const getCodec = (
  codec: GatewayEncoding,
  compression: GatewayCompression,
): GatewayCodec => {
  let mainCodec;

  switch (codec) {
    case "etf":
      mainCodec = etfCodec;
      break;
    default:
      mainCodec = jsonCodec;
      break;
  }

  switch (compression) {
    case "zlib-stream":
      return new ZlibGatewayCodec(mainCodec);
    case "zstd-stream":
      return new ZstdGatewayCodec(mainCodec);
    default:
      return mainCodec;
  }
};
