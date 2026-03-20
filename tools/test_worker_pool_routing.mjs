import worker from "./worker.js";

const captured = [];
const originalFetch = globalThis.fetch;

const samplePool = [
    {
        index: 0,
        email: "pool1@example.com",
        token: "token-pool-1",
        exp: Math.floor(Date.now() / 1000) + 3600
    },
    {
        index: 1,
        email: "pool2@example.com",
        token: "token-pool-2",
        exp: Math.floor(Date.now() / 1000) + 3600
    },
    {
        index: 310,
        email: "pool311@example.com",
        token: "token-pool-311",
        exp: Math.floor(Date.now() / 1000) + 3600
    }
];

const env = {
    ACCOUNT_POOL_JSON: JSON.stringify(samplePool)
};

globalThis.fetch = async function mockedFetch(target, init = {}) {
    const headers = new Headers(init.headers || {});
    captured.push({
        url: String(target),
        method: String(init.method || "GET").toUpperCase(),
        authorization: headers.get("authorization") || "",
        cookie: headers.get("cookie") || ""
    });

    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
            "content-type": "application/json"
        }
    });
};

function authPreview(value) {
    const token = String(value || "").trim();
    if (!token) {
        return "<none>";
    }
    const parts = token.split(" ");
    const raw = parts.length === 2 ? parts[1] : token;
    return raw.slice(0, 8) + "..." + raw.slice(-4);
}

async function probe(label, path, requestInit) {
    const url = "https://worker.test" + path;
    const response = await worker.fetch(new Request(url, requestInit), env);
    const latest = captured[captured.length - 1] || {};

    console.log("\n---", label, "---");
    console.log("request:", url);
    console.log("status:", response.status);
    console.log("route target:", latest.url || "<none>");
    console.log("upstream auth:", authPreview(latest.authorization));
    console.log("pool-number header:", response.headers.get("x-worker-pool-number") || "<none>");
    console.log("pool-raw-index header:", response.headers.get("x-worker-pool-raw-index") || "<none>");
    console.log("pool-email header:", response.headers.get("x-worker-pool-email") || "<none>");
    console.log("pool-strategy header:", response.headers.get("x-worker-pool-strategy") || "<none>");
}

async function main() {
    await probe("explicit pool number", "/x7a9?pool_number=311", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] })
    });

    await probe("hashed by user key", "/x7a9?user_key=stress-user-17", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] })
    });

    await probe("existing auth kept", "/x7a9", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: "Bearer already-supplied"
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] })
    });
}

main()
    .catch(function (error) {
        console.error(error && error.message ? error.message : String(error));
        process.exitCode = 1;
    })
    .finally(function () {
        globalThis.fetch = originalFetch;
    });
