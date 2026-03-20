const BASE = "https://chat.qwen.ai";

const probes = [
    {
        label: "/api/chat POST",
        url: BASE + "/api/chat",
        method: "POST",
        body: {
            messages: [{ role: "user", content: "ping" }],
            stream: false
        }
    },
    {
        label: "/api/chat/stream POST",
        url: BASE + "/api/chat/stream",
        method: "POST",
        body: {
            messages: [{ role: "user", content: "ping" }],
            stream: true
        }
    },
    {
        label: "/api/v2/chats/new POST",
        url: BASE + "/api/v2/chats/new",
        method: "POST",
        body: {
            title: "Test"
        }
    },
    {
        label: "/api/v2/chat/completions POST",
        url: BASE + "/api/v2/chat/completions",
        method: "POST",
        body: {
            model: "qwen3.5-plus",
            messages: [{ role: "user", content: "ping" }],
            stream: false
        }
    }
];

function preview(text, limit = 220) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) {
        return "<empty>";
    }
    return value.length > limit ? value.slice(0, limit) + "..." : value;
}

async function main() {
    for (const probe of probes) {
        try {
            const response = await fetch(probe.url, {
                method: probe.method,
                headers: {
                    "content-type": "application/json",
                    accept: "application/json"
                },
                body: JSON.stringify(probe.body)
            });
            const text = await response.text();
            console.log("\n---", probe.label, "---");
            console.log("status:", response.status, "ok:", response.ok);
            console.log("content-type:", response.headers.get("content-type") || "<none>");
            console.log("body:", preview(text));
        } catch (error) {
            console.log("\n---", probe.label, "---");
            console.log("error:", error && error.message ? error.message : String(error));
        }
    }
}

main();
