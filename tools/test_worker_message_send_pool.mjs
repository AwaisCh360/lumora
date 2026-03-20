import fs from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
    baseUrl: "https://cors-bypass.quotesiaofficial.workers.dev",
    sessionRoute: "/n3w1",
    messageRoute: "/x7a9",
    poolFile: path.resolve(process.cwd(), "../account_pool.json"),
    accounts: 311,
    requestsPerAccount: 4,
    concurrency: 80,
    sessionConcurrency: 40,
    timeoutMs: 120000,
    model: "qwen3.5-plus",
    prompt: "Reply with exactly one word: PONG"
};

function parseArgs(argv) {
    const config = { ...DEFAULTS };

    for (let i = 0; i < argv.length; i += 1) {
        const key = String(argv[i] || "").trim();
        const next = String(argv[i + 1] || "").trim();

        if (key === "--base" && next) {
            config.baseUrl = next;
            i += 1;
            continue;
        }
        if (key === "--session-route" && next) {
            config.sessionRoute = next;
            i += 1;
            continue;
        }
        if (key === "--message-route" && next) {
            config.messageRoute = next;
            i += 1;
            continue;
        }
        if (key === "--pool-file" && next) {
            config.poolFile = path.resolve(process.cwd(), next);
            i += 1;
            continue;
        }
        if (key === "--accounts" && next) {
            config.accounts = Number(next);
            i += 1;
            continue;
        }
        if (key === "--requests-per-account" && next) {
            config.requestsPerAccount = Number(next);
            i += 1;
            continue;
        }
        if (key === "--concurrency" && next) {
            config.concurrency = Number(next);
            i += 1;
            continue;
        }
        if (key === "--session-concurrency" && next) {
            config.sessionConcurrency = Number(next);
            i += 1;
            continue;
        }
        if (key === "--timeout-ms" && next) {
            config.timeoutMs = Number(next);
            i += 1;
            continue;
        }
        if (key === "--model" && next) {
            config.model = next;
            i += 1;
            continue;
        }
        if (key === "--prompt" && next) {
            config.prompt = next;
            i += 1;
            continue;
        }
    }

    config.baseUrl = String(config.baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, "");
    config.sessionRoute = normalizeRoute(config.sessionRoute || DEFAULTS.sessionRoute);
    config.messageRoute = normalizeRoute(config.messageRoute || DEFAULTS.messageRoute);
    config.accounts = asPositiveInt(config.accounts, DEFAULTS.accounts);
    config.requestsPerAccount = asPositiveInt(config.requestsPerAccount, DEFAULTS.requestsPerAccount);
    config.concurrency = asPositiveInt(config.concurrency, DEFAULTS.concurrency);
    config.sessionConcurrency = asPositiveInt(config.sessionConcurrency, DEFAULTS.sessionConcurrency);
    config.timeoutMs = asPositiveInt(config.timeoutMs, DEFAULTS.timeoutMs);

    return config;
}

function normalizeRoute(value) {
    const text = String(value || "").trim();
    if (!text) {
        return "/";
    }
    return text.startsWith("/") ? text : "/" + text;
}

function asPositiveInt(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0
        ? Math.floor(number)
        : fallback;
}

function nowEpochSeconds() {
    return Math.floor(Date.now() / 1000);
}

function asEpochSeconds(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return 0;
    }
    if (numeric > 1000000000000) {
        return Math.floor(numeric / 1000);
    }
    return Math.floor(numeric);
}

function randomId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return String(Date.now()) + "-" + String(Math.floor(Math.random() * 1000000));
}

function preview(text, limit = 180) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) {
        return "<empty>";
    }
    return value.length > limit ? value.slice(0, limit) + "..." : value;
}

function parseJsonSafe(text) {
    try {
        return JSON.parse(text);
    } catch (_error) {
        return null;
    }
}

function isBadStatusText(value) {
    return /^(false|failed|error|denied)$/i.test(String(value || "").trim());
}

