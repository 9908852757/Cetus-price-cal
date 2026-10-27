const METHODS = new Set(['calcRead', 'calcLogin', 'calcLogout', 'calcWrite', 'calcSaveQuote']);
const COOKIE = 'cetus_editor_session';
const MAX_BODY = 131072;

function json(data, status = 200, cookie) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(JSON.stringify(data), { status, headers });
}
function session(request) {
  const raw = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  if (!raw) return '';
  try { const value = decodeURIComponent(raw.slice(COOKIE.length + 1)); return /^[a-zA-Z0-9-]{32,128}$/.test(value) ? value : ''; } catch { return ''; }
}
function cookie(value, request, env) {
  const secure = env.VERCEL === '1' || new URL(request.url).protocol === 'https:';
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value ? 3600 : 0}${secure ? '; Secure' : ''}`;
}
function safeMessage(value) {
  return String(value || 'The sheet service is unavailable. Please try again.')
    .replace(/https?:\/\/[^\s"<>]*(?:script\.google|googleusercontent)[^\s"<>]*/gi, '[data service]')
    .replace(/document with (?:ID|id)\s+[a-zA-Z0-9_-]+/g, 'the pricing sheet').slice(0, 500);
}

// Exported factory makes it possible to test without network access or real secrets.
export function createHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function handle(request) {
    if (request.method !== 'POST') return json({ ok: false, error: 'Use POST.' }, 405);
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) return json({ ok: false, error: 'Open the calculator on this website to continue.' }, 403);
    if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return json({ ok: false, error: 'JSON is required.' }, 415);
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return json({ ok: false, error: 'Request is too large.' }, 413);
    let body;
    try { const text = await request.text(); if (Buffer.byteLength(text) > MAX_BODY) return json({ ok: false, error: 'Request is too large.' }, 413); body = JSON.parse(text); } catch { return json({ ok: false, error: 'Invalid request.' }, 400); }
    if (!body || !METHODS.has(body.method) || !Array.isArray(body.args) || body.args.length > 3) return json({ ok: false, error: 'Unsupported request.' }, 400);
    const method = body.method, args = body.args, token = session(request);
    if (['calcWrite', 'calcSaveQuote'].includes(method) && !token) return json({ ok: false, error: 'Unlock editing with your password first.' }, 401);
    if (method === 'calcLogout' && (!token || !env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_API_KEY)) return json({ ok: true, data: true }, 200, cookie('', request, env));
    if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_API_KEY) return json({ ok: false, error: 'The sheet connection needs to be configured in Vercel.' }, 503);
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(env.APPS_SCRIPT_URL)) return json({ ok: false, error: 'The sheet connection is not configured correctly.' }, 503);
    let forwarded;
    if (method === 'calcRead') forwarded = [token, args[1] === true];
    if (method === 'calcLogin') { if (typeof args[0] !== 'string' || !args[0] || args[0].length > 256) return json({ ok: false, error: 'Enter the editing password.' }, 400); forwarded = [args[0]]; }
    if (method === 'calcLogout') forwarded = [token];
    if (method === 'calcWrite') forwarded = [token, args[1], args[2]];
    if (method === 'calcSaveQuote') forwarded = [token, args[1]];
    try {
      const upstream = await fetchImpl(env.APPS_SCRIPT_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, key: env.APPS_SCRIPT_API_KEY, action: method, args: forwarded }), signal: AbortSignal.timeout(60000) });
      if (method === 'calcLogout') return json({ ok: true, data: true }, 200, cookie('', request, env));
      if (!upstream.ok) return json({ ok: false, error: 'The sheet service is temporarily unavailable. Please try again.' }, 502);
      let result;
      try { result = await upstream.json(); } catch { return json({ ok: false, error: 'The sheet connection returned an unexpected response.' }, 502); }
      if (!result || result.ok !== true) {
        const code = result?.error?.code;
        if (code === 'BRIDGE_AUTH') return json({ ok: false, error: 'The sheet connection key needs to be checked in Vercel.' }, 503);
        return json({ ok: false, error: safeMessage(result?.error?.message) }, code === 'LOGIN' || code === 'SESSION' ? 401 : code === 'TEMPORARY' ? 503 : 400);
      }
      if (method === 'calcLogin') {
        if (typeof result.data !== 'string' || !/^[a-zA-Z0-9-]{32,128}$/.test(result.data)) return json({ ok: false, error: 'Could not start the editing session.' }, 502);
        return json({ ok: true, data: 'authenticated' }, 200, cookie(result.data, request, env));
      }
      if (method === 'calcLogout') return json({ ok: true, data: true }, 200, cookie('', request, env));
      // The browser needs the quote number and tab name, not the spreadsheet URL.
      if (method === 'calcSaveQuote') return json({ ok: true, data: { id: result.data.id, total: result.data.total, tabName: result.data.tabName } });
      return json({ ok: true, data: result.data });
    } catch { if (method === 'calcLogout') return json({ ok: true, data: true }, 200, cookie('', request, env)); return json({ ok: false, error: 'The sheet service took too long to respond. Please try again.' }, 503); }
  };
}

export const POST = createHandler();
export function GET() { return json({ ok: false, error: 'Use POST.' }, 405); }
