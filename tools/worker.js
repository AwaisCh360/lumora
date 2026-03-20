const BASE = "https://chat.qwen.ai";

// Keep short aliases so frontend requests never expose the upstream host.
const STATIC_ROUTES = {
  "/x7a9": "/api/v2/chat/completions",
  "/x7a9/stop": "/api/v2/chat/completions/stop",
  "/v2k9": "/api/v2/chat/completions",
  "/v2k9/stop": "/api/v2/chat/completions/stop",
  "/p9lm": "/api/models",
  "/s1n0": "/api/v1/auths/signin",
  "/n3w1": "/api/v2/chats/new",
  "/u8p1": "/api/v1/files/getstsToken",
  "/c1st": "/api/v2/chats/"
};

const DYNAMIC_CHAT_PREFIX = "/c1st/";
const ACCOUNT_POOL_CACHE_TTL_MS = 60 * 1000;
const TOKEN_EXPIRY_SKEW_MS = 60 * 1000;
const ACCOUNT_POOL_KV_DEFAULT_KEY = "account_pool.json";
const CORS_ALLOWED_HEADERS = "Authorization, Content-Type, Accept, X-Lumora-Pool-Index, X-Pool-Index, X-Account-Index, X-Lumora-Pool-Email, X-Pool-Email, X-Lumora-User-Key, X-Lumora-User-Id, X-User-Id, X-Lumora-Pool-Reload";

const runtimeState = {
  poolCacheKey: "",
  poolLoadedAt: 0,
  poolAccounts: [],
  roundRobinCursor: 0 
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env)
      });
    }

    const target = resolveTargetUrl(request.url);
    if (!target) {
      return jsonResponse(
        {
          error: "route_not_found",
          hint: "Use configured stealth routes or legacy ?url=<encoded upstream url> format."
        },
        404
      );
    }

    const targetPath = safePathname(target);
    const poolHints = readPoolHints(request);
    const hasIncomingAuth = hasAuthorizationHeader(request.headers);
    const forcePoolReload = shouldForcePoolReload(request);
    const allowHintedAuthPassthrough = shouldAllowHintedAuthPassthrough(env);
    const allowUnauthedHintRouting = shouldAllowUnauthedHintRouting(env);

    if (poolHints.hasRoutingHint && !hasIncomingAuth && !allowUnauthedHintRouting) {
      return jsonResponse(
        {
          error: "pool_hint_auth_required",
          hint: "Routing hints require incoming Authorization unless ACCOUNT_POOL_ALLOW_UNAUTH_HINTS=true."
        },
        401,
        request,
        env
      );
    }

    let poolSelection = null;
    let poolDiagnostic = null;
    try {
      poolSelection = await resolvePoolSelection(poolHints, env, {
        allowRoundRobinFallback: !hasIncomingAuth,
        forceReload: forcePoolReload
      });
    } catch (error) {
      if (poolHints.hasRoutingHint) {
        if (hasIncomingAuth && allowHintedAuthPassthrough) {
          poolDiagnostic = {
            status: "pool-load-failed",
            strategy: "auth-passthrough",
            note: "Worker pool load failed; request continued with incoming authorization."
          };
        } else {
          return jsonResponse(
            {
              error: "account_pool_load_failed",
              detail: error && error.message ? error.message : String(error)
            },
            500,
            request,
            env
          );
        }
      }
    }

    if (poolHints.hasRoutingHint && !poolSelection) {
      if (hasIncomingAuth && allowHintedAuthPassthrough) {
        poolDiagnostic = poolDiagnostic || {
          status: "pool-unavailable",
          strategy: "auth-passthrough",
          note: "Worker pool source unavailable; request continued with incoming authorization."
        };
      } else {
        return jsonResponse(
          {
            error: "account_pool_unavailable",
            hint: "Load account pool data in worker env (ACCOUNT_POOL_JSON, ACCOUNT_POOL_B64, or ACCOUNT_POOL_KV)."
          },
          503,
          request,
          env
        );
      }
    }

    try {
      const method = String(request.method || "GET").toUpperCase();
      const init = {
        method: method,
        headers: cleanHeaders(request.headers, {
          targetPath: targetPath,
          poolSelection: poolSelection
        }),
        redirect: "follow"
      };

      if (method !== "GET" && method !== "HEAD") {
        init.body = request.body;
      }

      const upstream = await fetch(target, init);
      const headers = new Headers(upstream.headers);
      applyCors(headers, request, env);

      if (!headers.has("cache-control")) {
        headers.set("cache-control", "no-cache");
      }
      headers.set("x-accel-buffering", "no");

      if (poolSelection) {
        applyPoolSelectionHeaders(headers, poolSelection);
      }
      if (poolDiagnostic) {
        applyPoolDiagnosticHeaders(headers, poolDiagnostic);
      }

      return new Response(upstream.body, {
        status: upstream.status,
        headers: headers
      });
    } catch (error) {
      return jsonResponse(
        {
          error: "upstream_fetch_failed",
          detail: error && error.message ? error.message : String(error)
        },
        502,
        request,
        env
      );
    }
  }
};