function detectFailureFromObject(payload) {
    if (!payload || typeof payload !== "object") {
        return "";
    }

    const data = payload.data && typeof payload.data === "object"
        ? payload.data
        : null;

    const code = String(
        data && data.code
            ? data.code
            : payload.code || ""
    ).trim();
    const detail = String(
        data && data.details
            ? data.details
            : payload.detail || payload.message || ""
    ).trim();

    if (payload.success === false || payload.status === false) {
        return code ? code + (detail ? ": " + detail : "") : (detail || "payload_status_false");
    }

    if (typeof payload.status === "string" && isBadStatusText(payload.status)) {
        return code ? code + (detail ? ": " + detail : "") : (detail || "payload_status_error");
    }

    if (data) {
        if (data.status === false || (typeof data.status === "string" && isBadStatusText(data.status))) {
            return code ? code + (detail ? ": " + detail : "") : (detail || "payload_data_status_error");
        }
    }

    if (typeof payload.error === "string" && payload.error.trim()) {
        return payload.error.trim();
    }

    if (code && /(bad[_\s-]?request|validation|unauthorized|forbidden|rate|error)/i.test(code)) {
        return code + (detail ? ": " + detail : "");
    }

    return "";
}

function detectLogicalFailure(rawText) {
    const text = String(rawText || "");
    const trimmed = text.trim();
    if (!trimmed) {
        return "";
    }

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const parsed = parseJsonSafe(trimmed);
        return parsed ? detectFailureFromObject(parsed) : "";
    }

    const lines = trimmed.split(/\r?\n/);
    for (const line of lines) {
        const clean = String(line || "").trim();
        if (!clean || !clean.startsWith("data:")) {
            continue;
        }
        const payloadText = clean.slice(5).trim();
        if (!payloadText || payloadText === "[DONE]") {
            continue;
        }
        const parsed = parseJsonSafe(payloadText);
        if (!parsed) {
            continue;
        }
        const failure = detectFailureFromObject(parsed);
        if (failure) {
            return failure;
        }
    }

    return "";
}

function extractAssistantTextFromPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return "";
    }

    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    if (choices.length) {
        const first = choices[0] && typeof choices[0] === "object" ? choices[0] : null;
        if (first) {
            const delta = first.delta && typeof first.delta === "object" ? first.delta : null;
            if (delta && typeof delta.content === "string") {
                return delta.content;
            }
            if (typeof first.text === "string") {
                return first.text;
            }
        }
    }

    if (typeof payload.content === "string") {
        return payload.content;
    }

    const data = payload.data && typeof payload.data === "object" ? payload.data : null;
    if (data && typeof data.content === "string") {
        return data.content;
    }

    return "";
}

function analyzeParsedContent(rawText) {
    const text = String(rawText || "");
    const trimmed = text.trim();

    if (!trimmed) {
        return {
            parseMode: "empty",
            parseOk: false,
            parsedEvents: 0,
            tokenChars: 0,
            parseFailureReason: "empty_response"
        };
    }

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        const parsed = parseJsonSafe(trimmed);
        if (!parsed) {
            return {
                parseMode: "json",
                parseOk: false,
                parsedEvents: 0,
                tokenChars: 0,
                parseFailureReason: "invalid_json"
            };
        }

        const token = extractAssistantTextFromPayload(parsed);
        return {
            parseMode: "json",
            parseOk: true,
            parsedEvents: 1,
            tokenChars: token.length,
            parseFailureReason: ""
        };
    }

    const lines = trimmed.split(/\r?\n/);
    let sawDataLine = false;
    let parsedEvents = 0;
    let tokenChars = 0;

    for (const line of lines) {
        const clean = String(line || "").trim();
        if (!clean || !clean.startsWith("data:")) {
            continue;
        }
        sawDataLine = true;
        const payloadText = clean.slice(5).trim();
        if (!payloadText || payloadText === "[DONE]") {
            continue;
        }
        const parsed = parseJsonSafe(payloadText);
        if (!parsed) {
            continue;
        }
        parsedEvents += 1;
        tokenChars += extractAssistantTextFromPayload(parsed).length;
    }

    if (sawDataLine) {
        return {
            parseMode: "sse",
            parseOk: parsedEvents > 0,
            parsedEvents,
            tokenChars,
            parseFailureReason: parsedEvents > 0 ? "" : "unparsable_sse_events"
        };
    }

    return {
        parseMode: "plain-text",
        parseOk: true,
        parsedEvents: 1,
        tokenChars: trimmed.length,
        parseFailureReason: ""
    };
}

