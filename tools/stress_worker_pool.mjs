const DEFAULTS = {
    baseUrl: "https://cors-bypass.quotesiaofficial.workers.dev",
    accounts: 311,
    concurrency: 32,
    timeoutMs: 20000,
    baselineRounds: 0,
    explicitRounds: 1,
    hashRounds: 1,
    routePath: "/p9lm"
};

function parseArgs(argv) {
    const config = Object.assign({}, DEFAULTS);

    for (let index = 0; index < argv.length; index += 1) {
        const value = String(argv[index] || "").trim();
        const next = String(argv[index + 1] || "").trim();

        if (value === "--base" && next) {
            config.baseUrl = next;
            index += 1;
            continue;
        }
        if (value === "--accounts" && next) {
            config.accounts = Number(next);
            index += 1;
            continue;
        }
        if (value === "--concurrency" && next) {
            config.concurrency = Number(next);
            index += 1;
            continue;
        }
        if (value === "--timeout-ms" && next) {
            config.timeoutMs = Number(next);
            index += 1;
            continue;
        }
        if (value === "--explicit-rounds" && next) {
            config.explicitRounds = Number(next);
            index += 1;
            continue;
        }
        if (value === "--baseline-rounds" && next) {
            config.baselineRounds = Number(next);
            index += 1;
            continue;
        }
        if (value === "--hash-rounds" && next) {
            config.hashRounds = Number(next);
            index += 1;
            continue;
        }
        if (value === "--route" && next) {
            config.routePath = next;
            index += 1;
            continue;
        }
    }

    config.accounts = Number.isFinite(config.accounts) && config.accounts > 0
        ? Math.floor(config.accounts)
        : DEFAULTS.accounts;
    config.concurrency = Number.isFinite(config.concurrency) && config.concurrency > 0
        ? Math.floor(config.concurrency)
        : DEFAULTS.concurrency;
    config.timeoutMs = Number.isFinite(config.timeoutMs) && config.timeoutMs > 0
        ? Math.floor(config.timeoutMs)
        : DEFAULTS.timeoutMs;
    config.baselineRounds = Number.isFinite(config.baselineRounds) && config.baselineRounds >= 0
        ? Math.floor(config.baselineRounds)
        : DEFAULTS.baselineRounds;
    config.explicitRounds = Number.isFinite(config.explicitRounds) && config.explicitRounds >= 0
        ? Math.floor(config.explicitRounds)
        : DEFAULTS.explicitRounds;
    config.hashRounds = Number.isFinite(config.hashRounds) && config.hashRounds >= 0
        ? Math.floor(config.hashRounds)
        : DEFAULTS.hashRounds;
    config.baseUrl = String(config.baseUrl || DEFAULTS.baseUrl).replace(/\/+$/, "");
    config.routePath = String(config.routePath || DEFAULTS.routePath).startsWith("/")
        ? String(config.routePath || DEFAULTS.routePath)
        : "/" + String(config.routePath || DEFAULTS.routePath);

    return config;
}

function buildJobs(config) {
    const jobs = [];

    for (let round = 1; round <= config.baselineRounds; round += 1) {
        for (let index = 1; index <= config.accounts; index += 1) {
            jobs.push({
                id: "baseline-r" + String(round) + "-n" + String(index),
                phase: "baseline",
                expectedPoolNumber: null,
                url: config.baseUrl + config.routePath
            });
        }
    }

    for (let round = 1; round <= config.explicitRounds; round += 1) {
        for (let poolNumber = 1; poolNumber <= config.accounts; poolNumber += 1) {
            jobs.push({
                id: "explicit-r" + String(round) + "-p" + String(poolNumber),
                phase: "explicit",
                expectedPoolNumber: poolNumber,
                url: config.baseUrl + config.routePath + "?pool_number=" + String(poolNumber)
            });
        }
    }

    for (let round = 1; round <= config.hashRounds; round += 1) {
        for (let userIndex = 1; userIndex <= config.accounts; userIndex += 1) {
            jobs.push({
                id: "hash-r" + String(round) + "-u" + String(userIndex),
                phase: "hash",
                expectedPoolNumber: null,
                url: config.baseUrl + config.routePath + "?user_key=stress-user-" + String(userIndex)
            });
        }
    }

    return jobs;
}

function toNumber(value) {
    const parsed = Number(String(value || "").trim());
    return Number.isFinite(parsed) ? parsed : NaN;
}

async function runOne(job, timeoutMs) {
    const started = performance.now();
    const controller = new AbortController();
    const timeoutHandle = setTimeout(function () {
        controller.abort();
    }, timeoutMs);

    try {
        const response = await fetch(job.url, {
            method: "GET",
            signal: controller.signal
        });
        const elapsedMs = performance.now() - started;
        const poolNumberHeader = response.headers.get("x-worker-pool-number") || "";
        const strategyHeader = response.headers.get("x-worker-pool-strategy") || "";
        const status = response.status;
        await response.text();

        return {
            ok: true,
            id: job.id,
            phase: job.phase,
            expectedPoolNumber: job.expectedPoolNumber,
            status: status,
            elapsedMs: elapsedMs,
            poolNumberHeader: poolNumberHeader,
            strategyHeader: strategyHeader,
            error: ""
        };
    } catch (error) {
        const elapsedMs = performance.now() - started;
        return {
            ok: false,
            id: job.id,
            phase: job.phase,
            expectedPoolNumber: job.expectedPoolNumber,
            status: 0,
            elapsedMs: elapsedMs,
            poolNumberHeader: "",
            strategyHeader: "",
            error: error && error.name === "AbortError"
                ? "timeout"
                : (error && error.message ? error.message : String(error))
        };
    } finally {
        clearTimeout(timeoutHandle);
    }
}

