// Client-side PlantUML rendering via the TeaVM build of PlantUML
// (@plantuml/core), with automatic fallback to the server /render/svg
// endpoint while the engine is still downloading or if it fails.
//
// Engine constraints (see the package's GITHUB_INTEGRATION.md):
// - viz-global.js (Graphviz/WASM) must be loaded as a classic script before
//   plantuml.js is imported.
// - The engine builds SVG through the DOM, so it runs on the main thread —
//   it cannot live in a Web Worker.
// - Renders share internal engine state and MUST be serialized; concurrent
//   renderToString calls deadlock.
// - Invalid input does not reach the error callback: the engine "succeeds"
//   with a rendered error image, which we detect and turn into a structured
//   error so the UI can keep the last good diagram visible.

import { api } from "./api";

export interface RenderErrorInfo {
  message: string;
  line?: number;
  /** True for infrastructure failures (network, timeout) as opposed to a
   *  syntax error in the diagram — don't set editor error markers for these. */
  transient?: boolean;
}

export interface PreviewRenderResult {
  svg?: string;
  error?: RenderErrorInfo;
  /** True when a newer render replaced this one before it ran — discard. */
  superseded?: boolean;
  engine: "client" | "server";
}

type EngineModule = {
  renderToString: (
    lines: string[],
    onSuccess: (svg: string) => void,
    onError: (err: unknown) => void,
  ) => void;
};

// A render that exceeds this is assumed to have wedged the engine's internal
// state; we stop trusting it and route all subsequent renders to the server.
const RENDER_TIMEOUT_MS = 20_000;

let engine: EngineModule | null = null;
let enginePromise: Promise<void> | null = null;
let engineFailed = false;

function loadClassicScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Start downloading the rendering engine (idempotent). Call on editor mount
 * so the engine is warm by the first debounced render; until it resolves,
 * renderPreview transparently uses the server.
 */
export function ensureEngineLoading(): void {
  if (enginePromise || engineFailed) return;
  enginePromise = (async () => {
    await loadClassicScript(`${__PLANTUML_VENDOR_BASE__}viz-global.js`);
    const mod = (await import(
      /* @vite-ignore */ `${__PLANTUML_VENDOR_BASE__}plantuml.js`
    )) as EngineModule;
    if (typeof mod.renderToString !== "function") {
      throw new Error("plantuml.js loaded but renderToString is missing");
    }
    engine = mod;
  })();
  enginePromise.catch((err) => {
    engineFailed = true;
    console.warn("PlantUML client engine unavailable, using server rendering:", err);
  });
}

export function isClientEngineReady(): boolean {
  return engine !== null && !engineFailed;
}

/**
 * Resolves true once the engine is loaded (starting the download if needed),
 * false if it failed to load. Lets pages re-render their current content
 * locally as soon as the engine is available — replacing the initial
 * server-rendered (or server-unreachable) preview.
 */
export function whenEngineReady(): Promise<boolean> {
  ensureEngineLoading();
  if (engine) return Promise.resolve(true);
  if (!enginePromise) return Promise.resolve(false);
  return enginePromise.then(
    () => true,
    () => false,
  );
}

/**
 * Detect the engine's rendered error image. PlantUML error output always
 * contains a "[From <source> (line N) ]" location text plus a red (#FF0000)
 * message line; requiring both makes a false positive on a real user diagram
 * vanishingly unlikely.
 */
function detectErrorSvg(svg: string): RenderErrorInfo | null {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const texts = Array.from(doc.querySelectorAll("text"));

  let line: number | undefined;
  let sawLocation = false;
  for (const t of texts) {
    const m = (t.textContent ?? "").match(/^\[From .*\(line (\d+)\)\s*\]$/);
    if (m) {
      sawLocation = true;
      line = parseInt(m[1], 10);
      break;
    }
  }
  if (!sawLocation) return null;

  const red = texts.find(
    (t) => (t.getAttribute("fill") ?? "").toUpperCase() === "#FF0000",
  );
  if (!red) return null;

  return { message: (red.textContent ?? "").trim() || "Syntax error", line };
}

function runEngineRender(source: string): Promise<PreviewRenderResult> {
  return new Promise<PreviewRenderResult>((resolve) => {
    let settled = false;
    const finish = (result: PreviewRenderResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      engineFailed = true;
      console.warn("PlantUML client render timed out; falling back to server rendering");
      finish({ error: { message: "Render timed out", transient: true }, engine: "client" });
    }, RENDER_TIMEOUT_MS);

    try {
      engine!.renderToString(
        source.split(/\r\n|\r|\n/),
        (svg) => finish({ error: detectErrorSvg(svg) ?? undefined, svg, engine: "client" }),
        (err) => finish({ error: { message: String(err) || "Render failed" }, engine: "client" }),
      );
    } catch (err) {
      finish({ error: { message: String(err) || "Render failed" }, engine: "client" });
    }
  }).then((result: PreviewRenderResult) =>
    // An error image is not a preview — drop the svg so callers keep the
    // last good diagram, matching the server 422 behavior.
    result.error ? { ...result, svg: undefined } : result,
  );
}

// Serialized render queue with latest-wins coalescing: at most one render
// runs and at most one waits; a newer request replaces the waiting one, whose
// caller gets { superseded: true }.
let renderRunning = false;
let queued: { source: string; resolve: (r: PreviewRenderResult) => void } | null = null;

async function pumpQueue(): Promise<void> {
  while (queued) {
    const job = queued;
    queued = null;
    const result = engineFailed
      ? await renderOnServer(job.source)
      : await runEngineRender(job.source);
    job.resolve(result);
  }
  renderRunning = false;
}

function renderOnClient(source: string): Promise<PreviewRenderResult> {
  return new Promise((resolve) => {
    if (queued) queued.resolve({ superseded: true, engine: "client" });
    queued = { source, resolve };
    if (!renderRunning) {
      renderRunning = true;
      void pumpQueue();
    }
  });
}

async function renderOnServer(source: string): Promise<PreviewRenderResult> {
  try {
    const response = await api.requestRaw("/render/svg", {
      method: "POST",
      body: JSON.stringify({ source }),
    });

    if (response.status === 422) {
      const data = await response.json();
      return {
        error: data.detail?.error || data.error || { message: "Syntax error" },
        engine: "server",
      };
    }

    if (!response.ok) throw new Error("Render failed");
    return { svg: await response.text(), engine: "server" };
  } catch {
    return { error: { message: "Render request failed", transient: true }, engine: "server" };
  }
}

/**
 * Render PlantUML source for a live preview. Uses the in-browser TeaVM
 * engine when it's ready (no network round trip); otherwise kicks off the
 * engine download and renders via the server this time. The result carries
 * both the SVG and any syntax error (message + 1-based line), so callers
 * need no separate /render/check call.
 */
export function renderPreview(source: string): Promise<PreviewRenderResult> {
  if (isClientEngineReady()) return renderOnClient(source);
  ensureEngineLoading();
  return renderOnServer(source);
}
