import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";

const defaultTcpHosts = ["127.0.0.1", "localhost", "::1"];

async function fileExists(filePath) {
  try {
    await NodeFSP.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function tcpPortIsReady({ host, port, connectTimeoutMs = 500 }) {
  return new Promise((resolveReady) => {
    const socket = NodeNet.createConnection({ host, port });
    let settled = false;

    const finish = (ready) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolveReady(ready);
    };

    socket.once("connect", () => {
      finish(true);
    });
    socket.once("timeout", () => {
      finish(false);
    });
    socket.once("error", () => {
      finish(false);
    });
    socket.setTimeout(connectTimeoutMs);
  });
}

async function httpPathIsReady({ origin, pathname, fetchTimeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetch(new URL(pathname, origin), {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "*/*" },
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePendingResources({
  baseDir,
  files,
  tcpPort,
  tcpHosts,
  connectTimeoutMs,
  httpOrigin,
  httpPaths,
  fetchTimeoutMs,
}) {
  const pendingFiles = [];

  for (const relativeFilePath of files) {
    const ready = await fileExists(NodePath.resolve(baseDir, relativeFilePath));
    if (!ready) {
      pendingFiles.push(relativeFilePath);
    }
  }

  let tcpReady = false;
  for (const host of tcpHosts) {
    tcpReady = await tcpPortIsReady({
      host,
      port: tcpPort,
      connectTimeoutMs,
    });
    if (tcpReady) {
      break;
    }
  }

  const pendingHttpPaths = [];
  if (httpOrigin !== undefined) {
    for (const pathname of httpPaths) {
      const ready = await httpPathIsReady({
        origin: httpOrigin,
        pathname,
        fetchTimeoutMs,
      });
      if (!ready) {
        pendingHttpPaths.push(pathname);
      }
    }
  }

  return {
    pendingFiles,
    pendingHttpPaths,
    tcpReady,
  };
}

export async function waitForResources({
  baseDir,
  files = [],
  intervalMs = 100,
  timeoutMs = 120_000,
  tcpHost,
  tcpPort,
  connectTimeoutMs = 500,
  httpOrigin,
  httpPaths = [],
  fetchTimeoutMs = 10_000,
}) {
  if (!Number.isInteger(tcpPort) || tcpPort <= 0) {
    throw new TypeError("waitForResources requires a positive integer tcpPort");
  }

  const startedAt = Date.now();
  const tcpHosts = tcpHost ? [tcpHost] : defaultTcpHosts;

  while (true) {
    const { pendingFiles, pendingHttpPaths, tcpReady } = await resolvePendingResources({
      baseDir,
      files,
      tcpPort,
      tcpHosts,
      connectTimeoutMs,
      httpOrigin,
      httpPaths,
      fetchTimeoutMs,
    });

    if (pendingFiles.length === 0 && pendingHttpPaths.length === 0 && tcpReady) {
      return;
    }

    if (Date.now() - startedAt >= timeoutMs) {
      const pendingResources = [];
      if (!tcpReady) {
        pendingResources.push(tcpHost ? `tcp:${tcpHost}:${tcpPort}` : `tcp:${tcpPort}`);
      }
      for (const filePath of pendingFiles) {
        pendingResources.push(`file:${filePath}`);
      }
      for (const pathname of pendingHttpPaths) {
        pendingResources.push(`http:${pathname}`);
      }

      throw new Error(
        `Timed out waiting for desktop dev resources after ${timeoutMs}ms: ${pendingResources.join(", ")}`,
      );
    }

    await NodeTimersPromises.setTimeout(intervalMs);
  }
}