function resolveTargetUrl(requestUrl) {
  const url = new URL(requestUrl);
  const rawPath = normalizePath(url.pathname);

  const staticPath = STATIC_ROUTES[rawPath];
  if (staticPath) {
    return BASE + staticPath + url.search;
  }

  if (rawPath.startsWith(DYNAMIC_CHAT_PREFIX)) {
    const chatId = rawPath.slice(DYNAMIC_CHAT_PREFIX.length).trim();
    if (!chatId) {
      return null;
    }
    const safeChatId = encodeURIComponent(safeDecodeURIComponent(chatId));
    return BASE + "/api/v2/chats/" + safeChatId + url.search;
  }

  return resolveLegacyTarget(url);
}

function resolveLegacyTarget(url) {
  const encoded = url.searchParams.get("url");
  if (!encoded) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(encoded);
  } catch (_error) {
    try {
      parsed = new URL(encoded, BASE);
    } catch (_nestedError) {
      return null;
    }
  }

  if (parsed.origin !== BASE) {
    return null;
  }

  return BASE + parsed.pathname + parsed.search;
}

function normalizePath(pathname) {
  const value = String(pathname || "").trim();
  if (!value || value === "/") {
    return "/";
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function safePathname(urlValue) {
  try {
    return String(new URL(String(urlValue || "")).pathname || "");
  } catch (_error) {
    return "";
  }
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return String(value || "");
  }
}

function resolveCorsOrigin(request, env) {
  const origin = request && request.headers
    ? readHeaderValue(request.headers, "origin")
    : "";
  if (!origin) {
    return "*";
  }

  const configuredRaw = env
    ? firstNonEmpty([
      env.CORS_ALLOWED_ORIGINS,
      env.ALLOWED_ORIGINS
    ])
    : "";
  if (!configuredRaw) {
    return origin;
  }

  if (configuredRaw.trim() === "*") {
    return origin;
  }

  const allowed = configuredRaw
    .split(",")
    .map(function (entry) {
      return String(entry || "").trim();
    })
    .filter(Boolean);

  return allowed.indexOf(origin) !== -1
    ? origin
    : "null";
}

function corsHeaders(request, env) {
  const allowOrigin = resolveCorsOrigin(request, env);
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
    "Access-Control-Expose-Headers": "x-worker-pool-number,x-worker-pool-raw-index,x-worker-pool-email,x-worker-pool-strategy,x-worker-pool-status,x-worker-pool-note"
  };
}

function applyCors(headers, request, env) {
  const cors = corsHeaders(request, env);
  Object.keys(cors).forEach(function (key) {
    headers.set(key, cors[key]);
  });
  if (cors["Access-Control-Allow-Origin"] !== "*") {
    headers.set("Vary", "Origin");
  }
}

