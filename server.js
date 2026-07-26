import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const UPSTREAM_ORIGIN = "https://bestkill.ru";
const CACHE_DIR = path.join(__dirname, ".mirror-cache");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const TEXT_TYPES = [
  "text/html",
  "text/css",
  "application/javascript",
  "text/javascript",
  "application/json",
  "application/xml",
  "text/xml",
  "image/svg+xml"
];

const REQUEST_HEADER_ALLOWLIST = [
  "accept",
  "accept-language",
  "cache-control",
  "content-type",
  "cookie",
  "pragma",
  "referer",
  "user-agent"
];

function cacheKey(url) {
  return createHash("sha256").update(url).digest("hex");
}

function metaPath(key) {
  return path.join(CACHE_DIR, `${key}.json`);
}

function bodyPath(key) {
  return path.join(CACHE_DIR, `${key}.body`);
}

function isTextContent(contentType = "") {
  const type = contentType.split(";")[0].trim().toLowerCase();
  return TEXT_TYPES.includes(type) || type.endsWith("+xml");
}

function isBlockedProxyTarget(url) {
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function toUpstreamUrl(req) {
  const localUrl = new URL(req.url, `http://${req.headers.host}`);

  if (localUrl.pathname === "/__mirror/external") {
    const target = localUrl.searchParams.get("url");
    if (!target) return null;
    return new URL(target);
  }

  const upstream = new URL(localUrl.pathname + localUrl.search, UPSTREAM_ORIGIN);
  return upstream;
}

function toLocalUrl(rawUrl, baseUrl, localOrigin) {
  if (!rawUrl || rawUrl.startsWith("#")) return rawUrl;
  if (/^(mailto|tel|steam|skype|discord):/i.test(rawUrl)) return rawUrl;

  let absolute;
  try {
    absolute = new URL(rawUrl, baseUrl);
  } catch {
    return rawUrl;
  }

  if (absolute.origin === UPSTREAM_ORIGIN || absolute.hostname === "www.bestkill.ru") {
    return "/" + absolute.pathname.replace(/^\/+/, "") + absolute.search + absolute.hash;
  }

  if (absolute.protocol === "http:" || absolute.protocol === "https:") {
    const local = new URL("/__mirror/external", localOrigin);
    local.searchParams.set("url", absolute.href);
    return local.pathname + local.search + absolute.hash;
  }

  return rawUrl;
}

function rewriteCssUrls(css, baseUrl, localOrigin) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, value) => {
    const rewritten = toLocalUrl(value.trim(), baseUrl, localOrigin);
    return `url(${quote}${rewritten}${quote})`;
  });
}

function rewriteHtml(html, baseUrl, localOrigin) {
  const attrs = [
    "href",
    "src",
    "action",
    "poster",
    "data",
    "data-src",
    "data-original",
    "data-url"
  ];
  const attrPattern = new RegExp(`\\b(${attrs.join("|")})\\s*=\\s*(['"])(.*?)\\2`, "gi");

  let out = html.replace(attrPattern, (match, name, quote, value) => {
    const rewritten = toLocalUrl(value, baseUrl, localOrigin);
    return `${name}=${quote}${rewritten}${quote}`;
  });

  out = out.replace(/\bsrcset\s*=\s*(['"])(.*?)\1/gi, (match, quote, value) => {
    const rewritten = value
      .split(",")
      .map((part) => {
        const trimmed = part.trim();
        const pieces = trimmed.split(/\s+/);
        if (!pieces[0]) return trimmed;
        pieces[0] = toLocalUrl(pieces[0], baseUrl, localOrigin);
        return pieces.join(" ");
      })
      .join(", ");
    return `srcset=${quote}${rewritten}${quote}`;
  });

  out = rewriteInlineAbsoluteUrls(out, baseUrl, localOrigin);
  out = rewriteCssUrls(out, baseUrl, localOrigin);

  if (!out.includes("__bestkillMirrorQueue")) {
    out = out.replace(
      /<\/head>/i,
      `<script>
(function () {
  window.__bestkillMirrorQueue = window.__bestkillMirrorQueue || [];
  ["chat_load_fixed_message", "get_site_stats"].forEach(function (name) {
    if (typeof window[name] === "function") return;
    var shim = function () {
      window.__bestkillMirrorQueue.push([name, Array.prototype.slice.call(arguments)]);
    };
    shim.__bestkillMirrorShim = true;
    window[name] = shim;
  });
})();
</script></head>`
    );
  }

  if (!out.includes("/mirror-client.js")) {
    out = out.replace(
      /<\/body>/i,
      '<script src="/mirror-client.js"></script></body>'
    );
  }

  return out;
}

function rewriteInlineAbsoluteUrls(text, baseUrl, localOrigin) {
  return text
    .replace(/https?:\\\/\\\/(?:www\\.)?bestkill\\.ru\\\/+/gi, "\\/")
    .replace(/https?:\/\/(?:www\.)?bestkill\.ru\/+/gi, "/")
    .replace(/\/\/(?:www\.)?bestkill\.ru\/+/gi, "/");
}

function rewriteText(text, contentType, baseUrl, localOrigin) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type === "text/html" || !type) return rewriteHtml(text, baseUrl, localOrigin);
  if (type === "text/css") return rewriteCssUrls(rewriteInlineAbsoluteUrls(text, baseUrl, localOrigin), baseUrl, localOrigin);
  if (type.includes("javascript") || type.endsWith("json") || type.endsWith("xml") || type === "image/svg+xml") {
    return rewriteInlineAbsoluteUrls(text, baseUrl, localOrigin);
  }
  return text;
}