function percentile(values, p) {
    if (!values.length) {
        return 0;
    }
    const sorted = [...values].sort(function (a, b) {
        return a - b;
    });
    const rank = (p / 100) * (sorted.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    if (low === high) {
        return sorted[low];
    }
    const ratio = rank - low;
    return sorted[low] + (sorted[high] - sorted[low]) * ratio;
}

function summarizeNumeric(values) {
    if (!values.length) {
        return {
            count: 0,
            avg: 0,
            p50: 0,
            p95: 0,
            p99: 0,
            min: 0,
            max: 0
        };
    }

    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (const value of values) {
        sum += value;
        if (value < min) {
            min = value;
        }
        if (value > max) {
            max = value;
        }
    }

    return {
        count: values.length,
        avg: sum / values.length,
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        p99: percentile(values, 99),
        min,
        max
    };
}

function countWithinThreshold(values, thresholdMs) {
    let count = 0;
    for (const value of values) {
        if (value <= thresholdMs) {
            count += 1;
        }
    }
    return count;
}

function formatMetric(stats) {
    return stats.avg.toFixed(1) + "ms / " + stats.p50.toFixed(1) + "ms / " + stats.p95.toFixed(1) + "ms (n=" + String(stats.count) + ")";
}

async function runWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let cursor = 0;

    async function loop() {
        while (cursor < items.length) {
            const slot = cursor;
            cursor += 1;
            results[slot] = await worker(items[slot], slot);
        }
    }

    const workers = [];
    const count = Math.min(concurrency, items.length || 1);
    for (let i = 0; i < count; i += 1) {
        workers.push(loop());
    }

    await Promise.all(workers);
    return results;
}

async function loadUsableAccounts(poolFile, maxAccounts) {
    const raw = await fs.readFile(poolFile, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error("Pool file must be an array.");
    }

    const now = nowEpochSeconds();
    const normalized = [];

    for (let i = 0; i < parsed.length; i += 1) {
        const entry = parsed[i];
        if (!entry || typeof entry !== "object") {
            continue;
        }
        const token = String(entry.token || entry.access_token || "").trim();
        if (!token) {
            continue;
        }

        const exp = asEpochSeconds(entry.exp || entry.token_expiry || entry.tokenExpiry || 0);
        if (exp > 0 && exp <= now + 120) {
            continue;
        }

        const idx = Number.isFinite(Number(entry.index))
            ? Math.floor(Number(entry.index))
            : i;

        normalized.push({
            key: String(idx),
            index: idx,
            email: String(entry.email || "").trim(),
            token,
            exp
        });
    }

    normalized.sort(function (a, b) {
        return a.index - b.index;
    });

    return normalized.slice(0, maxAccounts);
}

function createSessionPayload(model) {
    return {
        title: "Pool Burst Test",
        models: [model],
        chat_mode: "normal",
        chat_type: "t2t",
        project_id: "",
        timestamp: Date.now()
    };
}

function createMessagePayload(model, prompt, chatId) {
    const ts = Date.now();
    const fid = randomId();
    const childId = randomId();

    return {
        chat_id: chatId,
        stream: true,
        version: "2.1",
        incremental_output: true,
        chat_mode: "normal",
        model,
        parent_id: null,
        messages: [
            {
                fid,
                parentId: null,
                childrenIds: [childId],
                role: "user",
                content: prompt,
                user_action: "chat",
                files: [],
                timestamp: ts,
                models: [model],
                chat_type: "t2t",
                feature_config: {
                    output_schema: "phase",
                    thinking_enabled: false
                },
                extra: {
                    meta: {
                        subChatType: "t2t"
                    }
                },
                sub_chat_type: "t2t",
                parent_id: null
            }
        ],
        timestamp: ts
    };
}

async function fetchWithTimeout(url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
        controller.abort();
    }, timeoutMs);

    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