function jsonResponse(payload, status, request, env) {
  const headers = new Headers({ "content-type": "application/json" });
  applyCors(headers, request, env);
  return new Response(JSON.stringify(payload), {
    status: status,
    headers: headers
  });
}

function hasAuthorizationHeader(headers) {
  return Boolean(readHeaderValue(headers, "authorization"));
}

function shouldAllowHintedAuthPassthrough(env) {
  if (!env || env.ACCOUNT_POOL_ALLOW_AUTH_PASSTHROUGH == null) {
    return true;
  }

  const raw = String(env.ACCOUNT_POOL_ALLOW_AUTH_PASSTHROUGH || "").trim();
  if (!raw) {
    return true;
  }
  return /^(1|true|yes|on)$/i.test(raw);
}

function shouldAllowUnauthedHintRouting(env) {
  if (!env || env.ACCOUNT_POOL_ALLOW_UNAUTH_HINTS == null) {
    return false;
  }
  const raw = String(env.ACCOUNT_POOL_ALLOW_UNAUTH_HINTS || "").trim();
  if (!raw) {
    return false;
  }
  return /^(1|true|yes|on)$/i.test(raw);
}

function shouldInjectPoolAuth(targetPath) {
  return !/\/api\/v1\/auths\/signin$/i.test(String(targetPath || ""));
}

function cleanHeaders(headers, options) {
  const context = options && typeof options === "object" ? options : {};
  const targetPath = context.targetPath || "";
  const poolSelection = context.poolSelection || null;
  const injectPoolAuth = Boolean(poolSelection && shouldInjectPoolAuth(targetPath));

  const blocked = new Set([
    "host",
    "cf-connecting-ip",
    "cf-ipcountry",
    "cf-ray",
    "x-forwarded-for",
    "x-forwarded-proto",
    "content-length",
    "x-lumora-pool-index",
    "x-pool-index",
    "x-account-index",
    "x-lumora-pool-email",
    "x-pool-email",
    "x-lumora-user-key",
    "x-lumora-user-id",
    "x-user-id",
    "x-lumora-pool-reload"
  ]);

  const out = new Headers();
  for (const [key, value] of headers.entries()) {
    const lowered = key.toLowerCase();
    if (blocked.has(lowered)) {
      continue;
    }
    if (injectPoolAuth && lowered === "authorization") {
      continue;
    }
    out.set(key, value);
  }

  if (injectPoolAuth && poolSelection && poolSelection.token) {
    out.set("authorization", "Bearer " + poolSelection.token);
    const existingCookie = String(out.get("cookie") || "").trim();
    if (!/\btoken=/i.test(existingCookie)) {
      out.set(
        "cookie",
        existingCookie
          ? existingCookie + "; token=" + poolSelection.token
          : "token=" + poolSelection.token
      );
    }
  }

  out.set("origin", BASE);
  out.set("referer", BASE + "/c/guest");

  return out;
}

function readHeaderValue(headers, headerName) {
  const wanted = String(headerName || "").toLowerCase();
  for (const [key, value] of headers.entries()) {
    if (String(key || "").toLowerCase() === wanted) {
      return String(value || "").trim();
    }
  }
  return "";
}

