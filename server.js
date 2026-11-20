import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

function isBlockedHostname(hostname) {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  // Block private IPv4 ranges & cloud metadata IPs
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveProxyUrl(raw, baseUrl) {
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.toLowerCase().startsWith('javascript:')
  ) {
    return raw;
  }
  if (trimmed.startsWith('/api/proxy?')) {
    return trimmed;
  }
  try {
    const abs = new URL(trimmed, baseUrl).toString();
    return `/api/proxy?url=${encodeURIComponent(abs)}`;
  } catch {
    return raw;
  }
}

function rewriteCss(css, baseUrl) {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_match, quote, urlPath) => {
    const rewritten = resolveProxyUrl(urlPath, baseUrl);
    return `url(${quote}${rewritten}${quote})`;
  });
}

function rewriteHtml(html, finalUrl) {
  let out = html;

  // Strip restrictive CSP meta tags and integrity attributes
  out = out.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
  out = out.replace(/\s+integrity=["'][^"']*["']/gi, '');
  out = out.replace(/\s+nonce=["'][^"']*["']/gi, '');

  // Rewrite common URL attributes
  out = out.replace(
    /(\b(?:href|src|action|poster)\s*=\s*)(["'])([^"']*)\2/gi,
    (_m, prefix, quote, val) => `${prefix}${quote}${resolveProxyUrl(val, finalUrl)}${quote}`
  );

  // Rewrite inline CSS url(...)
  out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (_m, quote, urlPath) => {
    const rewritten = resolveProxyUrl(urlPath, finalUrl);
    return `url(${quote}${rewritten}${quote})`;
  });

  const helperScript = `
<script>
(function() {
  var BASE_URL = ${JSON.stringify(finalUrl)};
  try {
    window.parent.postMessage({ type: 'ARCADE_PROXY_NAV', url: BASE_URL, title: document.title || BASE_URL }, '*');
  } catch (e) {}

  document.addEventListener('DOMContentLoaded', function() {
    try {
      window.parent.postMessage({ type: 'ARCADE_PROXY_NAV', url: BASE_URL, title: document.title || BASE_URL }, '*');
    } catch (e) {}
  });

  document.addEventListener('click', function(e) {
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
    e.preventDefault();
    var targetUrl = href;
    if (!href.startsWith('/api/proxy?')) {
      try {
        targetUrl = '/api/proxy?url=' + encodeURIComponent(new URL(href, BASE_URL).toString());
      } catch (err) {}
    }
    window.location.href = targetUrl;
  }, true);

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var method = (form.getAttribute('method') || 'GET').toUpperCase();
    var rawAction = form.getAttribute('action') || BASE_URL;
    var actualAction = rawAction;
    if (rawAction.startsWith('/api/proxy?url=')) {
      try {
        actualAction = decodeURIComponent(rawAction.slice('/api/proxy?url='.length));
      } catch (err) {}
    } else {
      try {
        actualAction = new URL(rawAction, BASE_URL).toString();
      } catch (err) {}
    }
    if (method === 'GET') {
      e.preventDefault();
      var formData = new FormData(form);
      var target = new URL(actualAction);
      formData.forEach(function(value, key) {
        if (typeof value === 'string') target.searchParams.set(key, value);
      });
      window.location.href = '/api/proxy?url=' + encodeURIComponent(target.toString());
    }
  }, true);

  window.open = function(url) {
    if (url) {
      try {
        var resolved = new URL(url, BASE_URL).toString();
        window.location.href = '/api/proxy?url=' + encodeURIComponent(resolved);
      } catch (e) {}
    }
    return null;
  };
})();
</script>`;

  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n${helperScript}`);
  } else {
    out = `${helperScript}\n${out}`;
  }

  return out;
}

async function fetchDuckDuckGoResults(query) {
  const results = [];
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return results;
    const html = await res.text();
    const blockRegex =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>)?/gi;
    let match;
    while ((match = blockRegex.exec(html)) !== null && results.length < 10) {
      let href = match[1].replace(/&amp;/g, '&');
      if (href.includes('uddg=')) {
        try {
          const parsed = new URL(href, 'https://duckduckgo.com');
          const uddg = parsed.searchParams.get('uddg');
          if (uddg) href = uddg;
        } catch {
          // keep href
        }
      }
      if (!href.startsWith('http')) continue;
      const title = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const snippet = (match[3] || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (title) {
        results.push({ title, url: href, snippet, source: 'Web' });
      }
    }
  } catch {
    // Fallback to Wikipedia/other sources below
  }
  return results;
}

async function fetchWikipediaResults(query) {
  const results = [];
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        query
      )}&format=json&srlimit=6`,
      {
        headers: { 'User-Agent': 'ArcadeDeckProxy/1.0' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return results;
    const data = await res.json();
    const list = (data && data.query && data.query.search) || [];
    for (const item of list) {
      const cleanSnippet = item.snippet.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      results.push({
        title: `${item.title} — Wikipedia`,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
        snippet: cleanSnippet,
        source: 'Wikipedia',
      });
    }
  } catch {
    // Ignore errors
  }
  return results;
}

async function startServer() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Search page inside proxy iframe
  app.get('/api/search-page', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (!query) {
      res.status(400).send('Missing search query');
      return;
    }

    const [ddgResults, wikiResults] = await Promise.all([
      fetchDuckDuckGoResults(query),
      fetchWikipediaResults(query),
    ]);

    const seen = new Set();
    const combined = [];
    for (const item of [...ddgResults, ...wikiResults]) {
      if (!seen.has(item.url)) {
        seen.add(item.url);
        combined.push(item);
      }
    }

    const itemsHtml =
      combined.length > 0
        ? combined
            .map(
              (item) => `
          <article class="result">
            <div class="meta">${escapeHtml(item.source)} · ${escapeHtml(item.url)}</div>
            <a class="title" href="/api/proxy?url=${encodeURIComponent(item.url)}">${escapeHtml(
                item.title
              )}</a>
            <p class="snippet">${escapeHtml(item.snippet || 'Open this page through the web proxy.')}</p>
          </article>`
            )
            .join('')
        : `<div class="empty">
            <p>No direct search results returned for "${escapeHtml(query)}".</p>
            <p class="sub">Try entering a full website URL in the proxy bar above, or search another topic.</p>
          </div>`;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Search: ${escapeHtml(query)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0d1017;
      color: #f4f5f7;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px;
      line-height: 1.5;
    }
    .wrap { max-width: 780px; margin: 0 auto; }
    .search-head {
      display: flex;
      gap: 10px;
      margin-bottom: 24px;
      padding-bottom: 18px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .search-head input {
      flex: 1;
      background: #171b24;
      border: 1px solid rgba(255,255,255,0.16);
      border-radius: 8px;
      padding: 10px 14px;
      color: #fff;
      font-size: 14px;
    }
    .search-head button {
      background: #f97316;
      color: #111318;
      border: none;
      border-radius: 8px;
      padding: 10px 18px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }
    .count { font-size: 13px; color: #9ca3af; margin-bottom: 18px; }
    .result {
      padding: 16px 0;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .meta {
      font-size: 12px;
      color: #9ca3af;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .title {
      display: inline-block;
      font-size: 17px;
      font-weight: 600;
      color: #fb923c;
      text-decoration: none;
      margin-bottom: 5px;
    }
    .title:hover { text-decoration: underline; }
    .snippet { font-size: 14px; color: #d1d5db; }
    .empty { padding: 40px 0; color: #d1d5db; }
    .sub { margin-top: 8px; font-size: 13px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="wrap">
    <form class="search-head" action="/api/search-page" method="GET">
      <input type="search" name="q" value="${escapeHtml(query)}" placeholder="Search anything..." required />
      <button type="submit">Search</button>
    </form>
    <p class="count">${combined.length} results for "${escapeHtml(query)}"</p>
    ${itemsHtml}
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // Web Proxy Endpoint
  app.all('/api/proxy', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      res.status(400).send('Missing url query parameter');
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.status(400).send('Invalid URL');
      return;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      res.status(400).send('Only http and https URLs are supported');
      return;
    }

    if (isBlockedHostname(parsedUrl.hostname)) {
      res.status(403).send('Access to private or local addresses is blocked');
      return;
    }

    try {
      const upstream = await fetch(parsedUrl.toString(), {
        method: req.method === 'POST' ? 'POST' : 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: req.headers.accept || '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      });

      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      const finalUrl = upstream.url || parsedUrl.toString();

      res.status(upstream.status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');

      if (contentType.includes('text/html')) {
        const html = await upstream.text();
        res.send(rewriteHtml(html, finalUrl));
        return;
      }

      if (contentType.includes('text/css')) {
        const css = await upstream.text();
        res.send(rewriteCss(css, finalUrl));
        return;
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.send(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upstream fetch failed';
      res
        .status(502)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(
          `<div style="background:#0d1017;color:#f4f5f7;font-family:system-ui,sans-serif;padding:32px;">
            <h2 style="margin-bottom:8px;">Could not load page via proxy</h2>
            <p style="color:#9ca3af;font-size:14px;">${escapeHtml(message)}</p>
          </div>`
        );
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ArcadeDeck server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
