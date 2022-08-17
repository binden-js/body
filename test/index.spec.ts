import { deepStrictEqual, ok, fail } from "node:assert";
import { Server } from "node:http";
import {
  brotliCompress as brotliCompressAsync,
  gzip as gzipAsync,
  deflate as deflateAsync,
  InputType,
} from "node:zlib";
import fetch, { FetchError } from "node-fetch";
import { Binden, Middleware, Context, ct_text, ct_json } from "binden";

import { BodyParser } from "../index.js";

function brotliCompress(data: InputType): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    brotliCompressAsync(data, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

function gzip(data: InputType): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    gzipAsync(data, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

function deflate(data: InputType): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    deflateAsync(data, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

const port = 8080;
const url = `http://localhost:${port}/`;

suite("BodyParser", () => {
  let app: Binden;
  let server: Server;

  setup((done) => {
    app = new Binden();
    server = app.createServer().listen(port, done);
  });

  test("text", async () => {
    const body = "Hello World";
    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        deepStrictEqual(ct.request.body, body);
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const headers = { "Content-Type": ct_text };
    const response = await fetch(url, { method: "POST", body, headers });
    ok(response.ok);
  });

  test("Unsupported method", async () => {
    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        deepStrictEqual(typeof ct.request.body, "undefined");
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const headers = { "Content-Type": ct_text };
    ok((await fetch(url, { method: "GET", headers })).ok);
    ok((await fetch(url, { method: "HEAD", headers })).ok);
    ok((await fetch(url, { method: "OPTIONS", headers })).ok);
    ok((await fetch(url, { method: "TRACE", headers })).ok);
  });

  test("Destroyed socket", async () => {
    const promise = new Promise<void>((resolve) => {
      class DestroySocket extends Middleware {
        public run(ct: Context): void {
          ct.request.destroy();
          deepStrictEqual(ct.request.destroyed, true);
        }
      }
      class AssertMiddleware extends Middleware {
        public run(ct: Context): Promise<void> {
          deepStrictEqual(typeof ct.request.body, "undefined");
          resolve();
          return ct.send();
        }
      }

      app.use(new DestroySocket(), new BodyParser(), new AssertMiddleware());
    });

    const body = "Hello World";
    const headers = { "Content-Type": ct_text };
    try {
      await fetch(url, { method: "POST", body, headers });
      fail("Should throw an Error");
    } catch (error: unknown) {
      ok(error instanceof FetchError);
      deepStrictEqual(error.type, "system");
      deepStrictEqual(error.code, "ECONNRESET");
      deepStrictEqual(
        error.message,
        `request to ${url} failed, reason: socket hang up`
      );
    }
    await promise;
  });

  test("JSON", async () => {
    const expected = { message: "Hello World" };
    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        deepStrictEqual(ct.request.body, expected);
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const headers = { "Content-Type": ct_json };
    const body = JSON.stringify(expected);
    const response = await fetch(url, { method: "POST", body, headers });
    ok(response.ok);
  });

  test("JSON (invalid)", async () => {
    app.use(new BodyParser());

    const headers = { "Content-Type": ct_json };
    const body = "Not a JSON";
    const response = await fetch(url, { method: "POST", body, headers });
    deepStrictEqual(response.status, 415);
  });

  test("form", async () => {
    const body = new URLSearchParams({ message: "Hello World" });
    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        deepStrictEqual(ct.request.body, body);
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const response = await fetch(url, { method: "POST", body });
    ok(response.ok);
  });

  test("encoding", async () => {
    const expected = { message: "Hello World" };
    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        deepStrictEqual(ct.request.body, expected);
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const brotli = await brotliCompress(JSON.stringify(expected));
    const doubleGzip = await gzip(await gzip(brotli));
    const body = await deflate(doubleGzip);

    const ce = "br, x-gzip, gzip, deflate";
    const headers = { "Content-Encoding": ce, "Content-Type": ct_json };
    const response = await fetch(url, { method: "POST", body, headers });
    ok(response.ok);
  });

  test("Missing `Content-Type`", async () => {
    const body = "Hello World";
    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        deepStrictEqual(typeof ct.request.body, "undefined");
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const headers = { "Content-Type": "" };

    const response = await fetch(url, { method: "POST", body, headers });
    deepStrictEqual(response.status, 200);
  });

  test("Unsupported `Content-Type`", async () => {
    const body = "Hello World";

    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        deepStrictEqual(typeof ct.request.body, "undefined");
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const headers = { "Content-Type": "__unsupported__" };
    const response = await fetch(url, { method: "POST", body, headers });
    deepStrictEqual(response.status, 200);
  });

  test("Unsupported `Content-Encoding`", async () => {
    const body = "Hello World";

    app.use(new BodyParser());

    const headers = { "Content-Type": ct_json, "Content-Encoding": "compress" };
    const response = await fetch(url, { method: "POST", body, headers });
    deepStrictEqual(response.status, 415);
  });

  test("Decompressions errors", async () => {
    const body = "Hello World";

    app.use(new BodyParser());

    const headers = { "Content-Type": ct_text, "Content-Encoding": "br" };
    const response = await fetch(url, { method: "POST", body, headers });
    deepStrictEqual(response.status, 415);
  });

  teardown((done) => server.close(done));
});