async function readResponseWithStreamMetrics(response, startedAt) {
    const headersMs = performance.now() - startedAt;

    if (!response.body || typeof response.body.getReader !== "function") {
        const text = await response.text();
        const elapsed = performance.now() - startedAt;
        return {
            text,
            elapsed,
            headersMs,
            firstChunkMs: 0,
            firstDataEventMs: 0,
            firstTokenMs: 0,
            streamStartMs: headersMs || elapsed
        };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let text = "";
    let lineBuffer = "";
    let firstChunkMs = 0;
    let firstDataEventMs = 0;
    let firstTokenMs = 0;

    function inspectLine(rawLine) {
        const line = String(rawLine || "").replace(/\r$/, "");
        if (!line.startsWith("data:")) {
            return;
        }

        if (!firstDataEventMs) {
            firstDataEventMs = performance.now() - startedAt;
        }

        const payloadText = line.slice(5).trim();
        if (!payloadText || payloadText === "[DONE]") {
            return;
        }

        const parsed = parseJsonSafe(payloadText);
        if (!parsed || firstTokenMs) {
            return;
        }

        const token = extractAssistantTextFromPayload(parsed);
        if (token) {
            firstTokenMs = performance.now() - startedAt;
        }
    }

    while (true) {
        const read = await reader.read();
        if (read.done) {
            break;
        }

        const value = read.value;
        if (!value || !value.length) {
            continue;
        }

        if (!firstChunkMs) {
            firstChunkMs = performance.now() - startedAt;
        }

        const chunkText = decoder.decode(value, { stream: true });
        text += chunkText;
        lineBuffer += chunkText;

        let newlineIndex = lineBuffer.indexOf("\n");
        while (newlineIndex >= 0) {
            const line = lineBuffer.slice(0, newlineIndex);
            lineBuffer = lineBuffer.slice(newlineIndex + 1);
            inspectLine(line);
            newlineIndex = lineBuffer.indexOf("\n");
        }
    }

    const tail = decoder.decode();
    if (tail) {
        text += tail;
        lineBuffer += tail;
    }

    if (lineBuffer.trim()) {
        const lines = lineBuffer.split("\n");
        for (const line of lines) {
            inspectLine(line);
        }
    }

    const elapsed = performance.now() - startedAt;
    const streamStartMs = firstDataEventMs || firstChunkMs || headersMs || elapsed;

    return {
        text,
        elapsed,
        headersMs,
        firstChunkMs,
        firstDataEventMs,
        firstTokenMs,
        streamStartMs
    };
}

async function createSessionForAccount(config, account, attempt) {
    const url = config.baseUrl + config.sessionRoute;
    const payload = createSessionPayload(config.model);
    const started = performance.now();

    try {
        const response = await fetchWithTimeout(
            url,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "application/json",
                    authorization: "Bearer " + account.token
                },
                body: JSON.stringify(payload)
            },
            config.timeoutMs
        );

        const text = await response.text();
        const elapsed = performance.now() - started;

        if (!response.ok) {
            return {
                ok: false,
                accountKey: account.key,
                accountIndex: account.index,
                attempt,
                status: response.status,
                elapsed,
                sessionId: "",
                error: preview(text)
            };
        }

        let chatId = "";
        try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.data && typeof parsed.data.id === "string") {
                chatId = parsed.data.id.trim();
            }
        } catch (_error) {
            chatId = "";
        }

        if (!chatId) {
            return {
                ok: false,
                accountKey: account.key,
                accountIndex: account.index,
                attempt,
                status: response.status,
                elapsed,
                sessionId: "",
                error: "no_session_id"
            };
        }

        return {
            ok: true,
            accountKey: account.key,
            accountIndex: account.index,
            attempt,
            status: response.status,
            elapsed,
            sessionId: chatId,
            error: ""
        };
    } catch (error) {
        const elapsed = performance.now() - started;
        return {
            ok: false,
            accountKey: account.key,
            accountIndex: account.index,
            attempt,
            status: 0,
            elapsed,
            sessionId: "",
            error: error && error.name === "AbortError" ? "timeout" : String(error && error.message ? error.message : error)
        };
    }
}

function buildRequestSlots(accounts, requestsPerAccount) {
    const jobs = [];
    for (const account of accounts) {
        for (let i = 1; i <= requestsPerAccount; i += 1) {
            jobs.push({
                account,
                attempt: i
            });
        }
    }
    return jobs;
}

