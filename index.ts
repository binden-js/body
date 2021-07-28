import { finished } from "stream";
import { createInflate, createGunzip, createBrotliDecompress } from "zlib";
import {
  KauaiError,
  Middleware,
  Context,
  ct_text,
  ct_json,
  ct_form,
} from "kauai";

import type { Duplex, Readable } from "stream";

export type IBodyContentType = typeof ct_json | typeof ct_text | typeof ct_form;

export class BodyParser extends Middleware {
  public async run(context: Context): Promise<void> {
    const { name: middleware } = BodyParser;
    const { request, log: logger } = context;
    const log = logger.child({ middleware });
    const { aborted, complete, destroyed, method = "GET" } = request;

    if (
      method === "GET" ||
      method === "HEAD" ||
      method === "OPTIONS" ||
      method === "TRACE"
    ) {
      log.debug("Unsupported method", { method });
      return;
    }

    if (aborted || complete || destroyed) {
      log.debug("Skip parsing", { aborted, complete, destroyed });
      return;
    }

    const { content_type, content_encoding } = request;

    const type = content_type?.type ?? null;

    if (type !== ct_json && type !== ct_text && type !== ct_form) {
      log.debug("Unsupported Content-Type", { content_type: type });
      return;
    }

    const streams: [string, Duplex][] = [];

    for (const { encoding } of content_encoding) {
      if (encoding === "gzip" || encoding === "x-gzip") {
        streams.push([encoding, createGunzip()]);
      } else if (encoding === "deflate") {
        streams.push([encoding, createInflate()]);
      } else if (encoding === "br") {
        streams.push([encoding, createBrotliDecompress()]);
      } else {
        log.debug("Unsupported encoding", { encoding });
        throw new KauaiError(415);
      }
    }

    const body = await new Promise<string>((resolve, reject) => {
      let { request: stream } = context as { request: Readable };

      for (const [encoding, decompresser] of streams) {
        decompresser.once("error", (error) => {
          log.debug("Decoding failed", { error, encoding });
          reject(new KauaiError(415));
        });
        stream.pipe(decompresser);
        stream = decompresser;
      }

      const chunks: Buffer[] = [];

      stream.on("data", (data: Buffer) => chunks.push(data));

      finished(stream, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(Buffer.concat(chunks).toString());
        }
      });
    });

    try {
      request.body =
        type === ct_json
          ? JSON.parse(body)
          : type === ct_form
          ? new URLSearchParams(body)
          : body;
    } catch (error: unknown) {
      log.debug("Request body does not match provided Content-Type", {
        error,
        type,
        body,
      });

      throw new KauaiError(415);
    }
  }
}

export default BodyParser;
