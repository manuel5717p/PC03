const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getLab, listLabModes, listLabs, runLab } = require("./lab-registry");

const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT ?? 8010);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function hasUnsafePathSegments(rawUrl) {
  const rawPathname = rawUrl.split(/[?#]/, 1)[0];
  return rawPathname.split("/").some((segment) => {
    try {
      return decodeURIComponent(segment) === "..";
    } catch (error) {
      return false;
    }
  });
}

async function sendStatic(requestUrl, response, rawUrl) {
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.normalize(path.join(publicDir, pathname));
  const relativePath = path.relative(publicDir, filePath);

  if (hasUnsafePathSegments(rawUrl) || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, { "content-type": contentTypes[path.extname(filePath)] ?? "application/octet-stream" });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }

    throw error;
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (requestUrl.pathname === "/health") {
    sendJson(response, 200, { status: "ok", service: "observability-platform" });
    return;
  }

  if (requestUrl.pathname === "/api/labs") {
    sendJson(response, 200, { labs: listLabs() });
    return;
  }

  const labRouteMatch = requestUrl.pathname.match(/^\/api\/labs\/([^/]+)\/(modes|run)$/);
  if (labRouteMatch) {
    const [, labId, action] = labRouteMatch;
    const lab = getLab(labId);
    if (!lab) {
      sendJson(response, 404, { error: `lab '${labId}' was not found` });
      return;
    }

    if (action === "modes") {
      sendJson(response, 200, { modes: listLabModes(labId) });
      return;
    }

    sendJson(response, 200, runLab(labId, requestUrl.searchParams.get("mode") ?? lab.defaultMode ?? "normal"));
    return;
  }

  await sendStatic(requestUrl, response, request.url);
}

function createServer() {
  return http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      sendJson(response, error.statusCode ?? 500, { error: error.message });
    });
  });
}

if (require.main === module) {
  createServer().listen(port, () => {
    console.log(`AURA Observability Platform listening on http://localhost:${port}`);
  });
}

module.exports = {
  createServer,
  handleRequest
};