function readPoolHints(request) {
  const url = new URL(request.url);
  const query = url.searchParams;

  const indexHint = firstNonEmpty([
    readHeaderValue(request.headers, "x-lumora-pool-index"),
    readHeaderValue(request.headers, "x-pool-index"),
    readHeaderValue(request.headers, "x-account-index"),
    query.get("pool_index"),
    query.get("account_index"),
    query.get("account_number"),
    query.get("pool_number")
  ]);

  const emailHint = firstNonEmpty([
    readHeaderValue(request.headers, "x-lumora-pool-email"),
    readHeaderValue(request.headers, "x-pool-email"),
    query.get("pool_email"),
    query.get("account_email")
  ]).toLowerCase();

  const userKeyHint = firstNonEmpty([
    readHeaderValue(request.headers, "x-lumora-user-key"),
    readHeaderValue(request.headers, "x-lumora-user-id"),
    readHeaderValue(request.headers, "x-user-id"),
    query.get("user_key"),
    query.get("user_id")
  ]);

  const parsedIndex = parseInteger(indexHint);
  const hasRoutingHint = Boolean(indexHint || emailHint || userKeyHint);

  return {
    hasRoutingHint: hasRoutingHint,
    poolIndex: Number.isFinite(parsedIndex) ? parsedIndex : null,
    poolEmail: emailHint,
    userKey: userKeyHint
  };
}

function shouldForcePoolReload(request) {
  const query = new URL(request.url).searchParams;
  const hint = firstNonEmpty([
    readHeaderValue(request.headers, "x-lumora-pool-reload"),
    query.get("pool_reload")
  ]);
  if (!hint) {
    return false;
  }
  return /^(1|true|yes)$/i.test(hint);
}

function firstNonEmpty(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = String(values[index] || "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function parseInteger(value) {
  const text = String(value || "").trim();
  if (!/^[-]?\d+$/.test(text)) {
    return NaN;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : NaN;
}

function parsePositiveInteger(value) {
  const parsed = parseInteger(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return NaN;
  }
  return parsed;
}

function parseNonNegativeInteger(value) {
  const parsed = parseInteger(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return NaN;
  }
  return parsed;
}

function parseNumberFromText(value) {
  const text = String(value || "").trim();
  if (!text) {
    return NaN;
  }
  const match = text.match(/(\d+)/);
  if (!match || !match[1]) {
    return NaN;
  }
  return parsePositiveInteger(match[1]);
}

function parseExpiryToMs(value) {
  if (value == null || value === "") {
    return 0;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value > 1000000000000
      ? Math.floor(value)
      : Math.floor(value * 1000);
  }

  const text = String(value).trim();
  if (!text) {
    return 0;
  }

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 1000000000000
        ? Math.floor(numeric)
        : Math.floor(numeric * 1000);
    }
  }

  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function accountTokenIsUsable(account) {
  if (!account || !account.token) {
    return false;
  }
  if (!account.expMs) {
    return true;
  }
  return account.expMs > Date.now() + TOKEN_EXPIRY_SKEW_MS;
}

function normalizePoolAccount(entry, fallbackPosition) {
  const item = entry && typeof entry === "object" ? entry : {};
  const token = String(item.token || item.access_token || item.accessToken || "").trim();
  if (!token) {
    return null;
  }

  const rawIndex = parseNonNegativeInteger(item.index);
  const directPoolNumber = firstFinite([
    parsePositiveInteger(item.pool_number),
    parsePositiveInteger(item.poolNumber),
    parsePositiveInteger(item.pool_no),
    parsePositiveInteger(item.poolNo),
    parsePositiveInteger(item.number),
    parseNumberFromText(item.label),
    parseNumberFromText(item.name)
  ]);

  let poolNumber = directPoolNumber;
  if (!Number.isFinite(poolNumber)) {
    poolNumber = Number.isFinite(rawIndex)
      ? rawIndex + 1
      : fallbackPosition + 1;
  }

  const label = String(item.label || item.name || "Pool " + String(poolNumber)).trim() || "Pool " + String(poolNumber);

  return {
    token: token,
    email: String(item.email || "").trim().toLowerCase(),
    label: label,
    rawIndex: Number.isFinite(rawIndex) ? rawIndex : -1,
    poolNumber: poolNumber,
    expMs: parseExpiryToMs(item.exp || item.token_expiry || item.tokenExpiry || item.expires_at || item.expiresAt)
  };
}

function firstFinite(values) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return NaN;
}

