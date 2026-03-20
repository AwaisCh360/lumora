import fs from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
    baseUrl: "https://cors-bypass.quotesiaofficial.workers.dev",
    routePath: "/x7a9",
    poolFile: path.resolve(process.cwd(), "../account_pool.json"),
    count: 1,
    concurrency: 1,
    timeoutMs: 30000,
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
        if (key === "--route" && next) {
            config.routePath = next;
            i += 1;
            continue;
        }
        if (key === "--pool-file" && next) {
            config.poolFile = path.resolve(process.cwd(), next);
            i += 1;
            continue;
        }
        if (key === "--count" && next) {
            config.count = Number(next);
            i += 1;
            continue;
        }
        if (key === "--concurrency" && next) {
            config.concurrency = Number(next);
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
    config.routePath = String(config.routePath || DEFAULTS.routePath).startsWith("/")
        ? String(config.routePath || DEFAULTS.routePath)
        : "/" + String(config.routePath || DEFAULTS.routePath);
    config.count = Number.isFinite(config.count) && config.count > 0
        ? Math.floor(config.count)
        : DEFAULTS.count;
    config.concurrency = Number.isFinite(config.concurrency) && config.concurrency > 0
        ? Math.floor(config.concurrency)
        : DEFAULTS.concurrency;
    config.timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
        ? Math.floor(config.timeoutMs)
        : DEFAULTS.timeoutMs;

    return config;
}

function nowEpochSeconds() {
    return Math.floor(Date.now() / 1000);
}

function maskEmail(email) {
    const value = String(email || "").trim();
    if (!value.includes("@")) {
        return "***";
    }
    const [user, domain] = value.split("@");
    if (user.length <= 2) {
        return (user.charAt(0) || "*") + "*@" + domain;
    }
    return user.slice(0, 2) + "***@" + domain;
}

async function loadTokenFromPool(poolFile) {
    const raw = await fs.readFile(poolFile, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
        throw new Error("Pool file is empty or invalid.");
    }

    const now = nowEpochSeconds();
    const valid = parsed.find(function (entry) {
        if (!entry || typeof entry !== "object") {
            return false;
        }
        const token = String(entry.token || entry.access_token || "").trim();
        if (!token) {
            return false;
        }
        const exp = Number(entry.exp || entry.token_expiry || 0);
        if (!Number.isFinite(exp) || exp <= 0) {
            return true;
        }
        return exp > now + 120;
    });

    if (!valid) {
        throw new Error("No usable token found in pool file.");
    }

    return {
        token: String(valid.token || valid.access_token || "").trim(),
        email: String(valid.email || "").trim(),
        exp: Number(valid.exp || valid.token_expiry || 0)
    };
}

