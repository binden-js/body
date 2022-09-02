import { deepStrictEqual, ok, fail } from "node:assert";
import { Server } from "node:http";
import {
  brotliCompress as brotliCompressAsync,
  gzip as gzipAsync,
  deflate as deflateAsync,
  InputType,
} from "node:zlib";
import {
  errors,
  getGlobalDispatcher,
  request,
  setGlobalDispatcher,
  Agent,
  Dispatcher,
} from "undici";
import { Binden, Middleware, Context, ct_text, ct_json, ct_form } from "binden";

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
  let original_agent: Dispatcher;

  suiteSetup(() => {
    original_agent = getGlobalDispatcher();
    const agent = new Agent({ keepAliveTimeout: 1, keepAliveMaxTimeout: 1 });
    setGlobalDispatcher(agent);
  });

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
    const response = await request(url, { method: "POST", body, headers });
    ok(response.statusCode === 200);
    const text = await response.body.text();
    deepStrictEqual(text, "");
  });

  test("Unsupported methods", async () => {
    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        ok(typeof ct.request.body === "undefined");
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const { unsupported_methods } = BodyParser;
    // `CONNECT` is not supported, if any
    unsupported_methods.delete("CONNECT");

    for (const method of unsupported_methods) {
      const headers = { "Content-Type": ct_text };
      const response = await request(url, {
        method: method as Dispatcher.HttpMethod,
        headers,
      });
      ok(response.statusCode === 200);
      const text = await response.body.text();
      deepStrictEqual(text, "");
    }
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
          ok(typeof ct.request.body === "undefined");
          resolve();
          return ct.send();
        }
      }

      app.use(new DestroySocket(), new BodyParser(), new AssertMiddleware());
    });

    const body = "Hello World";
    const headers = { "Content-Type": ct_text };
    try {
      await request(url, { method: "POST", body, headers });
      fail("Should throw an Error");
    } catch (error: unknown) {
      ok(error instanceof errors.SocketError);
      deepStrictEqual(error.message, `other side closed`);
      deepStrictEqual(error.code, `UND_ERR_SOCKET`);
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
    const response = await request(url, { method: "POST", body, headers });
    ok(response.statusCode === 200);
    const text = await response.body.text();
    deepStrictEqual(text, "");
  });

  test("JSON (invalid)", async () => {
    app.use(new BodyParser());

    const headers = { "Content-Type": ct_json };
    const body = "Not a JSON";
    const response = await request(url, { method: "POST", body, headers });
    deepStrictEqual(response.statusCode, 415);
    const text = await response.body.text();
    deepStrictEqual(text, "");
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

    const headers = { "Content-Type": ct_form };
    const response = await request(url, {
      method: "POST",
      headers,
      body: body.toString(),
    });
    ok(response.statusCode === 200);
    const text = await response.body.text();
    deepStrictEqual(text, "");
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
    const response = await request(url, { method: "POST", body, headers });
    ok(response.statusCode);
    const text = await response.body.text();
    deepStrictEqual(text, "");
  });

  test("Missing `Content-Type`", async () => {
    const body = "Hello World";
    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        ok(typeof ct.request.body === "undefined");
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const headers = { "Content-Type": "" };

    const response = await request(url, { method: "POST", body, headers });
    deepStrictEqual(response.statusCode, 200);
    const text = await response.body.text();
    deepStrictEqual(text, "");
  });

  test("Unsupported `Content-Type`", async () => {
    const body = "Hello World";

    class AssertMiddleware extends Middleware {
      public run(ct: Context): Promise<void> {
        ok(typeof ct.request.body === "undefined");
        return ct.send();
      }
    }

    app.use(new BodyParser(), new AssertMiddleware());

    const headers = { "Content-Type": "__unsupported__" };
    const response = await request(url, { method: "POST", body, headers });
    deepStrictEqual(response.statusCode, 200);
    const text = await response.body.text();
    deepStrictEqual(text, "");
  });

  test("Unsupported `Content-Encoding`", async () => {
    const body = "Hello World";

    app.use(new BodyParser());

    const headers = { "Content-Type": ct_json, "Content-Encoding": "compress" };
    const response = await request(url, { method: "POST", body, headers });
    deepStrictEqual(response.statusCode, 415);
    const text = await response.body.text();
    deepStrictEqual(text, "");
  });

  test("Decompressions errors", async () => {
    const body = "Hello World";

    app.use(new BodyParser());

    const headers = { "Content-Type": ct_text, "Content-Encoding": "br" };
    const response = await request(url, { method: "POST", body, headers });
    deepStrictEqual(response.statusCode, 415);
    const text = await response.body.text();
    deepStrictEqual(text, "");
  });

  teardown((done) => server.close(done));

  suiteTeardown(() => {
    setGlobalDispatcher(original_agent);
  });
});