async function runWithConcurrency(jobs, concurrency, timeoutMs) {
    const results = new Array(jobs.length);
    let cursor = 0;

    async function workerLoop() {
        while (cursor < jobs.length) {
            const index = cursor;
            cursor += 1;
            results[index] = await runOne(jobs[index], timeoutMs);
        }
    }

    const workers = [];
    const workerCount = Math.min(concurrency, jobs.length || 1);
    for (let index = 0; index < workerCount; index += 1) {
        workers.push(workerLoop());
    }

    await Promise.all(workers);
    return results;
}

function percentile(values, p) {
    if (!values.length) {
        return 0;
    }
    const rank = (p / 100) * (values.length - 1);
    const low = Math.floor(rank);
    const high = Math.ceil(rank);
    if (low === high) {
        return values[low];
    }
    const ratio = rank - low;
    return values[low] + (values[high] - values[low]) * ratio;
}

function summarize(results, totalMs) {
    const latencies = results.map(function (entry) {
        return entry.elapsedMs;
    }).sort(function (a, b) {
        return a - b;
    });

    const statusCounts = {};
    const strategyCounts = {};
    const errors = [];

    let explicitMismatch = 0;
    let explicitMissing = 0;
    const seenPoolNumbers = new Set();

    results.forEach(function (entry) {
        const statusKey = entry.status ? String(entry.status) : "error";
        statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;

        if (!entry.ok) {
            errors.push(entry.error || "unknown");
        }

        if (entry.strategyHeader) {
            strategyCounts[entry.strategyHeader] = (strategyCounts[entry.strategyHeader] || 0) + 1;
        }

        const parsedPool = toNumber(entry.poolNumberHeader);
        if (Number.isFinite(parsedPool) && parsedPool > 0) {
            seenPoolNumbers.add(Math.floor(parsedPool));
        }

        if (entry.phase === "explicit") {
            if (!entry.poolNumberHeader) {
                explicitMissing += 1;
            } else if (Number.isFinite(entry.expectedPoolNumber) && Math.floor(parsedPool) !== entry.expectedPoolNumber) {
                explicitMismatch += 1;
            }
        }
    });

    const avgMs = latencies.length
        ? latencies.reduce(function (sum, value) {
            return sum + value;
        }, 0) / latencies.length
        : 0;

    return {
        total: results.length,
        totalSeconds: totalMs / 1000,
        throughput: totalMs > 0 ? (results.length * 1000) / totalMs : 0,
        avgMs: avgMs,
        minMs: latencies.length ? latencies[0] : 0,
        p50Ms: percentile(latencies, 50),
        p90Ms: percentile(latencies, 90),
        p95Ms: percentile(latencies, 95),
        p99Ms: percentile(latencies, 99),
        maxMs: latencies.length ? latencies[latencies.length - 1] : 0,
        statusCounts: statusCounts,
        strategyCounts: strategyCounts,
        errorCount: errors.length,
        explicitMismatch: explicitMismatch,
        explicitMissing: explicitMissing,
        uniquePoolNumbers: seenPoolNumbers.size,
        sampleErrors: errors.slice(0, 5)
    };
}

function printSummary(config, summary) {
    console.log("Worker stress test complete");
    console.log("base:", config.baseUrl);
    console.log("route:", config.routePath);
    console.log("accounts:", config.accounts);
    console.log("concurrency:", config.concurrency);
    console.log("baseline rounds:", config.baselineRounds);
    console.log("explicit rounds:", config.explicitRounds);
    console.log("hash rounds:", config.hashRounds);
    console.log("total requests:", summary.total);
    console.log("duration:", summary.totalSeconds.toFixed(2) + "s");
    console.log("throughput:", summary.throughput.toFixed(2) + " req/s");
    console.log("latency avg/p50/p95/p99:",
        summary.avgMs.toFixed(1) + "ms",
        "/",
        summary.p50Ms.toFixed(1) + "ms",
        "/",
        summary.p95Ms.toFixed(1) + "ms",
        "/",
        summary.p99Ms.toFixed(1) + "ms");
    console.log("latency min/max:", summary.minMs.toFixed(1) + "ms / " + summary.maxMs.toFixed(1) + "ms");

    console.log("status counts:", JSON.stringify(summary.statusCounts));
    console.log("strategy counts:", JSON.stringify(summary.strategyCounts));
    console.log("unique pool numbers seen:", summary.uniquePoolNumbers);
    console.log("explicit mismatches:", summary.explicitMismatch);
    console.log("explicit missing headers:", summary.explicitMissing);
    console.log("error count:", summary.errorCount);
    if (summary.sampleErrors.length) {
        console.log("sample errors:", JSON.stringify(summary.sampleErrors));
    }
}

async function main() {
    const config = parseArgs(process.argv.slice(2));
    const jobs = buildJobs(config);

    if (!jobs.length) {
        console.log("No jobs to run. Increase --baseline-rounds, --explicit-rounds, or --hash-rounds.");
        return;
    }

    console.log("Starting worker stress test...");
    console.log("Jobs:", jobs.length);

    const started = performance.now();
    const results = await runWithConcurrency(jobs, config.concurrency, config.timeoutMs);
    const elapsed = performance.now() - started;

    const summary = summarize(results, elapsed);
    printSummary(config, summary);

    if (summary.errorCount > 0 || summary.explicitMismatch > 0) {
        process.exitCode = 1;
    }
}

main().catch(function (error) {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
});
