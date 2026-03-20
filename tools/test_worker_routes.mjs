const BASE = "https://cors-bypass.quotesiaofficial.workers.dev";

const probes = [
    { label: "models GET", path: "/p9lm", method: "GET" },
    {
        label: "chat POST",
        path: "/x7a9",
        method: "POST",
        body: {
            messages: [{ role: "user", content: "ping" }],
            stream: false
        }
    },
    {
        label: "stream POST",
        path: "/v2k9",
        method: "POST",
        body: {
            messages: [{ role: "user", content: "ping" }],
            stream: true
        }
    },
    {
        label: "stop POST",
        path: "/x7a9/stop?chat_id=test-chat-id",
        method: "POST",
        body: {
            chat_id: "test-chat-id",
            response_id: "test-response-id"
        }
    },
    {
        label: "legacy proxy template shape",
        path: "/?url=" + encodeURIComponent("https://chat.qwen.ai/api/models"),
        method: "GET"
    }
];

function trimPreview(text, limit = 260) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) {
        return "<empty>";
    }
    return value.length > limit ? value.slice(0, limit) + "..." : value;
}

async function runProbe(probe) {
    const url = BASE + probe.path;

    const optionsRequest = new Request(url, { method: "OPTIONS" });
    const optionsResponse = await fetch(optionsRequest);

    const headers = {
        "content-type": "application/json"
    };

    const requestInit = {
        method: probe.method,
        headers: headers
    };

    if (probe.body) {
        requestInit.body = JSON.stringify(probe.body);
    }

    const startedAt = Date.now();
    const response = await fetch(url, requestInit);
    const elapsedMs = Date.now() - startedAt;
    const responseText = await response.text();

    return {
        label: probe.label,
        url: url,
        optionsStatus: optionsResponse.status,
        status: response.status,
        ok: response.ok,
        elapsedMs: elapsedMs,
        contentType: response.headers.get("content-type") || "<none>",
        allowOrigin: response.headers.get("access-control-allow-origin") || "<none>",
        preview: trimPreview(responseText)
    };
}

async function main() {
    console.log("Testing worker routes:", BASE);
    for (const probe of probes) {
        try {
            const result = await runProbe(probe);
            console.log("\n---", result.label, "---");
            console.log("url:", result.url);
            console.log("options status:", result.optionsStatus);
            console.log("status:", result.status, "ok:", result.ok, "time:", result.elapsedMs + "ms");
            console.log("content-type:", result.contentType);
            console.log("allow-origin:", result.allowOrigin);
            console.log("body preview:", result.preview);
        } catch (error) {
            console.log("\n---", probe.label, "---");
            console.log("url:", BASE + probe.path);
            console.log("error:", error && error.message ? error.message : String(error));
        }
    }
}

main();