function buildMessageJobsFromSessions(sessionAccounts) {
    return sessionAccounts.map(function (sessionAccount) {
        return {
            account: sessionAccount,
            attempt: sessionAccount.attempt
        };
    });
}

async function sendMessageJob(config, job) {
    const account = job.account;
    const url = config.baseUrl + config.messageRoute + "?chat_id=" + encodeURIComponent(account.sessionId);
    const payload = createMessagePayload(config.model, config.prompt, account.sessionId);

    const started = performance.now();
    try {
        const response = await fetchWithTimeout(
            url,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "text/event-stream, application/json",
                    authorization: "Bearer " + account.token
                },
                body: JSON.stringify(payload)
            },
            config.timeoutMs
        );

        const stream = await readResponseWithStreamMetrics(response, started);
        const text = stream.text;
        const elapsed = stream.elapsed;
        const logicalFailure = detectLogicalFailure(text);
        const parseInfo = analyzeParsedContent(text);
        const parseFailureReason = parseInfo.parseOk ? "" : parseInfo.parseFailureReason;
        const ok = response.ok && !logicalFailure && parseInfo.parseOk;

        return {
            ok,
            httpOk: response.ok,
            status: response.status,
            elapsed,
            headersMs: stream.headersMs,
            firstChunkMs: stream.firstChunkMs,
            firstDataEventMs: stream.firstDataEventMs,
            firstTokenMs: stream.firstTokenMs,
            streamStartMs: stream.streamStartMs,
            accountKey: account.key,
            accountIndex: account.index,
            attempt: job.attempt,
            failureReason: logicalFailure,
            parseMode: parseInfo.parseMode,
            parsedEvents: parseInfo.parsedEvents,
            tokenChars: parseInfo.tokenChars,
            parseFailureReason,
            preview: preview(text)
        };
    } catch (error) {
        const elapsed = performance.now() - started;
        return {
            ok: false,
            httpOk: false,
            status: 0,
            elapsed,
            headersMs: 0,
            firstChunkMs: 0,
            firstDataEventMs: 0,
            firstTokenMs: 0,
            streamStartMs: 0,
            accountKey: account.key,
            accountIndex: account.index,
            attempt: job.attempt,
            failureReason: "",
            parseMode: "transport-error",
            parsedEvents: 0,
            tokenChars: 0,
            parseFailureReason: "",
            preview: error && error.name === "AbortError" ? "timeout" : String(error && error.message ? error.message : error)
        };
    }
}

function summarizeSessions(results) {
    const statusCounts = {};
    let ok = 0;

    for (const item of results) {
        const key = item.status ? String(item.status) : "error";
        statusCounts[key] = (statusCounts[key] || 0) + 1;
        if (item.ok) {
            ok += 1;
        }
    }

    return {
        total: results.length,
        ok,
        failed: results.length - ok,
        statusCounts
    };
}