function normalizePoolAccounts(rawPoolJson) {
  const text = String(rawPoolJson || "").trim();
  if (!text) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const normalized = parsed
    .map(function (entry, index) {
      return normalizePoolAccount(entry, index);
    })
    .filter(Boolean);

  normalized.sort(function (left, right) {
    if (left.poolNumber !== right.poolNumber) {
      return left.poolNumber - right.poolNumber;
    }
    if (left.rawIndex !== right.rawIndex) {
      return left.rawIndex - right.rawIndex;
    }
    return String(left.email || "").localeCompare(String(right.email || ""));
  });

  return normalized;
}

function safeBase64Decode(value) {
  const input = String(value || "").trim();
  if (!input) {
    return "";
  }

  if (typeof atob === "function") {
    try {
      return atob(input);
    } catch (_error) {
      // Fallback below.
    }
  }

  if (typeof Buffer !== "undefined") {
    try {
      return Buffer.from(input, "base64").toString("utf-8");
    } catch (_error) {
      return "";
    }
  }

  return "";
}

function getPoolCacheKey(env) {
  if (env && typeof env.ACCOUNT_POOL_JSON === "string" && env.ACCOUNT_POOL_JSON.trim()) {
    const value = env.ACCOUNT_POOL_JSON;
    return "json:" + String(value.length) + ":" + value.slice(0, 32);
  }
  if (env && typeof env.ACCOUNT_POOL_B64 === "string" && env.ACCOUNT_POOL_B64.trim()) {
    const value = env.ACCOUNT_POOL_B64;
    return "b64:" + String(value.length) + ":" + value.slice(0, 32);
  }
  if (env && env.ACCOUNT_POOL_KV && typeof env.ACCOUNT_POOL_KV.get === "function") {
    const key = String(env.ACCOUNT_POOL_KV_KEY || ACCOUNT_POOL_KV_DEFAULT_KEY).trim() || ACCOUNT_POOL_KV_DEFAULT_KEY;
    return "kv:" + key;
  }
  return "";
}

async function loadPoolAccounts(env, forceReload) {
  const cacheKey = getPoolCacheKey(env);
  if (!cacheKey) {
    runtimeState.poolCacheKey = "";
    runtimeState.poolLoadedAt = 0;
    runtimeState.poolAccounts = [];
    runtimeState.roundRobinCursor = 0;
    return [];
  }

  const now = Date.now();
  const cacheStillFresh = now - runtimeState.poolLoadedAt <= ACCOUNT_POOL_CACHE_TTL_MS;
  if (!forceReload && cacheStillFresh && runtimeState.poolCacheKey === cacheKey && runtimeState.poolAccounts.length) {
    return runtimeState.poolAccounts;
  }

  let rawPool = "";

  if (env && typeof env.ACCOUNT_POOL_JSON === "string" && env.ACCOUNT_POOL_JSON.trim()) {
    rawPool = env.ACCOUNT_POOL_JSON;
  } else if (env && typeof env.ACCOUNT_POOL_B64 === "string" && env.ACCOUNT_POOL_B64.trim()) {
    rawPool = safeBase64Decode(env.ACCOUNT_POOL_B64);
  } else if (env && env.ACCOUNT_POOL_KV && typeof env.ACCOUNT_POOL_KV.get === "function") {
    const key = String(env.ACCOUNT_POOL_KV_KEY || ACCOUNT_POOL_KV_DEFAULT_KEY).trim() || ACCOUNT_POOL_KV_DEFAULT_KEY;
    rawPool = String(await env.ACCOUNT_POOL_KV.get(key) || "");
  }

  const normalized = normalizePoolAccounts(rawPool);
  runtimeState.poolCacheKey = cacheKey;
  runtimeState.poolLoadedAt = now;
  runtimeState.poolAccounts = normalized;
  if (runtimeState.roundRobinCursor >= normalized.length) {
    runtimeState.roundRobinCursor = 0;
  }
  return normalized;
}

