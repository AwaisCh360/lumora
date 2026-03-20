import worker from "./worker.js";

const captured = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async function mockedFetch(target, init = {}) {
    const url = String(target);
    captured.push({
        url: url,
        method: String(init.method || "GET").toUpperCase()
    });
    return new Response(
        JSON.stringify({ ok: true, target: url }),
        {
            status: 200,
            headers: {
                "content-type": "application/json"
            }
        }
    );
};

const probes = [
    { label: "models", path: "/p9lm", method: "GET" },
    { label: "signin", path: "/s1n0", method: "POST", body: { email: "a@b.com", password: "x" } },
    { label: "new chat", path: "/n3w1", method: "POST", body: { title: "t" } },
    { label: "completions", path: "/x7a9?chat_id=abc123", method: "POST", body: { stream: true } },
    { label: "completions stop", path: "/x7a9/stop?chat_id=abc123", method: "POST", body: { chat_id: "abc123", response_id: "resp-1" } },
    { label: "stream alias", path: "/v2k9?chat_id=abc123", method: "POST", body: { stream: true } },
    { label: "upload token", path: "/u8p1", method: "POST", body: { filename: "a.txt" } },
    { label: "chat list", path: "/c1st?page=1&exclude_project=true", method: "GET" },
    { label: "chat detail", path: "/c1st/chat-42", method: "GET" },
    { label: "chat delete", path: "/c1st/chat-42", method: "DELETE" },
    {
        label: "legacy url format",
        path: "/?url=" + encodeURIComponent("https://chat.qwen.ai/api/models"),
        method: "GET"
    },
    {
        label: "invalid legacy host",
        path: "/?url=" + encodeURIComponent("https://example.com/api/models"),
        method: "GET"
    },
    { label: "unknown route", path: "/unknown", method: "GET" }
];

async function probe(entry) {
    const url = "https://worker.test" + entry.path;
    const beforeCount = captured.length;
    const init = {
        method: entry.method,
        headers: {
            "content-type": "application/json"
        }
    };
    if (entry.body) {
        init.body = JSON.stringify(entry.body);
    }

    const response = await worker.fetch(new Request(url, init));
    const text = await response.text();
    const latest = captured.length > beforeCount
        ? captured[captured.length - 1]
        : null;

    return {
        label: entry.label,
        requestUrl: url,
        status: response.status,
        allowOrigin: response.headers.get("access-control-allow-origin") || "<none>",
        target: latest && latest.url ? latest.url : "<no-upstream-call>",
        body: text.slice(0, 220)
    };
}

async function main() {
    console.log("Local worker route resolution test");
    for (const entry of probes) {
        try {
            const result = await probe(entry);
            console.log("\n---", result.label, "---");
            console.log("request:", result.requestUrl);
            console.log("status:", result.status);
            console.log("allow-origin:", result.allowOrigin);
            console.log("target:", result.target);
            console.log("body:", result.body);
        } catch (error) {
            console.log("\n---", entry.label, "---");
            console.log("request:", "https://worker.test" + entry.path);
            console.log("error:", error && error.message ? error.message : String(error));
        }
    }
}

main().finally(function () {
    globalThis.fetch = originalFetch;
});
