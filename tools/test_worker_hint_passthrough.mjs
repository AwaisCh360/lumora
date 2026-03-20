import worker from "./worker.js";

const originalFetch = globalThis.fetch;
const captured = [];

globalThis.fetch = async function mockedFetch(target, init = {}) {
    const headers = new Headers(init.headers || {});
    captured.push({
        url: String(target),
        method: String(init.method || "GET").toUpperCase(),
        authorization: headers.get("authorization") || ""
    });

    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
            "content-type": "application/json"
        }
    });
};

async function probeWithAuth() {
    const request = new Request("https://worker.test/x7a9?pool_number=311", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: "Bearer direct-user-token"
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] })
    });

    const response = await worker.fetch(request, {});
    const upstream = captured[captured.length - 1] || {};

    console.log("\n--- hint + incoming auth ---");
    console.log("status:", response.status);
    console.log("upstream auth preserved:", upstream.authorization === "Bearer direct-user-token");
    console.log("x-worker-pool-status:", response.headers.get("x-worker-pool-status") || "<none>");
    console.log("x-worker-pool-strategy:", response.headers.get("x-worker-pool-strategy") || "<none>");
    console.log("x-worker-pool-note:", response.headers.get("x-worker-pool-note") || "<none>");
}

async function probeWithoutAuth() {
    const request = new Request("https://worker.test/x7a9?pool_number=311", {
        method: "POST",
        headers: {
            "content-type": "application/json"
        },
        body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] })
    });

    const response = await worker.fetch(request, {});
    const text = await response.text();

    console.log("\n--- hint without auth ---");
    console.log("status:", response.status);
    console.log("body:", text);
}

async function main() {
    await probeWithAuth();
    await probeWithoutAuth();
}

main()
    .catch(function (error) {
        console.error(error && error.message ? error.message : String(error));
        process.exitCode = 1;
    })
    .finally(function () {
        globalThis.fetch = originalFetch;
    });
