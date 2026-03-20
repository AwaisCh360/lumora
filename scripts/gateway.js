(function () {
    const utils = window.Lumora.utils;
    const config = window.LumoraConfig || {};
    const runtimeDefaults = config.runtimeDefaults || {};

    const DEFAULT_BASE_URL = runtimeDefaults.gatewayBaseUrl || "https://chat.qwen.ai";
    const DEFAULT_PROXY_TEMPLATE = runtimeDefaults.gatewayProxyTemplate || "https://cors-bypass.quotesiaofficial.workers.dev";
    const DEFAULT_MODEL = runtimeDefaults.defaultModel || "qwen3.5-plus";
    const DEFAULT_IMAGE_MODEL = runtimeDefaults.defaultImageModel || DEFAULT_MODEL;
    const DEFAULT_BOT_ID = "assistant";
    const DEFAULT_BOT_NAME = "Assistant";
    const DEFAULT_ALLOWED_MODELS = Array.isArray(runtimeDefaults.allowedModels) && runtimeDefaults.allowedModels.length
        ? runtimeDefaults.allowedModels
        : [DEFAULT_MODEL];
    const DEFAULT_THINKING_BUDGET = Number(runtimeDefaults.thinkingBudget) || 81920;
    const TITLE_RETRY_COUNT = 5;
    const TITLE_RETRY_DELAY_MS = 2000;
    const CUSTOM_BASE64 = "DGi0YA7BemWnQjCl4_bR3f8SKIF9tUz/xhr2oEOgPpac=61ZqwTudLkM5vHyNXsVJ";
    const STEALTH_CHAT_PREFIX = "/c1st";
    const STEALTH_ROUTE_MAP = {
        "/api/models": "/p9lm",
        "/api/v1/auths/signin": "/s1n0",
        "/api/v2/chats/new": "/n3w1",
        "/api/v1/files/getstsToken": "/u8p1",
        "/api/v2/chat/completions/stop": "/x7a9/stop",
        "/api/v2/chat/completions": "/x7a9",
        "/api/v2/chats": "/c1st"
    };

    const FINGERPRINT_DEFAULTS = {
        sdkVersion: "websdk-2.3.15d",
        initTimestamp: "1765348410850",
        field3: "91",
        field4: "1|15",
        language: "en-US",
        timezoneOffset: "480",
        colorDepth: "16705151|12791",
        screenInfo: "1470|956|283|797|158|0|1470|956|1470|798|0|0",
        field9: "5",
        platform: "MacIntel",
        field11: "10",
        webglRenderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)|Google Inc. (Apple)",
        field13: "30|30",
        field14: "0",
        field15: "28",
        pluginCount: "5",
        vendor: "Google Inc.",
        field29: "8",
        touchInfo: "-1|0|0|0|0",
        field32: "11",
        field35: "0",
        mode: "P"
    };

    const runtimeState = {
        ssxmodCookies: null,
        ssxmodTimestamp: 0,
        gatewayTokenCache: Object.create(null)
    };

    function normalizeModelAliases(rawAliases) {
        const source = rawAliases && typeof rawAliases === "object" && !Array.isArray(rawAliases)
            ? rawAliases
            : {};
        const normalized = {};
        Object.keys(source).forEach(function (modelId) {
            const normalizedId = String(modelId || "").trim();
            if (!normalizedId) {
                return;
            }
            const alias = String(source[modelId] || "").trim();
            if (!alias) {
                return;
            }
            normalized[normalizedId] = alias;
        });
        return normalized;
    }

    function normalizeBotId(rawId, fallbackIndex) {
        const source = String(rawId || "").trim().toLowerCase();
        const normalized = source
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/-{2,}/g, "-")
            .replace(/^-+|-+$/g, "");
        if (normalized) {
            return normalized;
        }
        return fallbackIndex === 0
            ? DEFAULT_BOT_ID
            : "bot-" + String(fallbackIndex + 1);
    }

    function normalizeBotCatalog(rawBots) {
        const source = Array.isArray(rawBots)
            ? rawBots
            : [];
        const seen = new Set();
        const normalized = [];

        source.forEach(function (entry, index) {
            const value = entry && typeof entry === "object"
                ? entry
                : {};
            let nextId = normalizeBotId(value.id, index);
            while (seen.has(nextId)) {
                nextId = nextId + "-2";
            }
            seen.add(nextId);
            const nextName = String(value.name || value.label || "").trim() || (index === 0 ? DEFAULT_BOT_NAME : ("Bot " + String(index + 1)));
            const nextPrompt = typeof value.system_prompt === "string"
                ? value.system_prompt
                : typeof value.prompt === "string"
                    ? value.prompt
                    : "";
            normalized.push({
                id: nextId,
                name: nextName,
                system_prompt: nextPrompt
            });
        });

        if (!normalized.length) {
            normalized.push({
                id: DEFAULT_BOT_ID,
                name: DEFAULT_BOT_NAME,
                system_prompt: ""
            });
        }

        return normalized;
    }

    function resolveActiveBot(settings, preferredBotId) {
        const bots = normalizeBotCatalog(settings && settings.bots);
        if (!bots.length) {
            return null;
        }
        const desiredId = String(preferredBotId || "").trim();
        if (desiredId) {
            const match = bots.find(function (bot) {
                return bot.id === desiredId;
            });
            if (match) {
                return match;
            }
        }
        return bots[0];
    }

    function normalizeAppSettings(raw) {
        const value = raw && typeof raw === "object" ? raw : {};
        const allowedModels = Array.isArray(value.allowed_models) && value.allowed_models.length
            ? value.allowed_models
            : DEFAULT_ALLOWED_MODELS;
        const modelAliases = normalizeModelAliases(value.model_aliases);
        const normalizedSystemPrompt = typeof value.system_prompt === "string" ? value.system_prompt : "";
        const bots = normalizeBotCatalog(value.bots);

        return {
            id: value.id || "global",
            brand_name: String(value.brand_name || config.defaults && config.defaults.brandName || "Lumora").trim(),
            brand_tagline: String(value.brand_tagline || config.defaults && config.defaults.brandTagline || "").trim(),
            theme_default: String(value.theme_default || "obsidian").trim() || "obsidian",
            welcome_title: String(value.welcome_title || config.defaults && config.defaults.welcomeTitle || "Start a new conversation").trim(),
            welcome_copy: String(value.welcome_copy || config.defaults && config.defaults.welcomeCopy || "").trim(),
            default_model: String(value.default_model || DEFAULT_MODEL).trim(),
            default_image_model: String(value.default_image_model || value.default_model || DEFAULT_IMAGE_MODEL).trim(),
            allowed_models: allowedModels.map(function (model) {
                return String(model).trim();
            }).filter(Boolean),
            model_aliases: modelAliases,
            bots: bots,
            system_prompt: normalizedSystemPrompt,
            thinking_enabled: Boolean(value.thinking_enabled),
            thinking_budget: Number(value.thinking_budget) || DEFAULT_THINKING_BUDGET,
            gateway_base_url: String(value.gateway_base_url || DEFAULT_BASE_URL).trim(),
            gateway_proxy_template: typeof value.gateway_proxy_template === "string"
                ? value.gateway_proxy_template
                : DEFAULT_PROXY_TEMPLATE,
            gateway_email: String(value.gateway_email || "").trim(),
            gateway_password_hash: String(value.gateway_password_hash || "").trim(),
            gateway_access_token: String(value.gateway_access_token || "").trim(),
            gateway_token_expiry: value.gateway_token_expiry || null,
            gateway_pool_id: String(value.gateway_pool_id || "").trim(),
            gateway_pool_label: String(value.gateway_pool_label || "").trim(),
            gateway_assignment_source: String(value.gateway_assignment_source || "").trim(),
            updated_at: value.updated_at || null
        };
    }

    function extractModelCapabilities(model) {
        const meta = model && model.info && model.info.meta && typeof model.info.meta === "object"
            ? model.info.meta
            : {};
        const abilities = meta.abilities && typeof meta.abilities === "object"
            ? meta.abilities
            : {};
        const chatTypes = Array.isArray(meta.chat_type)
            ? meta.chat_type.map(function (item) {
                return String(item).trim();
            }).filter(Boolean)
            : [];
        return {
            thinking: Boolean(abilities.thinking),
            auto_thinking: Boolean(meta.auto_thinking),
            search: chatTypes.indexOf("search") !== -1,
            image: chatTypes.indexOf("t2i") !== -1,
            video: chatTypes.indexOf("t2v") !== -1,
            image_edit: chatTypes.indexOf("image_edit") !== -1,
            chat_types: chatTypes
        };
    }

    function modelSupportsAutoMode(modelId) {
        return String(modelId || "").toLowerCase().indexOf("qwen3.5-plus") !== -1;
    }

    function normalizeComposerMode(mode, settings, requestModel) {
        if (mode === "auto") {
            if (modelSupportsAutoMode(requestModel)) {
                return "auto";
            }
            return settings && settings.thinking_enabled
                ? "thinking"
                : "fast";
        }
        if (mode === "thinking") {
            return "thinking";
        }
        if (mode === "fast") {
            return "fast";
        }
        return settings && settings.thinking_enabled
            ? "thinking"
            : "fast";
    }

    function normalizeInteractionMode(mode) {
        return mode === "image"
            ? "image"
            : "chat";
    }

    function normalizeTokenExpiryMs(value) {
        if (!value) {
            return 0;
        }

        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return value > 1000000000000
                ? Math.floor(value)
                : Math.floor(value * 1000);
        }

        const text = String(value).trim();
        if (!text) {
            return 0;
        }

        if (/^\d+$/.test(text)) {
            const numeric = Number(text);
            if (Number.isFinite(numeric) && numeric > 0) {
                return numeric > 1000000000000
                    ? Math.floor(numeric)
                    : Math.floor(numeric * 1000);
            }
        }

        const parsed = new Date(text).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function resolveConfiguredAccessToken(settings) {
        const token = String(settings && settings.gateway_access_token || "").trim();
        if (!token) {
            return "";
        }

        const jwtExpiry = utils.getTokenExpiry(token);
        const explicitExpiry = normalizeTokenExpiryMs(settings && settings.gateway_token_expiry);
        const checkedExpiry = Math.max(jwtExpiry || 0, explicitExpiry || 0);
        if (checkedExpiry && checkedExpiry <= Date.now() + 60 * 1000) {
            return "";
        }

        return token;
    }

    function gatewayReady(settings) {
        const normalized = normalizeAppSettings(settings);
        const hasBase = Boolean(normalized.gateway_base_url);
        const hasDirectToken = Boolean(resolveConfiguredAccessToken(normalized));
        const hasEmailPassword = Boolean(normalized.gateway_email && normalized.gateway_password_hash);
        return hasBase && (hasDirectToken || hasEmailPassword);
    }

    function randHash() {
        return Math.floor(Math.random() * 4294967296);
    }

    function randDeviceId() {
        const hex = "0123456789abcdef";
        let value = "";
        for (let index = 0; index < 20; index += 1) {
            value += hex[Math.floor(Math.random() * hex.length)];
        }
        return value;
    }

    function genFingerprint() {
        const base = FINGERPRINT_DEFAULTS;
        const timestamp = Date.now();
        return [
            randDeviceId(), base.sdkVersion, base.initTimestamp, base.field3, base.field4,
            base.language, base.timezoneOffset, base.colorDepth, base.screenInfo, base.field9,
            base.platform, base.field11, base.webglRenderer, base.field13, base.field14,
            base.field15, base.pluginCount + "|" + randHash(), String(randHash()),
            String(randHash()), "1", "0", "1", "0", base.mode, "0", "0", "0", "416",
            base.vendor, base.field29, base.touchInfo, String(randHash()), base.field32,
            String(timestamp), String(randHash()), base.field35, String(Math.floor(Math.random() * 91) + 10)
        ].join("^");
    }

    function lzwCompress(data, bits, charFunc) {
        if (!data) {
            return "";
        }

        const dictionary = {};
        const dictToCreate = {};
        let enlargeIn = 2;
        let dictSize = 3;
        let numBits = 2;
        const result = [];
        let val = 0;
        let pos = 0;
        let word = "";

        function flushBit(bit) {
            val = (val << 1) | bit;
            if (pos === bits - 1) {
                pos = 0;
                result.push(charFunc(val));
                val = 0;
            } else {
                pos += 1;
            }
        }

        function outputWord(currentWord) {
            if (Object.prototype.hasOwnProperty.call(dictToCreate, currentWord)) {
                let characterCode = currentWord.charCodeAt(0);
                if (characterCode < 256) {
                    for (let index = 0; index < numBits; index += 1) {
                        flushBit(0);
                    }
                    for (let index = 0; index < 8; index += 1) {
                        flushBit(characterCode & 1);
                        characterCode >>= 1;
                    }
                } else {
                    let control = 1;
                    for (let index = 0; index < numBits; index += 1) {
                        flushBit(control);
                        control = 0;
                    }
                    for (let index = 0; index < 16; index += 1) {
                        flushBit(characterCode & 1);
                        characterCode >>= 1;
                    }
                }
                enlargeIn -= 1;
                if (enlargeIn === 0) {
                    enlargeIn = 1 << numBits;
                    numBits += 1;
                }
                delete dictToCreate[currentWord];
            } else {
                let charCode = dictionary[currentWord];
                for (let index = 0; index < numBits; index += 1) {
                    flushBit(charCode & 1);
                    charCode >>= 1;
                }
            }
        }

        for (let index = 0; index < data.length; index += 1) {
            const character = data.charAt(index);
            if (!Object.prototype.hasOwnProperty.call(dictionary, character)) {
                dictionary[character] = dictSize;
                dictSize += 1;
                dictToCreate[character] = true;
            }
            const merged = word + character;
            if (Object.prototype.hasOwnProperty.call(dictionary, merged)) {
                word = merged;
            } else {
                outputWord(word);
                enlargeIn -= 1;
                if (enlargeIn === 0) {
                    enlargeIn = 1 << numBits;
                    numBits += 1;
                }
                dictionary[merged] = dictSize;
                dictSize += 1;
                word = character;
            }
        }

        if (word !== "") {
            outputWord(word);
            enlargeIn -= 1;
            if (enlargeIn === 0) {
                enlargeIn = 1 << numBits;
                numBits += 1;
            }
        }

        let charCode = 2;
        for (let index = 0; index < numBits; index += 1) {
            flushBit(charCode & 1);
            charCode >>= 1;
        }

        while (true) {
            val <<= 1;
            if (pos === bits - 1) {
                result.push(charFunc(val));
                break;
            }
            pos += 1;
        }

        return result.join("");
    }

    function customEncode(data, urlSafe) {
        let compressed = lzwCompress(data, 6, function (index) {
            return CUSTOM_BASE64.charAt(index);
        });
        if (!urlSafe) {
            const pad = compressed.length % 4;
            if (pad === 1) {
                compressed += "===";
            } else if (pad === 2) {
                compressed += "==";
            } else if (pad === 3) {
                compressed += "=";
            }
        }
        return compressed;
    }

    function generateSsxmodCookies() {
        const fields = genFingerprint().split("^");
        const pluginParts = fields[16].split("|");
        if (pluginParts.length === 2) {
            fields[16] = pluginParts[0] + "|" + randHash();
        }
        fields[17] = String(randHash());
        fields[18] = String(randHash());
        fields[31] = String(randHash());
        fields[33] = String(Date.now());
        fields[34] = String(randHash());
        fields[36] = String(Math.floor(Math.random() * 91) + 10);

        const itnaData = fields.join("^");
        const itna2Data = [
            fields[0], fields[1], fields[23],
            "0", "", "0", "", "", "0", "0", "0",
            fields[32], fields[33], "0", "0", "0", "0", "0"
        ].join("^");

        return {
            ssxmod_itna: "1-" + customEncode(itnaData, true),
            ssxmod_itna2: "1-" + customEncode(itna2Data, true)
        };
    }

    function getSsxmodCookies() {
        const now = Date.now();
        if (!runtimeState.ssxmodCookies || now - runtimeState.ssxmodTimestamp > 15 * 60 * 1000) {
            runtimeState.ssxmodCookies = generateSsxmodCookies();
            runtimeState.ssxmodTimestamp = now;
        }
        return runtimeState.ssxmodCookies;
    }

    function normalizeRoutePath(pathname) {
        const value = String(pathname || "").trim();
        if (!value || value === "/") {
            return "/";
        }
        return value.endsWith("/") ? value.slice(0, -1) : value;
    }

    function safeDecodeSegment(value) {
        try {
            return decodeURIComponent(value);
        } catch (_error) {
            return String(value || "");
        }
    }

    function mapTargetUrlToStealthPath(targetUrl) {
        let parsed;
        try {
            parsed = new URL(targetUrl);
        } catch (_error) {
            return "";
        }

        const normalizedPath = normalizeRoutePath(parsed.pathname);
        if (Object.prototype.hasOwnProperty.call(STEALTH_ROUTE_MAP, normalizedPath)) {
            return STEALTH_ROUTE_MAP[normalizedPath] + (parsed.search || "");
        }

        if (normalizedPath.indexOf("/api/v2/chats/") === 0) {
            const chatId = normalizedPath.slice("/api/v2/chats/".length).trim();
            if (!chatId) {
                return STEALTH_CHAT_PREFIX + (parsed.search || "");
            }
            const safeChatId = encodeURIComponent(safeDecodeSegment(chatId));
            return STEALTH_CHAT_PREFIX + "/" + safeChatId + (parsed.search || "");
        }

        return "";
    }

    function joinProxyBaseAndPath(proxyTemplate, pathWithQuery) {
        const base = String(proxyTemplate || "").trim().replace(/\/+$/, "");
        const routePath = String(pathWithQuery || "").startsWith("/")
            ? String(pathWithQuery || "")
            : "/" + String(pathWithQuery || "");
        return base + routePath;
    }

    function resolveStealthProxyBase(proxyTemplate) {
        const template = String(proxyTemplate || "").trim();
        if (!template) {
            return "";
        }

        const replaced = template
            .replace("{url_encoded}", "__target__")
            .replace("{url}", "__target__");

        try {
            const parsed = new URL(replaced);
            return (parsed.origin + parsed.pathname).replace(/\/+$/, "");
        } catch (_error) {
            const head = template.split("?")[0].trim().replace(/\/+$/, "");
            return /^https?:\/\//i.test(head) ? head : "";
        }
    }

    function buildLegacyUrlParamProxy(proxyTemplate, targetUrl) {
        const template = String(proxyTemplate || "").trim();
        if (!template) {
            return targetUrl;
        }
        if (template.includes("{url_encoded}")) {
            return template.replace("{url_encoded}", encodeURIComponent(targetUrl));
        }
        if (template.includes("{url}")) {
            return template.replace("{url}", targetUrl);
        }
        const separator = template.indexOf("?") === -1 ? "?" : "&";
        return template + separator + "url=" + encodeURIComponent(targetUrl);
    }

    function buildAlternateStealthStopUrl(routeUrl) {
        let parsed;
        try {
            parsed = new URL(String(routeUrl || ""));
        } catch (_error) {
            return "";
        }

        const currentPath = String(parsed.pathname || "");
        if (/\/x7a9\/stop$/i.test(currentPath)) {
            parsed.pathname = currentPath.replace(/\/x7a9\/stop$/i, "/v2k9/stop");
            return parsed.toString();
        }
        if (/\/v2k9\/stop$/i.test(currentPath)) {
            parsed.pathname = currentPath.replace(/\/v2k9\/stop$/i, "/x7a9/stop");
            return parsed.toString();
        }
        return "";
    }

    function buildProxyUrl(proxyTemplate, targetUrl) {
        const template = String(proxyTemplate || "").trim();
        if (!template) {
            return targetUrl;
        }

        const stealthPath = mapTargetUrlToStealthPath(targetUrl);
        const stealthBase = resolveStealthProxyBase(template);
        const hasPlaceholder = template.includes("{url_encoded}") || template.includes("{url}");

        // Prefer path-based stealth routes whenever possible, even if admin settings
        // still contain the old ?url={url_encoded} template.
        if (stealthPath && stealthBase) {
            return joinProxyBaseAndPath(stealthBase, stealthPath);
        }

        if (hasPlaceholder) {
            return buildLegacyUrlParamProxy(template, targetUrl);
        }

        if (/^https?:\/\//i.test(template)) {
            if (stealthPath) {
                return joinProxyBaseAndPath(template, stealthPath);
            }
            return buildLegacyUrlParamProxy(template, targetUrl);
        }

        if (template.endsWith("?") || template.endsWith("/")) {
            return template + targetUrl;
        }
        return template + "/" + targetUrl;
    }

    function buildRouteInfo(settings, targetUrl) {
        const proxyTemplate = String(settings.gateway_proxy_template || "").trim();
        if (!proxyTemplate) {
            return {
                routeLabel: "Direct runtime",
                url: targetUrl
            };
        }
        let routeLabel = "Routed gateway";
        try {
            routeLabel = "Route · " + new URL(proxyTemplate).host;
        } catch (_error) {
            routeLabel = "Routed gateway";
        }
        return {
            routeLabel: routeLabel,
            url: buildProxyUrl(proxyTemplate, targetUrl)
        };
    }

    function shouldRetryDirectRoute(error) {
        const message = error && error.message ? error.message : String(error || "");
        return /forbidden|access denied|error 1010|blocked|failed to fetch|cors|proxy|\b405\b|method not allowed/i.test(message);
    }

    function buildReferenceHeaders(settings, token, includeAuth) {
        const cookies = getSsxmodCookies();
        const baseUrl = settings.gateway_base_url || DEFAULT_BASE_URL;
        const cookieValue = "ssxmod_itna=" + cookies.ssxmod_itna + "; ssxmod_itna2=" + cookies.ssxmod_itna2;
        const headers = {
            accept: "application/json",
            "accept-encoding": "gzip, deflate",
            "accept-language": "en-US,en;q=0.9",
            "content-type": "application/json",
            source: "web",
            version: "0.2.7",
            "x-accel-buffering": "no",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
            "bx-v": "2.5.36",
            origin: baseUrl,
            referer: baseUrl + "/c/guest",
            "sec-ch-ua": "\"Not(A:Brand\";v=\"8\", \"Chromium\";v=\"144\", \"Google Chrome\";v=\"144\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"macOS\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            timezone: new Date().toString(),
            "x-request-id": utils.uid(),
            cookie: cookieValue
        };

        if (includeAuth && token) {
            headers.authorization = "Bearer " + token;
        }

        return headers;
    }

    function buildBrowserRequestHeaders(settings, token, includeAuth, contentType, requestOptions) {
        const reference = buildReferenceHeaders(settings, token, includeAuth);
        const options = requestOptions && typeof requestOptions === "object"
            ? requestOptions
            : {};
        const headers = {
            accept: String(options.accept || "application/json"),
            "accept-language": reference["accept-language"],
            "content-type": contentType || "application/json",
            source: reference.source,
            version: reference.version,
            "x-accel-buffering": reference["x-accel-buffering"],
            "bx-v": reference["bx-v"],
            timezone: reference.timezone,
            "x-request-id": reference["x-request-id"]
        };
        if (includeAuth && token) {
            headers.authorization = reference.authorization;
        }
        return headers;
    }

    async function fetchViaRoute(settings, targetUrl, fetchOptions, signal) {
        const routeInfo = buildRouteInfo(settings, targetUrl);
        const requestOptions = Object.assign({}, fetchOptions, {
            mode: "cors",
            credentials: "omit",
            signal: signal
        });
        const requestMethod = String(requestOptions.method || "GET").toUpperCase();
        const isChatCompletionRequest = requestMethod === "POST"
            && /\/api\/v2\/chat\/completions(?:\?|$)/i.test(String(targetUrl || ""));
        const isStopCompletionRequest = requestMethod === "POST"
            && /\/api\/v2\/chat\/completions\/stop(?:\?|$)/i.test(String(targetUrl || ""));

        async function doFetch(url, routeLabel) {
            const startedAt = performance.now();
            const response = await fetch(url, requestOptions);
            const headerMs = performance.now() - startedAt;
            if (!response.ok) {
                const preview = (await response.text()).slice(0, 260);
                throw new Error("HTTP " + response.status + " " + preview);
            }
            return {
                response: response,
                routeLabel: routeLabel,
                headerMs: headerMs
            };
        }

        try {
            return await doFetch(routeInfo.url, routeInfo.routeLabel);
        } catch (error) {
            const isRouted = routeInfo.url !== targetUrl;
            let finalError = error;

            if (isStopCompletionRequest && isRouted) {
                const fallbackUrls = [];
                const alternateStealthUrl = buildAlternateStealthStopUrl(routeInfo.url);
                if (alternateStealthUrl && alternateStealthUrl !== routeInfo.url) {
                    fallbackUrls.push({
                        url: alternateStealthUrl,
                        label: routeInfo.routeLabel + " · alternate stop"
                    });
                }

                const legacyProxyUrl = buildLegacyUrlParamProxy(settings.gateway_proxy_template, targetUrl);
                if (
                    legacyProxyUrl
                    && legacyProxyUrl !== routeInfo.url
                    && legacyProxyUrl !== alternateStealthUrl
                ) {
                    fallbackUrls.push({
                        url: legacyProxyUrl,
                        label: routeInfo.routeLabel + " · legacy stop"
                    });
                }

                for (let index = 0; index < fallbackUrls.length; index += 1) {
                    const entry = fallbackUrls[index];
                    try {
                        return await doFetch(entry.url, entry.label);
                    } catch (fallbackError) {
                        finalError = fallbackError;
                    }
                }
            }

            // Never replay chat completion POST through direct fallback.
            // If routed request reached upstream but failed at proxy layer,
            // replaying can create a duplicate assistant turn.
            if (isChatCompletionRequest) {
                throw finalError;
            }
            if (!isRouted || !shouldRetryDirectRoute(finalError)) {
                throw finalError;
            }
            return doFetch(targetUrl, "Direct fallback");
        }
    }

    function unwrapProxyText(rawText) {
        let text = typeof rawText === "string" ? rawText : "";
        for (let depth = 0; depth < 3; depth += 1) {
            const trimmed = text.trim();
            if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
                break;
            }
            let parsed;
            try {
                parsed = JSON.parse(trimmed);
            } catch (_error) {
                break;
            }
            if (parsed && typeof parsed.body === "string" && parsed.body.trim()) {
                text = parsed.body;
                continue;
            }
            if (parsed && parsed.data && typeof parsed.data.body === "string" && parsed.data.body.trim()) {
                text = parsed.data.body;
                continue;
            }
            if (parsed && parsed.response && typeof parsed.response.body === "string" && parsed.response.body.trim()) {
                text = parsed.response.body;
                continue;
            }
            if (parsed && typeof parsed.data === "string" && parsed.data.trim()) {
                text = parsed.data;
                continue;
            }
            break;
        }
        return text;
    }

    async function parseJsonResponse(response) {
        const rawText = await response.text();
        const normalized = unwrapProxyText(rawText);
        try {
            return JSON.parse(normalized);
        } catch (_error) {
            throw new Error(normalized.slice(0, 260) || "Response was not valid JSON.");
        }
    }

    function extractTextContent(value, depth) {
        const level = Number.isFinite(depth) ? depth : 0;
        if (level > 5 || value == null) {
            return "";
        }
        if (typeof value === "string") {
            return value;
        }
        if (typeof value === "number") {
            return Number.isFinite(value) ? String(value) : "";
        }
        if (Array.isArray(value)) {
            return value.map(function (entry) {
                return extractTextContent(entry, level + 1);
            }).join("");
        }
        if (typeof value !== "object") {
            return "";
        }

        if (typeof value.value === "string") {
            return value.value;
        }
        if (typeof value.text === "string") {
            return value.text;
        }
        if (typeof value.content === "string") {
            return value.content;
        }
        if (value.text && typeof value.text === "object") {
            const nestedText = extractTextContent(value.text, level + 1);
            if (nestedText.trim()) {
                return nestedText;
            }
        }
        if (Array.isArray(value.content)) {
            return extractTextContent(value.content, level + 1);
        }
        if (value.content && typeof value.content === "object") {
            const nestedContent = extractTextContent(value.content, level + 1);
            if (nestedContent.trim()) {
                return nestedContent;
            }
        }
        if (typeof value.delta === "string") {
            return value.delta;
        }
        if (value.delta && typeof value.delta === "object") {
            const nestedDelta = extractTextContent(value.delta, level + 1);
            if (nestedDelta.trim()) {
                return nestedDelta;
            }
        }
        if (typeof value.reasoning_content === "string") {
            return value.reasoning_content;
        }
        if (typeof value.output_text === "string") {
            return value.output_text;
        }
        if (Array.isArray(value.parts)) {
            return extractTextContent(value.parts, level + 1);
        }
        if (Array.isArray(value.items)) {
            return extractTextContent(value.items, level + 1);
        }

        const fallbackKeys = ["message", "messages", "prompt", "query", "input", "output", "answer", "response", "result", "data", "body", "payload"];
        for (let index = 0; index < fallbackKeys.length; index += 1) {
            const key = fallbackKeys[index];
            if (!Object.prototype.hasOwnProperty.call(value, key)) {
                continue;
            }
            const candidate = extractTextContent(value[key], level + 1);
            if (candidate.trim()) {
                return candidate;
            }
        }

        return "";
    }

    function normalizeGeneratedImage(item, index) {
        const source = item && typeof item === "object"
            ? item
            : { url: item };
        const url = String(source.url || source.file_url || source.content || "").trim();
        if (!url) {
            return null;
        }
        return {
            url: url,
            name: String(source.name || source.label || "Generated image " + String((Number(index) || 0) + 1)).trim()
        };
    }

    function uniqueGeneratedImages(items) {
        const seen = new Set();
        return (Array.isArray(items) ? items : []).map(function (item, index) {
            return normalizeGeneratedImage(item, index);
        }).filter(function (item) {
            if (!item || !item.url || seen.has(item.url)) {
                return false;
            }
            seen.add(item.url);
            return true;
        });
    }

    function looksLikeImageUrl(value) {
        const input = String(value || "").trim();
        if (!input) {
            return false;
        }
        try {
            const parsed = new URL(input);
            if (!/^https?:$/i.test(parsed.protocol)) {
                return false;
            }
            return /\.(png|jpe?g|gif|webp|bmp|svg)(?:$|\?)/i.test(parsed.pathname)
                || /(?:oss|aliyuncs|alibaba|qwen)/i.test(parsed.hostname);
        } catch (_error) {
            return false;
        }
    }

    function normalizeSourceUrl(value) {
        return String(value || "")
            .trim()
            .replace(/^<|>$/g, "");
    }

    function isLikelyWebSourceUrl(value) {
        const input = normalizeSourceUrl(value);
        if (!input) {
            return false;
        }
        if (looksLikeImageUrl(input)) {
            return false;
        }
        try {
            const parsed = new URL(input);
            return /^https?:$/i.test(parsed.protocol);
        } catch (_error) {
            return false;
        }
    }

    function normalizeSearchSource(item, index) {
        const source = item && typeof item === "object"
            ? item
            : { url: item };
        const url = normalizeSourceUrl(
            source.url
            || source.link
            || source.href
            || source.source_url
            || source.sourceUrl
            || source.uri
            || source.reference
            || source.ref
        );
        if (!isLikelyWebSourceUrl(url)) {
            return null;
        }
        const title = String(
            source.title
            || source.name
            || source.site_name
            || source.siteName
            || source.domain
            || source.host
            || ""
        ).trim();
        return {
            url: url,
            title: title || "Source " + String((Number(index) || 0) + 1)
        };
    }

    function uniqueSearchSources(items) {
        const seen = new Set();
        return (Array.isArray(items) ? items : []).map(function (item, index) {
            return normalizeSearchSource(item, index);
        }).filter(function (item) {
            if (!item || !item.url || seen.has(item.url)) {
                return false;
            }
            seen.add(item.url);
            return true;
        });
    }

    function collectSearchSourcesFromValue(value, depth, output) {
        const level = Number.isFinite(depth) ? depth : 0;
        const bucket = Array.isArray(output) ? output : [];
        if (level > 6 || value == null) {
            return bucket;
        }

        if (typeof value === "string") {
            const matches = value.match(/https?:\/\/[^\s<>")\]]+/gi) || [];
            matches.forEach(function (match) {
                bucket.push({ url: normalizeSourceUrl(match) });
            });
            return bucket;
        }

        if (typeof value === "number" || typeof value === "boolean") {
            return bucket;
        }

        if (Array.isArray(value)) {
            value.forEach(function (entry) {
                collectSearchSourcesFromValue(entry, level + 1, bucket);
            });
            return bucket;
        }

        if (typeof value !== "object") {
            return bucket;
        }

        const directUrl = normalizeSourceUrl(
            value.url
            || value.link
            || value.href
            || value.source_url
            || value.sourceUrl
            || value.uri
            || value.reference
            || value.ref
        );
        if (directUrl) {
            bucket.push({
                url: directUrl,
                title: String(
                    value.title
                    || value.name
                    || value.site_name
                    || value.siteName
                    || value.domain
                    || value.host
                    || ""
                ).trim()
            });
        }

        Object.keys(value).forEach(function (key) {
            collectSearchSourcesFromValue(value[key], level + 1, bucket);
        });
        return bucket;
    }

    function appendWebSearchSources(accumulator, candidate) {
        const target = accumulator && Array.isArray(accumulator.searchSources)
            ? accumulator.searchSources
            : [];
        const beforeCount = target.length;
        collectSearchSourcesFromValue(candidate, 0, target);
        const normalized = uniqueSearchSources(target);
        accumulator.searchSources = normalized;
        return normalized.length > beforeCount;
    }

    function isSearchPhase(phase) {
        const normalized = typeof phase === "string" ? phase.toLowerCase() : "";
        if (!normalized) {
            return false;
        }
        return normalized.includes("search")
            || normalized.includes("retrieve")
            || normalized.includes("browse");
    }

    function hasWebSearchSignal(value, depth) {
        const level = Number.isFinite(depth) ? depth : 0;
        if (level > 6 || value == null) {
            return false;
        }
        if (Array.isArray(value)) {
            return value.some(function (entry) {
                return hasWebSearchSignal(entry, level + 1);
            });
        }
        if (typeof value !== "object") {
            return false;
        }

        if (String(value.name || "").toLowerCase() === "web_search") {
            return true;
        }
        if (Array.isArray(value.web_search_info) && value.web_search_info.length) {
            return true;
        }

        const responseInfo = value["response.info"];
        if (responseInfo && hasWebSearchSignal(responseInfo, level + 1)) {
            return true;
        }

        if (value.response && typeof value.response === "object") {
            if (hasWebSearchSignal(value.response.info, level + 1)) {
                return true;
            }
        }
        if (value.response_info && hasWebSearchSignal(value.response_info, level + 1)) {
            return true;
        }

        return Object.keys(value).some(function (key) {
            return hasWebSearchSignal(value[key], level + 1);
        });
    }

    function extractGeneratedImagesFromReplyText(replyText) {
        const found = [];
        let nextReply = String(replyText || "");

        function remember(url) {
            if (!looksLikeImageUrl(url)) {
                return;
            }
            found.push({ url: url });
        }

        nextReply = nextReply.replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g, function (_match, url) {
            remember(url);
            return "";
        });

        nextReply = nextReply
            .split(/\r?\n/)
            .filter(function (line) {
                const trimmed = line.trim();
                if (!trimmed) {
                    return true;
                }
                if (looksLikeImageUrl(trimmed) && !/\s/.test(trimmed)) {
                    remember(trimmed);
                    return false;
                }
                return true;
            })
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        return {
            reply: nextReply,
            generatedImages: uniqueGeneratedImages(found)
        };
    }

    function isReasoningPhase(phase) {
        const normalized = typeof phase === "string" ? phase.toLowerCase() : "";
        if (!normalized) {
            return false;
        }
        if (
            normalized.includes("answer") ||
            normalized.includes("final") ||
            normalized.includes("output") ||
            normalized.includes("response")
        ) {
            return false;
        }
        return normalized.includes("think") || normalized.includes("reason") || normalized.includes("analysis");
    }

    function isImageGenerationPhase(phase) {
        const normalized = typeof phase === "string" ? phase.toLowerCase() : "";
        return normalized === "image_gen" || normalized.indexOf("image_gen") !== -1;
    }

    function appendStreamText(accumulator, content, phase) {
        const text = extractTextContent(content, 0);
        if (!text) {
            return false;
        }
        if (isReasoningPhase(phase)) {
            accumulator.thinking += text;
            accumulator.phase = "thinking";
        } else {
            accumulator.reply += text;
            accumulator.phase = "answer";
        }
        accumulator.answerChunks += 1;
        return true;
    }

    function appendGeneratedImage(accumulator, content, phase) {
        if (!isImageGenerationPhase(phase)) {
            return false;
        }
        const text = extractTextContent(content, 0).trim();
        if (!text) {
            return false;
        }
        const nextImages = uniqueGeneratedImages((accumulator.generatedImages || []).concat([{ url: text }]));
        if (!nextImages.length || nextImages.length === (accumulator.generatedImages || []).length) {
            return false;
        }
        accumulator.generatedImages = nextImages;
        accumulator.phase = "image_gen";
        return true;
    }

    function parseSseDataLine(dataString, accumulator) {
        if (!dataString || dataString === "[DONE]") {
            return false;
        }
        let chunk;
        try {
            chunk = JSON.parse(dataString);
            accumulator.eventsParsed += 1;
        } catch (_error) {
            return false;
        }

        if (chunk["response.created"] && chunk["response.created"].response_id) {
            accumulator.responseId = chunk["response.created"].response_id;
            const createdParentId = chunk["response.created"].parent_id;
            if (typeof createdParentId === "string" && createdParentId.trim()) {
                accumulator.parentUserId = createdParentId.trim();
            }
        } else if (!accumulator.responseId && typeof chunk.response_id === "string") {
            accumulator.responseId = chunk.response_id;
        }
        if (!accumulator.parentUserId && typeof chunk.parent_id === "string" && chunk.parent_id.trim()) {
            accumulator.parentUserId = chunk.parent_id.trim();
        }

        const responseInfo = chunk && typeof chunk === "object"
            ? (
                chunk["response.info"]
                || (chunk.response && typeof chunk.response === "object" ? chunk.response.info : null)
                || chunk.response_info
            )
            : null;
        if (responseInfo && typeof responseInfo === "object") {
            const appended = appendWebSearchSources(accumulator, responseInfo)
                || appendWebSearchSources(accumulator, chunk);
            const hasSignal = appended
                || hasWebSearchSignal(responseInfo, 0)
                || hasWebSearchSignal(chunk, 0);
            if (hasSignal) {
                const enteringSearch = accumulator.phase !== "searching";
                accumulator.phase = "searching";
                if (appended || enteringSearch) {
                    return true;
                }
            }
        }

        const choice = Array.isArray(chunk.choices) && chunk.choices[0] ? chunk.choices[0] : null;
        if (choice) {
            const delta = choice.delta;
            const phase = delta && typeof delta === "object" && typeof delta.phase === "string"
                ? delta.phase
                : typeof chunk.phase === "string"
                    ? chunk.phase
                    : "";
            if (delta && typeof delta === "object" && delta.name === "web_search") {
                const appended = appendWebSearchSources(accumulator, delta)
                    || appendWebSearchSources(accumulator, choice.message)
                    || appendWebSearchSources(accumulator, chunk);
                const enteringSearch = accumulator.phase !== "searching";
                accumulator.phase = "searching";
                if (appended || enteringSearch) {
                    return true;
                }
            } else {
                if (appendGeneratedImage(accumulator, delta, phase)) {
                    return true;
                }
                if (appendStreamText(accumulator, delta, phase)) {
                    return true;
                }
            }
            if (appendGeneratedImage(accumulator, choice.message && (choice.message.content || choice.message), phase)) {
                return true;
            }
            if (choice.message && appendStreamText(accumulator, choice.message.content || choice.message, phase)) {
                return true;
            }
            if (appendGeneratedImage(accumulator, choice.text, phase)) {
                return true;
            }
            if (appendStreamText(accumulator, choice.text, phase)) {
                return true;
            }
        }

        const chunkPhase = typeof chunk.phase === "string" ? chunk.phase : "";
        if (isSearchPhase(chunkPhase)) {
            const appended = appendWebSearchSources(accumulator, chunk);
            const enteringSearch = accumulator.phase !== "searching";
            accumulator.phase = "searching";
            if (appended || enteringSearch) {
                return true;
            }
        }
        if (appendGeneratedImage(accumulator, chunk.delta, chunkPhase)) {
            return true;
        }
        if (appendStreamText(accumulator, chunk.delta, chunkPhase)) {
            return true;
        }
        if (appendGeneratedImage(accumulator, chunk.content, chunkPhase)) {
            return true;
        }
        if (appendStreamText(accumulator, chunk.content, chunkPhase)) {
            return true;
        }
        if (appendGeneratedImage(accumulator, chunk.output_text, chunkPhase)) {
            return true;
        }
        if (appendStreamText(accumulator, chunk.output_text, chunkPhase)) {
            return true;
        }
        if (chunk.data && appendGeneratedImage(accumulator, chunk.data.content || chunk.data, chunkPhase)) {
            return true;
        }
        if (chunk.data && appendStreamText(accumulator, chunk.data.content || chunk.data, chunkPhase)) {
            return true;
        }
        if (Array.isArray(chunk.output) && appendGeneratedImage(accumulator, chunk.output, chunkPhase)) {
            return true;
        }
        if (Array.isArray(chunk.output) && appendStreamText(accumulator, chunk.output, chunkPhase)) {
            return true;
        }

        return false;
    }

    function extractReplyFromJson(data, fallbackText) {
        if (data && Array.isArray(data.choices) && data.choices[0]) {
            const choice = data.choices[0];
            const messageContent = choice.message ? extractTextContent(choice.message.content || choice.message, 0) : "";
            if (messageContent.trim()) {
                return messageContent;
            }
            const deltaContent = choice.delta ? extractTextContent(choice.delta.content || choice.delta, 0) : "";
            if (deltaContent.trim()) {
                return deltaContent;
            }
            const choiceText = extractTextContent(choice.text, 0);
            if (choiceText.trim()) {
                return choiceText;
            }
        }
        const content = extractTextContent(data && data.content, 0);
        if (content.trim()) {
            return content;
        }
        const outputText = extractTextContent(data && data.output_text, 0);
        if (outputText.trim()) {
            return outputText;
        }
        return typeof fallbackText === "string" && fallbackText.trim()
            ? fallbackText.trim()
            : "No response text found.";
    }

    function parseReply(text) {
        const normalized = unwrapProxyText(text);
        if (normalized.includes("data:")) {
            const lines = normalized.split(/\r?\n/);
            const accumulator = {
                reply: "",
                thinking: "",
                generatedImages: [],
                searchSources: [],
                responseId: null,
                parentUserId: null,
                eventsParsed: 0,
                answerChunks: 0,
                phase: ""
            };
            lines.forEach(function (rawLine) {
                const line = rawLine.trim();
                if (line.startsWith("data:")) {
                    parseSseDataLine(line.slice(5).trim(), accumulator);
                }
            });
            const extracted = extractGeneratedImagesFromReplyText(accumulator.reply.trim());
            return {
                reply: extracted.reply,
                thinking: accumulator.thinking.trim(),
                generatedImages: uniqueGeneratedImages((accumulator.generatedImages || []).concat(extracted.generatedImages || [])),
                searchSources: uniqueSearchSources(accumulator.searchSources || []),
                responseId: accumulator.responseId,
                parentUserId: accumulator.parentUserId,
                parser: "sse",
                eventsParsed: accumulator.eventsParsed,
                answerChunks: accumulator.answerChunks
            };
        }

        let data = null;
        try {
            data = JSON.parse(normalized);
        } catch (_error) {
            data = null;
        }
        const extracted = extractGeneratedImagesFromReplyText(extractReplyFromJson(data, normalized));
        const collectedSources = [];
        collectSearchSourcesFromValue(data, 0, collectedSources);
        collectSearchSourcesFromValue(normalized, 0, collectedSources);
        return {
            reply: extracted.reply,
            thinking: "",
            generatedImages: extracted.generatedImages,
            searchSources: uniqueSearchSources(collectedSources),
            responseId: data && (data.response_id || data.data && data.data.response_id || null),
            parentUserId: data && (data.parent_id || data.data && data.data.parent_id || null),
            parser: "json",
            eventsParsed: 0,
            answerChunks: 0
        };
    }

    function normalizeRetryChildrenIds(childrenIds) {
        const seen = new Set();
        const source = Array.isArray(childrenIds) ? childrenIds : [];
        return source
            .map(function (value) {
                return String(value || "").trim();
            })
            .filter(function (value) {
                if (!value || seen.has(value)) {
                    return false;
                }
                seen.add(value);
                return true;
            });
    }

    function sleep(ms) {
        return new Promise(function (resolve) {
            window.setTimeout(resolve, ms);
        });
    }

    async function sleepWithSignal(ms, signal) {
        if (!signal) {
            await sleep(ms);
            return;
        }
        await new Promise(function (resolve, reject) {
            if (signal.aborted) {
                reject(new DOMException("Aborted", "AbortError"));
                return;
            }
            const timeoutId = window.setTimeout(cleanResolve, ms);

            function cleanResolve() {
                signal.removeEventListener("abort", onAbort);
                resolve();
            }

            function onAbort() {
                window.clearTimeout(timeoutId);
                signal.removeEventListener("abort", onAbort);
                reject(new DOMException("Aborted", "AbortError"));
            }

            signal.addEventListener("abort", onAbort, { once: true });
        });
    }

    function extractChatList(data) {
        if (!data) {
            return [];
        }
        if (data.data && Array.isArray(data.data.list)) {
            return data.data.list;
        }
        if (Array.isArray(data.data)) {
            return data.data;
        }
        if (Array.isArray(data.list)) {
            return data.list;
        }
        return [];
    }

    async function fetchRemoteTitle(options) {
        const settings = normalizeAppSettings(options && options.settings);
        const sessionId = String(options && options.sessionId || "").trim();
        const signal = options && options.signal;

        if (!sessionId) {
            return "";
        }

        const token = await ensureGatewayToken(settings, signal);
        const url = settings.gateway_base_url + "/api/v2/chats/?page=1&exclude_project=true";

        for (let attempt = 0; attempt < TITLE_RETRY_COUNT; attempt += 1) {
            if (attempt > 0) {
                await sleepWithSignal(TITLE_RETRY_DELAY_MS, signal);
            }
            const fetchResult = await fetchViaRoute(settings, url, {
                method: "GET",
                headers: buildBrowserRequestHeaders(settings, token, true, "application/json")
            }, signal);
            const data = await parseJsonResponse(fetchResult.response);
            const chats = extractChatList(data);
            const match = chats.find(function (chat) {
                return chat && chat.id === sessionId;
            });

            if (!match) {
                continue;
            }

            const title = String(match.title || "").trim();
            if (title && title !== "New Chat" && !title.startsWith("API: ")) {
                return title;
            }
        }

        return "";
    }

    function extractDeleteErrorDetail(payload) {
        if (!payload || typeof payload !== "object") {
            return "";
        }
        const data = payload.data && typeof payload.data === "object" ? payload.data : {};
        const parts = [
            payload.error,
            payload.message,
            payload.detail,
            payload.msg,
            data.error,
            data.message,
            data.detail,
            data.code,
            data.details
        ].map(function (value) {
            return typeof value === "string" ? value.trim() : "";
        }).filter(Boolean);
        return parts[0] || "";
    }

    function payloadIndicatesMissingResource(payload) {
        const detail = extractDeleteErrorDetail(payload).toLowerCase();
        return /\b404\b|not found|does not exist|resource.*missing/i.test(detail);
    }

    function payloadRejectsDeletion(payload) {
        if (!payload || typeof payload !== "object") {
            return false;
        }
        if (payload.success === false) {
            return true;
        }
        const data = payload.data && typeof payload.data === "object" ? payload.data : null;
        if (!data) {
            return false;
        }
        if (typeof data.status === "boolean") {
            return data.status === false;
        }
        if (typeof data.status === "string") {
            const normalized = data.status.trim().toLowerCase();
            if (!normalized) {
                return false;
            }
            return ["false", "failed", "error", "denied"].indexOf(normalized) !== -1;
        }
        return false;
    }

    function payloadAcceptsDeletion(payload) {
        if (!payload || typeof payload !== "object") {
            return false;
        }
        if (payloadIndicatesMissingResource(payload)) {
            return true;
        }
        if (payload.success === true) {
            return true;
        }
        const data = payload.data && typeof payload.data === "object" ? payload.data : null;
        if (!data) {
            return false;
        }
        if (typeof data.status === "boolean") {
            return data.status;
        }
        if (typeof data.status === "string") {
            return /^(true|ok|success|deleted)$/i.test(data.status.trim());
        }
        return false;
    }

    async function remoteSessionStillExists(settings, token, sessionId, signal) {
        try {
            const fetchResult = await fetchViaRoute(
                settings,
                settings.gateway_base_url + "/api/v2/chats/" + encodeURIComponent(sessionId),
                {
                    method: "GET",
                    headers: buildBrowserRequestHeaders(settings, token, true, "application/json")
                },
                signal
            );
            const payload = await parseJsonResponse(fetchResult.response);
            if (payloadIndicatesMissingResource(payload)) {
                return false;
            }
            if (payload && payload.success === true) {
                return true;
            }
            return null;
        } catch (error) {
            const message = error && error.message ? error.message : String(error || "");
            if (/\b404\b|not found|does not exist/i.test(message)) {
                return false;
            }
            return null;
        }
    }

    async function deleteRemoteSession(options) {
        const settings = normalizeAppSettings(options && options.settings);
        const sessionId = String(options && options.sessionId || "").trim();
        const signal = options && options.signal;

        if (!sessionId) {
            return {
                deleted: false,
                skipped: true,
                reason: "missing-session-id"
            };
        }

        async function requestDelete(token) {
            const headers = buildBrowserRequestHeaders(settings, token, true, "application/json");
            headers.origin = settings.gateway_base_url;
            headers.referer = settings.gateway_base_url + "/c/guest";

            const fetchResult = await fetchViaRoute(
                settings,
                settings.gateway_base_url + "/api/v2/chats/" + encodeURIComponent(sessionId),
                {
                    method: "DELETE",
                    headers: headers
                },
                signal
            );

            const statusCode = fetchResult.response.status;
            let payload = null;
            try {
                payload = await parseJsonResponse(fetchResult.response);
            } catch (_parseError) {
                payload = null;
            }

            if (payloadIndicatesMissingResource(payload)) {
                return {
                    deleted: true,
                    skipped: false,
                    sessionId: sessionId,
                    routeLabel: fetchResult.routeLabel,
                    statusCode: statusCode,
                    verified: true,
                    alreadyMissing: true
                };
            }

            const acceptedByPayload = payloadAcceptsDeletion(payload);
            const acceptedByStatus = statusCode >= 200 && statusCode < 300 && !payloadRejectsDeletion(payload);
            if (!acceptedByPayload && !acceptedByStatus) {
                const detail = extractDeleteErrorDetail(payload);
                throw new Error(detail || "Gateway reported remote chat deletion failed.");
            }

            let sawExistingState = false;
            for (let attempt = 0; attempt < 10; attempt += 1) {
                const stillExists = await remoteSessionStillExists(settings, token, sessionId, signal);
                if (stillExists === false) {
                    return {
                        deleted: true,
                        skipped: false,
                        sessionId: sessionId,
                        routeLabel: fetchResult.routeLabel,
                        statusCode: statusCode,
                        verified: true
                    };
                }
                if (stillExists === true) {
                    sawExistingState = true;
                }
                if (attempt < 9) {
                    await sleepWithSignal(Math.min(1200, 200 + (attempt * 150)), signal);
                }
            }

            if (sawExistingState) {
                throw new Error("Delete acknowledged but remote chat still exists.");
            }

            return {
                deleted: true,
                skipped: false,
                sessionId: sessionId,
                routeLabel: fetchResult.routeLabel,
                statusCode: statusCode,
                verified: false
            };
        }

        try {
            const token = await ensureGatewayToken(settings, signal);
            return await requestDelete(token);
        } catch (error) {
            const message = error && error.message ? error.message : String(error || "");
            if (!/\b401\b|unauthorized|access token|bearer/i.test(message)) {
                throw error;
            }
            const freshToken = await signInGateway(settings, signal);
            return requestDelete(freshToken);
        }
    }

    async function replayReplySmoothly(text, onUpdate, signal, metrics) {
        const step = text.length <= 180 ? 2 : text.length <= 480 ? 5 : text.length <= 1200 ? 10 : 16;
        for (let index = step; index < text.length; index += step) {
            if (signal && signal.aborted) {
                throw new DOMException("Aborted", "AbortError");
            }
            onUpdate({
                reply: text.slice(0, index),
                thinking: "",
                generatedImages: [],
                parser: "ui-live",
                state: "streaming"
            });
            metrics.liveUpdates += 1;
            await sleepWithSignal(10, signal);
        }
        onUpdate({
            reply: text,
            thinking: "",
            generatedImages: [],
            parser: "ui-live",
            state: "streaming"
        });
    }

    async function stopChatCompletion(options) {
        const settings = normalizeAppSettings(options && options.settings);
        const sessionId = String(options && options.sessionId || "").trim();
        const responseId = String(options && options.responseId || "").trim();
        const responseIdCandidates = (function () {
            const seen = new Set();
            const raw = [];
            if (Array.isArray(options && options.responseIds)) {
                raw.push.apply(raw, options.responseIds);
            }
            if (responseId) {
                raw.unshift(responseId);
            }
            return raw.map(function (value) {
                return String(value || "").trim();
            }).filter(function (value) {
                if (!value || seen.has(value)) {
                    return false;
                }
                seen.add(value);
                return true;
            });
        }());
        const signal = options && options.signal;

        if (!sessionId || !responseIdCandidates.length) {
            return {
                stopped: false,
                skipped: true,
                reason: !sessionId ? "missing-session-id" : "missing-response-id"
            };
        }

        function isUnauthorizedErrorMessage(message) {
            return /\b401\b|unauthorized|access token|bearer/i.test(String(message || ""));
        }

        function payloadRejectsStop(payload) {
            if (!payload || typeof payload !== "object") {
                return false;
            }

            const payloadStatus = typeof payload.status === "string"
                ? payload.status.trim().toLowerCase()
                : "";
            const data = payload.data && typeof payload.data === "object"
                ? payload.data
                : null;
            const dataStatus = data && typeof data.status === "string"
                ? data.status.trim().toLowerCase()
                : "";

            return payload.success === false
                || payload.status === false
                || payloadStatus === "false"
                || payloadStatus === "failed"
                || payloadStatus === "error"
                || payloadStatus === "denied"
                || (data && data.status === false)
                || dataStatus === "false"
                || dataStatus === "failed"
                || dataStatus === "error"
                || dataStatus === "denied";
        }

        async function requestStop(token, currentResponseId) {
            const fetchResult = await fetchViaRoute(
                settings,
                settings.gateway_base_url + "/api/v2/chat/completions/stop?chat_id=" + encodeURIComponent(sessionId),
                {
                    method: "POST",
                    headers: buildBrowserRequestHeaders(settings, token, true, "application/json", {
                        accept: "application/json, text/plain, */*"
                    }),
                    body: JSON.stringify({
                        chat_id: sessionId,
                        response_id: currentResponseId
                    })
                },
                signal
            );

            let payload = null;
            try {
                payload = await parseJsonResponse(fetchResult.response);
            } catch (_parseError) {
                payload = null;
            }

            if (payloadRejectsStop(payload)) {
                throw new Error(extractDeleteErrorDetail(payload) || "Gateway reported stop request failed.");
            }

            return {
                stopped: true,
                skipped: false,
                sessionId: sessionId,
                responseId: currentResponseId,
                attemptedResponseIds: responseIdCandidates,
                routeLabel: fetchResult.routeLabel,
                statusCode: fetchResult.response.status
            };
        }

        async function requestStopWithToken(token) {
            let lastError = null;

            for (let index = 0; index < responseIdCandidates.length; index += 1) {
                const candidate = responseIdCandidates[index];
                try {
                    return await requestStop(token, candidate);
                } catch (error) {
                    const message = error && error.message ? error.message : String(error || "");
                    if (isUnauthorizedErrorMessage(message)) {
                        throw error;
                    }
                    lastError = error;
                }
            }

            throw lastError || new Error("Unable to stop completion for any known response id.");
        }

        try {
            const token = await ensureGatewayToken(settings, signal);
            return await requestStopWithToken(token);
        } catch (error) {
            const message = error && error.message ? error.message : String(error || "");
            if (!isUnauthorizedErrorMessage(message)) {
                throw error;
            }
            const freshToken = await signInGateway(settings, signal);
            return requestStopWithToken(freshToken);
        }
    }

    async function readLiveResponse(response, requestStart, onUpdate, signal) {
        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        const isSseHeader = contentType.includes("event-stream");
        const metrics = {
            parser: "json",
            streamChunks: 0,
            streamBytes: 0,
            liveUpdates: 0,
            firstByteMs: null,
            responseBytes: 0,
            bodyReadMs: 0,
            parseMs: 0
        };

        if (!response.body) {
            const bodyStart = performance.now();
            const rawText = await response.text();
            const bodyEnd = performance.now();
            const parseStart = performance.now();
            const parsed = parseReply(rawText);
            await replayReplySmoothly(parsed.reply || "", onUpdate, signal, metrics);
            onUpdate({
                reply: parsed.reply || "",
                thinking: parsed.thinking || "",
                generatedImages: parsed.generatedImages || [],
                searchSources: parsed.searchSources || [],
                responseId: parsed.responseId || null,
                parentUserId: parsed.parentUserId || null,
                parser: parsed.parser + "-ui-live",
                phase: parsed.generatedImages && parsed.generatedImages.length
                    ? "image_gen"
                    : parsed.reply
                        ? "answer"
                        : parsed.thinking
                            ? "thinking"
                            : "",
                state: "streaming"
            });
            const parseEnd = performance.now();
            metrics.parser = parsed.parser + "-ui-live";
            metrics.responseBytes = rawText.length;
            metrics.bodyReadMs = bodyEnd - bodyStart;
            metrics.parseMs = parseEnd - parseStart;
            return {
                parsed: parsed,
                metrics: metrics
            };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const streamState = {
            reply: "",
            thinking: "",
            generatedImages: [],
            searchSources: [],
            responseId: null,
            parentUserId: null,
            eventsParsed: 0,
            answerChunks: 0,
            phase: ""
        };
        let rawText = "";
        let pending = "";
        let detectedSse = false;
        const bodyStart = performance.now();
        const parseStart = performance.now();

        while (true) {
            const chunk = await reader.read();
            if (chunk.done) {
                break;
            }
            if (metrics.firstByteMs == null) {
                metrics.firstByteMs = performance.now() - requestStart;
            }
            metrics.streamChunks += 1;
            metrics.streamBytes += chunk.value.byteLength;
            const decoded = decoder.decode(chunk.value, { stream: true });
            rawText += decoded;
            pending += decoded;

            if (!isSseHeader && !pending.includes("data:")) {
                continue;
            }

            const lines = pending.split(/\r?\n/);
            pending = lines.pop() || "";
            lines.forEach(function (rawLine) {
                const line = rawLine.trim();
                if (!line.startsWith("data:")) {
                    return;
                }
                detectedSse = true;
                const changed = parseSseDataLine(line.slice(5).trim(), streamState);
                if (changed) {
                    onUpdate({
                        reply: streamState.reply,
                        thinking: streamState.thinking,
                        generatedImages: streamState.generatedImages,
                        searchSources: streamState.searchSources,
                        responseId: streamState.responseId,
                        parentUserId: streamState.parentUserId,
                        parser: "sse-live",
                        phase: streamState.phase || (streamState.reply ? "answer" : streamState.thinking ? "thinking" : ""),
                        state: "streaming"
                    });
                    metrics.liveUpdates += 1;
                }
            });
        }

        const tail = decoder.decode();
        if (tail) {
            rawText += tail;
            pending += tail;
        }

        if ((isSseHeader || detectedSse || pending.includes("data:")) && pending.trim()) {
            pending.split(/\r?\n/).forEach(function (rawLine) {
                const line = rawLine.trim();
                if (!line.startsWith("data:")) {
                    return;
                }
                const changed = parseSseDataLine(line.slice(5).trim(), streamState);
                if (changed) {
                    onUpdate({
                        reply: streamState.reply,
                        thinking: streamState.thinking,
                        generatedImages: streamState.generatedImages,
                        searchSources: streamState.searchSources,
                        responseId: streamState.responseId,
                        parentUserId: streamState.parentUserId,
                        parser: "sse-live",
                        phase: streamState.phase || (streamState.reply ? "answer" : streamState.thinking ? "thinking" : ""),
                        state: "streaming"
                    });
                    metrics.liveUpdates += 1;
                }
            });
        }

        const bodyEnd = performance.now();
        metrics.responseBytes = rawText.length;
        metrics.bodyReadMs = bodyEnd - bodyStart;

        const fullyParsed = parseReply(rawText);
        let parsed;
        const hasStreamOutput = Boolean(streamState.reply.trim() || streamState.thinking.trim() || (streamState.generatedImages && streamState.generatedImages.length));
        if (hasStreamOutput) {
            const liveReply = streamState.reply.trim();
            const liveThinking = streamState.thinking.trim();
            const liveGeneratedImages = uniqueGeneratedImages(streamState.generatedImages || []);
            const liveSearchSources = uniqueSearchSources(streamState.searchSources || []);
            const recoveredReply = fullyParsed.reply && fullyParsed.reply !== "No response text found."
                ? fullyParsed.reply.trim()
                : "";
            const recoveredThinking = fullyParsed.thinking ? fullyParsed.thinking.trim() : "";
            const recoveredGeneratedImages = uniqueGeneratedImages(fullyParsed.generatedImages || []);
            const recoveredSearchSources = uniqueSearchSources(fullyParsed.searchSources || []);
            const usedRecovery = (!liveReply && recoveredReply)
                || (!liveThinking && recoveredThinking)
                || (!liveGeneratedImages.length && recoveredGeneratedImages.length)
                || (!liveSearchSources.length && recoveredSearchSources.length)
                || (!streamState.responseId && fullyParsed.responseId);
            parsed = {
                reply: liveReply || recoveredReply,
                thinking: liveThinking || recoveredThinking,
                generatedImages: liveGeneratedImages.length ? liveGeneratedImages : recoveredGeneratedImages,
                searchSources: liveSearchSources.length ? liveSearchSources : recoveredSearchSources,
                responseId: streamState.responseId || fullyParsed.responseId,
                parentUserId: streamState.parentUserId || fullyParsed.parentUserId,
                parser: usedRecovery ? "sse-live-recovered" : "sse-live",
                eventsParsed: streamState.eventsParsed,
                answerChunks: streamState.answerChunks
            };
            onUpdate({
                reply: parsed.reply,
                thinking: parsed.thinking,
                generatedImages: parsed.generatedImages,
                searchSources: parsed.searchSources || [],
                responseId: parsed.responseId || null,
                parentUserId: parsed.parentUserId || null,
                parser: "sse-live",
                phase: streamState.phase || (parsed.generatedImages && parsed.generatedImages.length ? "image_gen" : parsed.reply ? "answer" : parsed.thinking ? "thinking" : ""),
                state: "streaming"
            });
        } else {
            parsed = fullyParsed;
            if (parsed.reply) {
                await replayReplySmoothly(parsed.reply || "", onUpdate, signal, metrics);
                onUpdate({
                    reply: parsed.reply || "",
                    thinking: parsed.thinking || "",
                    generatedImages: parsed.generatedImages || [],
                    searchSources: parsed.searchSources || [],
                    responseId: parsed.responseId || null,
                    parentUserId: parsed.parentUserId || null,
                    parser: "ui-live",
                    phase: parsed.generatedImages && parsed.generatedImages.length
                        ? "image_gen"
                        : parsed.reply
                            ? "answer"
                            : parsed.thinking
                                ? "thinking"
                                : "",
                    state: "streaming"
                });
            } else if (parsed.generatedImages && parsed.generatedImages.length) {
                onUpdate({
                    reply: "",
                    thinking: "",
                    generatedImages: parsed.generatedImages,
                    searchSources: parsed.searchSources || [],
                    responseId: parsed.responseId || null,
                    parentUserId: parsed.parentUserId || null,
                    parser: "ui-live",
                    phase: "image_gen",
                    state: "streaming"
                });
            }
        }

        const parseEnd = performance.now();
        metrics.parser = parsed.parser;
        metrics.parseMs = parseEnd - parseStart;
        return {
            parsed: parsed,
            metrics: metrics
        };
    }

    function getGatewayCacheKey(email) {
        return "lumora:gateway-token:" + email;
    }

    function readCachedGatewayToken(email) {
        if (!email) {
            return "";
        }
        const key = getGatewayCacheKey(email);
        const entry = runtimeState.gatewayTokenCache[key];
        const token = entry && entry.token
            ? String(entry.token)
            : "";
        if (!token) {
            return "";
        }
        const expiry = Number(entry && entry.expiry) || utils.getTokenExpiry(token);
        if (!expiry || expiry <= Date.now() + 60 * 1000) {
            delete runtimeState.gatewayTokenCache[key];
            return "";
        }
        return token;
    }

    function storeGatewayToken(email, token) {
        if (!email || !token) {
            return;
        }
        const key = getGatewayCacheKey(email);
        runtimeState.gatewayTokenCache[key] = {
            token: token,
            expiry: utils.getTokenExpiry(token)
        };
    }

    function looksLikeSha256(value) {
        return /^[a-f0-9]{64}$/i.test(String(value || "").trim());
    }

    async function signInGateway(settings, signal) {
        const normalized = normalizeAppSettings(settings);
        if (!gatewayReady(normalized)) {
            throw new Error("Assistant runtime is not configured yet. Ask an admin to complete the gateway settings.");
        }

        const configuredToken = resolveConfiguredAccessToken(normalized);
        if (configuredToken) {
            return configuredToken;
        }

        const rawPassword = String(normalized.gateway_password_hash || "").trim();
        if (!normalized.gateway_email || !rawPassword) {
            throw new Error("No valid runtime token is available. Ask an admin to refresh the pool credentials.");
        }
        const passwordCandidates = [];
        if (rawPassword) {
            passwordCandidates.push(rawPassword);
            if (!looksLikeSha256(rawPassword) && typeof utils.sha256Hex === "function") {
                passwordCandidates.push(await utils.sha256Hex(rawPassword));
            }
        }

        const dedupedPasswords = passwordCandidates.filter(function (candidate, index) {
            return candidate && passwordCandidates.indexOf(candidate) === index;
        });

        let lastError = null;
        for (let index = 0; index < dedupedPasswords.length; index += 1) {
            const candidate = dedupedPasswords[index];
            try {
                const fetchResult = await fetchViaRoute(normalized, normalized.gateway_base_url + "/api/v1/auths/signin", {
                    method: "POST",
                    headers: {
                        accept: "application/json",
                        "content-type": "application/json"
                    },
                    body: JSON.stringify({
                        email: normalized.gateway_email,
                        password: candidate
                    })
                }, signal);
                const data = await parseJsonResponse(fetchResult.response);
                if (data && data.token) {
                    storeGatewayToken(normalized.gateway_email, data.token);
                    return data.token;
                }
                lastError = new Error("Gateway login succeeded but no access token was returned.");
            } catch (error) {
                lastError = error;
            }
        }

        if (lastError) {
            throw lastError;
        }
        throw new Error("Unable to sign in to the gateway runtime.");
    }

    async function ensureGatewayToken(settings, signal) {
        const normalized = normalizeAppSettings(settings);
        const configuredToken = resolveConfiguredAccessToken(normalized);
        if (configuredToken) {
            return configuredToken;
        }

        const cached = readCachedGatewayToken(normalized.gateway_email);
        if (cached) {
            return cached;
        }
        return signInGateway(normalized, signal);
    }

    async function loadModels(settings, signal) {
        const normalized = normalizeAppSettings(settings);
        const token = await ensureGatewayToken(normalized, signal);
        const fetchResult = await fetchViaRoute(normalized, normalized.gateway_base_url + "/api/models", {
            method: "GET",
            headers: buildBrowserRequestHeaders(normalized, token, true, "application/json")
        }, signal);
        const data = await parseJsonResponse(fetchResult.response);
        return (Array.isArray(data.data) ? data.data : []).map(function (model) {
            const capabilities = extractModelCapabilities(model);
            return {
                id: model.id || "",
                name: model.name || model.id || "",
                capabilities: capabilities,
                chat_types: capabilities.chat_types
            };
        }).filter(function (model) {
            return model.id;
        });
    }

    function buildFeatureConfig(settings, modeOverride, interactionMode, requestModel) {
        if (normalizeInteractionMode(interactionMode) === "image") {
            return {
                output_schema: "phase",
                thinking_enabled: false
            };
        }
        const resolvedMode = normalizeComposerMode(modeOverride, settings, requestModel);
        if (resolvedMode === "auto") {
            return {
                output_schema: "phase"
            };
        }
        const featureConfig = {
            output_schema: "phase",
            thinking_enabled: resolvedMode === "thinking"
        };
        if (featureConfig.thinking_enabled) {
            featureConfig.thinking_budget = Number(settings.thinking_budget) || DEFAULT_THINKING_BUDGET;
        }
        return featureConfig;
    }

    function modelSupportsVisualInput(modelId) {
        const value = String(modelId || "").toLowerCase();
        return value.indexOf("omni") !== -1
            || value.indexOf("-vl") !== -1
            || value.indexOf("qvq") !== -1
            || value.indexOf("vision") !== -1;
    }

    function normalizeAllowedModelIds(settings) {
        const seen = new Set();
        return (Array.isArray(settings && settings.allowed_models) ? settings.allowed_models : [])
            .map(function (entry) {
                return String(entry || "").trim();
            })
            .filter(function (modelId) {
                if (!modelId || seen.has(modelId)) {
                    return false;
                }
                seen.add(modelId);
                return true;
            });
    }

    function resolveEnabledModel(settings, preferredModel, optionsOverride) {
        const options = Object.assign({ requireImageCapable: false }, optionsOverride || {});
        const allowedModels = normalizeAllowedModelIds(settings);
        const fallbackModel = String(preferredModel || settings.default_model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

        if (!allowedModels.length) {
            return fallbackModel;
        }

        const preferred = String(preferredModel || "").trim();
        if (preferred && allowedModels.indexOf(preferred) !== -1) {
            if (!options.requireImageCapable || modelSupportsVisualInput(preferred)) {
                return preferred;
            }
        }

        if (options.requireImageCapable) {
            const imageCapableAllowed = allowedModels.find(modelSupportsVisualInput);
            if (imageCapableAllowed) {
                return imageCapableAllowed;
            }
        }

        return allowedModels[0];
    }

    function resolveRequestModel(settings, files, interactionMode, preferredModel) {
        if (normalizeInteractionMode(interactionMode) === "image") {
            return resolveEnabledModel(
                settings,
                String(preferredModel || settings.default_image_model || settings.default_model || DEFAULT_IMAGE_MODEL).trim() || DEFAULT_IMAGE_MODEL,
                { requireImageCapable: true }
            );
        }
        const configuredModel = resolveEnabledModel(
            settings,
            String(preferredModel || settings.default_model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
            { requireImageCapable: false }
        );
        const items = Array.isArray(files) ? files : [];
        const hasImage = items.some(function (file) {
            return String(file && file.type || "").toLowerCase() === "image";
        });
        if (!hasImage || modelSupportsVisualInput(configuredModel)) {
            return configuredModel;
        }
        const multimodalAllowedModel = normalizeAllowedModelIds(settings).find(modelSupportsVisualInput);
        return multimodalAllowedModel || configuredModel;
    }

    async function ensureRemoteSession(settings, thread, token, signal, requestModel, interactionMode) {
        const requestedChatType = normalizeInteractionMode(interactionMode) === "image"
            ? "t2i"
            : "t2t";
        const existingSessionId = thread && typeof thread.remote_session_id === "string"
            ? thread.remote_session_id.trim()
            : "";

        // Keep a single remote thread/session for this local chat even if the user switches
        // between Ask (t2t) and Image (t2i), matching the expected Qwen conversation flow.
        if (existingSessionId) {
            return existingSessionId;
        }
        const payload = {
            title: thread.title || "New chat",
            models: [requestModel || settings.default_model || DEFAULT_MODEL],
            chat_mode: "normal",
            chat_type: requestedChatType,
            project_id: "",
            timestamp: Date.now()
        };
        const fetchResult = await fetchViaRoute(settings, settings.gateway_base_url + "/api/v2/chats/new", {
            method: "POST",
            headers: buildBrowserRequestHeaders(settings, token, true, "application/json"),
            body: JSON.stringify(payload)
        }, signal);
        const data = await parseJsonResponse(fetchResult.response);
        if (!(data && data.success && data.data && data.data.id)) {
            throw new Error("Unable to create a runtime session.");
        }
        return data.data.id;
    }

    function normalizeUploadedFile(file) {
        const item = file && typeof file === "object" ? file : {};
        const rawType = String(item.type || item.filetype || "file").trim().toLowerCase();
        return {
            index: Number.isFinite(Number(item.index)) ? Number(item.index) : null,
            id: String(item.id || item.file_id || "").trim(),
            file_id: String(item.file_id || item.id || "").trim(),
            url: String(item.url || item.file_url || "").trim(),
            file_url: String(item.file_url || item.url || "").trim(),
            name: String(item.name || item.filename || "Attachment").trim() || "Attachment",
            size: Number(item.size) || 0,
            type: rawType.indexOf("image/") === 0 ? "image" : rawType || "file",
            status: String(item.status || "uploaded").trim() || "uploaded"
        };
    }

    function detectUploadFileType(file) {
        const mime = file && typeof file.type === "string"
            ? file.type.toLowerCase()
            : "";
        return mime.startsWith("image/")
            ? "image"
            : "file";
    }

    function ensureOssClient() {
        if (typeof window === "undefined" || typeof window.OSS !== "function") {
            throw new Error("Attachment uploader is not ready yet. Refresh the page and try again.");
        }
        return window.OSS;
    }

    function normalizeOssRegion(region) {
        const value = String(region || "").trim();
        return value || "oss-ap-southeast-1";
    }

    function standardOssRegion(region) {
        const value = normalizeOssRegion(region);
        return value.indexOf("oss-") === 0
            ? value.slice(4)
            : value;
    }

    function formatOssIsoDate(date) {
        const value = date instanceof Date ? date : new Date();
        function pad(number) {
            return String(number).padStart(2, "0");
        }
        return String(value.getUTCFullYear())
            + pad(value.getUTCMonth() + 1)
            + pad(value.getUTCDate())
            + "T"
            + pad(value.getUTCHours())
            + pad(value.getUTCMinutes())
            + pad(value.getUTCSeconds())
            + "Z";
    }

    function buildOssCredential(accessKeyId, region, formattedDate) {
        const shortDate = String(formattedDate || "").split("T")[0];
        return [
            String(accessKeyId || "").trim(),
            shortDate,
            standardOssRegion(region),
            "oss",
            "aliyun_v4_request"
        ].join("/");
    }

    function encodePolicyBase64(policy) {
        const json = typeof policy === "string"
            ? policy
            : JSON.stringify(policy);
        return btoa(unescape(encodeURIComponent(json)));
    }

    function resolveOssUploadTargetUrl(client, targetPath) {
        const objectUrl = client.generateObjectUrl(String(targetPath || "").trim());
        const parsed = new URL(objectUrl);
        parsed.pathname = "/";
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString();
    }

    async function requestUploadTicket(settings, token, file, signal) {
        const payload = {
            filename: file && file.name ? file.name : "upload.bin",
            filesize: file && file.size ? file.size : 0,
            filetype: detectUploadFileType(file)
        };
        const fetchResult = await fetchViaRoute(settings, settings.gateway_base_url + "/api/v1/files/getstsToken", {
            method: "POST",
            headers: buildBrowserRequestHeaders(settings, token, true, "application/json"),
            body: JSON.stringify(payload)
        }, signal);
        const data = await parseJsonResponse(fetchResult.response);
        const requiredKeys = [
            "file_path",
            "file_url",
            "file_id",
            "access_key_id",
            "access_key_secret",
            "security_token",
            "bucketname",
            "region"
        ];
        const missingKey = requiredKeys.find(function (key) {
            return !data || typeof data[key] !== "string" || !String(data[key]).trim();
        });
        if (missingKey) {
            throw new Error("Upload ticket is incomplete (" + missingKey + ").");
        }
        return data;
    }

    async function uploadFileWithOss(file, uploadTicket) {
        const OSS = ensureOssClient();
        const client = new OSS({
            region: normalizeOssRegion(uploadTicket.region),
            accessKeyId: uploadTicket.access_key_id,
            accessKeySecret: uploadTicket.access_key_secret,
            stsToken: uploadTicket.security_token,
            bucket: uploadTicket.bucketname,
            secure: true
        });

        const targetPath = String(uploadTicket.file_path || "").trim();
        const targetUrl = resolveOssUploadTargetUrl(client, targetPath);
        const now = new Date();
        const formattedDate = formatOssIsoDate(now);
        const credential = buildOssCredential(
            uploadTicket.access_key_id,
            uploadTicket.region,
            formattedDate
        );
        const maxFileSize = Math.max(Number(file && file.size) || 1, 10 * 1024 * 1024);
        const policy = {
            expiration: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
            conditions: [
                { bucket: uploadTicket.bucketname },
                { "x-oss-credential": credential },
                { "x-oss-date": formattedDate },
                { "x-oss-signature-version": "OSS4-HMAC-SHA256" },
                ["content-length-range", 1, maxFileSize],
                ["eq", "$success_action_status", "200"],
                ["eq", "$key", targetPath]
            ]
        };
        if (file && file.type) {
            policy.conditions.push(["eq", "$Content-Type", file.type]);
        }
        if (uploadTicket.security_token) {
            policy.conditions.push({ "x-oss-security-token": uploadTicket.security_token });
        }

        const signature = client.signPostObjectPolicyV4(policy, now);
        const formData = new FormData();
        formData.append("key", targetPath);
        formData.append("Content-Type", file && file.type ? file.type : "application/octet-stream");
        formData.append("x-oss-date", formattedDate);
        formData.append("x-oss-credential", credential);
        formData.append("x-oss-signature-version", "OSS4-HMAC-SHA256");
        if (uploadTicket.security_token) {
            formData.append("x-oss-security-token", uploadTicket.security_token);
        }
        formData.append("policy", encodePolicyBase64(policy));
        formData.append("x-oss-signature", signature);
        formData.append("success_action_status", "200");
        formData.append("file", file, file && file.name ? file.name : "upload.bin");

        const requestOptions = {
            method: "POST",
            body: formData
        };
        if (typeof window !== "undefined" && window.location && window.location.protocol === "file:") {
            requestOptions.mode = "no-cors";
        }

        const response = await fetch(targetUrl, requestOptions);
        if (requestOptions.mode !== "no-cors" && !response.ok) {
            throw new Error("OSS upload failed with status " + response.status + ".");
        }

        return normalizeUploadedFile({
            id: uploadTicket.file_id,
            file_id: uploadTicket.file_id,
            name: file && file.name ? file.name : "upload.bin",
            size: file && file.size ? file.size : 0,
            type: detectUploadFileType(file),
            url: uploadTicket.file_url,
            file_url: uploadTicket.file_url,
            status: "uploaded"
        });
    }

    async function uploadFiles(options) {
        const files = Array.isArray(options && options.files) ? options.files.filter(Boolean) : [];
        const settings = normalizeAppSettings(options && options.settings);
        const signal = options && options.signal;

        if (!files.length) {
            return { files: [], errors: [] };
        }
        const token = await ensureGatewayToken(settings, signal);
        const uploaded = [];
        const errors = [];

        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            try {
                const uploadTicket = await requestUploadTicket(settings, token, file, signal);
                const uploadedFile = await uploadFileWithOss(file, uploadTicket);
                uploaded.push(Object.assign({ index: index }, uploadedFile));
            } catch (error) {
                errors.push({
                    index: index,
                    name: file && file.name ? file.name : "upload.bin",
                    type: detectUploadFileType(file),
                    status: "error",
                    error: error && error.message ? error.message : "Upload failed."
                });
            }
        }

        return { files: uploaded, errors: errors };
    }

    async function streamChat(options) {
        const settings = normalizeAppSettings(options.settings);
        const thread = options.thread || {};
        const files = Array.isArray(options.files) ? options.files.map(normalizeUploadedFile) : [];
        const interactionMode = normalizeInteractionMode(options.interactionMode);
        let prompt = String(options.prompt || "").trim();
        const onUpdate = typeof options.onUpdate === "function" ? options.onUpdate : function () {};
        const signal = options.signal;

        if (interactionMode === "chat" && !prompt && files.length) {
            prompt = files.some(function (file) {
                return String(file.type || "").toLowerCase() === "image";
            })
                ? "Please describe the attached image."
                : "Please review the attached file.";
        }

        if (!prompt && !(interactionMode === "chat" && files.length)) {
            throw new Error("Prompt is empty.");
        }
        if (interactionMode === "image" && files.length) {
            throw new Error("Attachments are only available in Ask mode right now.");
        }

        const token = await ensureGatewayToken(settings, signal);
        const requestModel = resolveRequestModel(
            settings,
            files,
            interactionMode,
            String(options.model || "").trim()
        );
        const activeBot = resolveActiveBot(settings, String(options.botId || "").trim());
        const mode = normalizeComposerMode(options.mode, settings, requestModel);
        const sessionId = await ensureRemoteSession(settings, thread, token, signal, requestModel, interactionMode);
        const chatType = interactionMode === "image" ? "t2i" : "t2t";

        // Expose the active remote session immediately so the UI can preserve
        // linkage even if the user stops before the first stream token arrives.
        onUpdate({
            reply: "",
            thinking: "",
            generatedImages: [],
            sessionId: sessionId,
            responseId: null,
            parentUserId: null,
            parser: "session-init",
            state: "streaming"
        });

        const regeneration = options && options.regeneration && typeof options.regeneration === "object"
            ? options.regeneration
            : null;
        const isRetry = Boolean(
            regeneration
            && normalizeInteractionMode(interactionMode) === "chat"
            && String(regeneration.qwenParentId || "").trim()
        );
        const parentId = thread.remote_session_id === sessionId
            && thread.remote_parent_id
            ? thread.remote_parent_id
            : null;
        const timestamp = Date.now();
        const messageId = isRetry
            ? String(regeneration.qwenParentId || "").trim()
            : utils.uid();
        const childId = utils.uid();
        const existingChildrenIds = isRetry
            ? normalizeRetryChildrenIds(regeneration.childrenIds)
            : [];
        const retryChildrenIds = isRetry
            ? normalizeRetryChildrenIds(existingChildrenIds.concat([childId]))
            : [];
        const requestTimestamp = isRetry && Number.isFinite(Number(regeneration.originalTimestamp))
            ? Number(regeneration.originalTimestamp)
            : timestamp;
        const requestStart = performance.now();
        const messagePayload = {
            fid: messageId,
            parentId: isRetry ? null : parentId,
            childrenIds: isRetry ? retryChildrenIds : [childId],
            role: "user",
            content: prompt,
            user_action: isRetry ? "retry" : "chat",
            files: files,
            timestamp: requestTimestamp,
            models: [requestModel],
            chat_type: chatType,
            feature_config: buildFeatureConfig(settings, mode, interactionMode, requestModel),
            extra: {
                meta: {
                    subChatType: chatType
                }
            },
            sub_chat_type: chatType,
            parent_id: isRetry ? null : parentId
        };

        if (isRetry) {
            // Test-9 contract: id must match qwen_parent fid.
            messagePayload.id = messageId;
        }

        const payload = {
            chat_id: sessionId,
            stream: true,
            version: "2.1",
            incremental_output: true,
            chat_mode: "normal",
            model: requestModel,
            parent_id: isRetry ? null : parentId,
            messages: [messagePayload],
            timestamp: timestamp
        };

        if (activeBot && activeBot.system_prompt) {
            payload.system_message = activeBot.system_prompt;
        }

        const fetchResult = await fetchViaRoute(
            settings,
            settings.gateway_base_url + "/api/v2/chat/completions?chat_id=" + encodeURIComponent(sessionId),
            {
                method: "POST",
                headers: buildBrowserRequestHeaders(settings, token, true, "application/json"),
                body: JSON.stringify(payload)
            },
            signal
        );

        const liveResult = await readLiveResponse(fetchResult.response, requestStart, function (payload) {
            const livePayload = payload && typeof payload === "object"
                ? payload
                : {};
            onUpdate(Object.assign({}, livePayload, {
                sessionId: sessionId,
                responseId: livePayload.responseId || null,
                parentUserId: livePayload.parentUserId || null
            }));
        }, signal);
        const parsed = liveResult.parsed;
        const metrics = liveResult.metrics;
        const totalMs = performance.now() - requestStart;

        return {
            reply: parsed.reply || "",
            thinking: parsed.thinking || "",
            generatedImages: uniqueGeneratedImages(parsed.generatedImages || []),
            searchSources: uniqueSearchSources(parsed.searchSources || []),
            requestModel: requestModel,
            botId: activeBot ? activeBot.id : "",
            botName: activeBot ? activeBot.name : "",
            mode: mode,
            interactionMode: interactionMode,
            chatType: chatType,
            sessionId: sessionId,
            parentId: parsed.responseId || parentId || null,
            trace: {
                route_label: fetchResult.routeLabel,
                user_action: isRetry ? "retry" : "chat",
                request_fid: messageId,
                request_timestamp: messagePayload.timestamp,
                response_id: parsed.responseId || null,
                qwen_parent_id: parsed.parentUserId || messageId,
                children_ids: isRetry
                    ? retryChildrenIds
                    : parsed.responseId
                        ? [parsed.responseId]
                        : [],
                message_total_ms: totalMs,
                header_ms: fetchResult.headerMs,
                first_byte_ms: metrics.firstByteMs,
                parse_ms: metrics.parseMs,
                body_read_ms: metrics.bodyReadMs,
                response_bytes: metrics.responseBytes,
                stream_bytes: metrics.streamBytes,
                stream_chunks: metrics.streamChunks,
                live_updates: metrics.liveUpdates,
                parser: metrics.parser,
                remote_chat_type: chatType,
                bot_id: activeBot ? activeBot.id : "",
                search_sources: uniqueSearchSources(parsed.searchSources || []),
                status_code: fetchResult.response.status,
                response_content_type: fetchResult.response.headers.get("content-type") || "unknown"
            }
        };
    }

    window.LumoraGateway = {
        normalizeAppSettings: normalizeAppSettings,
        gatewayReady: gatewayReady,
        ensureGatewayToken: ensureGatewayToken,
        loadModels: loadModels,
        uploadFiles: uploadFiles,
        streamChat: streamChat,
        stopChatCompletion: stopChatCompletion,
        fetchRemoteTitle: fetchRemoteTitle,
        deleteRemoteSession: deleteRemoteSession
    };
}());
