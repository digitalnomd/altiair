import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const args = parseArgs(process.argv.slice(2));
const host = args.host ?? process.env.ALTIAIR_UI_HOST ?? "127.0.0.1";
const port = Number(args.port ?? process.env.ALTIAIR_UI_PORT ?? 4173);
const target = stripTrailingSlash(args.target ?? process.env.ALTIAIR_NODE_API ?? "http://127.0.0.1:8080");
const token = process.env.ALTIAIR_API_TOKEN;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid UI port: ${port}`);
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    writeJson(response, 500, {
      error: error instanceof Error ? error.message : "Unknown UI server error.",
    });
  });
});

server.listen(port, host, () => {
  console.log(
    JSON.stringify(
      {
        ui: `http://${host}:${port}/`,
        target,
        apiProxy: "/api/*",
      },
      null,
      2,
    ),
  );
});

async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname === "/api/dashboard") {
    await serveDashboardSnapshot(response);
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    await proxyApi(request, response, url);
    return;
  }

  await serveStatic(url, response);
}

async function serveDashboardSnapshot(response) {
  const [health, topology, peers, gateway, congestion, pending, ledger] = await Promise.all([
    fetchTargetJson("/health"),
    fetchTargetJson("/topology"),
    fetchTargetJson("/peers"),
    fetchTargetJson("/gateway"),
    fetchTargetJson("/congestion"),
    fetchTargetJson("/bundles/pending"),
    fetchTargetJson("/ledger"),
  ]);

  if ([health, topology, peers, gateway, congestion, pending, ledger].every((item) => item?.error)) {
    writeJson(response, 503, {
      error: "Node API unavailable.",
      target,
    });
    return;
  }

  writeJson(response, 200, {
    nodeApi: {
      capturedAt: new Date().toISOString(),
      health,
      topology,
      peers,
      gateway,
      congestion,
      pending,
      ledger,
    },
  });
}

async function proxyApi(request, response, url) {
  const targetUrl = `${target}${url.pathname.replace(/^\/api/, "")}${url.search}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value !== undefined && key.toLowerCase() !== "host") {
      headers.set(key, Array.isArray(value) ? value.join(",") : value);
    }
  }
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request,
    duplex: "half",
  });

  response.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
  if (upstream.body) {
    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      response.write(Buffer.from(value));
    }
  }
  response.end();
}

async function serveStatic(url, response) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const resolved = path.resolve(rootDir, `.${requested}`);
  if (resolved !== rootDir && !resolved.startsWith(`${rootDir}${path.sep}`)) {
    writeJson(response, 403, { error: "Forbidden." });
    return;
  }

  let fileStat;
  try {
    fileStat = await stat(resolved);
  } catch {
    writeJson(response, 404, { error: "Not found." });
    return;
  }

  if (!fileStat.isFile()) {
    writeJson(response, 404, { error: "Not found." });
    return;
  }

  response.writeHead(200, {
    "content-type": mimeType(resolved),
    "content-length": fileStat.size,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  createReadStream(resolved).pipe(response);
}

async function fetchTargetJson(pathname) {
  try {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    const response = await fetch(`${target}${pathname}`, { headers });
    if (!response.ok) {
      return { error: `${pathname} returned ${response.status}` };
    }
    return response.json();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : `Unable to fetch ${pathname}.`,
    };
  }
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  }[ext] ?? "application/octet-stream";
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      parsed[key] = "true";
    } else {
      parsed[key] = value;
      index += 1;
    }
  }
  return parsed;
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
