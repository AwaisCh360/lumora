import fs from "fs";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import OSS from "ali-oss";
import { policy2Str } from "ali-oss/lib/common/utils/policy2Str.js";
import { getCredential } from "ali-oss/lib/common/signUtils.js";
import { getStandardRegion } from "ali-oss/lib/common/utils/getStandardRegion.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const imagePath = path.join(__dirname, "HCVDBxmWIAAx8XP.jpg");
const accountsPath = path.join(rootDir, "account_pool.json");

const accounts = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
const token = Array.isArray(accounts) ? accounts[0].token : accounts.token;
const imageBytes = fs.readFileSync(imagePath);

function buildHeaders() {
    return {
        accept: "application/json",
        "content-type": "application/json",
        authorization: "Bearer " + token,
        source: "web",
        version: "0.2.7",
        "bx-v": "2.5.36",
        timezone: new Date().toString(),
        "x-request-id": crypto.randomUUID()
    };
}

function pad(value) {
    return String(value).padStart(2, "0");
}

function formatUtc(value) {
    return String(value.getUTCFullYear())
        + pad(value.getUTCMonth() + 1)
        + pad(value.getUTCDate())
        + "T"
        + pad(value.getUTCHours())
        + pad(value.getUTCMinutes())
        + pad(value.getUTCSeconds())
        + "Z";
}

const stsResponse = await fetch("https://chat.qwen.ai/api/v1/files/getstsToken", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
        filename: path.basename(imagePath),
        filesize: imageBytes.length,
        filetype: "image"
    })
});
const sts = await stsResponse.json();
if (stsResponse.ok === false) {
    throw new Error("STS failed: " + JSON.stringify(sts).slice(0, 300));
}

const client = new OSS({
    accessKeyId: sts.access_key_id,
    accessKeySecret: sts.access_key_secret,
    stsToken: sts.security_token,
    bucket: sts.bucketname,
    region: sts.region,
    secure: true
});

const now = new Date();
const formattedDate = formatUtc(now);
const credential = getCredential(
    formattedDate.split("T")[0],
    getStandardRegion(client.options.region),
    client.options.accessKeyId
);
const policy = {
    expiration: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    conditions: [
        { bucket: client.options.bucket },
        { "x-oss-credential": credential },
        { "x-oss-date": formattedDate },
        { "x-oss-signature-version": "OSS4-HMAC-SHA256" },
        ["content-length-range", 1, Math.max(imageBytes.length, 5 * 1024 * 1024)],
        ["eq", "$success_action_status", "200"],
        ["eq", "$key", sts.file_path],
        ["eq", "$Content-Type", "image/jpeg"],
        { "x-oss-security-token": client.options.stsToken }
    ]
};

const uploadForm = new FormData();
uploadForm.append("key", sts.file_path);
uploadForm.append("Content-Type", "image/jpeg");
uploadForm.append("x-oss-date", formattedDate);
uploadForm.append("x-oss-credential", credential);
uploadForm.append("x-oss-signature-version", "OSS4-HMAC-SHA256");
uploadForm.append("x-oss-security-token", client.options.stsToken);
uploadForm.append("policy", Buffer.from(policy2Str(policy), "utf8").toString("base64"));
uploadForm.append("x-oss-signature", client.signPostObjectPolicyV4(policy, now));
uploadForm.append("success_action_status", "200");
uploadForm.append("file", new Blob([imageBytes], { type: "image/jpeg" }), path.basename(imagePath));

const uploadUrl = client.generateObjectUrl(sts.file_path).replace(sts.file_path, "");
const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    body: uploadForm
});
if (uploadResponse.ok === false) {
    throw new Error("Upload failed: " + uploadResponse.status + " " + await uploadResponse.text());
}

console.log("UPLOAD_OK", {
    file_url_len: sts.file_url.length,
    file_id: sts.file_id
});

const sessionResponse = await fetch("https://chat.qwen.ai/api/v2/chats/new", {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({
        title: "JS Image Smoke Test",
        models: ["qwen3-omni-flash-2025-12-01"],
        chat_mode: "normal",
        chat_type: "t2t",
        project_id: "",
        timestamp: Date.now()
    })
});
const sessionJson = await sessionResponse.json();
if (sessionResponse.ok === false || sessionJson.success == false) {
    throw new Error("Session failed: " + JSON.stringify(sessionJson).slice(0, 300));
}

const sessionId = sessionJson.data.id;
const payload = {
    chat_id: sessionId,
    stream: true,
    version: "2.1",
    incremental_output: true,
    chat_mode: "normal",
    model: "qwen3-omni-flash-2025-12-01",
    parent_id: null,
    messages: [{
        fid: crypto.randomUUID(),
        parentId: null,
        childrenIds: [crypto.randomUUID()],
        role: "user",
        content: "Please describe this attached image briefly.",
        user_action: "chat",
        files: [{
            type: "image",
            url: sts.file_url,
            id: sts.file_id,
            name: path.basename(imagePath),
            size: imageBytes.length,
            file_id: sts.file_id,
            file_url: sts.file_url,
            status: "uploaded"
        }],
        timestamp: Date.now(),
        models: ["qwen3-omni-flash-2025-12-01"],
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
    }],
    timestamp: Date.now()
};

const chatResponse = await fetch(
    "https://chat.qwen.ai/api/v2/chat/completions?chat_id=" + encodeURIComponent(sessionId),
    {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload)
    }
);

console.log("CHAT_STATUS", chatResponse.status);
const reader = chatResponse.body.getReader();
const decoder = new TextDecoder();
let preview = "";
while (true) {
    const { value, done } = await reader.read();
    if (done) {
        break;
    }
    preview += decoder.decode(value, { stream: true });
    if (preview.length > 1200) {
        break;
    }
}
console.log(preview.slice(0, 1200));
