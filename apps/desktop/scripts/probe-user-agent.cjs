const NodeFS = require("node:fs");
const NodeHttp = require("node:http");
const NodePath = require("node:path");

const { BrowserWindow, app } = require("electron");

const outputPath = NodePath.join(__dirname, "..", ".probe-user-agent.jsonl");
NodeFS.writeFileSync(outputPath, "");
const write = (value) => NodeFS.appendFileSync(outputPath, `${JSON.stringify(value)}\n`);
const requests = [];
const server = NodeHttp.createServer((request, response) => {
  requests.push({ url: request.url, headers: request.headers });
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>UA probe</title>");
});

const readIdentity = async (window, baseUrl, label) => {
  write({ step: "load", label });
  await window.loadURL(`${baseUrl}?label=${label}`);
  const identity = await window.webContents.executeJavaScript(`(async () => ({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    brands: navigator.userAgentData?.brands ?? null,
    entropy: navigator.userAgentData
      ? await navigator.userAgentData.getHighEntropyValues([
          "architecture",
          "bitness",
          "fullVersionList",
          "model",
          "platform",
          "platformVersion",
          "uaFullVersion",
          "wow64"
        ])
      : null
  }))()`);
  write({ label, identity });
  return identity;
};

app.whenReady().then(async () => {
  write({ step: "app-ready" });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("UA probe server did not expose a TCP port.");
  }

  const window = new BrowserWindow({ show: false });
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  try {
    const identity = await readIdentity(window, baseUrl, "default");
    const fullVersion = identity.entropy?.uaFullVersion ?? "146.0.0.0";
    const majorVersion = fullVersion.split(".")[0];
    const userAgent = identity.userAgent
      .replace(/(?:^|\s)(?:Electron|T3Code(?:\([^)]*\))?)\/[^\s]+/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    window.webContents.debugger.attach("1.3");
    await window.webContents.debugger.sendCommand("Network.setUserAgentOverride", {
      userAgent,
      platform: identity.platform,
      userAgentMetadata: {
        brands: [...(identity.brands ?? []), { brand: "Google Chrome", version: majorVersion }],
        fullVersionList: [
          ...(identity.entropy?.fullVersionList ?? []),
          { brand: "Google Chrome", version: fullVersion },
        ],
        fullVersion,
        platform: identity.entropy?.platform ?? "Windows",
        platformVersion: identity.entropy?.platformVersion ?? "10.0.0",
        architecture: identity.entropy?.architecture ?? "x86",
        model: identity.entropy?.model ?? "",
        mobile: false,
        bitness: identity.entropy?.bitness ?? "64",
        wow64: identity.entropy?.wow64 ?? false,
      },
    });
    await readIdentity(window, baseUrl, "attached");
    window.webContents.debugger.detach();
    await readIdentity(window, baseUrl, "detached");
    write({ requests });
  } catch (error) {
    write({ error: error instanceof Error ? error.stack : String(error) });
  } finally {
    window.destroy();
    server.closeAllConnections();
    server.close();
    app.exit(0);
  }
});