function summarizeMessages(results, requestsPerAccount) {
    const statusCounts = {};
    const parseModeCounts = {};
    const latencies = [];
    const streamStartLatencies = [];
    const headersLatencies = [];
    const firstChunkLatencies = [];
    const firstDataEventLatencies = [];
    const firstTokenLatencies = [];
    const accountStats = new Map();
    const failures = [];
    let failedRequests = 0;
    let logicalFailureCount = 0;
    let httpOkWithLogicalFailure = 0;
    let parseFailureCount = 0;
    let parsedEventsTotal = 0;
    let tokenCharsTotal = 0;

    for (const item of results) {
        const statusKey = item.status ? String(item.status) : "error";
        statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
        latencies.push(item.elapsed);

        if (item.streamStartMs > 0) {
            streamStartLatencies.push(item.streamStartMs);
        }
        if (item.headersMs > 0) {
            headersLatencies.push(item.headersMs);
        }
        if (item.firstChunkMs > 0) {
            firstChunkLatencies.push(item.firstChunkMs);
        }
        if (item.firstDataEventMs > 0) {
            firstDataEventLatencies.push(item.firstDataEventMs);
        }
        if (item.firstTokenMs > 0) {
            firstTokenLatencies.push(item.firstTokenMs);
        }

        const parseKey = String(item.parseMode || "unknown");
        parseModeCounts[parseKey] = (parseModeCounts[parseKey] || 0) + 1;
        parsedEventsTotal += Number(item.parsedEvents || 0);
        tokenCharsTotal += Number(item.tokenChars || 0);
        if (item.parseFailureReason) {
            parseFailureCount += 1;
        }

        if (!accountStats.has(item.accountKey)) {
            accountStats.set(item.accountKey, {
                total: 0,
                ok: 0
            });
        }
        const stats = accountStats.get(item.accountKey);
        stats.total += 1;
        if (item.ok) {
            stats.ok += 1;
        } else if (failures.length < 8) {
            failedRequests += 1;
            if (item.failureReason) {
                logicalFailureCount += 1;
                if (item.httpOk) {
                    httpOkWithLogicalFailure += 1;
                }
            }
            failures.push({
                accountIndex: item.accountIndex,
                attempt: item.attempt,
                status: item.status,
                reason: item.failureReason || item.parseFailureReason || "request_failed",
                preview: item.preview
            });
        } else {
            failedRequests += 1;
            if (item.failureReason) {
                logicalFailureCount += 1;
                if (item.httpOk) {
                    httpOkWithLogicalFailure += 1;
                }
            }
        }
    }

    let accountsFullSuccess = 0;
    let accountsPartial = 0;
    let accountsZeroSuccess = 0;

    for (const entry of accountStats.values()) {
        if (entry.ok >= requestsPerAccount) {
            accountsFullSuccess += 1;
        } else if (entry.ok > 0) {
            accountsPartial += 1;
        } else {
            accountsZeroSuccess += 1;
        }
    }

    let sum = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = 0;
    for (const ms of latencies) {
        sum += ms;
        if (ms < min) {
            min = ms;
        }
        if (ms > max) {
            max = ms;
        }
    }

    return {
        total: results.length,
        statusCounts,
        parseModeCounts,
        latencyAvg: latencies.length ? sum / latencies.length : 0,
        latencyP50: percentile(latencies, 50),
        latencyP95: percentile(latencies, 95),
        latencyP99: percentile(latencies, 99),
        latencyMin: latencies.length ? min : 0,
        latencyMax: latencies.length ? max : 0,
        streamStartStats: summarizeNumeric(streamStartLatencies),
        headersStats: summarizeNumeric(headersLatencies),
        firstChunkStats: summarizeNumeric(firstChunkLatencies),
        firstDataEventStats: summarizeNumeric(firstDataEventLatencies),
        firstTokenStats: summarizeNumeric(firstTokenLatencies),
        streamStartUnder1s: countWithinThreshold(streamStartLatencies, 1000),
        streamStartUnder2s: countWithinThreshold(streamStartLatencies, 2000),
        streamStartSamples: streamStartLatencies.length,
        failedRequests,
        logicalFailureCount,
        httpOkWithLogicalFailure,
        parseFailureCount,
        parsedEventsTotal,
        tokenCharsTotal,
        accountsTotal: accountStats.size,
        accountsFullSuccess,
        accountsPartial,
        accountsZeroSuccess,
        sampleFailures: failures
    };
}