function fnv1aHash(text) {
  let hash = 2166136261;
  const value = String(text || "");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectByPoolNumber(accounts, requestedIndex) {
  if (!accounts.length || !Number.isFinite(requestedIndex)) {
    return null;
  }

  if (requestedIndex > 0) {
    const byPoolNumber = accounts.find(function (entry) {
      return entry.poolNumber === requestedIndex;
    });
    if (byPoolNumber) {
      return byPoolNumber;
    }
  }

  return accounts.find(function (entry) {
    return entry.rawIndex === requestedIndex;
  }) || null;
}

function selectPoolAccount(accounts, hints, allowRoundRobinFallback) {
  if (!accounts.length) {
    return null;
  }

  const usable = accounts.filter(accountTokenIsUsable);
  const source = usable.length ? usable : accounts;
  if (!source.length) {
    return null;
  }

  if (hints.poolEmail) {
    const byEmail = source.find(function (entry) {
      return String(entry.email || "") === hints.poolEmail;
    });
    if (byEmail) {
      return {
        strategy: "email",
        account: byEmail
      };
    }
  }

  if (Number.isFinite(hints.poolIndex)) {
    const byIndex = selectByPoolNumber(source, hints.poolIndex);
    if (byIndex) {
      return {
        strategy: "index",
        account: byIndex
      };
    }
  }

  if (hints.userKey) {
    const hash = fnv1aHash(hints.userKey);
    return {
      strategy: "user-hash",
      account: source[hash % source.length]
    };
  }

  if (!allowRoundRobinFallback) {
    return null;
  }

  const slot = runtimeState.roundRobinCursor % source.length;
  runtimeState.roundRobinCursor = (runtimeState.roundRobinCursor + 1) % source.length;
  return {
    strategy: "round-robin",
    account: source[slot]
  };
}

async function resolvePoolSelection(hints, env, options) {
  const config = options && typeof options === "object" ? options : {};
  if (!hints.hasRoutingHint && !config.allowRoundRobinFallback) {
    return null;
  }

  const accounts = await loadPoolAccounts(env, Boolean(config.forceReload));
  if (!accounts.length) {
    return null;
  }

  const selected = selectPoolAccount(accounts, hints, Boolean(config.allowRoundRobinFallback));
  if (!selected || !selected.account || !selected.account.token) {
    return null;
  }

  return {
    token: selected.account.token,
    email: selected.account.email,
    poolNumber: selected.account.poolNumber,
    rawIndex: selected.account.rawIndex,
    strategy: selected.strategy
  };
}

function maskEmail(value) {
  const email = String(value || "").trim();
  const parts = email.split("@");
  if (parts.length !== 2) {
    return "";
  }

  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return name.charAt(0) + "*" + "@" + domain;
  }
  return name.slice(0, 2) + "***@" + domain;
}

function applyPoolSelectionHeaders(headers, selection) {
  headers.set("x-worker-pool-number", String(selection.poolNumber || ""));
  if (Number.isFinite(selection.rawIndex) && selection.rawIndex >= 0) {
    headers.set("x-worker-pool-raw-index", String(selection.rawIndex));
  }
  if (selection.email) {
    headers.set("x-worker-pool-email", maskEmail(selection.email));
  }
  if (selection.strategy) {
    headers.set("x-worker-pool-strategy", selection.strategy);
  }
}

function applyPoolDiagnosticHeaders(headers, diagnostic) {
  const info = diagnostic && typeof diagnostic === "object" ? diagnostic : {};

  const status = String(info.status || "").trim();
  if (status) {
    headers.set("x-worker-pool-status", status);
  }

  const strategy = String(info.strategy || "").trim();
  if (strategy && !headers.has("x-worker-pool-strategy")) {
    headers.set("x-worker-pool-strategy", strategy);
  }

  const note = String(info.note || "").trim();
  if (note) {
    headers.set("x-worker-pool-note", note.slice(0, 180));
  }
}