function preview(text, limit = 260) {
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

function extractTokenContent(payload) {
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

    return "";
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

function metricStats(values) {
    if (!values.length) {
        return {
            count: 0,
            avg: 0,
            p50: 0,
            p95: 0,
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
        min: min,
        max: max
    };
}

function metricLabel(stats) {
    return stats.avg.toFixed(1) + "ms / " + stats.p50.toFixed(1) + "ms / " + stats.p95.toFixed(1) + "ms (n=" + String(stats.count) + ")";
}

async function parseSseResponse(response, startedAt) {
    if (!response.body || typeof response.body.getReader !== "function") {
        const text = await response.text();
        const elapsed = performance.now() - startedAt;
        const parsed = parseJsonSafe(String(text || "").trim());
        const logicalFailure = parsed ? detectFailureFromObject(parsed) : "";
        return {
            elapsed,
            headersMs: elapsed,
            firstChunkMs: 0,
            firstDataEventMs: 0,
            firstTokenMs: 0,
            chunkCount: 0,
            dataEventCount: 0,
            tokenCharCount: 0,
            parseErrorCount: 0,
            doneSeen: false,
            logicalFailure,
            preview: preview(text)
        };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let chunkCount = 0;
    let dataEventCount = 0;
    let tokenCharCount = 0;
    let parseErrorCount = 0;
    let doneSeen = false;

    let firstChunkMs = 0;
    let firstDataEventMs = 0;
    let firstTokenMs = 0;
    let tokenPreview = "";
    let lastDataPreview = "";
    let logicalFailure = "";

    function processLine(rawLine) {
        const line = String(rawLine || "").replace(/\r$/, "");
        if (!line || !line.startsWith("data:")) {
            return;
        }

        const payloadText = line.slice(5).trim();
        if (!payloadText) {
            return;
        }

        dataEventCount += 1;
        if (!firstDataEventMs) {
            firstDataEventMs = performance.now() - startedAt;
        }

        if (payloadText === "[DONE]") {
            doneSeen = true;
            return;
        }

        lastDataPreview = payloadText;
        try {
            const parsed = JSON.parse(payloadText);
            if (!logicalFailure) {
                logicalFailure = detectFailureFromObject(parsed);
            }
            const token = extractTokenContent(parsed);
            if (token) {
                tokenCharCount += token.length;
                if (!firstTokenMs) {
                    firstTokenMs = performance.now() - startedAt;
                }
                if (tokenPreview.length < 260) {
                    const remaining = 260 - tokenPreview.length;
                    tokenPreview += token.slice(0, remaining);
                }
            }
        } catch (_error) {
            parseErrorCount += 1;
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

        chunkCount += 1;
        if (!firstChunkMs) {
            firstChunkMs = performance.now() - startedAt;
        }

        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex >= 0) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            processLine(line);
            newlineIndex = buffer.indexOf("\n");
        }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
        const leftovers = buffer.split("\n");
        for (const line of leftovers) {
            processLine(line);
        }
    }

    const elapsed = performance.now() - startedAt;

    return {
        elapsed,
        headersMs: 0,
        firstChunkMs,
        firstDataEventMs,
        firstTokenMs,
        chunkCount,
        dataEventCount,
        tokenCharCount,
        parseErrorCount,
        doneSeen,
        logicalFailure,
        preview: tokenPreview || preview(lastDataPreview)
    };
}

function makeMessagePayload(config, chatId) {
    const timestamp = Date.now();
    const fid = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : String(timestamp) + "-fid";
    const childId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : String(timestamp) + "-child";

    return {
        chat_id: chatId,
        stream: true,
        version: "2.1",
        incremental_output: true,
        chat_mode: "normal",
        model: config.model,
        parent_id: null,
        messages: [
            {
                fid: fid,
                parentId: null,
                childrenIds: [childId],
                role: "user",
                content: config.prompt,
                user_action: "chat",
                files: [],
                timestamp: timestamp,
                models: [config.model],
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
        timestamp: timestamp
    };
}

async function createSession(config, token) {
    const url = config.baseUrl + "/n3w1";
    const payload = {
        title: "Worker Message Test",
        models: [config.model],
        chat_mode: "normal",
        chat_type: "t2t",
        project_id: "",
        timestamp: Date.now()
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "accept": "application/json",
            "authorization": "Bearer " + token
        },
        body: JSON.stringify(payload)
    });

    const text = await response.text();
    if (!response.ok) {
        throw new Error("Session create failed: status " + String(response.status) + " body " + preview(text));
    }

    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch (_error) {
        parsed = null;
    }

    const chatId = parsed && parsed.data && typeof parsed.data.id === "string"
        ? parsed.data.id.trim()
        : "";

    if (!chatId) {
        throw new Error("Session create returned no chat id. Body: " + preview(text));
    }

    return chatId;
}

async function sendOne(index, config, token, chatId) {
    const url = config.baseUrl + config.routePath + "?chat_id=" + encodeURIComponent(chatId);
    const payload = makeMessagePayload(config, chatId);

    const controller = new AbortController();
    const timer = setTimeout(function () {
        controller.abort();
    }, config.timeoutMs);

    const started = performance.now();
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "accept": "text/event-stream, application/json",
                "authorization": "Bearer " + token
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const headersMs = performance.now() - started;
        const parsed = await parseSseResponse(response, started);
        parsed.headersMs = headersMs;
        const logicalFailure = parsed.logicalFailure || "";
        const ok = response.ok && !logicalFailure;

        return {
            index,
            ok,
            httpOk: response.ok,
            status: response.status,
            elapsed: parsed.elapsed,
            headersMs: parsed.headersMs,
            firstChunkMs: parsed.firstChunkMs,
            firstDataEventMs: parsed.firstDataEventMs,
            firstTokenMs: parsed.firstTokenMs,
            chunkCount: parsed.chunkCount,
            dataEventCount: parsed.dataEventCount,
            tokenCharCount: parsed.tokenCharCount,
            parseErrorCount: parsed.parseErrorCount,
            doneSeen: parsed.doneSeen,
            failureReason: logicalFailure,
            contentType: response.headers.get("content-type") || "",
            preview: parsed.preview
        };
    } catch (error) {
        const elapsed = performance.now() - started;
        return {
            index,
            ok: false,
            httpOk: false,
            status: 0,
            elapsed,
            headersMs: 0,
            firstChunkMs: 0,
            firstDataEventMs: 0,
            firstTokenMs: 0,
            chunkCount: 0,
            dataEventCount: 0,
            tokenCharCount: 0,
            parseErrorCount: 0,
            doneSeen: false,
            failureReason: "",
            contentType: "",
            preview: error && error.name === "AbortError" ? "timeout" : String(error && error.message ? error.message : error)
        };
    } finally {
        clearTimeout(timer);
    }
}

async function runWithConcurrency(config, token, chatId) {
    const results = new Array(config.count);
    let cursor = 0;

    async function workerLoop() {
        while (cursor < config.count) {
            const slot = cursor;
            cursor += 1;
            results[slot] = await sendOne(slot + 1, config, token, chatId);
        }
    }

    const workers = [];
    const workerCount = Math.min(config.concurrency, config.count);
    for (let i = 0; i < workerCount; i += 1) {
        workers.push(workerLoop());
    }
    await Promise.all(workers);
    return results;
}

function summarize(results) {
    const statusCounts = {};
    const latencies = [];
    const headersMs = [];
    const firstChunkMs = [];
    const firstDataEventMs = [];
    const firstTokenMs = [];
    const chunkCounts = [];
    const dataEventCounts = [];
    const tokenChars = [];

    let parseErrors = 0;
    let doneSeenCount = 0;
    let sseResponseCount = 0;
    let failedRequests = 0;
    let logicalFailureCount = 0;
    let httpOkWithLogicalFailure = 0;

    for (const result of results) {
        const key = result.status ? String(result.status) : "error";
        statusCounts[key] = (statusCounts[key] || 0) + 1;
        latencies.push(result.elapsed);

        if (result.headersMs > 0) {
            headersMs.push(result.headersMs);
        }
        if (result.firstChunkMs > 0) {
            firstChunkMs.push(result.firstChunkMs);
        }
        if (result.firstDataEventMs > 0) {
            firstDataEventMs.push(result.firstDataEventMs);
        }
        if (result.firstTokenMs > 0) {
            firstTokenMs.push(result.firstTokenMs);
        }

        chunkCounts.push(result.chunkCount || 0);
        dataEventCounts.push(result.dataEventCount || 0);
        tokenChars.push(result.tokenCharCount || 0);
        parseErrors += result.parseErrorCount || 0;
        if (result.doneSeen) {
            doneSeenCount += 1;
        }
        if ((result.dataEventCount || 0) > 0) {
            sseResponseCount += 1;
        }

        if (!result.ok) {
            failedRequests += 1;
            if (result.failureReason) {
                logicalFailureCount += 1;
                if (result.httpOk) {
                    httpOkWithLogicalFailure += 1;
                }
            }
        }
    }

    return {
        statusCounts,
        fullStreamMs: metricStats(latencies),
        headersMs: metricStats(headersMs),
        firstChunkMs: metricStats(firstChunkMs),
        firstDataEventMs: metricStats(firstDataEventMs),
        firstTokenMs: metricStats(firstTokenMs),
        chunksPerRequest: metricStats(chunkCounts),
        dataEventsPerRequest: metricStats(dataEventCounts),
        tokenCharsPerRequest: metricStats(tokenChars),
        parseErrors,
        doneSeenCount,
        sseResponseCount,
        plainResponseCount: results.length - sseResponseCount,
        failedRequests,
        logicalFailureCount,
        httpOkWithLogicalFailure
    };
}

async function main() {
    const config = parseArgs(process.argv.slice(2));
    const tokenInfo = await loadTokenFromPool(config.poolFile);

    console.log("Worker message test starting...");
    console.log("base:", config.baseUrl);
    console.log("route:", config.routePath);
    console.log("pool file:", config.poolFile);
    console.log("using account:", maskEmail(tokenInfo.email));
    if (Number.isFinite(tokenInfo.exp) && tokenInfo.exp > 0) {
        console.log("token exp (epoch):", tokenInfo.exp);
    }
    console.log("count:", config.count, "concurrency:", config.concurrency);

    const sessionId = await createSession(config, tokenInfo.token);
    console.log("session id:", sessionId);

    const started = performance.now();
    const results = await runWithConcurrency(config, tokenInfo.token, sessionId);
    const elapsed = performance.now() - started;
    const summary = summarize(results);

    console.log("completed in:", (elapsed / 1000).toFixed(2) + "s");
    console.log("status counts:", JSON.stringify(summary.statusCounts));
    console.log("full stream avg/p50/p95:", metricLabel(summary.fullStreamMs));
    console.log("headers recv avg/p50/p95:", metricLabel(summary.headersMs));
    console.log("first chunk avg/p50/p95:", metricLabel(summary.firstChunkMs));
    console.log("first data event avg/p50/p95:", metricLabel(summary.firstDataEventMs));
    console.log("first token avg/p50/p95:", metricLabel(summary.firstTokenMs));
    console.log("chunks/request avg:", summary.chunksPerRequest.avg.toFixed(1), "events/request avg:", summary.dataEventsPerRequest.avg.toFixed(1), "token chars/request avg:", summary.tokenCharsPerRequest.avg.toFixed(1));
    console.log("SSE responses:", summary.sseResponseCount + "/" + config.count, "plain responses:", summary.plainResponseCount + "/" + config.count);
    console.log("failed requests:", summary.failedRequests, "logical failures:", summary.logicalFailureCount, "http200+logical-fail:", summary.httpOkWithLogicalFailure);
    console.log("done markers seen:", summary.doneSeenCount + "/" + config.count, "parse errors:", summary.parseErrors);

    const first = results[0];
    if (first) {
        console.log("sample #1 => status:", first.status, "time:", first.elapsed.toFixed(1) + "ms");
        console.log("sample body:", first.preview);
    }

    if (summary.failedRequests > 0) {
        process.exitCode = 1;
    }
}

main().catch(function (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
});
