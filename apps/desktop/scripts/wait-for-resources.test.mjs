import * as NodeHttp from "node:http";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeFS from "node:fs";

import { assert, describe, it } from "vite-plus/test";

import { waitForResources } from "./wait-for-resources.mjs";

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("expected a TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

describe("waitForResources", () => {
  it("waits until Vite-shaped HTTP paths return 200, not just a TCP accept", async () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-wait-resources-"));
    const readyFile = NodePath.join(directory, "main.cjs");
    NodeFS.writeFileSync(readyFile, "ok");

    let serveModules = false;
    const server = NodeHttp.createServer((request, response) => {
      if (!serveModules) {
        response.statusCode = 404;
        response.end("not ready");
        return;
      }
      if (request.url === "/" || request.url === "/src/main.tsx") {
        response.statusCode = 200;
        response.end("ready");
        return;
      }
      response.statusCode = 404;
      response.end("missing");
    });

    try {
      const port = await listen(server, "127.0.0.1");
      const wait = waitForResources({
        baseDir: directory,
        files: ["main.cjs"],
        tcpHost: "127.0.0.1",
        tcpPort: port,
        httpOrigin: new URL(`http://127.0.0.1:${port}/`),
        httpPaths: ["/", "/src/main.tsx"],
        intervalMs: 20,
        timeoutMs: 2_000,
        fetchTimeoutMs: 200,
      });

      await new Promise((resolve) => setTimeout(resolve, 80));
      serveModules = true;
      await wait;
    } finally {
      await closeServer(server);
      NodeFS.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("times out when the port accepts TCP but never serves the renderer entry", async () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-wait-resources-"));
    NodeFS.writeFileSync(NodePath.join(directory, "main.cjs"), "ok");
    const server = NodeNet.createServer((socket) => {
      socket.destroy();
    });

    try {
      const port = await listen(server, "127.0.0.1");
      let failed = null;
      try {
        await waitForResources({
          baseDir: directory,
          files: ["main.cjs"],
          tcpHost: "127.0.0.1",
          tcpPort: port,
          httpOrigin: new URL(`http://127.0.0.1:${port}/`),
          httpPaths: ["/src/main.tsx"],
          intervalMs: 20,
          timeoutMs: 250,
          fetchTimeoutMs: 50,
        });
      } catch (error) {
        failed = error;
      }
      assert.instanceOf(failed, Error);
      assert.match(failed.message, /http:\/src\/main\.tsx/);
    } finally {
      await closeServer(server);
      NodeFS.rmSync(directory, { recursive: true, force: true });
    }
  });
});