async function main() {
    const config = parseArgs(process.argv.slice(2));

    console.log("Pool-wide message test starting...");
    console.log("base:", config.baseUrl);
    console.log("session route:", config.sessionRoute, "message route:", config.messageRoute);
    console.log("pool file:", config.poolFile);
    console.log("accounts target:", config.accounts, "requests/account:", config.requestsPerAccount);
    console.log("planned requests:", config.accounts * config.requestsPerAccount);
    console.log("session concurrency:", config.sessionConcurrency, "message concurrency:", config.concurrency);

    const accounts = await loadUsableAccounts(config.poolFile, config.accounts);
    if (!accounts.length) {
        throw new Error("No usable accounts found in pool file.");
    }

    console.log("usable accounts loaded:", accounts.length);

    const requestSlots = buildRequestSlots(accounts, config.requestsPerAccount);
    console.log("session slots prepared:", requestSlots.length);

    const accountByKey = new Map();
    for (const account of accounts) {
        accountByKey.set(account.key, account);
    }

    const sessionStarted = performance.now();
    const sessionResults = await runWithConcurrency(requestSlots, config.sessionConcurrency, async function (slot) {
        return await createSessionForAccount(config, slot.account, slot.attempt);
    });
    const sessionElapsedMs = performance.now() - sessionStarted;

    const sessionSummary = summarizeSessions(sessionResults);
    console.log("session setup complete in:", (sessionElapsedMs / 1000).toFixed(2) + "s");
    console.log("sessions ok/failed:", sessionSummary.ok + "/" + sessionSummary.failed);
    console.log("session status counts:", JSON.stringify(sessionSummary.statusCounts));

    const readyAccounts = [];
    for (const session of sessionResults) {
        if (!session.ok || !session.sessionId) {
            continue;
        }
        const source = accountByKey.get(session.accountKey);
        if (!source) {
            continue;
        }
        readyAccounts.push({
            key: session.accountKey,
            index: session.accountIndex,
            attempt: session.attempt,
            token: source.token,
            sessionId: session.sessionId
        });
    }

    if (!readyAccounts.length) {
        throw new Error("No accounts with valid sessions. Message phase skipped.");
    }

    const jobs = buildMessageJobsFromSessions(readyAccounts);
    console.log("message jobs prepared:", jobs.length);

    const runStarted = performance.now();
    const results = await runWithConcurrency(jobs, config.concurrency, async function (job) {
        return await sendMessageJob(config, job);
    });
    const runElapsedMs = performance.now() - runStarted;

    const summary = summarizeMessages(results, config.requestsPerAccount);
    const runSeconds = runElapsedMs / 1000;

    console.log("\nPool-wide message test complete");
    console.log("session ids ready:", readyAccounts.length);
    console.log("total requests sent:", summary.total);
    console.log("duration:", runSeconds.toFixed(2) + "s");
    console.log("throughput:", (summary.total / Math.max(runSeconds, 0.001)).toFixed(2), "req/s");
    console.log("status counts:", JSON.stringify(summary.statusCounts));
    console.log("parse mode counts:", JSON.stringify(summary.parseModeCounts));
    console.log("stream start (headers/firstChunk/firstData/firstToken) avg/p50/p95:");
    console.log("  headers:", formatMetric(summary.headersStats));
    console.log("  first chunk:", formatMetric(summary.firstChunkStats));
    console.log("  first data:", formatMetric(summary.firstDataEventStats));
    console.log("  first token:", formatMetric(summary.firstTokenStats));
    console.log("stream start effective avg/p50/p95:", formatMetric(summary.streamStartStats));
    console.log("stream start under 1s:", summary.streamStartUnder1s + "/" + summary.streamStartSamples, "under 2s:", summary.streamStartUnder2s + "/" + summary.streamStartSamples);
    console.log("failed requests:", summary.failedRequests, "logical failures:", summary.logicalFailureCount, "parse failures:", summary.parseFailureCount, "http200+logical-fail:", summary.httpOkWithLogicalFailure);
    console.log("parsed events total:", summary.parsedEventsTotal, "token chars total:", summary.tokenCharsTotal);
    console.log("latency avg/p50/p95/p99:",
        summary.latencyAvg.toFixed(1) + "ms",
        "/",
        summary.latencyP50.toFixed(1) + "ms",
        "/",
        summary.latencyP95.toFixed(1) + "ms",
        "/",
        summary.latencyP99.toFixed(1) + "ms");
    console.log("latency min/max:", summary.latencyMin.toFixed(1) + "ms / " + summary.latencyMax.toFixed(1) + "ms");
    console.log("account success (full/partial/zero):",
        summary.accountsFullSuccess + "/" + summary.accountsPartial + "/" + summary.accountsZeroSuccess,
        "out of",
        summary.accountsTotal);

    if (summary.sampleFailures.length) {
        console.log("sample failures:", JSON.stringify(summary.sampleFailures));
    }

    const expectedTotal = sessionSummary.ok;
    if (
        summary.total !== expectedTotal
        || sessionSummary.failed > 0
        || summary.failedRequests > 0
        || summary.parseFailureCount > 0
        || summary.accountsPartial > 0
        || summary.accountsZeroSuccess > 0
    ) {
        process.exitCode = 1;
    }
}

main().catch(function (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
});
