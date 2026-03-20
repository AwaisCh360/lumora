import fs from "node:fs/promises";
import path from "node:path";

const DEFAULTS = {
    baseUrl: "https://cors-bypass.quotesiaofficial.workers.dev",
    routePath: "/p9lm",
    poolNumber: 311,
    poolFile: path.resolve(process.cwd(), "../account_pool.json")
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
        if (key === "--pool-number" && next) {
            config.poolNumber = Number(next);
            i += 1;
            continue;
        }
        if (key === "--pool-file" && next) {
            config.poolFile = path.resolve(process.cwd(), next);
            i += 1;
            continue;
        }
    }

    config.baseUrl = String(config.baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, "");
    config.routePath = String(config.routePath || DEFAULTS.routePath).startsWith("/")
        ? String(config.routePath || DEFAULTS.routePath)
        : "/" + String(config.routePath || DEFAULTS.routePath);
    config.poolNumber = Number.isFinite(config.poolNumber) && config.poolNumber > 0
        ? Math.floor(config.poolNumber)
        : DEFAULTS.poolNumber;

    return config;
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

async function loadToken(poolFile) {
    const raw = await fs.readFile(poolFile, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
        throw new Error("Pool file invalid or empty");
    }

    const now = Math.floor(Date.now() / 1000);
    const valid = parsed.find(function (entry) {
        if (!entry || typeof entry !== "object") {
            return false;
        }
        const token = String(entry.token || entry.access_token || "").trim();
        if (!token) {
            return false;
        }
        const exp = asEpochSeconds(entry.exp || entry.token_expiry || entry.tokenExpiry || 0);
        return exp <= 0 || exp > now + 120;
    });

    if (!valid) {
        throw new Error("No usable token found");
    }

    return String(valid.token || valid.access_token || "").trim();
}

function short(text, limit = 220) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) {
        return "<empty>";
    }
    return value.length > limit ? value.slice(0, limit) + "..." : value;
}

async function probe(label, url, token) {
    const headers = {
        accept: "application/json"
    };
    if (token) {
        headers.authorization = "Bearer " + token;
    }

    const response = await fetch(url, {
        method: "GET",
        headers
    });

    const body = await response.text();

    console.log("\n---", label, "---");
    console.log("url:", url);
    console.log("status:", response.status, "ok:", response.ok);
    console.log("x-worker-pool-status:", response.headers.get("x-worker-pool-status") || "<none>");
    console.log("x-worker-pool-strategy:", response.headers.get("x-worker-pool-strategy") || "<none>");
    console.log("x-worker-pool-note:", response.headers.get("x-worker-pool-note") || "<none>");
    console.log("body:", short(body));

    return {
        status: response.status,
        statusHeader: response.headers.get("x-worker-pool-status") || "",
        strategyHeader: response.headers.get("x-worker-pool-strategy") || ""
    };
}

async function main() {
    const config = parseArgs(process.argv.slice(2));
    const token = await loadToken(config.poolFile);

    const url = config.baseUrl + config.routePath + "?pool_number=" + String(config.poolNumber);

    console.log("Testing hinted passthrough behavior...");
    console.log("base:", config.baseUrl);
    console.log("route:", config.routePath);
    console.log("pool hint:", config.poolNumber);

    const noAuth = await probe("hinted request without auth", url, "");
    const withAuth = await probe("hinted request with auth", url, token);

    const pass = noAuth.status === 503 && withAuth.status !== 503;

    if (!pass) {
        console.log("\nResult: unexpected behavior");
        process.exitCode = 1;
        return;
    }

    console.log("\nResult: expected behavior confirmed (no-auth=503, with-auth!=503)");
}

main().catch(function (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
});
