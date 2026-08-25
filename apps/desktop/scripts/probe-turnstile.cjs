const NodeFS = require("node:fs");
const NodePath = require("node:path");

const { BrowserWindow, app, session } = require("electron");

const outputPath = NodePath.join(__dirname, "..", ".probe-turnstile.jsonl");
NodeFS.writeFileSync(outputPath, "");
const write = (value) => NodeFS.appendFileSync(outputPath, `${JSON.stringify(value)}\n`);
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const probeWindows = [];
const normalizeUserAgent = (userAgent) =>
  userAgent
    .replace(/(?:^|\s)(?:Electron|T3Code(?:\([^)]*\))?)\/[^\s]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const waitForAuth0 = async (window) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (window.webContents.getURL().startsWith("https://auth.converge.ai/")) return;
    await sleep(100);
  }
  throw new Error(`Auth0 navigation timed out at ${window.webContents.getURL()}`);
};

const clickPoint = (window, point) => {
  window.webContents.sendInputEvent({ type: "mouseMove", x: point.x, y: point.y });
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
  });
};

const runMode = async (mode) => {
  write({ mode, step: "start" });
  const partition = `turnstile-probe-${mode}-${Date.now()}`;
  const browserSession = session.fromPartition(partition);
  const userAgent = normalizeUserAgent(browserSession.getUserAgent());
  browserSession.setUserAgent(userAgent);
  const usesPreload = mode !== "chromium";
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      partition,
      contextIsolation: !usesPreload,
      nodeIntegration: false,
      sandbox: true,
      ...(usesPreload
        ? { preload: NodePath.join(__dirname, "..", "dist-electron", "preview-pick-preload.cjs") }
        : {}),
    },
  });
  probeWindows.push(window);
  const consoleEntries = [];
  window.webContents.on("console-message", (event, level, message, line, sourceId) => {
    consoleEntries.push({
      level: event.level ?? level,
      message: event.message ?? message,
      line: event.lineNumber ?? line,
      sourceId: event.sourceId ?? sourceId,
    });
  });

  try {
    await window.loadURL("about:blank");
    if (!["chromium", "preload"].includes(mode)) {
      window.webContents.debugger.on("message", () => undefined);
      window.webContents.debugger.attach("1.3");
    }
    if (mode === "runtime" || mode === "all") {
      await window.webContents.debugger.sendCommand("Runtime.enable");
    }
    if (mode === "accessibility" || mode === "all") {
      await window.webContents.debugger.sendCommand("Accessibility.enable");
    }
    if (mode === "network" || mode === "all") {
      await window.webContents.debugger.sendCommand("Network.enable");
      await window.webContents.debugger.sendCommand("Log.enable");
    }
    if (mode === "chrome" || mode === "chrome-runtime") {
      const fullVersion = process.versions.chrome;
      const majorVersion = fullVersion.split(".")[0];
      window.webContents.debugger.attach("1.3");
      await window.webContents.debugger.sendCommand("Network.setUserAgentOverride", {
        userAgent,
        platform: "Win32",
        userAgentMetadata: {
          brands: [
            { brand: "Not-A.Brand", version: "24" },
            { brand: "Chromium", version: majorVersion },
            { brand: "Google Chrome", version: majorVersion },
          ],
          fullVersionList: [
            { brand: "Not-A.Brand", version: "24.0.0.0" },
            { brand: "Chromium", version: fullVersion },
            { brand: "Google Chrome", version: fullVersion },
          ],
          fullVersion,
          platform: "Windows",
          platformVersion: "15.0.0",
          architecture: "x86",
          model: "",
          mobile: false,
          bitness: "64",
          wow64: false,
        },
      });
      if (mode === "chrome-runtime") {
        await window.webContents.debugger.sendCommand("Runtime.enable");
      }
    }

    await Promise.race([
      window.loadURL("https://framia.converge.ai/"),
      sleep(20_000).then(() => {
        throw new Error("Framia landing navigation timed out.");
      }),
    ]);
    write({ mode, step: "landing-loaded", url: window.webContents.getURL() });
    await sleep(3_000);
    const login = await window.webContents.executeJavaScript(`(() => {
      const candidates = Array.from(document.querySelectorAll("a,button"));
      const target = candidates.find((element) => /^(login|log in|sign in|登录)$/i.test(element.textContent?.trim() || ""));
      if (!target) return null;
      const href = target instanceof HTMLAnchorElement ? target.href : null;
      target.click();
      return { tag: target.tagName, text: target.textContent?.trim() || "", href };
    })()`);
    if (login === null) {
      const landing = await window.webContents.executeJavaScript(`({
        url: location.href,
        text: (document.body?.innerText || "").slice(0, 2000),
        controls: Array.from(document.querySelectorAll("a,button")).slice(0, 100).map((element) => ({
          tag: element.tagName,
          text: element.textContent?.trim() || "",
          href: element instanceof HTMLAnchorElement ? element.href : null
        }))
      })`);
      write({ mode, landing });
      throw new Error("Framia login control was not found.");
    }
    write({ mode, step: "login-clicked", login });
    await waitForAuth0(window);
    write({ mode, step: "auth0-loaded", url: window.webContents.getURL() });
    await sleep(1_000);
    const emailPoint = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('input[type="email"],input[name="email"],input[name="username"]');
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    })()`);
    if (emailPoint === null) throw new Error("Auth0 email input was not found.");
    clickPoint(window, emailPoint);
    await window.webContents.insertText("turnstile-probe@example.com");
    const emailValue = await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('input[type="email"],input[name="email"],input[name="username"]');
      if (!input) return null;
      if (input.value !== "turnstile-probe@example.com") {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, "turnstile-probe@example.com");
        input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "turnstile-probe@example.com" }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return input.value;
    })()`);
    write({ mode, step: "identifier-filled", emailValue });
    const submitPoint = await window.webContents.executeJavaScript(`(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const visible = buttons.filter((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !candidate.disabled;
      });
      const button = visible.find((candidate) => candidate.type === "submit")
        ?? visible.find((candidate) => /continue/i.test(candidate.textContent || ""));
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        text: button.textContent?.trim() || "",
        type: button.type,
        width: rect.width,
        height: rect.height
      };
    })()`);
    if (submitPoint === null) throw new Error("Auth0 continue button was not found.");
    write({ mode, step: "submit-resolved", submitPoint });
    clickPoint(window, submitPoint);
    await sleep(500);
    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('input[type="email"],input[name="email"],input[name="username"]');
      const form = input?.form;
      const button = form
        ? Array.from(form.querySelectorAll("button")).find((candidate) => candidate.type === "submit")
        : null;
      if (!form) return false;
      form.requestSubmit(button || undefined);
      return true;
    })()`);
    write({ mode, step: "identifier-submitted" });
    await sleep(8_000);
    const result = await window.webContents.executeJavaScript(`({
      url: location.href,
      text: (document.body?.innerText || "").slice(0, 4000),
      userAgent: navigator.userAgent,
      brands: navigator.userAgentData?.brands ?? null,
      webdriver: navigator.webdriver,
      processType: typeof window.process,
      challengeResponses: Array.from(document.querySelectorAll('input[name*="turnstile"],input[name*="captcha"]')).map((input) => ({
        name: input.name,
        valueLength: input.value.length
      })),
      challengeFrames: Array.from(document.querySelectorAll('iframe[src*="challenges.cloudflare.com"]')).map((frame) => frame.src)
    })`);
    write({ mode, login, result, consoleEntries });
  } catch (error) {
    write({ mode, error: error instanceof Error ? error.stack : String(error), consoleEntries });
  } finally {
    // Keep at least one renderer alive until every mode has completed so Electron
    // does not tear down the app between sequential probes.
  }
};

app.whenReady().then(async () => {
  for (const mode of ["preload"]) {
    await runMode(mode);
  }
  for (const window of probeWindows) window.destroy();
  app.exit(0);
});