async function readCache(url) {
  const key = cacheKey(url);
  try {
    const [metaRaw, body] = await Promise.all([readFile(metaPath(key), "utf8"), readFile(bodyPath(key))]);
    return { key, meta: JSON.parse(metaRaw), body };
  } catch {
    return { key, meta: null, body: null };
  }
}

async function writeCache(url, meta, body) {
  const key = cacheKey(url);
  await mkdir(CACHE_DIR, { recursive: true });
  await Promise.all([
    writeFile(metaPath(key), JSON.stringify({ ...meta, url, cachedAt: new Date().toISOString() }, null, 2)),
    writeFile(bodyPath(key), body)
  ]);
}

function responseHeaders(headers, contentType, bodyLength) {
  const outgoing = {};
  for (const [name, value] of headers) {
    const lower = name.toLowerCase();
    if (
      ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"].includes(lower)
    ) {
      continue;
    }
    if (lower === "set-cookie") continue;
    outgoing[name] = value;
  }
  if (contentType) outgoing["content-type"] = contentType;
  outgoing["content-length"] = String(bodyLength);
  outgoing["x-bestkill-mirror"] = "node";
  return outgoing;
}

function rewriteSetCookie(headers) {
  const getSetCookie = headers.getSetCookie?.bind(headers);
  const cookies = getSetCookie ? getSetCookie() : [];
  return cookies.map((cookie) =>
    cookie
      .replace(/;\s*Domain=[^;]+/gi, "")
      .replace(/;\s*Secure/gi, "")
      .replace(/;\s*SameSite=None/gi, "; SameSite=Lax")
  );
}

function makeRequestHeaders(req, upstreamUrl) {
  const headers = {};
  for (const name of REQUEST_HEADER_ALLOWLIST) {
    const value = req.headers[name];
    if (value) headers[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  headers.host = upstreamUrl.host;
  headers.origin = UPSTREAM_ORIGIN;
  headers.referer = UPSTREAM_ORIGIN + "/";
  headers["user-agent"] = headers["user-agent"] || USER_AGENT;
  return headers;
}

async function collectBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function fetchUpstream(req, upstreamUrl) {
  const body = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await collectBody(req);
  const response = await fetch(upstreamUrl, {
    method: req.method,
    headers: makeRequestHeaders(req, upstreamUrl),
    body,
    redirect: "manual"
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    contentType,
    body: buffer
  };
}

async function sendCachedOrUpstream(req, res, upstreamUrl) {
  const localOrigin = `http://${req.headers.host}`;
  const cacheUrl = upstreamUrl.href;
  const cached = await readCache(cacheUrl);

  try {
    const upstream = await fetchUpstream(req, upstreamUrl);
    let body = upstream.body;
    let contentType = upstream.contentType;

    if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get("location")) {
      const rewritten = toLocalUrl(upstream.headers.get("location"), upstreamUrl, localOrigin);
      res.writeHead(upstream.status, { location: rewritten });
      res.end();
      return;
    }

    if (isTextContent(contentType)) {
      const rewritten = rewriteText(body.toString("utf8"), contentType, upstreamUrl, localOrigin);
      body = Buffer.from(rewritten, "utf8");
    }

    if (req.method === "GET" && upstream.status < 500) {
      await writeCache(cacheUrl, {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
        contentType
      }, body).catch(() => {});
    }

    const headers = responseHeaders(upstream.headers, contentType, body.length);
    const cookies = rewriteSetCookie(upstream.headers);
    if (cookies.length) headers["set-cookie"] = cookies;
    res.writeHead(upstream.status, headers);
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (cached.meta && cached.body) {
      res.writeHead(cached.meta.status || 200, {
        "content-type": cached.meta.contentType || cached.meta.headers?.["content-type"] || "application/octet-stream",
        "content-length": String(cached.body.length),
        "x-bestkill-mirror": "cache-fallback"
      });
      res.end(req.method === "HEAD" ? undefined : cached.body);
      return;
    }

    res.writeHead(502, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><meta charset="utf-8"><title>Mirror error</title>
      <style>body{font-family:Arial,sans-serif;background:#111;color:#eee;padding:40px}code{color:#ff7878}</style>
      <h1>Не удалось получить страницу</h1>
      <p>Node-зеркало не смогло загрузить <code>${escapeHtml(upstreamUrl.href)}</code>.</p>
      <pre>${escapeHtml(error.message)}</pre>`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendMirrorClient(res) {
  const js = `
(function () {
  const upstream = "https://bestkill.ru";

  function localize(url) {
    if (!url || url[0] === "#") return url;
    if (/^(mailto|tel|steam|skype|discord):/i.test(url)) return url;
    try {
      const absolute = new URL(url, upstream + location.pathname);
      if (absolute.hostname === "bestkill.ru" || absolute.hostname === "www.bestkill.ru") {
        return absolute.pathname + absolute.search + absolute.hash;
      }
      if (absolute.protocol === "http:" || absolute.protocol === "https:") {
        return "/__mirror/external?url=" + encodeURIComponent(absolute.href);
      }
    } catch (_) {}
    return url;
  }

  const originalOpen = window.open;
  window.open = function (url, target, features) {
    return originalOpen.call(window, localize(url), target, features);
  };

  if (window.XMLHttpRequest) {
    const original = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      arguments[1] = localize(url);
      return original.apply(this, arguments);
    };
  }

  if (window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function (resource, init) {
      if (typeof resource === "string") resource = localize(resource);
      else if (resource && resource.url) resource = localize(resource.url);
      return originalFetch.call(this, resource, init);
    };
  }

  function replayQueuedCalls() {
    const queue = window.__bestkillMirrorQueue || [];
    window.__bestkillMirrorQueue = [];
    queue.forEach(function (item) {
      const name = item[0];
      const args = item[1];
      const fn = window[name];
      if (typeof fn === "function" && !fn.__bestkillMirrorShim) {
        try { fn.apply(window, args); } catch (_) {}
      }
    });
  }

  if (document.readyState === "complete") replayQueuedCalls();
  else window.addEventListener("load", replayQueuedCalls, { once: true });
})();`;
  res.writeHead(200, {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(Buffer.byteLength(js))
  });
  res.end(js);
}

async function sendStatus(res) {
  let files = 0;
  try {
    files = (await stat(CACHE_DIR)).isDirectory()
      ? (await import("node:fs/promises")).readdir(CACHE_DIR).then((items) => items.length / 2)
      : 0;
  } catch {
    files = 0;
  }
  const body = JSON.stringify({
    upstream: UPSTREAM_ORIGIN,
    cacheDir: CACHE_DIR,
    cachedItems: await files
  }, null, 2);
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const localUrl = new URL(req.url, `http://${req.headers.host}`);

    if (localUrl.pathname === "/mirror-client.js") {
      await sendMirrorClient(res);
      return;
    }

    if (localUrl.pathname === "/__mirror/status") {
      await sendStatus(res);
      return;
    }

    if (localUrl.pathname === "/__mirror/clear-cache" && req.method === "POST") {
      await rm(CACHE_DIR, { recursive: true, force: true });
      res.writeHead(204);
      res.end();
      return;
    }

    const upstreamUrl = toUpstreamUrl(req);
    if (!upstreamUrl) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("Bad mirror URL");
      return;
    }

    if (isBlockedProxyTarget(upstreamUrl)) {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      res.end("Refusing to proxy local mirror URL");
      return;
    }

    await sendCachedOrUpstream(req, res, upstreamUrl);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error.stack || error.message);
  }
});

server.listen(PORT, () => {
  console.log(`BestKILL Node mirror: http://localhost:${PORT}`);
});
