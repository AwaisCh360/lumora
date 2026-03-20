(function () {
    const auth = window.LumoraAuth;
    const client = auth.client;
    const gateway = window.LumoraGateway;
    const utils = window.Lumora.utils;
    const theme = window.Lumora.theme;
    let adminWorkspaceApi = window.LumoraAdminWorkspace;
    const markedLib = window.marked;
    const purify = window.DOMPurify;
    const ADMIN_WORKSPACE_SCRIPT_SRC = "scripts/admin-workspace.js?v=20260320-poolux10";
    const BOTTOM_THRESHOLD = 80;
    const THREAD_ROUTE_KEY = "thread";
    const NEW_ROUTE_KEY = "new";
    const SHARE_ROUTE_KEY = "share";
    const SHARE_TOKEN_ROUTE_KEY = "token";
    const DEFAULT_PREFERENCES = {
        sidebarCollapsed: false,
        activeView: "chat",
        threadMode: "bot",
        interactionMode: "chat",
        activeBotId: "",
        composerMode: null,
        enterToSend: true,
        showTimestamps: true,
        chatModelOverride: "",
        imageModelOverride: ""
    };
    const REMOTE_STOP_RETRY_DELAY_MS = 300;
    const REMOTE_STOP_MAX_ATTEMPTS = 7;

    const dom = {
        chatSidebar: document.getElementById("chat-sidebar"),
        sidebarToggleBtn: document.getElementById("sidebar-toggle-btn"),
        sidebarRailNewBtn: document.getElementById("sidebar-rail-new-btn"),
        sidebarRailBotsBtn: document.getElementById("sidebar-rail-bots-btn"),
        sidebarRailChatsBtn: document.getElementById("sidebar-rail-chats-btn"),
        sidebarRailSettingsBtn: document.getElementById("sidebar-rail-settings-btn"),
        sidebarRailAdminLink: document.getElementById("sidebar-rail-admin-link"),
        sidebarProfileBtn: document.getElementById("sidebar-profile-btn"),
        sidebarProfileAvatar: document.getElementById("sidebar-profile-avatar"),
        railProfileMenu: document.getElementById("rail-profile-menu"),
        railProfileName: document.getElementById("rail-profile-name"),
        railProfileEmail: document.getElementById("rail-profile-email"),
        railProfileSettingsBtn: document.getElementById("rail-profile-settings-btn"),
        railProfileLogoutBtn: document.getElementById("rail-profile-logout-btn"),
        botSection: document.getElementById("bot-section"),
        threadList: document.getElementById("thread-list"),
        threadCount: document.getElementById("thread-count"),
        botList: document.getElementById("bot-list"),
        botCount: document.getElementById("bot-count"),
        threadScopeCopy: document.getElementById("thread-scope-copy"),
        threadSearchInput: document.getElementById("thread-search-input"),
        newThreadBtn: document.getElementById("new-thread-btn"),
        threadMetaBadge: document.getElementById("thread-meta-badge"),
        threadTitle: document.getElementById("thread-title"),
        shareThreadBtn: document.getElementById("share-thread-btn"),
        chatStatusLine: document.getElementById("chat-status-line"),
        renameThreadBtn: document.getElementById("rename-thread-btn"),
        pinThreadBtn: document.getElementById("pin-thread-btn"),
        resetSessionBtn: document.getElementById("reset-session-btn"),
        regenerateReplyBtn: document.getElementById("regenerate-reply-btn"),
        exportThreadBtn: document.getElementById("export-thread-btn"),
        deleteThreadBtn: document.getElementById("delete-thread-btn"),
        profileName: document.getElementById("profile-name"),
        profileRole: document.getElementById("profile-role"),
        adminLink: document.getElementById("admin-link"),
        logoutBtn: document.getElementById("logout-btn"),
        welcomePanel: document.getElementById("welcome-panel"),
        welcomeTitle: document.getElementById("welcome-title"),
        welcomeCopy: document.getElementById("welcome-copy"),
        messages: document.getElementById("messages"),
        jumpLatestBtn: document.getElementById("jump-latest-btn"),
        chatView: document.getElementById("chat-view"),
        settingsView: document.getElementById("settings-view"),
        adminView: document.getElementById("admin-view"),
        embeddedAdminWorkspace: document.querySelector('[data-admin-workspace="embedded"]'),
        settingsBackBtn: document.getElementById("settings-back-btn"),
        profileSettingsForm: document.getElementById("profile-settings-form"),
        profileSettingsStatus: document.getElementById("profile-settings-status"),
        settingsDisplayName: document.getElementById("settings-display-name"),
        settingsEmail: document.getElementById("settings-email"),
        settingsSidebarStatus: document.getElementById("settings-sidebar-status"),
        settingsSidebarToggleBtn: document.getElementById("settings-sidebar-toggle-btn"),
        chatPreferencesForm: document.getElementById("chat-preferences-form"),
        preferencesSettingsStatus: document.getElementById("preferences-settings-status"),
        settingsEnterToSend: document.getElementById("settings-enter-to-send"),
        settingsShowTimestamps: document.getElementById("settings-show-timestamps"),
        clearChatsBtn: document.getElementById("clear-chats-btn"),
        chatMaintenanceStatus: document.getElementById("chat-maintenance-status"),
        resetPreferencesBtn: document.getElementById("reset-preferences-btn"),
        settingsLogoutBtn: document.getElementById("settings-logout-btn"),
        settingsAdminLink: document.getElementById("settings-admin-link"),
        accountSettingsStatus: document.getElementById("account-settings-status"),
        composerForm: document.getElementById("composer-form"),
        composerStatus: document.getElementById("composer-status"),
        connectionBadge: document.getElementById("connection-badge"),
        composerAttachments: document.getElementById("composer-attachments"),
        composerAttachBtn: document.getElementById("composer-attach-btn"),
        composerFileInput: document.getElementById("composer-file-input"),
        composerIntentToggle: document.getElementById("composer-intent-toggle"),
        composerChatModeBtn: document.getElementById("composer-chat-mode-btn"),
        composerImageModeBtn: document.getElementById("composer-image-mode-btn"),
        composerModelSelect: document.getElementById("composer-model-select"),
        composerModePicker: document.getElementById("composer-mode-picker"),
        composerModeTrigger: document.getElementById("composer-mode-trigger"),
        composerModeLabel: document.getElementById("composer-mode-label"),
        composerModeMenu: document.getElementById("composer-mode-menu"),
        composerMicBtn: document.getElementById("composer-mic-btn"),
        promptInput: document.getElementById("prompt-input"),
        promptCount: document.getElementById("prompt-count"),
        stopBtn: document.getElementById("stop-btn"),
        sendBtn: document.getElementById("send-btn"),
        toast: document.getElementById("toast")
    };

    const toast = utils.createNotifier(dom.toast);
    const state = {
        context: null,
        settings: null,
        runtimeGateway: null,
        threads: [],
        activeThreadId: null,
        openThreadMenuId: null,
        messages: [],
        threadQuery: "",
        busy: false,
        abortController: null,
        isAutoFollow: true,
        showJumpToLatest: false,
        lastMessagesScrollTop: 0,
        titleSourceSupported: true,
        threadBotIdSupported: true,
        preferences: Object.assign({}, DEFAULT_PREFERENCES),
        titleSyncing: {},
        adminWorkspace: null,
        composerModeMenuOpen: false,
        profileMenuOpen: false,
        reasoningExpanded: {},
        pendingAttachments: [],
        uploadingAttachments: [],
        latestRegeneratableAssistantId: "",
        visibleMessages: [],
        messageVariantMeta: {},
        messageTurnKeyById: {},
        turnVariantMembers: {},
        variantSelectionByTurn: {},
        sendInFlight: false,
        lastSendSignature: "",
        lastSendAt: 0,
        touchScrollStartTop: 0,
        remoteStopRetryTimerId: null,
        streamReveal: {
            timerId: null,
            messageId: null
        }
    };
    let adminWorkspaceLoadPromise = null;

    function loadScriptWithFreshQuery(baseSrc) {
        return new Promise(function (resolve, reject) {
            const src = String(baseSrc || "").trim();
            if (!src) {
                reject(new Error("Script source is missing."));
                return;
            }

            const fullSrc = src + (src.indexOf("?") === -1 ? "?" : "&") + "reload=" + Date.now();
            const script = document.createElement("script");
            script.src = fullSrc;
            script.async = false;
            script.onload = function () {
                resolve();
            };
            script.onerror = function () {
                reject(new Error("Failed to load " + src));
            };
            (document.head || document.body || document.documentElement).appendChild(script);
        });
    }

    async function ensureAdminWorkspaceApiLoaded() {
        adminWorkspaceApi = window.LumoraAdminWorkspace;
        if (adminWorkspaceApi && typeof adminWorkspaceApi.create === "function") {
            return adminWorkspaceApi;
        }

        if (!adminWorkspaceLoadPromise) {
            adminWorkspaceLoadPromise = loadScriptWithFreshQuery(ADMIN_WORKSPACE_SCRIPT_SRC)
                .then(function () {
                    adminWorkspaceApi = window.LumoraAdminWorkspace;
                    if (!adminWorkspaceApi || typeof adminWorkspaceApi.create !== "function") {
                        throw new Error("Admin workspace module is still unavailable after reload.");
                    }
                    return adminWorkspaceApi;
                })
                .finally(function () {
                    adminWorkspaceLoadPromise = null;
                });
        }

        return adminWorkspaceLoadPromise;
    }

    function configureMarkdown() {
        if (!markedLib || typeof markedLib.setOptions !== "function") {
            return;
        }
        markedLib.setOptions({
            gfm: true,
            breaks: true,
            mangle: false,
            headerIds: false
        });
    }

    function activeStorageKey() {
        const userId = state.context && state.context.user && state.context.user.id
            ? state.context.user.id
            : "guest";
        const botId = getEffectiveThreadBotId() || "assistant";
        return "active-thread:" + userId + ":" + botId;
    }

    function preferencesStorageKey() {
        return "chat-preferences:" + state.context.user.id;
    }

    function readPreferences() {
        const stored = utils.getStoredValue(preferencesStorageKey(), null) || {};
        state.preferences = Object.assign({}, DEFAULT_PREFERENCES, stored);
        if (["chat", "settings", "admin"].indexOf(state.preferences.activeView) === -1) {
            state.preferences.activeView = DEFAULT_PREFERENCES.activeView;
        }
        if (["normal", "bot"].indexOf(state.preferences.threadMode) === -1) {
            state.preferences.threadMode = DEFAULT_PREFERENCES.threadMode;
        }
        if (!isValidComposerMode(state.preferences.composerMode)) {
            state.preferences.composerMode = null;
        }
        if (!isValidInteractionMode(state.preferences.interactionMode)) {
            state.preferences.interactionMode = DEFAULT_PREFERENCES.interactionMode;
        }
        if (typeof state.preferences.chatModelOverride !== "string") {
            state.preferences.chatModelOverride = "";
        }
        if (typeof state.preferences.imageModelOverride !== "string") {
            state.preferences.imageModelOverride = "";
        }
        if (typeof state.preferences.activeBotId !== "string") {
            state.preferences.activeBotId = "";
        }
    }

    function persistPreferences() {
        utils.setStoredValue(preferencesStorageKey(), state.preferences);
    }

    function getChatRouteState() {
        const params = new URLSearchParams(window.location.search || "");
        return {
            threadId: String(params.get(THREAD_ROUTE_KEY) || "").trim(),
            forceNew: params.get(NEW_ROUTE_KEY) === "1",
            shareMode: params.get(SHARE_ROUTE_KEY) === "1",
            shareToken: String(params.get(SHARE_TOKEN_ROUTE_KEY) || "").trim()
        };
    }

    function replaceCurrentRouteUrl(url) {
        if (!window.history || typeof window.history.replaceState !== "function") {
            return;
        }
        window.history.replaceState({}, "", url.toString());
    }

    function syncThreadRoute(threadId, options) {
        const settings = Object.assign({
            shareMode: false,
            shareToken: ""
        }, options || {});
        const url = new URL(window.location.href);

        if (threadId) {
            url.searchParams.set(THREAD_ROUTE_KEY, String(threadId));
        } else {
            url.searchParams.delete(THREAD_ROUTE_KEY);
        }

        url.searchParams.delete(NEW_ROUTE_KEY);

        if (settings.shareMode && threadId) {
            url.searchParams.set(SHARE_ROUTE_KEY, "1");
            if (settings.shareToken) {
                url.searchParams.set(SHARE_TOKEN_ROUTE_KEY, String(settings.shareToken));
            } else {
                url.searchParams.delete(SHARE_TOKEN_ROUTE_KEY);
            }
        } else {
            url.searchParams.delete(SHARE_ROUTE_KEY);
            url.searchParams.delete(SHARE_TOKEN_ROUTE_KEY);
        }

        replaceCurrentRouteUrl(url);
    }

    function getThreadTrace(thread) {
        const trace = thread && thread.last_trace;
        return trace && typeof trace === "object"
            ? trace
            : {};
    }

    function getThreadShareMeta(thread) {
        const trace = getThreadTrace(thread);
        const share = trace._share;
        if (!share || typeof share !== "object") {
            return null;
        }
        return Object.assign({}, share);
    }

    function withPreservedShareTrace(thread, nextTrace) {
        const merged = nextTrace && typeof nextTrace === "object"
            ? Object.assign({}, nextTrace)
            : {};
        const shareMeta = getThreadShareMeta(thread);
        if (shareMeta && shareMeta.token_hash) {
            merged._share = shareMeta;
        }
        return merged;
    }

    function buildThreadShareTrace(thread, tokenHash) {
        const nowIso = new Date().toISOString();
        const currentTrace = getThreadTrace(thread);
        const currentShareMeta = getThreadShareMeta(thread) || {};
        const shareMeta = Object.assign({}, currentShareMeta, {
            token_hash: tokenHash,
            updated_at: nowIso,
            created_at: currentShareMeta.created_at || nowIso,
            created_by: state.context && state.context.user ? state.context.user.id : null,
            version: 1
        });
        return Object.assign({}, currentTrace, {
            _share: shareMeta
        });
    }

    function generateShareToken() {
        const bytes = new Uint8Array(18);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes)
            .map(function (value) {
                return value.toString(16).padStart(2, "0");
            })
            .join("");
    }

    function buildThreadShareUrl(threadId, token) {
        const url = new URL(window.location.href);
        url.searchParams.set(THREAD_ROUTE_KEY, String(threadId || "").trim());
        url.searchParams.set(SHARE_ROUTE_KEY, "1");
        url.searchParams.set(SHARE_TOKEN_ROUTE_KEY, String(token || "").trim());
        url.searchParams.delete(NEW_ROUTE_KEY);
        return url.toString();
    }

    async function isValidThreadShareToken(thread, token) {
        const shareMeta = getThreadShareMeta(thread);
        const expected = String(shareMeta && shareMeta.token_hash || "").trim();
        const provided = String(token || "").trim();
        if (!expected || !provided) {
            return false;
        }
        const providedHash = await utils.sha256Hex(provided);
        return providedHash === expected;
    }

    function profileInitials() {
        const source = state.context && state.context.profile && state.context.profile.display_name
            ? state.context.profile.display_name
            : state.context && state.context.user && state.context.user.email
                ? state.context.user.email
                : "User";
        return source
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map(function (part) {
                return part.charAt(0).toUpperCase();
            })
            .join("") || "U";
    }

    function setAppReady(isReady) {
        if (!document.body) {
            return;
        }
        document.body.classList.toggle("is-app-ready", Boolean(isReady));
    }

    function isValidComposerMode(mode) {
        return mode === "fast" || mode === "thinking" || mode === "auto";
    }

    function isValidInteractionMode(mode) {
        return mode === "chat" || mode === "image";
    }

    function getResolvedInteractionMode() {
        return isValidInteractionMode(state.preferences.interactionMode)
            ? state.preferences.interactionMode
            : DEFAULT_PREFERENCES.interactionMode;
    }

    function modelSupportsVisualInput(modelId) {
        const value = String(modelId || "").toLowerCase();
        return value.indexOf("omni") !== -1
            || value.indexOf("-vl") !== -1
            || value.indexOf("qvq") !== -1
            || value.indexOf("vision") !== -1;
    }

    function normalizeModelAliasMap(rawAliases) {
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

    function getModelDisplayName(modelId) {
        const normalizedId = String(modelId || "").trim();
        if (!normalizedId) {
            return "";
        }
        const aliases = normalizeModelAliasMap(state.settings && state.settings.model_aliases);
        const alias = String(aliases[normalizedId] || "").trim();
        return alias || normalizedId;
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
            ? "assistant"
            : "bot-" + String(fallbackIndex + 1);
    }

    function getAvailableBots() {
        const settings = state.settings || {};
        const source = Array.isArray(settings.bots)
            ? settings.bots
            : [];
        const seen = new Set();
        const bots = [];

        source.forEach(function (entry, index) {
            const value = entry && typeof entry === "object"
                ? entry
                : {};
            const baseId = normalizeBotId(value.id, index);
            let botId = baseId;
            let suffix = 2;
            while (seen.has(botId)) {
                botId = baseId + "-" + String(suffix);
                suffix += 1;
            }
            seen.add(botId);
            bots.push({
                id: botId,
                name: String(value.name || value.label || "").trim() || (index === 0 ? "Assistant" : ("Bot " + String(index + 1))),
                system_prompt: typeof value.system_prompt === "string"
                    ? value.system_prompt
                    : typeof value.prompt === "string"
                        ? value.prompt
                        : ""
            });
        });

        if (!bots.some(function (bot) { return bot.id === "assistant"; })) {
            bots.unshift({
                id: "assistant",
                name: "Assistant",
                system_prompt: ""
            });
        }

        return bots;
    }

    function getCustomBots() {
        const settings = state.settings || {};
        const source = Array.isArray(settings.bots)
            ? settings.bots
            : [];
        const seen = new Set();
        const bots = [];

        source.forEach(function (entry, index) {
            const value = entry && typeof entry === "object"
                ? entry
                : {};
            const baseId = normalizeBotId(value.id, index);
            let botId = baseId;
            let suffix = 2;
            while (seen.has(botId)) {
                botId = baseId + "-" + String(suffix);
                suffix += 1;
            }
            seen.add(botId);
            bots.push({
                id: botId,
                name: String(value.name || value.label || "").trim() || (index === 0 ? "Assistant" : ("Bot " + String(index + 1))),
                system_prompt: typeof value.system_prompt === "string"
                    ? value.system_prompt
                    : typeof value.prompt === "string"
                        ? value.prompt
                        : ""
            });
        });

        return bots;
    }

    function getResolvedThreadMode() {
        const preferred = String(state.preferences.threadMode || "").trim().toLowerCase();
        if (preferred === "bot" && getCustomBots().length) {
            return "bot";
        }
        return "normal";
    }

    function ensureThreadModePreference(optionsOverride) {
        const options = Object.assign({ persist: true }, optionsOverride || {});
        const resolvedMode = getResolvedThreadMode();
        if (state.preferences.threadMode === resolvedMode) {
            return resolvedMode;
        }
        state.preferences.threadMode = resolvedMode;
        if (options.persist) {
            persistPreferences();
        }
        return resolvedMode;
    }

    function getResolvedActiveBotId() {
        const bots = getCustomBots();
        if (!bots.length) {
            return "";
        }
        const preferred = String(state.preferences.activeBotId || "").trim();
        if (preferred && bots.some(function (bot) { return bot.id === preferred; })) {
            return preferred;
        }
        return bots[0].id;
    }

    function getEffectiveThreadBotId() {
        const mode = getResolvedThreadMode();
        if (mode === "normal") {
            return "assistant";
        }
        const botId = getResolvedActiveBotId();
        return botId || "assistant";
    }

    function getActiveBot() {
        const bots = getAvailableBots();
        if (!bots.length) {
            return null;
        }
        const activeId = getEffectiveThreadBotId();
        return bots.find(function (bot) {
            return bot.id === activeId;
        }) || bots[0];
    }

    function ensureActiveBotPreference(optionsOverride) {
        const options = Object.assign({ persist: true }, optionsOverride || {});
        const resolvedId = getResolvedActiveBotId();
        if (!resolvedId) {
            if (state.preferences.activeBotId) {
                state.preferences.activeBotId = "";
                if (options.persist) {
                    persistPreferences();
                }
            }
            return "";
        }
        if (resolvedId === state.preferences.activeBotId) {
            return resolvedId;
        }
        state.preferences.activeBotId = resolvedId;
        if (options.persist) {
            persistPreferences();
        }
        return resolvedId;
    }

    function setActiveBot(botId, optionsOverride) {
        const options = Object.assign({ persist: true }, optionsOverride || {});
        const requested = String(botId || "").trim();
        const bots = getCustomBots();
        if (!bots.length) {
            return false;
        }
        const match = bots.find(function (bot) {
            return bot.id === requested;
        }) || bots[0];
        if (!match) {
            return false;
        }
        if (state.preferences.activeBotId === match.id) {
            return false;
        }
        state.preferences.activeBotId = match.id;
        if (options.persist) {
            persistPreferences();
        }
        renderBotList();
        syncComposerControls();
        return true;
    }

    function setThreadMode(mode, optionsOverride) {
        const options = Object.assign({ persist: true }, optionsOverride || {});
        const requested = String(mode || "").trim().toLowerCase();
        const nextMode = requested === "bot" && getCustomBots().length
            ? "bot"
            : "normal";
        if (state.preferences.threadMode === nextMode) {
            return false;
        }
        state.preferences.threadMode = nextMode;
        if (options.persist) {
            persistPreferences();
        }
        applyShellState();
        return true;
    }

    async function switchToNormalChatContext(optionsOverride) {
        const options = Object.assign({ focusComposer: true }, optionsOverride || {});
        if (state.busy) {
            toast("Stop the current reply before switching chat mode.", "info");
            return;
        }

        setActiveView("chat", { focusComposer: options.focusComposer });
        const changedMode = setThreadMode("normal");
        if (!changedMode && state.preferences.activeView === "chat") {
            return;
        }

        state.threadQuery = "";
        if (dom.threadSearchInput) {
            dom.threadSearchInput.value = "";
        }

        syncThreadRoute(null);
        await loadThreads();
        await restoreInitialThreadSelection();
        renderPreferences();
    }

    async function switchToBotContext(botId) {
        if (state.busy) {
            toast("Stop the current reply before switching bots.", "info");
            return;
        }

        const hasCustomBots = getCustomBots().length > 0;
        if (!hasCustomBots) {
            toast("No custom bots yet. Create one in admin settings.", "info");
            return;
        }

        const previousMode = getResolvedThreadMode();
        const previousBotId = getResolvedActiveBotId();
        const changedBot = setActiveBot(botId);
        const changedMode = setThreadMode("bot");
        if (!changedBot && !changedMode) {
            return;
        }

        setActiveView("chat", { focusComposer: false });
        state.threadQuery = "";
        if (dom.threadSearchInput) {
            dom.threadSearchInput.value = "";
        }

        try {
            syncThreadRoute(null);
            await loadThreads();
            await restoreInitialThreadSelection();
            renderPreferences();
        } catch (error) {
            setThreadMode(previousMode);
            setActiveBot(previousBotId);
            throw error;
        }
    }

    function renderBotList() {
        const mode = getResolvedThreadMode();
        const bots = getCustomBots();
        const activeBotId = ensureActiveBotPreference({ persist: false });

        if (dom.botSection) {
            dom.botSection.hidden = false;
        }
        if (dom.botCount) {
            dom.botCount.textContent = String(bots.length);
        }

        if (!dom.botList) {
            return;
        }

        if (!bots.length) {
            dom.botList.innerHTML = '<div class="bot-list-empty">No custom bots yet. Create bots from admin settings.</div>';
            return;
        }

        dom.botList.innerHTML = bots.map(function (bot) {
            const activeClass = bot.id === activeBotId ? " is-active" : "";
            const activeLabel = bot.id === activeBotId
                ? "Active"
                : "Ready";
            return [
                '<button class="bot-card' + activeClass + '" type="button" data-bot-id="' + utils.escapeHtml(bot.id) + '">',
                '<span class="bot-card-head">',
                '<strong>' + utils.escapeHtml(bot.name) + '</strong>',
                '<span class="bot-card-state">' + utils.escapeHtml(activeLabel) + '</span>',
                '</span>',
                '</button>'
            ].join("");
        }).join("");
    }

    function renderThreadScopeCopy() {
        if (!dom.threadScopeCopy) {
            return;
        }
        const mode = getResolvedThreadMode();
        if (mode === "normal") {
            dom.threadScopeCopy.textContent = "Showing normal chats.";
            return;
        }
        const activeBot = getActiveBot();
        const activeBotLabel = activeBot && activeBot.name
            ? activeBot.name
            : "Assistant";
        dom.threadScopeCopy.textContent = "Showing chats for " + activeBotLabel + ".";
    }

    function handleBotListClick(event) {
        const trigger = event.target.closest("[data-bot-id]");
        if (!trigger) {
            return;
        }
        const botId = String(trigger.getAttribute("data-bot-id") || "").trim();
        if (!botId) {
            return;
        }
        switchToBotContext(botId)
            .then(function () {
                startNewChat();
            })
            .catch(function (error) {
                toast(error && error.message ? error.message : "Unable to switch bot threads right now.", "error");
            });
    }

    function handleBotRailClick() {
        if (state.busy) {
            return;
        }

        setActiveView("chat", { focusComposer: false });
        const bots = getCustomBots();
        if (!bots.length) {
            toast("No custom bots yet. Create one in admin settings.", "info");
            return;
        }

        const preferredBotId = ensureActiveBotPreference({ persist: true }) || bots[0].id;
        switchToBotContext(preferredBotId)
            .catch(function (error) {
                toast(error && error.message ? error.message : "Unable to open bot chats right now.", "error");
            });
    }

    function getEnabledModelIds() {
        const settings = state.settings || {};
        const sourceModels = Array.isArray(settings.allowed_models) && settings.allowed_models.length
            ? settings.allowed_models
            : [settings.default_model || "", settings.default_image_model || ""];
        const seen = new Set();
        return sourceModels.map(function (modelId) {
            return String(modelId || "").trim();
        }).filter(function (modelId) {
            if (!modelId || seen.has(modelId)) {
                return false;
            }
            seen.add(modelId);
            return true;
        });
    }

    function getDefaultModelForInteraction(interactionMode) {
        const settings = state.settings || {};
        if (interactionMode === "image") {
            return String(settings.default_image_model || settings.default_model || "").trim();
        }
        return String(settings.default_model || "").trim();
    }

    function getStoredModelOverride(interactionMode) {
        return interactionMode === "image"
            ? String(state.preferences.imageModelOverride || "").trim()
            : String(state.preferences.chatModelOverride || "").trim();
    }

    function setStoredModelOverride(interactionMode, modelId) {
        const nextValue = String(modelId || "").trim();
        if (interactionMode === "image") {
            state.preferences.imageModelOverride = nextValue;
        } else {
            state.preferences.chatModelOverride = nextValue;
        }
        persistPreferences();
    }

    function getSelectableModelsForInteraction(interactionMode) {
        const enabledModels = getEnabledModelIds();
        if (interactionMode !== "image") {
            return enabledModels;
        }
        const imageCapableModels = enabledModels.filter(modelSupportsVisualInput);
        return imageCapableModels.length
            ? imageCapableModels
            : enabledModels;
    }

    function resolveComposerSelectedModel(interactionMode) {
        const mode = isValidInteractionMode(interactionMode)
            ? interactionMode
            : getResolvedInteractionMode();
        const selectableModels = getSelectableModelsForInteraction(mode);
        const storedOverride = getStoredModelOverride(mode);
        if (storedOverride && selectableModels.indexOf(storedOverride) !== -1) {
            return storedOverride;
        }
        const preferredDefault = getDefaultModelForInteraction(mode);
        if (preferredDefault && selectableModels.indexOf(preferredDefault) !== -1) {
            return preferredDefault;
        }
        return selectableModels.length
            ? selectableModels[0]
            : preferredDefault;
    }

    function renderComposerModelSelect(interactionMode) {
        if (!dom.composerModelSelect) {
            return;
        }

        const mode = isValidInteractionMode(interactionMode)
            ? interactionMode
            : getResolvedInteractionMode();
        const selectableModels = getSelectableModelsForInteraction(mode);
        const preferredModel = resolveComposerSelectedModel(mode);

        if (!selectableModels.length) {
            dom.composerModelSelect.innerHTML = '<option value="">No enabled models</option>';
            dom.composerModelSelect.value = "";
            dom.composerModelSelect.disabled = true;
            dom.composerModelSelect.title = "No enabled models found in admin settings.";
            return;
        }

        dom.composerModelSelect.innerHTML = selectableModels.map(function (modelId) {
            const label = getModelDisplayName(modelId);
            return '<option value="' + utils.escapeHtml(modelId) + '">' + utils.escapeHtml(label || modelId) + "</option>";
        }).join("");

        dom.composerModelSelect.value = selectableModels.indexOf(preferredModel) !== -1
            ? preferredModel
            : selectableModels[0];
        dom.composerModelSelect.disabled = state.busy;
        dom.composerModelSelect.title = mode === "image"
            ? "Select enabled image model"
            : "Select enabled chat model";
    }

    function getSelectedComposerModel(interactionMode) {
        const mode = isValidInteractionMode(interactionMode)
            ? interactionMode
            : getResolvedInteractionMode();
        const selectableModels = getSelectableModelsForInteraction(mode);
        const selectedInControl = mode === getResolvedInteractionMode() && dom.composerModelSelect
            ? String(dom.composerModelSelect.value || "").trim()
            : "";
        if (selectedInControl && selectableModels.indexOf(selectedInControl) !== -1) {
            return selectedInControl;
        }
        return resolveComposerSelectedModel(mode);
    }

    function modelSupportsAutoMode(modelId) {
        return String(modelId || "").toLowerCase().indexOf("qwen3.5-plus") !== -1;
    }

    function getAvailableComposerModes(interactionMode, selectedModel) {
        const resolvedInteractionMode = isValidInteractionMode(interactionMode)
            ? interactionMode
            : getResolvedInteractionMode();
        const modes = ["fast", "thinking"];
        if (resolvedInteractionMode === "chat" && modelSupportsAutoMode(selectedModel)) {
            modes.push("auto");
        }
        return modes;
    }

    function getResolvedComposerMode(interactionMode, selectedModel, preferredMode) {
        const resolvedInteractionMode = isValidInteractionMode(interactionMode)
            ? interactionMode
            : getResolvedInteractionMode();
        const resolvedModel = String(selectedModel || getSelectedComposerModel(resolvedInteractionMode) || "").trim();
        const availableModes = getAvailableComposerModes(resolvedInteractionMode, resolvedModel);
        const candidateMode = isValidComposerMode(preferredMode)
            ? preferredMode
            : state.preferences.composerMode;

        if (isValidComposerMode(candidateMode) && availableModes.indexOf(candidateMode) !== -1) {
            return candidateMode;
        }

        const defaultMode = state.settings && state.settings.thinking_enabled
            ? "thinking"
            : "fast";
        if (availableModes.indexOf(defaultMode) !== -1) {
            return defaultMode;
        }
        return availableModes.length
            ? availableModes[0]
            : "fast";
    }

    function getComposerModeLabel(mode) {
        if (mode === "auto") {
            return "Auto";
        }
        return mode === "thinking"
            ? "Thinking"
            : "Fast";
    }

    function queuedAttachmentCount() {
        return state.pendingAttachments.length + state.uploadingAttachments.length;
    }

    function normalizeAttachmentDescriptor(descriptor) {
        const item = descriptor && typeof descriptor === "object" ? descriptor : {};
        const name = String(item.name || item.filename || "Attachment").trim() || "Attachment";
        const rawType = String(item.type || item.filetype || "").trim().toLowerCase();
        const type = rawType.indexOf("image/") === 0
            ? "image"
            : rawType;
        return {
            localId: String(item.localId || "att-" + utils.uid()),
            id: String(item.id || item.file_id || "").trim(),
            name: name,
            size: Number(item.size) || 0,
            type: type || "file",
            url: String(item.url || item.file_url || "").trim(),
            status: String(item.status || "uploaded").trim() || "uploaded",
            error: String(item.error || "").trim()
        };
    }

    function collectMessageAttachments(meta) {
        const items = meta && Array.isArray(meta.attachments) ? meta.attachments : [];
        return items.map(normalizeAttachmentDescriptor).filter(function (item) {
            return item.name;
        });
    }

    function activeUploadInProgress() {
        return state.uploadingAttachments.some(function (item) {
            return item.status === "uploading";
        });
    }

    function sendableAttachments() {
        return state.pendingAttachments
            .filter(function (item) {
                return item.status === "uploaded" && (item.id || item.url);
            })
            .map(function (item) {
                return {
                    localId: item.localId,
                    id: item.id,
                    file_id: item.id,
                    name: item.name,
                    size: item.size,
                    type: item.type,
                    url: item.url,
                    file_url: item.url,
                    status: "uploaded"
                };
            });
    }

    function buildAttachmentOnlyPrompt(files) {
        const items = Array.isArray(files) ? files : [];
        const hasImage = items.some(function (file) {
            return String(file.type || "").toLowerCase() === "image";
        });
        return hasImage
            ? "Please describe the attached image."
            : "Please review the attached file.";
    }

    function removeQueuedAttachment(localId) {
        const identifier = String(localId || "");
        state.pendingAttachments = state.pendingAttachments.filter(function (item) {
            return item.localId !== identifier;
        });
        state.uploadingAttachments = state.uploadingAttachments.filter(function (item) {
            return item.localId !== identifier;
        });
    }

    function setComposerModeMenuOpen(isOpen) {
        state.composerModeMenuOpen = Boolean(isOpen);
        if (!dom.composerModePicker || !dom.composerModeTrigger || !dom.composerModeMenu) {
            return;
        }
        dom.composerModePicker.dataset.open = state.composerModeMenuOpen ? "true" : "false";
        dom.composerModeTrigger.setAttribute("aria-expanded", state.composerModeMenuOpen ? "true" : "false");
        dom.composerModeMenu.hidden = !state.composerModeMenuOpen;
    }

    function syncComposerControls() {
        const interactionMode = getResolvedInteractionMode();
        renderComposerModelSelect(interactionMode);
        const selectedModel = getSelectedComposerModel(interactionMode);
        const availableModes = getAvailableComposerModes(interactionMode, selectedModel);
        const mode = getResolvedComposerMode(interactionMode, selectedModel);
        if (state.preferences.composerMode !== mode) {
            state.preferences.composerMode = mode;
            persistPreferences();
        }
        const hasPrompt = Boolean((dom.promptInput && dom.promptInput.value || "").trim());
        const hasQueuedAttachments = Boolean(sendableAttachments().length);
        const uploadsPending = activeUploadInProgress();
        const attachmentsBlocked = interactionMode === "image" && queuedAttachmentCount() > 0;
        const canSend = interactionMode === "image"
            ? hasPrompt && !attachmentsBlocked
            : hasPrompt || hasQueuedAttachments;

        if (dom.composerChatModeBtn && dom.composerImageModeBtn) {
            const isChat = interactionMode === "chat";
            dom.composerChatModeBtn.classList.toggle("is-active", isChat);
            dom.composerChatModeBtn.setAttribute("aria-selected", isChat ? "true" : "false");
            dom.composerImageModeBtn.classList.toggle("is-active", !isChat);
            dom.composerImageModeBtn.setAttribute("aria-selected", !isChat ? "true" : "false");
        }

        if (dom.composerModeLabel) {
            dom.composerModeLabel.textContent = getComposerModeLabel(mode);
        }

        if (dom.composerModeMenu) {
            dom.composerModeMenu.querySelectorAll("[data-composer-mode]").forEach(function (button) {
                const buttonMode = button.getAttribute("data-composer-mode");
                const isAvailable = availableModes.indexOf(buttonMode) !== -1;
                button.hidden = !isAvailable;
                button.disabled = !isAvailable;
                if (!isAvailable) {
                    button.classList.remove("is-active");
                    button.setAttribute("aria-checked", "false");
                    return;
                }
                const isActive = buttonMode === mode;
                button.classList.toggle("is-active", isActive);
                button.setAttribute("aria-checked", isActive ? "true" : "false");
            });
        }

        if (dom.composerModeTrigger) {
            dom.composerModeTrigger.disabled = state.busy || interactionMode !== "chat";
            dom.composerModeTrigger.setAttribute("title", "Response mode: " + getComposerModeLabel(mode));
        }

        if (dom.composerModePicker) {
            dom.composerModePicker.hidden = interactionMode !== "chat";
        }

        if (dom.composerAttachBtn) {
            dom.composerAttachBtn.disabled = state.busy || uploadsPending || interactionMode === "image";
            dom.composerAttachBtn.setAttribute("title", interactionMode === "image" ? "Attachments are available in Ask mode." : "Attach file");
        }

        if (dom.composerMicBtn) {
            dom.composerMicBtn.disabled = true;
        }

        if (dom.sendBtn) {
            dom.sendBtn.hidden = state.busy;
            dom.sendBtn.disabled = state.busy || uploadsPending || !canSend;
            dom.sendBtn.setAttribute("title", interactionMode === "image" ? "Generate image" : "Send message");
        }

        if (dom.stopBtn) {
            dom.stopBtn.hidden = !state.busy;
            dom.stopBtn.disabled = !state.busy;
        }
    }

    function setComposerMode(mode, options) {
        const mergedOptions = Object.assign({ persist: true }, options || {});
        const interactionMode = getResolvedInteractionMode();
        const selectedModel = getSelectedComposerModel(interactionMode);
        const availableModes = getAvailableComposerModes(interactionMode, selectedModel);
        if (!isValidComposerMode(mode) || availableModes.indexOf(mode) === -1) {
            return;
        }
        state.preferences.composerMode = mode;
        if (mergedOptions.persist) {
            persistPreferences();
        }
        setComposerModeMenuOpen(false);
        syncComposerControls();
    }

    function setInteractionMode(mode, options) {
        const mergedOptions = Object.assign({ persist: true }, options || {});
        if (!isValidInteractionMode(mode)) {
            return;
        }
        state.preferences.interactionMode = mode;
        if (mode === "image") {
            setComposerModeMenuOpen(false);
        }
        if (mergedOptions.persist) {
            persistPreferences();
        }
        syncComposerControls();
    }

    function setProfileMenuOpen(isOpen) {
        state.profileMenuOpen = Boolean(isOpen);
        if (!dom.railProfileMenu || !dom.sidebarProfileBtn) {
            return;
        }
        dom.railProfileMenu.hidden = !state.profileMenuOpen;
        dom.railProfileMenu.dataset.open = state.profileMenuOpen ? "true" : "false";
        dom.sidebarProfileBtn.classList.toggle("is-active", state.profileMenuOpen);
        dom.sidebarProfileBtn.setAttribute("aria-expanded", state.profileMenuOpen ? "true" : "false");
    }

    function setThreadMenuOpen(threadId) {
        state.openThreadMenuId = threadId ? String(threadId) : null;
        renderThreadList();
        if (state.openThreadMenuId) {
            requestAnimationFrame(updateOpenThreadMenuPlacement);
        }
    }

    function updateOpenThreadMenuPlacement() {
        if (!state.openThreadMenuId || !dom.threadList) {
            return;
        }

        const openCard = dom.threadList.querySelector(".thread-card.menu-open");
        if (!openCard) {
            return;
        }

        const menu = openCard.querySelector(".thread-menu");
        const trigger = openCard.querySelector(".thread-menu-trigger");
        if (!menu || !trigger || menu.hidden) {
            return;
        }

        menu.dataset.placement = "down";
        const listRect = dom.threadList.getBoundingClientRect();
        const triggerRect = trigger.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const spaceBelow = listRect.bottom - triggerRect.bottom;
        const spaceAbove = triggerRect.top - listRect.top;
        const requiredSpace = (menuRect.height || 0) + 10;

        if (spaceBelow < requiredSpace && spaceAbove > spaceBelow) {
            menu.dataset.placement = "up";
        }
    }

    function handleThreadListScroll() {
        if (state.openThreadMenuId) {
            updateOpenThreadMenuPlacement();
        }
    }

    function handleWindowResize() {
        if (state.openThreadMenuId) {
            updateOpenThreadMenuPlacement();
        }
    }

    function syncAppViews(activeView) {
        const views = [
            { key: "chat", node: dom.chatView },
            { key: "settings", node: dom.settingsView },
            { key: "admin", node: dom.adminView }
        ].filter(function (entry) {
            return entry.node;
        });

        views.forEach(function (entry) {
            const node = entry.node;
            const shouldShow = entry.key === activeView;
            node.hidden = !shouldShow;
            node.classList.toggle("is-active-view", shouldShow);
        });
    }

    function applyShellState() {
        document.body.dataset.sidebarCollapsed = state.preferences.sidebarCollapsed ? "true" : "false";

        const isSettingsView = state.preferences.activeView === "settings";
        const isAdminView = state.preferences.activeView === "admin";
        const isChatView = state.preferences.activeView === "chat";
        const threadMode = ensureThreadModePreference({ persist: false });
        syncAppViews(
            isSettingsView ? "settings" : isAdminView ? "admin" : "chat"
        );
        if (dom.sidebarRailChatsBtn) {
            dom.sidebarRailChatsBtn.classList.toggle("is-active", isChatView && threadMode === "normal");
        }
        if (dom.sidebarRailBotsBtn) {
            dom.sidebarRailBotsBtn.classList.toggle("is-active", isChatView && threadMode === "bot");
        }
        if (dom.botSection) {
            dom.botSection.hidden = threadMode !== "bot";
        }
        dom.sidebarRailSettingsBtn.classList.toggle("is-active", isSettingsView);
        dom.sidebarRailAdminLink.classList.toggle("is-active", isAdminView);
        dom.chatSidebar.setAttribute("data-collapsed", state.preferences.sidebarCollapsed ? "true" : "false");
        dom.sidebarToggleBtn.setAttribute("aria-expanded", state.preferences.sidebarCollapsed ? "false" : "true");
        dom.sidebarToggleBtn.setAttribute("title", state.preferences.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar");
        dom.sidebarToggleBtn.setAttribute("aria-label", state.preferences.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar");
        dom.sidebarToggleBtn.querySelector(".rail-glyph").textContent = state.preferences.sidebarCollapsed ? ">" : "<";
        dom.settingsSidebarStatus.textContent = state.preferences.sidebarCollapsed ? "Collapsed rail" : "Expanded layout";
        dom.settingsSidebarToggleBtn.textContent = state.preferences.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
        syncDocumentTitle();
        syncComposerControls();
    }

    function getThemeLabel(themeId) {
        const availableThemes = typeof theme.getAvailableThemes === "function"
            ? theme.getAvailableThemes()
            : [];
        const match = availableThemes.find(function (entry) {
            return entry.id === themeId;
        });
        return match ? match.label : String(themeId || "-");
    }

    function setChatFeedback(kind, copy) {
        const resolvedKind = kind || (gateway.gatewayReady(getGatewayRuntimeSettings()) ? "ready" : "setup");
        const badgeLabels = {
            ready: "Ready",
            setup: "Setup",
            idle: "Idle",
            sending: "Streaming",
            complete: "Complete",
            stopped: "Stopped",
            error: "Error",
            reset: "Reset"
        };
        dom.connectionBadge.dataset.state = resolvedKind;
        dom.connectionBadge.textContent = badgeLabels[resolvedKind] || "Ready";
        dom.composerStatus.textContent = copy || "Enter sends. Shift+Enter adds a new line.";
    }

    function setActiveView(view, options) {
        let nextView = "chat";
        if (view === "settings") {
            nextView = "settings";
        } else if (view === "admin" && state.context && state.context.profile.role === "admin") {
            nextView = "admin";
        }
        const mergedOptions = Object.assign({ persist: true, focusComposer: false }, options || {});
        state.preferences.activeView = nextView;
        setProfileMenuOpen(false);
        if (mergedOptions.persist) {
            persistPreferences();
        }
        applyShellState();
        if (mergedOptions.focusComposer && nextView === "chat") {
            requestAnimationFrame(function () {
                dom.promptInput.focus();
            });
        }
    }

    function setSidebarCollapsed(collapsed, options) {
        const mergedOptions = Object.assign({ persist: true }, options || {});
        state.preferences.sidebarCollapsed = Boolean(collapsed);
        if (mergedOptions.persist) {
            persistPreferences();
        }
        applyShellState();
    }

    function getActiveThread() {
        return state.threads.find(function (thread) {
            return thread.id === state.activeThreadId;
        }) || null;
    }

    function getBrandName() {
        if (state.settings && state.settings.brand_name) {
            return state.settings.brand_name;
        }
        const config = window.LumoraConfig || {};
        return config.defaults && config.defaults.brandName
            ? config.defaults.brandName
            : "Lumora";
    }

    function syncDocumentTitle() {
        if (state.preferences.activeView === "settings") {
            document.title = "Settings | " + getBrandName();
            return;
        }
        if (state.preferences.activeView === "admin") {
            document.title = "Admin | " + getBrandName();
            return;
        }
        const thread = getActiveThread();
        const prefix = thread && thread.title
            ? thread.title
            : "Chat";
        document.title = prefix + " | " + getBrandName();
    }

    function isNearBottom() {
        if (!dom.messages) {
            return true;
        }
        const remaining = dom.messages.scrollHeight - dom.messages.clientHeight - dom.messages.scrollTop;
        return remaining <= BOTTOM_THRESHOLD;
    }

    function renderJumpLatestButton() {
        if (!dom.jumpLatestBtn) {
            return;
        }
        dom.jumpLatestBtn.hidden = !state.showJumpToLatest;
    }

    function scrollMessagesToBottom(behavior) {
        if (!dom.messages) {
            return;
        }
        if (behavior === "smooth" && typeof dom.messages.scrollTo === "function") {
            dom.messages.scrollTo({
                top: dom.messages.scrollHeight,
                behavior: "smooth"
            });
            state.lastMessagesScrollTop = dom.messages.scrollHeight;
            return;
        }
        dom.messages.scrollTop = dom.messages.scrollHeight;
        state.lastMessagesScrollTop = dom.messages.scrollTop;
    }

    function detachAutoFollow() {
        state.isAutoFollow = false;
        state.showJumpToLatest = state.busy;
        renderJumpLatestButton();
    }

    function clearStreamRevealTimer() {
        if (state.streamReveal.timerId) {
            window.clearTimeout(state.streamReveal.timerId);
            state.streamReveal.timerId = null;
        }
    }

    function getStreamRevealInterval() {
        return 20;
    }

    function getRevealStepSize(remaining) {
        if (remaining > 480) {
            return 28;
        }
        if (remaining > 320) {
            return 22;
        }
        if (remaining > 180) {
            return 14;
        }
        if (remaining > 80) {
            return 8;
        }
        if (remaining > 24) {
            return 4;
        }
        return 2;
    }

    function computeRevealIndex(targetText, currentLength, stepSize) {
        let nextIndex = Math.min(targetText.length, currentLength + stepSize);
        const limit = Math.min(targetText.length, currentLength + stepSize + 12);

        while (
            nextIndex < limit &&
            nextIndex < targetText.length &&
            /\S/.test(targetText.charAt(nextIndex - 1)) &&
            /\S/.test(targetText.charAt(nextIndex))
        ) {
            nextIndex += 1;
        }

        return nextIndex;
    }

    function advanceStreamReveal(message) {
        if (!message || state.streamReveal.messageId !== message.id) {
            clearStreamRevealTimer();
            return;
        }

        const targetText = String(message.targetContent || "");
        const currentText = String(message.content || "");

        if (currentText === targetText) {
            clearStreamRevealTimer();
            return;
        }

        const remaining = targetText.length - currentText.length;
        const nextIndex = computeRevealIndex(
            targetText,
            currentText.length,
            getRevealStepSize(remaining)
        );

        message.content = targetText.slice(0, nextIndex);
        updateStreamingMessageElement(message);
        const shouldFollow = state.isAutoFollow;
        syncScrollAfterRender({
            forceFollow: shouldFollow,
            fromStream: !shouldFollow
        });

        state.streamReveal.timerId = window.setTimeout(function () {
            state.streamReveal.timerId = null;
            advanceStreamReveal(message);
        }, getStreamRevealInterval());
    }

    function scheduleStreamReveal(message, payload) {
        if (!message) {
            return;
        }

        const update = payload && typeof payload === "object" ? payload : {};
        const previousMeta = message.meta && typeof message.meta === "object"
            ? message.meta
            : {};
        const nextReply = String(update.reply || "");
        const nextThinking = String(update.thinking || "");
        const nextGeneratedImages = Array.isArray(update.generatedImages) ? update.generatedImages : [];
        const nextSearchSources = Array.isArray(update.searchSources)
            ? update.searchSources
            : Array.isArray(previousMeta.search_sources)
                ? previousMeta.search_sources
                : [];
        const nextResponseId = String(update.responseId || previousMeta.response_id || "").trim();
        const nextParentUserId = String(update.parentUserId || previousMeta.parent_user_id || "").trim();
        const nextSessionId = String(update.sessionId || previousMeta.session_id || "").trim();
        const previousReply = String(message.targetContent || message.content || "");
        const previousThinking = String(previousMeta.reasoning_text || "");
        const previousGeneratedImages = JSON.stringify(previousMeta.generated_images || []);
        const previousSearchSources = JSON.stringify(previousMeta.search_sources || []);

        message.targetContent = nextReply;
        message.meta = Object.assign({}, previousMeta, {
            state: "streaming",
            parser: update.parser || previousMeta.parser || "",
            phase: update.phase || (nextGeneratedImages.length ? "image_gen" : nextReply ? "answer" : nextThinking ? "thinking" : ""),
            mode: update.mode || previousMeta.mode || getResolvedComposerMode(),
            interaction_mode: update.interactionMode || previousMeta.interaction_mode || getResolvedInteractionMode(),
            generated_images: nextGeneratedImages,
            reasoning_text: nextThinking,
            search_sources: nextSearchSources,
            response_id: nextResponseId,
            parent_user_id: nextParentUserId,
            session_id: nextSessionId
        });

        if (state.streamReveal.messageId !== message.id) {
            clearStreamRevealTimer();
            state.streamReveal.messageId = message.id;
        }

        if (
            nextThinking !== previousThinking
            || nextReply === previousReply
            || JSON.stringify(nextGeneratedImages) !== previousGeneratedImages
            || JSON.stringify(nextSearchSources) !== previousSearchSources
        ) {
            updateStreamingMessageElement(message);
            syncScrollAfterRender({
                forceFollow: state.isAutoFollow,
                fromStream: !state.isAutoFollow
            });
        }

        if (nextReply !== previousReply && !state.streamReveal.timerId) {
            advanceStreamReveal(message);
        }
    }

    function finalizeStreamReveal(message, options) {
        const mergedOptions = Object.assign({
            flush: false
        }, options || {});

        if (!message) {
            return;
        }

        if (state.streamReveal.messageId === message.id) {
            clearStreamRevealTimer();
            state.streamReveal.messageId = null;
        }

        if (mergedOptions.flush && typeof message.targetContent === "string") {
            message.content = message.targetContent;
        }

        delete message.targetContent;
    }

    function enableAutoFollow(options) {
        const mergedOptions = Object.assign({
            scroll: false,
            behavior: "auto"
        }, options || {});
        state.isAutoFollow = true;
        state.showJumpToLatest = false;
        renderJumpLatestButton();
        if (mergedOptions.scroll) {
            requestAnimationFrame(function () {
                scrollMessagesToBottom(mergedOptions.behavior);
            });
        }
    }

    function syncScrollAfterRender(options) {
        const mergedOptions = Object.assign({
            forceFollow: false,
            fromStream: false
        }, options || {});

        requestAnimationFrame(function () {
            if (mergedOptions.forceFollow || state.isAutoFollow) {
                scrollMessagesToBottom();
                state.isAutoFollow = true;
                state.showJumpToLatest = false;
                renderJumpLatestButton();
                return;
            }

            if (mergedOptions.fromStream) {
                state.showJumpToLatest = true;
                renderJumpLatestButton();
            }
        });
    }

    function sortThreads(threads) {
        return threads.slice().sort(function (left, right) {
            if (Boolean(left.pinned) !== Boolean(right.pinned)) {
                return left.pinned ? -1 : 1;
            }
            return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
        });
    }

    function upsertThreadLocal(thread) {
        const normalized = normalizeThreadRecord(thread);
        const index = state.threads.findIndex(function (entry) {
            return entry.id === normalized.id;
        });
        if (index === -1) {
            state.threads.unshift(normalized);
        } else {
            state.threads[index] = normalized;
        }
        state.threads = sortThreads(state.threads);
    }

    function removeThreadLocal(threadId) {
        state.threads = state.threads.filter(function (thread) {
            return thread.id !== threadId;
        });
    }

    function isMissingTitleSourceError(error) {
        const message = error && error.message ? error.message : String(error || "");
        return /title_source/i.test(message) && /schema cache|column|could not find/i.test(message);
    }

    function isMissingThreadBotIdError(error) {
        const message = error && error.message ? error.message : String(error || "");
        return /bot_id/i.test(message) && /schema cache|column|could not find/i.test(message);
    }

    function getThreadBotId(thread) {
        const record = thread && typeof thread === "object"
            ? thread
            : {};
        const directBotId = String(record.bot_id || "").trim();
        if (directBotId) {
            return normalizeBotId(directBotId, 0);
        }
        const trace = getThreadTrace(record);
        const traceBotId = String(trace.bot_id || trace.botId || "").trim();
        if (traceBotId) {
            return normalizeBotId(traceBotId, 0);
        }
        return "assistant";
    }

    function normalizeThreadRecord(thread, fallbackSource) {
        const record = thread && typeof thread === "object"
            ? Object.assign({}, thread)
            : {};
        record.bot_id = getThreadBotId(record);
        if (!record.title_source) {
            record.title_source = fallbackSource || "local";
        }
        return record;
    }

    function normalizeThreadList(list) {
        return (Array.isArray(list) ? list : []).map(function (thread) {
            return normalizeThreadRecord(thread);
        });
    }

    function friendlyRuntimeError(error) {
        const message = error && error.message ? error.message : String(error);
        if (/configured|gateway settings|runtime is not configured/i.test(message)) {
            return "The assistant is not configured yet. Ask an admin to finish the chat runtime setup.";
        }
        if (/401|403|token|login|access token|bearer/i.test(message)) {
            return "The assistant runtime could not be authorized right now. Ask an admin to review the runtime settings.";
        }
        return message
            .replace(/qwen/ig, "assistant")
            .replace(/proxy/ig, "route");
    }

    function roleLabel(role) {
        if (role === "user") {
            return "You";
        }
        if (role === "system") {
            return "System";
        }
        if (role === "error") {
            return "Error";
        }
        return "Assistant";
    }

    function isSafeRichLinkHref(value) {
        const href = String(value || "").trim();
        if (!href) {
            return false;
        }
        if (href.startsWith("#") || href.startsWith("/") || href.startsWith("./") || href.startsWith("../") || href.startsWith("?")) {
            return true;
        }
        try {
            const parsed = new URL(href, window.location.href);
            return /^https?:$/i.test(parsed.protocol)
                || /^mailto:$/i.test(parsed.protocol)
                || /^tel:$/i.test(parsed.protocol);
        } catch (_error) {
            return false;
        }
    }

    function finalizeRichHtml(html) {
        const template = document.createElement("template");
        template.innerHTML = html;

        template.content.querySelectorAll("a").forEach(function (link) {
            const href = String(link.getAttribute("href") || "").trim();
            if (href && !isSafeRichLinkHref(href)) {
                link.removeAttribute("href");
            }
            if (!link.getAttribute("href")) {
                link.removeAttribute("target");
                link.removeAttribute("rel");
                return;
            }
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
        });

        template.content.querySelectorAll("table").forEach(function (table) {
            if (table.parentElement && table.parentElement.classList.contains("markdown-table-wrap")) {
                return;
            }
            const wrapper = document.createElement("div");
            wrapper.className = "markdown-table-wrap";
            table.parentNode.insertBefore(wrapper, table);
            wrapper.appendChild(table);
        });

        template.content.querySelectorAll("pre").forEach(function (pre) {
            if (pre.parentElement && pre.parentElement.classList.contains("markdown-code-wrap")) {
                return;
            }
            const wrapper = document.createElement("div");
            wrapper.className = "markdown-code-wrap";

            const copyButton = document.createElement("button");
            copyButton.type = "button";
            copyButton.className = "markdown-code-copy-btn";
            copyButton.setAttribute("data-code-copy", "true");
            copyButton.setAttribute("aria-label", "Copy code block");
            copyButton.textContent = "Copy";

            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(copyButton);
            wrapper.appendChild(pre);
        });

        return template.innerHTML;
    }

    function escapeMarkdownHtml(source) {
        const placeholders = [];
        const marker = "__LUMORA_CODE_BLOCK__";
        let protectedSource = String(source || "")
            .replace(/```[\s\S]*?```/g, function (match) {
                const index = placeholders.push(match) - 1;
                return marker + index + "__";
            })
            .replace(/`[^`\n]+`/g, function (match) {
                const index = placeholders.push(match) - 1;
                return marker + index + "__";
            });

        protectedSource = protectedSource
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        return protectedSource.replace(new RegExp(marker + "(\\d+)__", "g"), function (_match, index) {
            return placeholders[Number(index)] || "";
        });
    }

    function renderMarkdownBlock(source) {
        const escapedSource = escapeMarkdownHtml(source);

        if (
            !markedLib
            || typeof markedLib.parse !== "function"
            || !purify
            || typeof purify.sanitize !== "function"
        ) {
            return utils.escapeHtml(source).replace(/\n/g, "<br>");
        }

        const rendered = markedLib.parse(escapedSource);
        const sanitized = purify.sanitize(rendered, { USE_PROFILES: { html: true } });

        return finalizeRichHtml(sanitized);
    }

    function renderPlaceholder(copy) {
        return '<div class="stream-placeholder">' + utils.escapeHtml(copy) + "</div>";
    }

    function normalizeInlineImageUrl(value) {
        return String(value || "")
            .trim()
            .replace(/^<|>$/g, "");
    }

    function looksLikeInlineImageUrl(value) {
        const rawUrl = normalizeInlineImageUrl(value);
        if (!rawUrl) {
            return false;
        }
        try {
            const parsed = new URL(rawUrl);
            if (!/^https?:$/i.test(parsed.protocol)) {
                return false;
            }
            const path = String(parsed.pathname || "");
            if (/\.(png|jpe?g|gif|webp|bmp|svg|avif)(?:$|\?)/i.test(path)) {
                return true;
            }
            const host = String(parsed.hostname || "").toLowerCase();
            const pathAndQuery = (String(parsed.pathname || "") + String(parsed.search || "")).toLowerCase();
            return /(?:aliyuncs|alibaba|alicdn|cdn|oss)/i.test(host)
                && /(?:image|img|jpg|jpeg|png|webp|gif|avif|x-oss-process)/i.test(pathAndQuery);
        } catch (_error) {
            return false;
        }
    }

    function extractInlineImageContent(content) {
        let nextContent = String(content || "");
        if (!nextContent.trim()) {
            return {
                body: "",
                images: []
            };
        }

        const found = [];
        function remember(url) {
            const normalized = normalizeInlineImageUrl(url);
            if (!looksLikeInlineImageUrl(normalized)) {
                return;
            }
            found.push({ url: normalized });
        }

        nextContent = nextContent.replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi, function (_match, url) {
            remember(url);
            return "";
        });

        nextContent = nextContent.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, function (_match, url) {
            remember(url);
            return "";
        });

        nextContent = nextContent
            .split(/\r?\n/)
            .filter(function (line) {
                const trimmed = line.trim();
                if (!trimmed) {
                    return true;
                }
                if (looksLikeInlineImageUrl(trimmed) && !/\s/.test(trimmed)) {
                    remember(trimmed);
                    return false;
                }
                return true;
            })
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        const seen = new Set();
        const images = found
            .map(function (item, index) {
                return normalizeGeneratedImageDescriptor(item, index);
            })
            .filter(function (item) {
                if (!item || !item.url || seen.has(item.url)) {
                    return false;
                }
                seen.add(item.url);
                return true;
            });

        return {
            body: nextContent,
            images: images
        };
    }

    function renderMessageBody(content, meta) {
        const inlineExtracted = extractInlineImageContent(content);
        const rawContent = injectSourceCitations(inlineExtracted.body, meta);
        if (!rawContent.trim()) {
            if ((meta && Array.isArray(meta.generated_images) && meta.generated_images.length) || inlineExtracted.images.length) {
                return "";
            }
            if (meta && meta.state === "streaming") {
                return renderPlaceholder(meta.interaction_mode === "image" ? "Generating image..." : "Generating response...");
            }
            return "";
        }
        return renderMarkdownBlock(rawContent);
    }

    function renderReasoningBody(content, meta) {
        const rawContent = String(content || "");
        if (!rawContent.trim()) {
            if (meta && meta.mode === "thinking" && meta.state === "streaming") {
                return renderPlaceholder("Thinking...");
            }
            return "";
        }
        return renderMarkdownBlock(rawContent);
    }

    function normalizeSearchSourceDescriptor(item, index) {
        const source = item && typeof item === "object"
            ? item
            : { url: item };
        const url = String(
            source.url
            || source.link
            || source.href
            || source.source_url
            || source.sourceUrl
            || source.uri
            || ""
        ).trim();
        if (!url) {
            return null;
        }

        let normalizedUrl = "";
        try {
            const parsed = new URL(url);
            if (!/^https?:$/i.test(parsed.protocol)) {
                return null;
            }
            normalizedUrl = parsed.toString();
        } catch (_error) {
            return null;
        }

        const title = String(
            source.title
            || source.name
            || source.site_name
            || source.siteName
            || source.host
            || source.domain
            || ""
        ).trim();

        return {
            url: normalizedUrl,
            title: title || "Source " + String((Number(index) || 0) + 1)
        };
    }

    function collectSearchSources(meta) {
        const value = meta && typeof meta === "object"
            ? meta
            : {};
        const candidates = [];
        if (Array.isArray(value.search_sources)) {
            candidates.push.apply(candidates, value.search_sources);
        }
        if (value.trace && typeof value.trace === "object" && Array.isArray(value.trace.search_sources)) {
            candidates.push.apply(candidates, value.trace.search_sources);
        }

        const seen = new Set();
        return candidates.map(function (item, index) {
            return normalizeSearchSourceDescriptor(item, index);
        }).filter(function (item) {
            if (!item || !item.url || seen.has(item.url)) {
                return false;
            }
            seen.add(item.url);
            return true;
        });
    }

    function isSearchPhase(phase) {
        const normalized = String(phase || "").trim().toLowerCase();
        if (!normalized) {
            return false;
        }
        return normalized.indexOf("search") !== -1
            || normalized.indexOf("retrieve") !== -1
            || normalized.indexOf("browse") !== -1;
    }

    function injectSourceCitations(content, meta) {
        const text = String(content || "");
        const sources = collectSearchSources(meta);
        if (!text || !sources.length) {
            return text;
        }

        return text.replace(/\[\[(\d+)\]\]/g, function (_match, indexText) {
            const sourceIndex = Number(indexText) - 1;
            if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sources.length) {
                return _match;
            }
            return "[" + String(indexText) + "](" + sources[sourceIndex].url + ")";
        });
    }

    function getSearchSourceHostLabel(url) {
        try {
            const parsed = new URL(String(url || ""));
            return String(parsed.hostname || "").replace(/^www\./i, "");
        } catch (_error) {
            return "";
        }
    }

    function renderSearchSourcesList(sources) {
        if (!Array.isArray(sources) || !sources.length) {
            return "";
        }

        return [
            '<ol class="search-sources-list">',
            sources.map(function (source, index) {
                const host = getSearchSourceHostLabel(source.url);
                const label = source.title || host || "Source " + String(index + 1);
                return [
                    '<li class="search-sources-item">',
                    '<a class="search-source-link" href="' + utils.escapeHtml(source.url) + '" target="_blank" rel="noopener noreferrer">' + utils.escapeHtml(label) + "</a>",
                    host
                        ? '<span class="search-source-host">' + utils.escapeHtml(host) + "</span>"
                        : "",
                    "</li>"
                ].join("");
            }).join(""),
            "</ol>"
        ].join("");
    }

    function renderSearchMarkup(message) {
        const meta = message && message.meta || {};
        const sources = collectSearchSources(meta);
        const isSearching = meta.state === "streaming" && isSearchPhase(meta.phase);
        if (!isSearching && !sources.length) {
            return "";
        }

        const label = isSearching
            ? "Searching..."
            : "Search Sources";
        const bodyHtml = sources.length
            ? renderSearchSourcesList(sources)
            : renderPlaceholder("Searching the web...");

        return [
            '<section class="thinking-block search-block is-open" data-search-block="' + utils.escapeHtml(message.id) + '">',
            '<button class="thinking-toggle search-toggle" type="button" disabled>',
            '<span class="thinking-toggle-copy">',
            '<span class="thinking-toggle-label">' + utils.escapeHtml(label) + "</span>",
            "</span>",
            isSearching
                ? '<span class="searching-pulse" aria-hidden="true"></span>'
                : "",
            "</button>",
            '<div class="thinking-panel search-panel">' + bodyHtml + "</div>",
            "</section>"
        ].join("");
    }

    function renderMessageAttachments(meta) {
        const attachments = collectMessageAttachments(meta);
        const chipAttachments = attachments.filter(function (item) {
            return item.type !== "image" || !item.url;
        });
        if (!chipAttachments.length) {
            return "";
        }
        return [
            '<div class="message-attachments">',
            chipAttachments.map(function (item) {
                const kind = item.type === "image" ? "Image" : "File";
                return [
                    '<div class="message-attachment-chip" title="' + utils.escapeHtml(item.name) + '">',
                    '<strong>' + utils.escapeHtml(item.name) + "</strong>",
                    '<span>' + utils.escapeHtml(kind) + "</span>",
                    "</div>"
                ].join("");
            }).join(""),
            "</div>"
        ].join("");
    }

    function normalizeGeneratedImageDescriptor(item, index) {
        const entry = item && typeof item === "object"
            ? item
            : { url: item };
        const url = String(entry.url || entry.file_url || "").trim();
        if (!url) {
            return null;
        }
        return {
            url: url,
            name: String(entry.name || "Generated image " + String(index + 1)).trim() || "Generated image " + String(index + 1),
            source: "generated"
        };
    }

    function collectInlineMedia(meta) {
        const attachments = collectMessageAttachments(meta).filter(function (item) {
            return item.type === "image" && item.url;
        }).map(function (item) {
            return {
                url: item.url,
                name: item.name || "Uploaded image",
                source: "attachment"
            };
        });
        const generatedImages = (meta && Array.isArray(meta.generated_images) ? meta.generated_images : [])
            .map(normalizeGeneratedImageDescriptor)
            .filter(Boolean);
        const inlineImages = extractInlineImageContent(meta && meta.raw_content || "").images;
        const seen = new Set();
        return attachments.concat(generatedImages, inlineImages).filter(function (item) {
            if (!item.url || seen.has(item.url)) {
                return false;
            }
            seen.add(item.url);
            return true;
        });
    }

    function renderMessageMedia(meta, content) {
        const metaWithContent = Object.assign({}, meta || {}, {
            raw_content: content
        });
        const mediaItems = collectInlineMedia(metaWithContent);
        if (!mediaItems.length) {
            return "";
        }
        return [
            '<div class="message-media-strip">',
            mediaItems.map(function (item, index) {
                const isGenerated = item.source === "generated";
                const label = isGenerated ? "Generated image" : "Image";
                const downloadName = item.name || "image-" + String(index + 1);
                return [
                    '<figure class="message-media-card' + (isGenerated ? " is-generated" : "") + '">',
                    '<a class="message-media-link' + (isGenerated ? " is-generated" : "") + '" href="' + utils.escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer" title="Open image">',
                    '<img class="message-media-image' + (isGenerated ? " is-generated" : "") + '" src="' + utils.escapeHtml(item.url) + '" alt="' + utils.escapeHtml(item.name || label) + '" loading="lazy">',
                    "</a>",
                    '<figcaption class="message-media-meta">',
                    '<div class="message-media-copy">',
                    '<strong>' + utils.escapeHtml(item.name || label) + "</strong>",
                    '<span>' + utils.escapeHtml(label) + "</span>",
                    "</div>",
                    '<div class="message-media-actions">',
                    '<a class="message-media-action" href="' + utils.escapeHtml(item.url) + '" target="_blank" rel="noopener noreferrer">Open</a>',
                    '<a class="message-media-action" href="' + utils.escapeHtml(item.url) + '" download="' + utils.escapeHtml(downloadName) + '">Download</a>',
                    "</div>",
                    "</figcaption>",
                    "</figure>"
                ].join("");
            }).join(""),
            "</div>"
        ].join("");
    }

    function renderThinkingMarkup(message) {
        const meta = message && message.meta || {};
        const showReasoning = (message.role || "assistant") === "assistant" && hasReasoningBlock(message);
        if (!showReasoning) {
            return "";
        }
        const reasoningOpen = isReasoningExpanded(message);
        return [
            '<section class="thinking-block' + (reasoningOpen ? " is-open" : "") + '" data-thinking-block="' + utils.escapeHtml(message.id) + '">',
            '<button class="thinking-toggle" type="button" data-thinking-toggle="' + utils.escapeHtml(message.id) + '" aria-expanded="' + (reasoningOpen ? "true" : "false") + '">',
            '<span class="thinking-toggle-copy">',
            '<span class="thinking-toggle-label">Thinking...</span>',
            "</span>",
            '<span class="thinking-toggle-icon" aria-hidden="true">',
            '<svg viewBox="0 0 20 20" role="presentation" focusable="false"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></svg>',
            "</span>",
            "</button>",
            '<div class="thinking-panel" data-thinking-panel="' + utils.escapeHtml(message.id) + '"' + (reasoningOpen ? "" : " hidden") + '>',
            '<div class="message-body thinking-body" data-thinking-body="' + utils.escapeHtml(message.id) + '">' + renderReasoningBody(meta.reasoning_text, meta) + "</div>",
            "</div>",
            "</section>"
        ].join("");
    }

    function hasReasoningBlock(message) {
        const meta = message && message.meta || {};
        const reasoningText = String(meta.reasoning_text || "");
        return Boolean(reasoningText.trim()) || (meta.mode === "thinking" && meta.state === "streaming");
    }

    function isReasoningExpanded(message) {
        return Boolean(state.reasoningExpanded[message.id]);
    }

    function getMessageMetaLine(message) {
        return state.preferences.showTimestamps
            ? roleLabel(message.role || "assistant") + " · " + utils.formatTime(message.created_at)
            : roleLabel(message.role || "assistant");
    }

    function renderMessageMarkup(message, variantMeta) {
        const role = message.role || "assistant";
        const meta = message.meta || {};
        const bodyHtml = renderMessageBody(message.content, meta);
        const mediaHtml = renderMessageMedia(meta, message.content);
        const attachmentsHtml = renderMessageAttachments(meta);
        const thinkingHtml = renderThinkingMarkup(message);
        const searchHtml = renderSearchMarkup(message);
        const streamingClass = meta.state === "streaming" ? " is-streaming" : "";
        const metaLine = getMessageMetaLine(message);
        const showRegenerateAction = isMessageRegeneratable(message);
        const messageActions = [];
        if (variantMeta && variantMeta.total > 1) {
            messageActions.push('<button type="button" class="message-version-nav" data-message-version-nav="' + utils.escapeHtml(message.id) + '" data-version-direction="prev"' + (variantMeta.index > 1 ? "" : " disabled") + ' aria-label="Show previous version">&lsaquo;</button>');
            messageActions.push('<span class="message-version-indicator" title="Response version">' + utils.escapeHtml(String(variantMeta.index) + "/" + String(variantMeta.total)) + "</span>");
            messageActions.push('<button type="button" class="message-version-nav" data-message-version-nav="' + utils.escapeHtml(message.id) + '" data-version-direction="next"' + (variantMeta.index < variantMeta.total ? "" : " disabled") + ' aria-label="Show next version">&rsaquo;</button>');
        }
        messageActions.push('<button type="button" data-message-copy="' + utils.escapeHtml(message.id) + '">Copy</button>');
        if (showRegenerateAction) {
            messageActions.push('<button type="button" class="message-action-regenerate" data-message-regenerate="' + utils.escapeHtml(message.id) + '">Regenerate</button>');
        }

        return [
            '<article class="message ' + utils.escapeHtml(role) + streamingClass + '" data-message-id="' + utils.escapeHtml(message.id) + '">',
            '<div class="message-head">',
            '<span class="message-meta">' + utils.escapeHtml(metaLine) + "</span>",
            "</div>",
            thinkingHtml,
            mediaHtml,
            attachmentsHtml,
            bodyHtml
                ? '<div class="message-body"><div class="message-body-inner" data-message-body="' + utils.escapeHtml(message.id) + '">' + bodyHtml + "</div></div>"
                : "",
            searchHtml,
            '<div class="message-actions">',
            messageActions.join(""),
            "</div>",
            "</article>"
        ].join("");
    }

    function findMessageElement(messageId) {
        if (!dom.messages || !messageId) {
            return null;
        }
        const nodes = dom.messages.querySelectorAll("[data-message-id]");
        for (let index = 0; index < nodes.length; index += 1) {
            if (nodes[index].getAttribute("data-message-id") === String(messageId)) {
                return nodes[index];
            }
        }
        return null;
    }

    function applyThinkingDisclosureState(article, message) {
        if (!article || !message) {
            return;
        }
        const block = article.querySelector('[data-thinking-block="' + String(message.id) + '"]');
        const panel = article.querySelector('[data-thinking-panel="' + String(message.id) + '"]');
        const toggle = article.querySelector('[data-thinking-toggle="' + String(message.id) + '"]');
        if (!block || !panel || !toggle) {
            return;
        }
        const isOpen = isReasoningExpanded(message);
        block.classList.toggle("is-open", isOpen);
        toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
        panel.hidden = !isOpen;
    }

    function upsertThinkingBlock(article, message) {
        if (!article) {
            return;
        }

        const meta = message && message.meta || {};
        const currentThinkingNode = article.querySelector(".thinking-block");

        if (!hasReasoningBlock(message)) {
            if (currentThinkingNode) {
                currentThinkingNode.remove();
            }
            return;
        }

        if (!currentThinkingNode) {
            const nextThinkingHtml = renderThinkingMarkup(message);
            if (!nextThinkingHtml) {
                return;
            }
            const template = document.createElement("template");
            template.innerHTML = nextThinkingHtml;
            const nextThinkingNode = template.content.firstElementChild;
            const messageHead = article.querySelector(".message-head");
            if (messageHead && nextThinkingNode) {
                messageHead.insertAdjacentElement("afterend", nextThinkingNode);
            }
            applyThinkingDisclosureState(article, message);
            return;
        }

        const blockId = String(message.id);
        const toggle = currentThinkingNode.querySelector(".thinking-toggle");
        const panel = currentThinkingNode.querySelector(".thinking-panel");
        const body = currentThinkingNode.querySelector(".thinking-body");

        currentThinkingNode.setAttribute("data-thinking-block", blockId);
        if (toggle) {
            toggle.setAttribute("data-thinking-toggle", blockId);
        }
        if (panel) {
            panel.setAttribute("data-thinking-panel", blockId);
        }
        if (body) {
            body.setAttribute("data-thinking-body", blockId);
            body.innerHTML = renderReasoningBody(meta.reasoning_text, meta);
        }

        applyThinkingDisclosureState(article, message);
    }

    function upsertSearchBlock(article, message) {
        if (!article) {
            return;
        }

        const currentSearchNode = article.querySelector(".search-block");
        const nextSearchHtml = renderSearchMarkup(message);
        if (!nextSearchHtml) {
            if (currentSearchNode) {
                currentSearchNode.remove();
            }
            return;
        }

        const template = document.createElement("template");
        template.innerHTML = nextSearchHtml;
        const nextSearchNode = template.content.firstElementChild;
        if (!nextSearchNode) {
            return;
        }

        if (currentSearchNode) {
            currentSearchNode.remove();
        }

        const messageBodyNode = article.querySelector(".message-body");
        if (messageBodyNode) {
            messageBodyNode.insertAdjacentElement("afterend", nextSearchNode);
            return;
        }

        const mediaNode = article.querySelector(".message-media-strip");
        if (mediaNode) {
            mediaNode.insertAdjacentElement("afterend", nextSearchNode);
            return;
        }

        const attachmentsNode = article.querySelector(".message-attachments");
        if (attachmentsNode) {
            attachmentsNode.insertAdjacentElement("afterend", nextSearchNode);
            return;
        }

        const thinkingNode = article.querySelector(".thinking-block");
        if (thinkingNode) {
            thinkingNode.insertAdjacentElement("afterend", nextSearchNode);
            return;
        }

        const actionsNode = article.querySelector(".message-actions");
        if (actionsNode) {
            actionsNode.insertAdjacentElement("beforebegin", nextSearchNode);
            return;
        }

        const messageHead = article.querySelector(".message-head");
        if (messageHead) {
            messageHead.insertAdjacentElement("afterend", nextSearchNode);
            return;
        }

        article.appendChild(nextSearchNode);
    }

    function updateStreamingMessageElement(message) {
        const article = findMessageElement(message && message.id);
        if (!article) {
            renderMessages();
            return;
        }
        const role = message.role || "assistant";
        const meta = message.meta || {};
        article.className = "message " + role + (meta.state === "streaming" ? " is-streaming" : "");

        const metaNode = article.querySelector(".message-meta");
        if (metaNode) {
            metaNode.textContent = getMessageMetaLine(message);
        }

        const nextBodyHtml = renderMessageBody(message.content, meta);
        const bodyNode = article.querySelector("[data-message-body]");
        if (nextBodyHtml) {
            if (bodyNode) {
                bodyNode.innerHTML = nextBodyHtml;
            } else {
                const template = document.createElement("template");
                template.innerHTML = '<div class="message-body"><div class="message-body-inner" data-message-body="' + utils.escapeHtml(message.id) + '">' + nextBodyHtml + "</div></div>";
                const nextBodyNode = template.content.firstElementChild;
                if (nextBodyNode) {
                    article.appendChild(nextBodyNode);
                }
            }
        } else if (bodyNode && bodyNode.parentElement) {
            bodyNode.parentElement.remove();
        }

        upsertThinkingBlock(article, message);

        const nextMediaHtml = renderMessageMedia(meta, message.content);
        const currentMediaNode = article.querySelector(".message-media-strip");
        const nextAttachmentHtml = renderMessageAttachments(meta);
        const currentAttachmentNode = article.querySelector(".message-attachments");
        const messageBody = article.querySelector(".message-body");
        if (nextMediaHtml) {
            const template = document.createElement("template");
            template.innerHTML = nextMediaHtml;
            const nextMediaNode = template.content.firstElementChild;
            if (currentMediaNode) {
                currentMediaNode.replaceWith(nextMediaNode);
            } else if (currentAttachmentNode && nextMediaNode) {
                currentAttachmentNode.insertAdjacentElement("beforebegin", nextMediaNode);
            } else if (messageBody && nextMediaNode) {
                messageBody.insertAdjacentElement("beforebegin", nextMediaNode);
            } else if (nextMediaNode) {
                article.appendChild(nextMediaNode);
            }
        } else if (currentMediaNode) {
            currentMediaNode.remove();
        }

        if (nextAttachmentHtml) {
            const template = document.createElement("template");
            template.innerHTML = nextAttachmentHtml;
            const nextAttachmentNode = template.content.firstElementChild;
            if (currentAttachmentNode) {
                currentAttachmentNode.replaceWith(nextAttachmentNode);
            } else if (messageBody && nextAttachmentNode) {
                messageBody.insertAdjacentElement("beforebegin", nextAttachmentNode);
            } else if (nextAttachmentNode) {
                article.appendChild(nextAttachmentNode);
            }
        } else if (currentAttachmentNode) {
            currentAttachmentNode.remove();
        }

        upsertSearchBlock(article, message);
    }

    async function fetchAppSettings() {
        const result = await client
            .from("app_settings")
            .select("*")
            .eq("id", "global")
            .maybeSingle();

        if (result.error) {
            throw new Error(result.error.message || "Unable to load workspace settings.");
        }

        return gateway.normalizeAppSettings(result.data || {});
    }

    function normalizeRuntimeGatewayCredentials(value) {
        const row = value && typeof value === "object" ? value : {};
        const assignmentSource = String(
            row.gateway_assignment_source
            || row.assignment_source
            || ""
        ).trim();
        const poolId = String(
            row.gateway_pool_id
            || row.pool_id
            || ""
        ).trim();
        const poolLabel = String(
            row.gateway_pool_label
            || row.pool_label
            || ""
        ).trim();
        const gatewayEmail = String(row.gateway_email || "").trim();
        const gatewayPasswordHash = String(row.gateway_password_hash || "").trim();
        const gatewayAccessToken = String(
            row.gateway_access_token
            || row.access_token
            || ""
        ).trim();

        return {
            gateway_email: gatewayEmail,
            gateway_password_hash: gatewayPasswordHash,
            gateway_access_token: gatewayAccessToken,
            gateway_token_expiry: row.gateway_token_expiry || row.token_expiry || null,
            gateway_pool_id: poolId,
            gateway_pool_label: poolLabel,
            gateway_assignment_source: assignmentSource,
            gateway_assigned_users: Number(row.assigned_users || row.gateway_assigned_users || 0) || 0,
            gateway_pool_capacity: Number(row.max_users || row.gateway_pool_capacity || 0) || 0
        };
    }

    function getGatewayRuntimeSettings() {
        const baseSettings = state.settings
            ? Object.assign({}, state.settings)
            : {};
        const runtime = state.runtimeGateway;
        if (!runtime) {
            return baseSettings;
        }

        if (runtime.gateway_email) {
            baseSettings.gateway_email = runtime.gateway_email;
        }
        if (runtime.gateway_password_hash) {
            baseSettings.gateway_password_hash = runtime.gateway_password_hash;
        }
        if (runtime.gateway_access_token) {
            baseSettings.gateway_access_token = runtime.gateway_access_token;
        }
        if (runtime.gateway_token_expiry) {
            baseSettings.gateway_token_expiry = runtime.gateway_token_expiry;
        }
        if (runtime.gateway_pool_id) {
            baseSettings.gateway_pool_id = runtime.gateway_pool_id;
        }
        if (runtime.gateway_pool_label) {
            baseSettings.gateway_pool_label = runtime.gateway_pool_label;
        }
        if (runtime.gateway_assignment_source) {
            baseSettings.gateway_assignment_source = runtime.gateway_assignment_source;
        }
        if (runtime.gateway_assigned_users) {
            baseSettings.gateway_assigned_users = runtime.gateway_assigned_users;
        }
        if (runtime.gateway_pool_capacity) {
            baseSettings.gateway_pool_capacity = runtime.gateway_pool_capacity;
        }

        return baseSettings;
    }

    async function refreshRuntimeGatewayCredentials(optionsOverride) {
        const options = Object.assign({
            silent: false
        }, optionsOverride || {});

        if (!state.context || !state.context.user || !state.context.user.id) {
            state.runtimeGateway = null;
            return null;
        }

        const rpcResult = await client.rpc("resolve_gateway_runtime_credentials", {
            target_user_id: state.context.user.id
        });

        if (rpcResult.error) {
            const message = String(rpcResult.error.message || "");
            if (/resolve_gateway_runtime_credentials|does not exist|schema cache|function/i.test(message)) {
                state.runtimeGateway = null;
                return null;
            }
            if (!options.silent) {
                throw new Error(message || "Unable to resolve runtime credentials.");
            }
            return state.runtimeGateway;
        }

        const row = Array.isArray(rpcResult.data)
            ? rpcResult.data[0]
            : rpcResult.data;
        state.runtimeGateway = row
            ? normalizeRuntimeGatewayCredentials(row)
            : null;
        return state.runtimeGateway;
    }

    async function loadThreads() {
        ensureThreadModePreference({ persist: false });
        const activeBotId = getEffectiveThreadBotId() || "assistant";
        let query = client
            .from("chat_threads")
            .select("*")
            .eq("owner_id", state.context.user.id);
        if (state.threadBotIdSupported !== false) {
            query = query.eq("bot_id", activeBotId);
        }
        let result = await query
            .order("pinned", { ascending: false })
            .order("updated_at", { ascending: false });

        if (result.error && state.threadBotIdSupported !== false && isMissingThreadBotIdError(result.error)) {
            state.threadBotIdSupported = false;
            result = await client
                .from("chat_threads")
                .select("*")
                .eq("owner_id", state.context.user.id)
                .order("pinned", { ascending: false })
                .order("updated_at", { ascending: false });
        }

        if (result.error) {
            throw new Error(result.error.message || "Unable to load your threads.");
        }

        let nextThreads = normalizeThreadList(result.data);
        if (state.threadBotIdSupported === false) {
            nextThreads = nextThreads.filter(function (thread) {
                return getThreadBotId(thread) === activeBotId;
            });
        }

        state.threads = nextThreads;
        renderThreadList();
    }

    async function restoreInitialThreadSelection() {
        const routeState = getChatRouteState();
        const storedThreadId = String(utils.getStoredValue(activeStorageKey(), "") || "").trim();

        if (routeState.forceNew) {
            startNewChat();
            syncThreadRoute(null);
            return;
        }

        const preferredThreadId = routeState.threadId || storedThreadId;
        if (!preferredThreadId) {
            if (state.threads.length) {
                await setActiveThread(state.threads[0].id);
            } else {
                startNewChat();
            }
            return;
        }

        const targetThread = state.threads.find(function (thread) {
            return String(thread.id) === preferredThreadId;
        });

        if (!targetThread) {
            if (routeState.threadId) {
                toast("The requested chat is unavailable for this account.", "error");
                startNewChat();
                return;
            }
            if (state.threads.length) {
                await setActiveThread(state.threads[0].id);
            } else {
                startNewChat();
            }
            return;
        }

        if (routeState.shareMode) {
            const token = String(routeState.shareToken || "").trim();
            if (!token) {
                toast("Share token is missing from the link.", "error");
                startNewChat();
                return;
            }
            const hasValidToken = await isValidThreadShareToken(targetThread, token);
            if (!hasValidToken) {
                toast("Invalid share token for this chat.", "error");
                startNewChat();
                return;
            }
        }

        await setActiveThread(preferredThreadId);
    }

    async function loadMessages(threadId) {
        if (!threadId) {
            state.messages = [];
            state.reasoningExpanded = {};
            state.visibleMessages = [];
            state.messageVariantMeta = {};
            state.messageTurnKeyById = {};
            state.turnVariantMembers = {};
            state.variantSelectionByTurn = {};
            renderMessages();
            renderThreadState();
            enableAutoFollow();
            return;
        }

        const result = await client
            .from("chat_messages")
            .select("*")
            .eq("thread_id", threadId)
            .order("created_at", { ascending: true });

        if (result.error) {
            throw new Error(result.error.message || "Unable to load this conversation.");
        }

        state.messages = Array.isArray(result.data) ? result.data : [];
        state.reasoningExpanded = {};
        state.visibleMessages = [];
        state.messageVariantMeta = {};
        state.messageTurnKeyById = {};
        state.turnVariantMembers = {};
        state.variantSelectionByTurn = {};
        renderMessages();
        renderThreadState();
        enableAutoFollow({ scroll: true });
    }

    async function setActiveThread(threadId, options) {
        const settings = Object.assign({ skipLoad: false, syncRoute: true }, options || {});
        setComposerModeMenuOpen(false);
        state.openThreadMenuId = null;
        state.activeThreadId = threadId;
        utils.setStoredValue(activeStorageKey(), threadId);
        if (settings.syncRoute) {
            syncThreadRoute(threadId);
        }
        renderThreadList();
        renderThreadState();
        enableAutoFollow();
        if (settings.skipLoad) {
            return;
        }
        await loadMessages(threadId);
    }

    function updatePromptCount() {
        if (dom.promptCount) {
            dom.promptCount.textContent = dom.promptInput.value.length + " characters";
        }
        syncComposerControls();
    }

    function renderComposerAttachments() {
        if (!dom.composerAttachments) {
            return;
        }
        const items = state.uploadingAttachments.concat(state.pendingAttachments);
        if (!items.length) {
            dom.composerAttachments.hidden = true;
            dom.composerAttachments.innerHTML = "";
            syncComposerControls();
            return;
        }

        dom.composerAttachments.hidden = false;
        dom.composerAttachments.innerHTML = items.map(function (item) {
            const normalized = normalizeAttachmentDescriptor(item);
            const statusLabel = normalized.status === "uploading"
                ? "Uploading"
                : normalized.status === "error"
                    ? "Failed"
                    : normalized.type === "image"
                        ? "Image"
                        : "File";
            const title = normalized.error
                ? normalized.name + " · " + normalized.error
                : normalized.name;
            return [
                '<div class="composer-attachment-chip" data-status="' + utils.escapeHtml(normalized.status) + '" title="' + utils.escapeHtml(title) + '">',
                '<span class="composer-attachment-name">' + utils.escapeHtml(normalized.name) + "</span>",
                '<span class="composer-attachment-state">' + utils.escapeHtml(statusLabel) + "</span>",
                '<button class="composer-attachment-remove" type="button" data-remove-attachment="' + utils.escapeHtml(normalized.localId) + '" aria-label="Remove attachment">&times;</button>',
                "</div>"
            ].join("");
        }).join("");
        syncComposerControls();
    }

    function getMessageTrace(message) {
        const meta = message && message.meta;
        if (!meta || typeof meta !== "object") {
            return {};
        }
        const trace = meta.trace;
        return trace && typeof trace === "object"
            ? trace
            : {};
    }

    function normalizeChildrenIds(childrenIds) {
        const seen = new Set();
        return (Array.isArray(childrenIds) ? childrenIds : [])
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

    function buildVisibleMessageProjection() {
        const source = Array.isArray(state.messages) ? state.messages : [];
        const entries = [];
        const groups = {};
        const selectedByTurn = {};
        const variantMetaById = {};
        const turnKeyById = {};
        const turnMembers = {};
        let latestUserId = "";

        source.forEach(function (message) {
            const role = message.role || "assistant";
            if (role === "user") {
                latestUserId = String(message.id || "").trim();
            }

            const trace = getMessageTrace(message);
            const qwenParentId = String(trace.qwen_parent_id || "").trim();
            const fallbackTurnKey = latestUserId
                ? "turn:" + latestUserId
                : "";
            const turnKey = (role === "assistant" || role === "error")
                ? (fallbackTurnKey || (qwenParentId ? "qwen:" + qwenParentId : ""))
                : "";

            const messageId = String(message.id || "").trim();
            if (messageId) {
                turnKeyById[messageId] = turnKey;
            }
            if (turnKey) {
                if (!groups[turnKey]) {
                    groups[turnKey] = [];
                }
                groups[turnKey].push(message);
            }

            entries.push({
                message: message,
                turnKey: turnKey
            });
        });

        Object.keys(groups).forEach(function (turnKey) {
            const members = groups[turnKey] || [];
            const memberIds = members.map(function (entry) {
                return String(entry.id || "").trim();
            }).filter(Boolean);
            if (!memberIds.length) {
                return;
            }
            const preferredId = String(state.variantSelectionByTurn[turnKey] || "").trim();
            const selectedId = memberIds.indexOf(preferredId) !== -1
                ? preferredId
                : memberIds[memberIds.length - 1];

            selectedByTurn[turnKey] = selectedId;
            turnMembers[turnKey] = memberIds;
            state.variantSelectionByTurn[turnKey] = selectedId;

            memberIds.forEach(function (messageId, index) {
                variantMetaById[messageId] = {
                    turnKey: turnKey,
                    index: index + 1,
                    total: memberIds.length,
                    selectedId: selectedId,
                    isSelected: messageId === selectedId
                };
            });
        });

        const visibleMessages = [];
        const renderedTurnKeys = new Set();
        entries.forEach(function (entry) {
            if (!entry.turnKey) {
                visibleMessages.push(entry.message);
                return;
            }

            const messageId = String(entry.message.id || "").trim();
            const variantMeta = variantMetaById[messageId];
            if (!variantMeta || variantMeta.total <= 1) {
                if (!renderedTurnKeys.has(entry.turnKey)) {
                    visibleMessages.push(entry.message);
                    renderedTurnKeys.add(entry.turnKey);
                }
                return;
            }

            if (renderedTurnKeys.has(entry.turnKey)) {
                return;
            }

            const selectedId = selectedByTurn[entry.turnKey];
            const selectedMessage = groups[entry.turnKey].find(function (candidate) {
                return String(candidate.id || "") === selectedId;
            }) || entry.message;
            visibleMessages.push(selectedMessage);
            renderedTurnKeys.add(entry.turnKey);
        });

        state.visibleMessages = visibleMessages;
        state.messageVariantMeta = variantMetaById;
        state.messageTurnKeyById = turnKeyById;
        state.turnVariantMembers = turnMembers;

        return {
            visibleMessages: visibleMessages,
            variantMetaById: variantMetaById
        };
    }

    function buildSendSignature(prompt, interactionMode, mode, model, attachments, botId) {
        const attachmentKey = (Array.isArray(attachments) ? attachments : []).map(function (item) {
            const normalized = normalizeAttachmentDescriptor(item);
            return [normalized.localId, normalized.file_id, normalized.name, normalized.size].join(":");
        }).join("|");
        return [
            String(state.activeThreadId || ""),
            String(prompt || "").trim(),
            String(interactionMode || ""),
            String(mode || ""),
            String(model || ""),
            String(botId || ""),
            attachmentKey
        ].join("::");
    }

    function buildRegenerationPayload(thread, regenerationContext) {
        if (!thread || !regenerationContext || !regenerationContext.replaceMessage) {
            return null;
        }
        const messageTrace = getMessageTrace(regenerationContext.replaceMessage);
        const threadTrace = thread.last_trace && typeof thread.last_trace === "object"
            ? thread.last_trace
            : {};
        const qwenParentId = String(
            messageTrace.qwen_parent_id
            || threadTrace.qwen_parent_id
            || ""
        ).trim();
        if (!qwenParentId) {
            return null;
        }

        const seedChildren = normalizeChildrenIds(messageTrace.children_ids)
            .concat(normalizeChildrenIds(threadTrace.children_ids));
        const responseId = String(messageTrace.response_id || thread.remote_parent_id || "").trim();
        if (responseId) {
            seedChildren.push(responseId);
        }

        const originalTimestamp = Number(messageTrace.request_timestamp || threadTrace.request_timestamp || 0) || null;

        return {
            qwenParentId: qwenParentId,
            childrenIds: normalizeChildrenIds(seedChildren),
            originalTimestamp: originalTimestamp
        };
    }

    function getRegenerationContext(targetAssistantMessageId) {
        if (!state.messages.length) {
            return null;
        }

        const visibleMessages = Array.isArray(state.visibleMessages) && state.visibleMessages.length
            ? state.visibleMessages
            : state.messages;

        let assistantIndex = -1;
        if (targetAssistantMessageId) {
            const targetId = String(targetAssistantMessageId);
            assistantIndex = state.messages.findIndex(function (message) {
                return String(message.id) === targetId;
            });
            if (assistantIndex === -1) {
                return null;
            }
            const targetRole = state.messages[assistantIndex].role;
            if (targetRole !== "assistant" && targetRole !== "error") {
                return null;
            }
        } else {
            for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
                const role = visibleMessages[index].role;
                if (role === "assistant" || role === "error") {
                    const activeId = String(visibleMessages[index].id || "");
                    assistantIndex = state.messages.findIndex(function (message) {
                        return String(message.id) === activeId;
                    });
                    break;
                }
                if (role === "user") {
                    return null;
                }
            }
        }

        if (assistantIndex === -1) {
            return null;
        }

        for (let index = assistantIndex - 1; index >= 0; index -= 1) {
            if (state.messages[index].role === "user") {
                return {
                    prompt: String(state.messages[index].content || "").trim(),
                    attachments: collectMessageAttachments(state.messages[index].meta || {}),
                    replaceMessage: state.messages[assistantIndex],
                    mode: state.messages[assistantIndex].meta && state.messages[assistantIndex].meta.mode,
                    interactionMode: state.messages[assistantIndex].meta && state.messages[assistantIndex].meta.interaction_mode,
                    model: state.messages[assistantIndex].meta && state.messages[assistantIndex].meta.request_model
                };
            }
        }

        return null;
    }

    function getLatestRegeneratableAssistantId() {
        const regenerationContext = getRegenerationContext();
        if (!regenerationContext || !regenerationContext.replaceMessage) {
            return "";
        }

        const message = regenerationContext.replaceMessage;
        const role = message.role || "assistant";
        const isStreaming = Boolean(message.meta && message.meta.state === "streaming");
        const messageId = String(message.id || "").trim();
        if (role !== "assistant" || isStreaming || !messageId) {
            return "";
        }
        return messageId;
    }

    function isMessageRegeneratable(message) {
        if (!message) {
            return false;
        }
        const role = message.role || "assistant";
        if (role !== "assistant") {
            return false;
        }
        if (message.meta && message.meta.state === "streaming") {
            return false;
        }
        const messageId = String(message.id || "").trim();
        if (!messageId) {
            return false;
        }
        const latestId = state.latestRegeneratableAssistantId || getLatestRegeneratableAssistantId();
        return Boolean(latestId) && latestId === messageId;
    }

    function syncActionButtons() {
        const hasThread = Boolean(getActiveThread());
        const regenerationContext = getRegenerationContext();
        dom.renameThreadBtn.disabled = !hasThread || state.busy;
        dom.pinThreadBtn.disabled = !hasThread || state.busy;
        dom.resetSessionBtn.disabled = !hasThread || state.busy;
        dom.regenerateReplyBtn.disabled = !hasThread || state.busy || !regenerationContext;
        dom.exportThreadBtn.disabled = !hasThread || state.busy;
        dom.deleteThreadBtn.disabled = !hasThread || state.busy;
        if (dom.shareThreadBtn) {
            dom.shareThreadBtn.hidden = true;
            dom.shareThreadBtn.setAttribute("aria-hidden", "true");
            dom.shareThreadBtn.disabled = true;
        }
        if (dom.clearChatsBtn) {
            dom.clearChatsBtn.disabled = state.busy || !state.threads.length;
        }
    }

    function setBusy(isBusy) {
        state.busy = isBusy;
        document.body.dataset.liveStreaming = isBusy ? "true" : "false";
        if (dom.newThreadBtn) {
            dom.newThreadBtn.disabled = isBusy;
        }
        dom.threadSearchInput.disabled = isBusy;
        if (dom.sidebarRailNewBtn) {
            dom.sidebarRailNewBtn.disabled = isBusy;
        }
        syncActionButtons();
        syncComposerControls();
        setComposerModeMenuOpen(false);
    }

    function renderThreadList() {
        renderThreadScopeCopy();
        const query = state.threadQuery.trim().toLowerCase();
        const threads = query
            ? state.threads.filter(function (thread) {
                return [
                    thread.title,
                    thread.remote_session_id
                ].join(" ").toLowerCase().includes(query);
            })
            : state.threads;

        dom.threadCount.textContent = query
            ? threads.length + "/" + state.threads.length
            : String(state.threads.length);

        if (!threads.length) {
            state.openThreadMenuId = null;
            dom.threadList.innerHTML = "";
            renderChatMaintenanceStatus();
            return;
        }

        if (state.openThreadMenuId && !threads.some(function (thread) {
            return String(thread.id) === String(state.openThreadMenuId);
        })) {
            state.openThreadMenuId = null;
        }

        dom.threadList.innerHTML = threads.map(function (thread) {
            const threadId = String(thread.id);
            const escapedThreadId = utils.escapeHtml(threadId);
            const menuOpen = threadId === state.openThreadMenuId;
            const activeClass = thread.id === state.activeThreadId ? " active" : "";
            const menuClass = menuOpen ? " menu-open" : "";
            return [
                '<article class="thread-card' + activeClass + menuClass + '">',
                '<button class="thread-card-main" type="button" data-thread-id="' + escapedThreadId + '">',
                "<strong>" + utils.escapeHtml(thread.title || "New chat") + "</strong>",
                "</button>",
                '<div class="thread-card-menu">',
                '<button class="thread-menu-trigger" type="button" data-thread-menu-trigger="' + escapedThreadId + '" aria-haspopup="menu" aria-expanded="' + (menuOpen ? "true" : "false") + '" title="Chat options">...</button>',
                '<div class="thread-menu" data-thread-menu="' + escapedThreadId + '"' + (menuOpen ? "" : " hidden") + '>',
                '<div class="thread-menu-label">Actions</div>',
                '<button class="thread-menu-item danger" type="button" data-thread-delete="' + escapedThreadId + '">Delete chat</button>',
                "</div>",
                "</div>",
                "</article>"
            ].join("");
        }).join("");

        renderChatMaintenanceStatus();
    }

    function renderThreadState() {
        const thread = getActiveThread();

        if (!thread) {
            dom.threadTitle.textContent = "New conversation";
            dom.chatStatusLine.textContent = gateway.gatewayReady(getGatewayRuntimeSettings())
                ? "Ready when you are."
                : "An admin still needs to finish the assistant runtime setup.";
            if (dom.threadMetaBadge) {
                dom.threadMetaBadge.hidden = true;
                dom.threadMetaBadge.textContent = "";
            }
            dom.pinThreadBtn.textContent = "Pin";
            syncActionButtons();
            syncDocumentTitle();
            return;
        }

        dom.threadTitle.textContent = thread.title || "New chat";
        dom.chatStatusLine.textContent = gateway.gatewayReady(getGatewayRuntimeSettings())
            ? "Ready when you are."
            : "An admin still needs to finish the assistant runtime setup.";
        if (dom.threadMetaBadge) {
            dom.threadMetaBadge.hidden = true;
            dom.threadMetaBadge.textContent = "";
        }
        dom.pinThreadBtn.textContent = thread.pinned ? "Unpin" : "Pin";
        syncActionButtons();
        syncDocumentTitle();
    }

    function renderMessages() {
        const settings = state.settings || {};
        const hasMessages = state.messages.length > 0;

        dom.welcomePanel.classList.toggle("hidden", hasMessages);
        dom.welcomeTitle.textContent = settings.welcome_title || "Start a new conversation";
        dom.welcomeCopy.textContent = settings.welcome_copy || "Ask for strategy, content, coding help, analysis, or anything else you want to work through live.";

        if (!hasMessages) {
            state.latestRegeneratableAssistantId = "";
            state.visibleMessages = [];
            state.messageVariantMeta = {};
            state.messageTurnKeyById = {};
            state.turnVariantMembers = {};
            state.variantSelectionByTurn = {};
            dom.messages.innerHTML = "";
            state.lastMessagesScrollTop = 0;
            state.showJumpToLatest = false;
            renderJumpLatestButton();
            return;
        }

        const projection = buildVisibleMessageProjection();
        state.latestRegeneratableAssistantId = getLatestRegeneratableAssistantId();
        dom.messages.innerHTML = projection.visibleMessages.map(function (message) {
            return renderMessageMarkup(message, projection.variantMetaById[String(message.id) || ""]);
        }).join("");
        state.lastMessagesScrollTop = dom.messages.scrollTop;

        renderJumpLatestButton();
    }

    function renderProfile() {
        dom.profileName.textContent = state.context.profile.display_name || state.context.user.email || "User";
        dom.profileRole.textContent = utils.formatRole(state.context.profile.role);
        dom.adminLink.hidden = state.context.profile.role !== "admin";
        dom.sidebarRailAdminLink.hidden = state.context.profile.role !== "admin";
        dom.settingsAdminLink.hidden = state.context.profile.role !== "admin";
        dom.sidebarProfileAvatar.textContent = profileInitials();
        if (dom.railProfileName) {
            dom.railProfileName.textContent = state.context.profile.display_name || state.context.user.email || "User";
        }
        if (dom.railProfileEmail) {
            dom.railProfileEmail.textContent = state.context.user.email || "";
        }
        dom.settingsDisplayName.value = state.context.profile.display_name || "";
        dom.settingsEmail.value = state.context.user.email || "";
        if (state.context.profile.role !== "admin" && state.preferences.activeView === "admin") {
            setActiveView("chat", { persist: true });
        }
    }

    function renderPreferences() {
        dom.settingsEnterToSend.checked = Boolean(state.preferences.enterToSend);
        dom.settingsShowTimestamps.checked = Boolean(state.preferences.showTimestamps);
        const threadMode = getResolvedThreadMode();
        const activeBot = getActiveBot();
        const activeBotLabel = activeBot && activeBot.name
            ? activeBot.name
            : "Assistant";
        const threadModeLabel = threadMode === "bot"
            ? "Bot mode: " + activeBotLabel
            : "Normal chats mode";
        const runtimePoolLabel = state.runtimeGateway && state.runtimeGateway.gateway_pool_label
            ? state.runtimeGateway.gateway_pool_label
            : state.runtimeGateway && state.runtimeGateway.gateway_pool_id
                ? "Assigned pool account"
                : "Workspace runtime";
        dom.accountSettingsStatus.textContent = state.preferences.sidebarCollapsed
            ? "Sidebar is collapsed. Expand it anytime from the rail. Runtime: " + runtimePoolLabel + ". " + threadModeLabel + "."
            : "Sidebar is expanded for full thread browsing. Runtime: " + runtimePoolLabel + ". " + threadModeLabel + ".";
        renderBotList();
        renderChatMaintenanceStatus();
        applyShellState();
    }

    function renderChatMaintenanceStatus(customMessage) {
        if (!dom.chatMaintenanceStatus) {
            return;
        }
        if (typeof customMessage === "string" && customMessage.trim()) {
            dom.chatMaintenanceStatus.textContent = customMessage.trim();
            return;
        }
        const total = Array.isArray(state.threads) ? state.threads.length : 0;
        const mode = getResolvedThreadMode();
        const activeBot = getActiveBot();
        const activeBotLabel = activeBot && activeBot.name
            ? activeBot.name
            : "Assistant";
        if (mode === "normal") {
            dom.chatMaintenanceStatus.textContent = total === 0
                ? "No normal chats yet."
                : total === 1
                    ? "1 normal chat. Delete all clears locally first and then cleans Qwen sessions."
                    : total + " normal chats. Delete all clears locally first and then cleans Qwen sessions.";
            return;
        }

        dom.chatMaintenanceStatus.textContent = total === 0
            ? "No chats for " + activeBotLabel + " yet."
            : total === 1
                ? "1 chat for " + activeBotLabel + ". Delete all clears locally first and then cleans Qwen sessions."
                : total + " chats for " + activeBotLabel + ". Delete all clears locally first and then cleans Qwen sessions.";
    }

    async function ensureThread(prompt) {
        const existing = getActiveThread();
        if (existing) {
            return existing;
        }

        const title = utils.truncateText(prompt.replace(/\s+/g, " "), 56) || "New chat";
        const insertPayload = {
            owner_id: state.context.user.id,
            title: title,
            title_source: "local",
            bot_id: getEffectiveThreadBotId() || "assistant"
        };
        if (state.titleSourceSupported === false) {
            delete insertPayload.title_source;
        }
        if (state.threadBotIdSupported === false) {
            delete insertPayload.bot_id;
        }

        let result = null;
        while (true) {
            result = await client
                .from("chat_threads")
                .insert(insertPayload)
                .select("*")
                .single();

            if (!result.error) {
                break;
            }
            if (insertPayload.title_source && isMissingTitleSourceError(result.error)) {
                state.titleSourceSupported = false;
                delete insertPayload.title_source;
                continue;
            }
            if (insertPayload.bot_id && isMissingThreadBotIdError(result.error)) {
                state.threadBotIdSupported = false;
                delete insertPayload.bot_id;
                continue;
            }
            break;
        }

        if (result.error) {
            throw new Error(result.error.message || "Unable to create a new thread.");
        }

        const normalized = normalizeThreadRecord(result.data, "local");
        upsertThreadLocal(normalized);
        state.messages = [];
        state.reasoningExpanded = {};
        state.visibleMessages = [];
        state.messageVariantMeta = {};
        state.messageTurnKeyById = {};
        state.turnVariantMembers = {};
        state.variantSelectionByTurn = {};
        await setActiveThread(result.data.id, { skipLoad: true });
        renderMessages();
        enableAutoFollow({ scroll: true });
        return normalized;
    }

    async function persistThreadUpdate(threadId, patch) {
        const currentThread = state.threads.find(function (thread) {
            return thread.id === threadId;
        }) || null;
        const fallbackSource = patch.title_source || currentThread && currentThread.title_source || "local";
        const initialPatch = Object.assign({}, patch);
        let preparedPatch = Object.assign({}, patch);

        if (state.titleSourceSupported === false) {
            delete preparedPatch.title_source;
        }

        let result = await client
            .from("chat_threads")
            .update(preparedPatch)
            .eq("id", threadId)
            .select("*")
            .single();

        if (result.error && initialPatch.title_source && isMissingTitleSourceError(result.error)) {
            state.titleSourceSupported = false;
            preparedPatch = Object.assign({}, initialPatch);
            delete preparedPatch.title_source;
            result = await client
                .from("chat_threads")
                .update(preparedPatch)
                .eq("id", threadId)
                .select("*")
                .single();
        }

        if (result.error) {
            throw new Error(result.error.message || "Unable to update the thread.");
        }

        const normalized = normalizeThreadRecord(result.data, fallbackSource);
        upsertThreadLocal(normalized);
        renderThreadList();
        renderThreadState();
        return normalized;
    }

    async function insertMessage(threadId, role, content, meta) {
        const result = await client
            .from("chat_messages")
            .insert({
                thread_id: threadId,
                role: role,
                content: content,
                meta: meta || {}
            })
            .select("*")
            .single();

        if (result.error) {
            throw new Error(result.error.message || "Unable to store the message.");
        }

        return result.data;
    }

    async function deleteMessageRecord(messageId) {
        if (!messageId) {
            return;
        }
        const result = await client
            .from("chat_messages")
            .delete()
            .eq("id", messageId);

        if (result.error) {
            throw new Error(result.error.message || "Unable to remove the previous reply.");
        }
    }

    function openAdminView(section) {
        if (!state.context || state.context.profile.role !== "admin") {
            return;
        }
        const targetSection = section || "settings";
        if (state.adminWorkspace) {
            state.adminWorkspace.setActiveSection(targetSection, { syncHash: false });
        } else {
            initializeAdminWorkspace()
                .then(function () {
                    if (state.adminWorkspace) {
                        state.adminWorkspace.setActiveSection(targetSection, { syncHash: false });
                    }
                })
                .catch(function (error) {
                    const statusNode = dom.embeddedAdminWorkspace
                        ? dom.embeddedAdminWorkspace.querySelector('[data-admin-el="status-line"]')
                        : null;
                    if (statusNode) {
                        statusNode.textContent = "Admin load failed. Refresh and retry.";
                    }
                    toast(error && error.message ? error.message : "Unable to load admin workspace.", "error");
                });
        }
        setActiveView("admin", { persist: true });
    }

    async function syncRemoteTitle(threadId, sessionId) {
        if (!threadId || !sessionId || state.titleSyncing[threadId]) {
            return;
        }

        state.titleSyncing[threadId] = true;
        try {
            const current = state.threads.find(function (thread) {
                return thread.id === threadId;
            });
            if (current && current.title_source === "manual") {
                return;
            }

            const nextTitle = await gateway.fetchRemoteTitle({
                settings: getGatewayRuntimeSettings(),
                sessionId: sessionId
            });
            if (!nextTitle) {
                return;
            }

            let latestResult = await client
                .from("chat_threads")
                .select("id, title, title_source")
                .eq("id", threadId)
                .single();

            if (latestResult.error && isMissingTitleSourceError(latestResult.error)) {
                state.titleSourceSupported = false;
                latestResult = await client
                    .from("chat_threads")
                    .select("id, title")
                    .eq("id", threadId)
                    .single();
            }

            if (latestResult.error) {
                throw new Error(latestResult.error.message || "Unable to check the latest chat title.");
            }

            const latest = normalizeThreadRecord(
                latestResult.data || {},
                current && current.title_source || "local"
            );
            if (latest.title_source === "manual") {
                return;
            }

            if (latest.title === nextTitle && latest.title_source === "remote") {
                return;
            }

            await persistThreadUpdate(threadId, {
                title: nextTitle,
                title_source: "remote",
                updated_at: new Date().toISOString()
            });
        } catch (error) {
            console.warn("Title sync skipped:", error && error.message ? error.message : error);
        } finally {
            delete state.titleSyncing[threadId];
        }
    }

    async function runPromptTurn(options) {
        const mergedOptions = Object.assign({
            persistUserMessage: true,
            replaceMessage: null,
            clearComposer: true,
            busyCopy: "Generating a live reply...",
            successCopy: "Latest reply completed successfully."
        }, options || {});
        const rawPrompt = String(mergedOptions.prompt || "").trim();
        const interactionMode = isValidInteractionMode(mergedOptions.interactionMode)
            ? mergedOptions.interactionMode
            : getResolvedInteractionMode();
        const attachmentSnapshot = Array.isArray(mergedOptions.attachments)
            ? mergedOptions.attachments.map(normalizeAttachmentDescriptor)
            : [];
        const prompt = rawPrompt || (interactionMode === "chat" && attachmentSnapshot.length ? buildAttachmentOnlyPrompt(attachmentSnapshot) : "");
        const selectedModel = String(mergedOptions.model || getSelectedComposerModel(interactionMode) || "").trim();
        const activeBot = getActiveBot();
        const selectedBotId = String(activeBot && activeBot.id || "").trim();
        const selectedBotName = String(activeBot && activeBot.name || "").trim();
        const promptMode = getResolvedComposerMode(interactionMode, selectedModel, mergedOptions.mode);

        if (state.busy) {
            return;
        }
        if (!prompt && !attachmentSnapshot.length) {
            toast("Type a message first.", "error");
            return;
        }
        if (interactionMode === "image" && attachmentSnapshot.length) {
            toast("Attachments are only available in Ask mode right now.", "error");
            return;
        }

        await refreshRuntimeGatewayCredentials({ silent: true });
        const runtimeSettings = getGatewayRuntimeSettings();
        if (!gateway.gatewayReady(runtimeSettings)) {
            toast("The assistant is not configured yet. Ask an admin to finish setup.", "error");
            return;
        }

        setBusy(true);
        setChatFeedback("sending", mergedOptions.busyCopy);
        if (mergedOptions.clearComposer) {
            dom.promptInput.value = "";
            utils.autoResizeTextarea(dom.promptInput);
            updatePromptCount();
        }

        let thread;
        let draftMessage = null;
        state.abortController = new AbortController();

        try {
            thread = mergedOptions.thread || await ensureThread(prompt);
            if (mergedOptions.persistUserMessage !== false) {
                const persistedUserMessage = await insertMessage(thread.id, "user", prompt, {
                    state: "done",
                    mode: promptMode,
                    interaction_mode: interactionMode,
                    bot_id: selectedBotId,
                    bot_name: selectedBotName,
                    request_model: selectedModel,
                    attachments: attachmentSnapshot
                });
                state.messages.push(persistedUserMessage);
            }

            draftMessage = {
                id: "draft-" + utils.uid(),
                thread_id: thread.id,
                role: "assistant",
                content: "",
                meta: {
                    state: "streaming",
                    mode: promptMode,
                    interaction_mode: interactionMode,
                    bot_id: selectedBotId,
                    bot_name: selectedBotName,
                    request_model: selectedModel,
                    search_sources: [],
                    generated_images: [],
                    reasoning_text: "",
                    response_id: "",
                    parent_user_id: "",
                    session_id: String(thread.remote_session_id || "")
                },
                created_at: new Date().toISOString()
            };
            state.reasoningExpanded[draftMessage.id] = false;
            if (mergedOptions.replaceMessage) {
                const turnKey = state.messageTurnKeyById[String(mergedOptions.replaceMessage.id)];
                if (turnKey) {
                    state.variantSelectionByTurn[turnKey] = draftMessage.id;
                }
                state.messages.push(draftMessage);
            } else {
                state.messages.push(draftMessage);
            }

            renderMessages();
            renderThreadState();
            enableAutoFollow({ scroll: true });

            const result = await gateway.streamChat({
                settings: runtimeSettings,
                thread: thread,
                mode: promptMode,
                interactionMode: interactionMode,
                model: selectedModel,
                botId: selectedBotId,
                prompt: prompt,
                files: attachmentSnapshot,
                regeneration: mergedOptions.regeneration || null,
                signal: state.abortController.signal,
                onUpdate: function (payload) {
                    scheduleStreamReveal(
                        draftMessage,
                        Object.assign({}, payload || {}, {
                            mode: promptMode,
                            interactionMode: interactionMode
                        })
                    );
                }
            });

            finalizeStreamReveal(draftMessage, { flush: true });

            const updatedThread = await persistThreadUpdate(thread.id, {
                remote_session_id: result.sessionId,
                remote_parent_id: result.parentId,
                last_trace: withPreservedShareTrace(thread, Object.assign({}, result.trace, {
                    remote_chat_type: result.chatType,
                    interaction_mode: interactionMode
                })),
                updated_at: new Date().toISOString()
            });

            const finalReply = result.reply
                || (Array.isArray(result.generatedImages) && result.generatedImages.length
                    ? ""
                    : result.thinking
                        ? "No final answer was returned."
                        : "No response text found.");
            const persistedAssistantMessage = await insertMessage(thread.id, "assistant", finalReply, {
                state: "done",
                trace: result.trace,
                mode: promptMode,
                interaction_mode: interactionMode,
                bot_id: result.botId || selectedBotId,
                bot_name: result.botName || selectedBotName,
                request_model: result.requestModel || selectedModel,
                search_sources: Array.isArray(result.searchSources) ? result.searchSources : [],
                generated_images: Array.isArray(result.generatedImages) ? result.generatedImages : [],
                reasoning_text: result.thinking || ""
            });

            state.messages = state.messages
                .filter(function (message) {
                    return message.id !== draftMessage.id;
                })
                .concat(persistedAssistantMessage);
            state.reasoningExpanded[persistedAssistantMessage.id] = false;
            delete state.reasoningExpanded[draftMessage.id];
            if (attachmentSnapshot.length) {
                const usedIds = attachmentSnapshot.map(function (item) {
                    return item.localId;
                });
                state.pendingAttachments = state.pendingAttachments.filter(function (item) {
                    return usedIds.indexOf(item.localId) === -1;
                });
                renderComposerAttachments();
            }
            renderMessages();
            renderThreadState();
            syncScrollAfterRender({
                forceFollow: state.isAutoFollow,
                fromStream: !state.isAutoFollow
            });
            setChatFeedback("complete", interactionMode === "image" ? "Image generated successfully." : mergedOptions.successCopy);
            if (interactionMode === "image") {
                toast("Image generated.", "success");
            }
            thread = updatedThread;

            syncRemoteTitle(updatedThread.id, result.sessionId);
        } catch (error) {
            if (error && error.name === "AbortError") {
                finalizeStreamReveal(draftMessage);
                if (thread && draftMessage) {
                    thread = await persistAbortRemoteState(thread, draftMessage, {
                        interactionMode: interactionMode,
                        requestModel: selectedModel
                    });
                    try {
                        const draftMeta = draftMessage.meta && typeof draftMessage.meta === "object"
                            ? draftMessage.meta
                            : {};
                        const reasoningText = String(draftMeta.reasoning_text || "");
                        const responseId = String(draftMeta.response_id || "").trim();
                        const parentUserId = String(draftMeta.parent_user_id || "").trim();
                        const sessionId = String(draftMeta.session_id || thread.remote_session_id || "").trim();
                        const generatedImages = Array.isArray(draftMeta.generated_images)
                            ? draftMeta.generated_images
                            : [];
                        const searchSources = Array.isArray(draftMeta.search_sources)
                            ? draftMeta.search_sources
                            : [];
                        const stoppedText = draftMessage.content.trim()
                            ? draftMessage.content
                            : reasoningText.trim()
                                ? "Generation stopped before a final answer was produced."
                                : mergedOptions.replaceMessage
                                    ? "Reply regeneration stopped before a new answer arrived."
                                    : "";
                        const stoppedMessage = stoppedText
                            ? await insertMessage(thread.id, "assistant", stoppedText, {
                            state: "stopped",
                            mode: promptMode,
                            interaction_mode: interactionMode,
                            bot_id: selectedBotId,
                            bot_name: selectedBotName,
                            reasoning_text: reasoningText,
                            search_sources: searchSources,
                            generated_images: generatedImages,
                            response_id: responseId,
                            parent_user_id: parentUserId,
                            session_id: sessionId,
                            trace: {
                                response_id: responseId,
                                qwen_parent_id: parentUserId,
                                children_ids: normalizeChildrenIds(responseId ? [responseId] : [])
                            }
                        })
                            : null;
                        state.messages = state.messages.filter(function (message) {
                            return message.id !== draftMessage.id;
                        });
                        if (stoppedMessage) {
                            state.messages = state.messages.concat(stoppedMessage);
                            state.reasoningExpanded[stoppedMessage.id] = false;
                        }
                        delete state.reasoningExpanded[draftMessage.id];
                    } catch (_insertError) {
                        draftMessage.meta = Object.assign({}, draftMessage.meta, { state: "stopped" });
                    }
                } else {
                    state.messages = state.messages.filter(function (message) {
                        return !(draftMessage && message.id === draftMessage.id);
                    });
                }
                renderMessages();
                renderThreadState();
                syncScrollAfterRender({
                    forceFollow: state.isAutoFollow
                });
                setChatFeedback("stopped", "Generation stopped. You can continue whenever you are ready.");
                toast("Generation stopped.", "info");
            } else {
                finalizeStreamReveal(draftMessage);
                const friendlyMessage = friendlyRuntimeError(error);
                if (thread && draftMessage) {
                    try {
                        const persistedError = await insertMessage(thread.id, "error", friendlyMessage, {
                            state: "error"
                        });
                        state.messages = state.messages
                            .filter(function (message) {
                                return message.id !== draftMessage.id;
                            })
                            .concat(persistedError);
                        delete state.reasoningExpanded[draftMessage.id];
                    } catch (_insertError) {
                        draftMessage.role = "error";
                        draftMessage.content = friendlyMessage;
                        draftMessage.meta = { state: "error" };
                    }
                } else {
                    toast(friendlyMessage, "error");
                }
                renderMessages();
                renderThreadState();
                syncScrollAfterRender({
                    forceFollow: state.isAutoFollow,
                    fromStream: !state.isAutoFollow
                });
                setChatFeedback("error", friendlyMessage);
                toast(friendlyMessage, "error");
            }
        } finally {
            setBusy(false);
            clearRemoteStopRetryTimer();
            state.abortController = null;
            if (thread) {
                upsertThreadLocal(thread);
                renderThreadList();
                renderThreadState();
            }
            if (state.preferences.activeView === "chat") {
                dom.promptInput.focus();
            }
        }
    }

    async function handleSend(event) {
        event.preventDefault();
        if (state.sendInFlight || state.busy) {
            return;
        }
        if (activeUploadInProgress()) {
            toast("Wait for the attachment upload to finish.", "error");
            return;
        }
        const interactionMode = getResolvedInteractionMode();
        const selectedModel = getSelectedComposerModel(interactionMode);
        const activeBot = getActiveBot();
        const selectedBotId = String(activeBot && activeBot.id || "").trim();
        const mode = getResolvedComposerMode(interactionMode, selectedModel);
        const attachments = interactionMode === "chat" ? sendableAttachments() : [];
        const sendSignature = buildSendSignature(dom.promptInput.value, interactionMode, mode, selectedModel, attachments, selectedBotId);
        const now = Date.now();
        if (
            sendSignature
            && sendSignature === state.lastSendSignature
            && now - Number(state.lastSendAt || 0) < 1800
        ) {
            return;
        }

        state.sendInFlight = true;
        state.lastSendSignature = sendSignature;
        state.lastSendAt = now;
        setComposerModeMenuOpen(false);
        try {
            await runPromptTurn({
                prompt: dom.promptInput.value,
                mode: mode,
                interactionMode: interactionMode,
                model: selectedModel,
                attachments: attachments,
                persistUserMessage: true,
                clearComposer: true,
                busyCopy: interactionMode === "image"
                    ? "Generating image..."
                    : mode === "thinking"
                        ? "Thinking through the answer..."
                        : "Generating a live reply..."
            });
        } finally {
            state.sendInFlight = false;
        }
    }

    function findActiveStreamingDraftMessage() {
        for (let index = state.messages.length - 1; index >= 0; index -= 1) {
            const message = state.messages[index];
            if (!message || message.role !== "assistant") {
                continue;
            }
            const meta = message.meta && typeof message.meta === "object"
                ? message.meta
                : {};
            if (meta.state === "streaming") {
                return message;
            }
        }
        return null;
    }

    function uniqueStopResponseIds(values) {
        const seen = new Set();
        return (Array.isArray(values) ? values : []).map(function (value) {
            return String(value || "").trim();
        }).filter(function (value) {
            if (!value || seen.has(value)) {
                return false;
            }
            seen.add(value);
            return true;
        });
    }

    function clearRemoteStopRetryTimer() {
        if (!state.remoteStopRetryTimerId) {
            return;
        }
        window.clearTimeout(state.remoteStopRetryTimerId);
        state.remoteStopRetryTimerId = null;
    }

    function mergeStopRequests(primaryRequest, fallbackRequest) {
        const primary = primaryRequest && typeof primaryRequest === "object"
            ? primaryRequest
            : null;
        const fallback = fallbackRequest && typeof fallbackRequest === "object"
            ? fallbackRequest
            : null;
        const sessionId = String(
            primary && primary.sessionId
            || fallback && fallback.sessionId
            || ""
        ).trim();
        const responseIds = uniqueStopResponseIds(
            []
                .concat(primary && Array.isArray(primary.responseIds) ? primary.responseIds : [])
                .concat(primary && primary.responseId ? [primary.responseId] : [])
                .concat(fallback && Array.isArray(fallback.responseIds) ? fallback.responseIds : [])
                .concat(fallback && fallback.responseId ? [fallback.responseId] : [])
        );

        if (!sessionId || !responseIds.length) {
            return null;
        }

        return {
            sessionId: sessionId,
            responseId: responseIds[0],
            responseIds: responseIds
        };
    }

    function resolveActiveStopRequest() {
        const thread = getActiveThread();
        const draftMessage = findActiveStreamingDraftMessage();
        if (!thread || !draftMessage) {
            return null;
        }

        const draftMeta = draftMessage.meta && typeof draftMessage.meta === "object"
            ? draftMessage.meta
            : {};
        const threadTrace = getThreadTrace(thread);
        const sessionId = String(draftMeta.session_id || thread.remote_session_id || "").trim();
        const responseIds = uniqueStopResponseIds([
            draftMeta.response_id,
            draftMeta.parent_user_id,
            thread.remote_parent_id,
            threadTrace.response_id,
            threadTrace.qwen_parent_id
        ]);

        if (!sessionId || !responseIds.length) {
            return null;
        }

        return {
            sessionId: sessionId,
            responseId: responseIds[0],
            responseIds: responseIds
        };
    }

    function requestRemoteStop(stopRequest, options) {
        if (!gateway || typeof gateway.stopChatCompletion !== "function") {
            return Promise.resolve(false);
        }
        const settings = options && typeof options === "object"
            ? options
            : {};
        const resolvedStopRequest = stopRequest || resolveActiveStopRequest();
        if (!resolvedStopRequest) {
            return Promise.resolve(false);
        }
        return gateway.stopChatCompletion({
            settings: getGatewayRuntimeSettings(),
            sessionId: resolvedStopRequest.sessionId,
            responseId: resolvedStopRequest.responseId,
            responseIds: resolvedStopRequest.responseIds
        }).then(function (result) {
            return Boolean(result && result.stopped);
        }).catch(function (error) {
            if (!settings.silent) {
                console.warn("Remote stop request failed:", error && error.message ? error.message : error);
            }
            return false;
        });
    }

    function scheduleRemoteStopWithRetry() {
        const seedRequest = resolveActiveStopRequest();
        let attempts = 0;
        clearRemoteStopRetryTimer();

        function runAttempt() {
            attempts += 1;
            const liveRequest = resolveActiveStopRequest();
            const mergedRequest = mergeStopRequests(liveRequest, seedRequest);
            requestRemoteStop(mergedRequest, {
                silent: attempts < REMOTE_STOP_MAX_ATTEMPTS
            }).then(function (stopped) {
                if (stopped || attempts >= REMOTE_STOP_MAX_ATTEMPTS) {
                    clearRemoteStopRetryTimer();
                    return;
                }
                state.remoteStopRetryTimerId = window.setTimeout(runAttempt, REMOTE_STOP_RETRY_DELAY_MS);
            });
        }

        runAttempt();
    }

    async function persistAbortRemoteState(thread, draftMessage, context) {
        if (!thread || !thread.id) {
            return thread;
        }

        const metadata = draftMessage && draftMessage.meta && typeof draftMessage.meta === "object"
            ? draftMessage.meta
            : {};
        const existingTrace = getThreadTrace(thread);
        const sessionId = String(metadata.session_id || thread.remote_session_id || "").trim();
        const responseId = String(metadata.response_id || "").trim();
        const parentUserId = String(metadata.parent_user_id || existingTrace.qwen_parent_id || "").trim();
        const nextChildrenIds = normalizeChildrenIds(
            normalizeChildrenIds(existingTrace.children_ids).concat(responseId ? [responseId] : [])
        );

        if (!sessionId && !responseId && !parentUserId && !nextChildrenIds.length) {
            return thread;
        }

        const interactionMode = context && context.interactionMode === "image"
            ? "image"
            : "chat";
        const remoteChatType = interactionMode === "image"
            ? "t2i"
            : "t2t";
        const nextTrace = withPreservedShareTrace(thread, Object.assign({}, existingTrace, {
            response_id: responseId || existingTrace.response_id || "",
            qwen_parent_id: parentUserId || existingTrace.qwen_parent_id || "",
            children_ids: nextChildrenIds,
            interaction_mode: interactionMode,
            remote_chat_type: remoteChatType,
            request_model: String(context && context.requestModel || existingTrace.request_model || "").trim(),
            state: "stopped",
            stopped_at: new Date().toISOString()
        }));

        const patch = {
            last_trace: nextTrace,
            updated_at: new Date().toISOString()
        };
        if (sessionId) {
            patch.remote_session_id = sessionId;
        }
        const nextRemoteParentId = String(
            parentUserId
            || thread.remote_parent_id
            || existingTrace.qwen_parent_id
            || existingTrace.response_id
            || responseId
            || ""
        ).trim();
        if (nextRemoteParentId) {
            patch.remote_parent_id = nextRemoteParentId;
        }

        try {
            return await persistThreadUpdate(thread.id, patch);
        } catch (error) {
            console.warn("Unable to persist stopped remote state:", error && error.message ? error.message : error);
            return thread;
        }
    }

    function handleStop() {
        if (!state.abortController) {
            return;
        }
        scheduleRemoteStopWithRetry();
        state.abortController.abort();
    }

    function handleThreadListClick(event) {
        const deleteButton = event.target.closest("[data-thread-delete]");
        if (deleteButton) {
            event.preventDefault();
            event.stopPropagation();
            const targetThreadId = deleteButton.getAttribute("data-thread-delete");
            setThreadMenuOpen(null);
            handleDeleteThreadById(targetThreadId).catch(function (error) {
                toast(error.message || "Unable to delete the chat.", "error");
            });
            return;
        }

        const menuTrigger = event.target.closest("[data-thread-menu-trigger]");
        if (menuTrigger) {
            event.preventDefault();
            event.stopPropagation();
            const targetThreadId = menuTrigger.getAttribute("data-thread-menu-trigger");
            setThreadMenuOpen(state.openThreadMenuId === targetThreadId ? null : targetThreadId);
            return;
        }

        const button = event.target.closest("[data-thread-id]");
        if (!button || state.busy) {
            return;
        }
        setThreadMenuOpen(null);
        setActiveView("chat");
        setActiveThread(button.getAttribute("data-thread-id")).catch(function (error) {
            toast(error.message || "Unable to open the thread.", "error");
        });
    }

    async function handleRenameThread() {
        const thread = getActiveThread();
        if (!thread || state.busy) {
            return;
        }
        const nextTitle = window.prompt("Rename this chat", thread.title || "New chat");
        if (!nextTitle) {
            return;
        }
        const cleanTitle = nextTitle.trim();
        if (!cleanTitle) {
            toast("Title cannot be empty.", "error");
            return;
        }
        try {
            await persistThreadUpdate(thread.id, {
                title: cleanTitle,
                title_source: "manual",
                updated_at: new Date().toISOString()
            });
            toast("Chat renamed.", "success");
        } catch (error) {
            toast(error.message || "Unable to rename the chat.", "error");
        }
    }

    async function handlePinThread() {
        const thread = getActiveThread();
        if (!thread || state.busy) {
            return;
        }
        try {
            await persistThreadUpdate(thread.id, {
                pinned: !thread.pinned,
                updated_at: new Date().toISOString()
            });
            toast(thread.pinned ? "Chat unpinned." : "Chat pinned.", "success");
        } catch (error) {
            toast(error.message || "Unable to update the chat.", "error");
        }
    }

    function handleExportThread() {
        const thread = getActiveThread();
        if (!thread) {
            return;
        }
        utils.downloadJson(
            (thread.title || "chat").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json",
            {
                exported_at: new Date().toISOString(),
                thread: thread,
                messages: state.messages
            }
        );
    }

    async function handleShareThread() {
        const thread = getActiveThread();
        if (!thread || state.busy) {
            return;
        }

        const shareToken = generateShareToken();
        const tokenHash = await utils.sha256Hex(shareToken);
        await persistThreadUpdate(thread.id, {
            last_trace: buildThreadShareTrace(thread, tokenHash),
            updated_at: new Date().toISOString()
        });

        const shareUrl = buildThreadShareUrl(thread.id, shareToken);
        try {
            await navigator.clipboard.writeText(shareUrl);
            toast("Secure share link copied.", "success");
        } catch (_error) {
            window.prompt("Copy secure share link", shareUrl);
            toast("Secure share link ready. Copy it from the prompt.", "info");
        }
    }

    function isRemoteDeleteMissingError(error) {
        const message = error && error.message ? error.message : String(error || "");
        return /\b404\b|not found|does not exist/i.test(message);
    }

    async function deleteRemoteThreadSession(sessionId) {
        const remoteSessionId = String(sessionId || "").trim();
        if (!remoteSessionId) {
            return {
                attempted: false,
                deleted: false,
                skipped: true,
                reason: "missing-session-id"
            };
        }
        if (!gateway.gatewayReady(getGatewayRuntimeSettings())) {
            return {
                attempted: false,
                deleted: false,
                skipped: true,
                reason: "gateway-not-ready"
            };
        }
        if (typeof gateway.deleteRemoteSession !== "function") {
            return {
                attempted: false,
                deleted: false,
                skipped: true,
                reason: "gateway-delete-unavailable"
            };
        }

        try {
            await gateway.deleteRemoteSession({
                settings: getGatewayRuntimeSettings(),
                sessionId: remoteSessionId
            });
            return {
                attempted: true,
                deleted: true,
                skipped: false
            };
        } catch (error) {
            if (isRemoteDeleteMissingError(error)) {
                return {
                    attempted: true,
                    deleted: true,
                    skipped: false,
                    alreadyMissing: true
                };
            }
            return {
                attempted: true,
                deleted: false,
                skipped: false,
                error: error
            };
        }
    }

    function threadHasUnlinkedRemoteState(thread) {
        const remoteSessionId = String(thread && thread.remote_session_id || "").trim();
        if (remoteSessionId) {
            return false;
        }
        const hasRemoteParent = Boolean(String(thread && thread.remote_parent_id || "").trim());
        const hasTrace = Boolean(thread && thread.last_trace && typeof thread.last_trace === "object" && Object.keys(thread.last_trace).length);
        return hasRemoteParent || hasTrace;
    }

    async function handleDeleteThreadById(threadId) {
        const thread = state.threads.find(function (entry) {
            return String(entry.id) === String(threadId || "");
        });
        if (!thread || state.busy) {
            return;
        }
        const confirmed = window.confirm('Delete "' + (thread.title || "this chat") + '"?');
        if (!confirmed) {
            return;
        }

        const remoteSessionId = String(thread.remote_session_id || "").trim();
        const hadUnlinkedRemoteState = threadHasUnlinkedRemoteState(thread);

        const result = await client
            .from("chat_threads")
            .delete()
            .eq("id", thread.id);

        if (result.error) {
            toast(result.error.message || "Unable to delete the chat.", "error");
            return;
        }

        const wasActive = String(state.activeThreadId || "") === String(thread.id);
        removeThreadLocal(thread.id);
        state.openThreadMenuId = null;

        if (wasActive) {
            const nextThread = state.threads[0] || null;
            if (nextThread) {
                try {
                    await setActiveThread(nextThread.id);
                } catch (error) {
                    state.activeThreadId = null;
                    state.messages = [];
                    state.reasoningExpanded = {};
                    state.visibleMessages = [];
                    state.messageVariantMeta = {};
                    state.messageTurnKeyById = {};
                    state.turnVariantMembers = {};
                    state.variantSelectionByTurn = {};
                    utils.setStoredValue(activeStorageKey(), null);
                    renderThreadList();
                    renderMessages();
                    renderThreadState();
                    enableAutoFollow();
                    toast("Chat deleted. Unable to load the next chat right now.", "info");
                }
            } else {
                state.activeThreadId = null;
                state.messages = [];
                state.reasoningExpanded = {};
                state.visibleMessages = [];
                state.messageVariantMeta = {};
                state.messageTurnKeyById = {};
                state.turnVariantMembers = {};
                state.variantSelectionByTurn = {};
                utils.setStoredValue(activeStorageKey(), null);
                renderThreadList();
                renderMessages();
                renderThreadState();
                enableAutoFollow();
                setChatFeedback("idle", "Chat deleted. Start a fresh conversation when ready.");
            }
        } else {
            renderThreadList();
            syncActionButtons();
        }

        toast("Chat deleted.", "success");

        if (!remoteSessionId) {
            if (hadUnlinkedRemoteState) {
                toast("Chat deleted locally. Qwen cleanup skipped because remote session ID was missing.", "info");
            }
            return;
        }

        deleteRemoteThreadSession(remoteSessionId)
            .then(function (remoteDeleteResult) {
                if (remoteDeleteResult.attempted && !remoteDeleteResult.deleted) {
                    console.warn("Remote chat deletion failed:", remoteDeleteResult.error);
                    const detail = remoteDeleteResult.error && remoteDeleteResult.error.message
                        ? remoteDeleteResult.error.message
                        : "Remote Qwen cleanup failed.";
                    toast("Chat deleted locally. " + detail, "error");
                    return;
                }
                if (remoteDeleteResult.skipped) {
                    toast("Chat deleted locally. Qwen cleanup was skipped.", "info");
                }
            })
            .catch(function (error) {
                toast("Chat deleted locally. Qwen cleanup failed: " + (error && error.message ? error.message : "unknown error."), "error");
            });
    }

    async function handleDeleteThread() {
        const thread = getActiveThread();
        if (!thread) {
            return;
        }
        return handleDeleteThreadById(thread.id);
    }

    function handleMessageVersionNavigation(messageId, direction) {
        const normalizedMessageId = String(messageId || "").trim();
        const normalizedDirection = direction === "prev" ? "prev" : "next";
        const turnKey = state.messageTurnKeyById[normalizedMessageId];
        if (!turnKey) {
            return;
        }
        const memberIds = Array.isArray(state.turnVariantMembers[turnKey])
            ? state.turnVariantMembers[turnKey].slice()
            : [];
        if (memberIds.length <= 1) {
            return;
        }

        const currentId = String(state.variantSelectionByTurn[turnKey] || normalizedMessageId).trim();
        const currentIndex = memberIds.indexOf(currentId);
        if (currentIndex === -1) {
            state.variantSelectionByTurn[turnKey] = memberIds[memberIds.length - 1];
            renderMessages();
            renderThreadState();
            return;
        }

        const nextIndex = normalizedDirection === "prev"
            ? Math.max(0, currentIndex - 1)
            : Math.min(memberIds.length - 1, currentIndex + 1);
        if (nextIndex === currentIndex) {
            return;
        }

        state.variantSelectionByTurn[turnKey] = memberIds[nextIndex];
        renderMessages();
        renderThreadState();
    }

    function handleMessageActions(event) {
        const thinkingToggle = event.target.closest("[data-thinking-toggle]");
        if (thinkingToggle) {
            const messageId = thinkingToggle.getAttribute("data-thinking-toggle");
            const message = state.messages.find(function (entry) {
                return entry.id === messageId;
            });
            if (!message) {
                return;
            }
            if (state.busy) {
                detachAutoFollow();
            }
            state.reasoningExpanded[messageId] = !isReasoningExpanded(message);
            const article = findMessageElement(messageId);
            if (article) {
                applyThinkingDisclosureState(article, message);
            } else {
                updateStreamingMessageElement(message);
            }
            return;
        }

        const versionNavButton = event.target.closest("[data-message-version-nav]");
        if (versionNavButton) {
            const messageId = versionNavButton.getAttribute("data-message-version-nav");
            const direction = versionNavButton.getAttribute("data-version-direction");
            handleMessageVersionNavigation(messageId, direction);
            return;
        }

        const regenerateButton = event.target.closest("[data-message-regenerate]");
        if (regenerateButton) {
            const messageId = regenerateButton.getAttribute("data-message-regenerate");
            if (state.busy) {
                toast("Please wait for the current response to finish.", "info");
                return;
            }
            handleRegenerateReplyByMessageId(messageId).catch(function (error) {
                toast(error && error.message ? error.message : "Unable to regenerate this reply.", "error");
            });
            return;
        }

        const codeCopyButton = event.target.closest("[data-code-copy]");
        if (codeCopyButton) {
            const codeContainer = codeCopyButton.closest(".markdown-code-wrap");
            const codeNode = codeContainer ? codeContainer.querySelector("pre code") : null;
            const copyValue = codeNode && codeNode.textContent ? codeNode.textContent : "";
            if (!copyValue) {
                toast("Nothing to copy.", "error");
                return;
            }
            navigator.clipboard.writeText(copyValue)
                .then(function () {
                    codeCopyButton.textContent = "Copied";
                    window.setTimeout(function () {
                        if (document.body.contains(codeCopyButton)) {
                            codeCopyButton.textContent = "Copy";
                        }
                    }, 1400);
                })
                .catch(function () {
                    toast("Clipboard access failed.", "error");
                });
            return;
        }

        const copyButton = event.target.closest("[data-message-copy]");
        if (!copyButton) {
            return;
        }
        const messageId = copyButton.getAttribute("data-message-copy");
        const message = state.messages.find(function (entry) {
            return entry.id === messageId;
        });
        const generatedImages = message && message.meta && Array.isArray(message.meta.generated_images)
            ? message.meta.generated_images
            : [];
        const copyValue = message && message.content
            ? message.content
            : generatedImages.map(function (item) {
                return item && item.url ? item.url : String(item || "");
            }).filter(Boolean).join("\n");
        if (!message || !copyValue) {
            toast("Nothing to copy.", "error");
            return;
        }
        navigator.clipboard.writeText(copyValue)
            .then(function () {
                toast("Message copied.", "success");
            })
            .catch(function () {
                toast("Clipboard access failed.", "error");
            });
    }

    function handleQuickPrompt(event) {
        const button = event.target.closest("[data-quick-prompt]");
        if (!button) {
            return;
        }
        dom.promptInput.value = button.getAttribute("data-quick-prompt") || "";
        utils.autoResizeTextarea(dom.promptInput);
        updatePromptCount();
        dom.promptInput.focus();
    }

    function queueUploadPlaceholders(files) {
        const staged = Array.isArray(files) ? files.map(function (file) {
            return normalizeAttachmentDescriptor({
                localId: "att-" + utils.uid(),
                name: file && file.name ? file.name : "Attachment",
                size: file && file.size ? file.size : 0,
                type: file && typeof file.type === "string" && file.type.toLowerCase().startsWith("image/")
                    ? "image"
                    : "file",
                status: "uploading"
            });
        }) : [];
        state.uploadingAttachments = state.uploadingAttachments.concat(staged);
        renderComposerAttachments();
        return staged;
    }

    async function uploadSelectedFiles(files) {
        const selectedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
        if (!selectedFiles.length) {
            return;
        }

        const staged = queueUploadPlaceholders(selectedFiles);
        const stagedIds = staged.map(function (item) {
            return item.localId;
        });

        try {
            await refreshRuntimeGatewayCredentials({ silent: true });
            const result = await gateway.uploadFiles({
                settings: getGatewayRuntimeSettings(),
                files: selectedFiles
            });
            const uploaded = Array.isArray(result && result.files) ? result.files : [];
            const failed = Array.isArray(result && result.errors) ? result.errors : [];

            state.uploadingAttachments = state.uploadingAttachments.filter(function (item) {
                return stagedIds.indexOf(item.localId) === -1;
            });

            uploaded.forEach(function (item, index) {
                const fallbackIndex = Number.isFinite(Number(item.index)) ? Number(item.index) : index;
                const fallback = staged[fallbackIndex] || staged[index] || {};
                state.pendingAttachments.push(normalizeAttachmentDescriptor(Object.assign({}, fallback, item, {
                    localId: fallback.localId || "att-" + utils.uid(),
                    status: "uploaded"
                })));
            });

            failed.forEach(function (item, index) {
                const fallbackIndex = Number.isFinite(Number(item.index)) ? Number(item.index) : uploaded.length + index;
                const fallback = staged[fallbackIndex] || staged[index] || {};
                state.pendingAttachments.push(normalizeAttachmentDescriptor(Object.assign({}, fallback, item, {
                    localId: fallback.localId || "att-" + utils.uid(),
                    status: "error"
                })));
            });

            renderComposerAttachments();
            if (uploaded.length) {
                toast(uploaded.length === 1 ? "Attachment ready." : uploaded.length + " attachments ready.", "success");
            }
            if (failed.length) {
                const firstFailure = failed[0] && (failed[0].error || failed[0].message);
                toast(firstFailure
                    ? "Attachment upload failed: " + firstFailure
                    : "Some attachments could not be uploaded.", "error");
            }
        } catch (error) {
            state.uploadingAttachments = state.uploadingAttachments.filter(function (item) {
                return stagedIds.indexOf(item.localId) === -1;
            });
            staged.forEach(function (item) {
                state.pendingAttachments.push(normalizeAttachmentDescriptor(Object.assign({}, item, {
                    status: "error",
                    error: error && error.message ? error.message : "Upload failed."
                })));
            });
            renderComposerAttachments();
            toast(error && error.message ? error.message : "Unable to upload the attachment.", "error");
        }
    }

    function handleComposerAttachClick() {
        if (!dom.composerFileInput || state.busy) {
            return;
        }
        if (getResolvedInteractionMode() === "image") {
            toast("Switch to Ask mode to upload attachments.", "info");
            return;
        }
        setComposerModeMenuOpen(false);
        dom.composerFileInput.click();
    }

    function handleComposerFileChange(event) {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        uploadSelectedFiles(files).catch(function (error) {
            toast(error && error.message ? error.message : "Unable to queue the attachment.", "error");
        });
    }

    function handleComposerAttachmentClick(event) {
        const button = event.target.closest("[data-remove-attachment]");
        if (!button) {
            return;
        }
        removeQueuedAttachment(button.getAttribute("data-remove-attachment"));
        renderComposerAttachments();
    }

    function handlePromptKeydown(event) {
        if (state.preferences.enterToSend && event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            dom.composerForm.requestSubmit();
        }
    }

    function handleComposerModeTrigger() {
        if (state.busy || getResolvedInteractionMode() !== "chat") {
            return;
        }
        setComposerModeMenuOpen(!state.composerModeMenuOpen);
    }

    function handleComposerModeMenuClick(event) {
        const button = event.target.closest("[data-composer-mode]");
        if (!button) {
            return;
        }
        setComposerMode(button.getAttribute("data-composer-mode"));
    }

    function handleComposerModelChange() {
        if (!dom.composerModelSelect) {
            return;
        }
        setStoredModelOverride(getResolvedInteractionMode(), dom.composerModelSelect.value);
        syncComposerControls();
    }

    function handleInteractionModeClick(event) {
        const button = event.target.closest("[data-interaction-mode]");
        if (!button || state.busy) {
            return;
        }
        const nextMode = button.getAttribute("data-interaction-mode");
        setInteractionMode(nextMode);
        if (nextMode === "image" && queuedAttachmentCount() > 0) {
            toast("Queued attachments stay in Ask mode. Remove them or switch back before sending.", "info");
        }
    }

    function handleGlobalPointerDown(event) {
        if (state.composerModeMenuOpen && dom.composerModePicker && !dom.composerModePicker.contains(event.target)) {
            setComposerModeMenuOpen(false);
        }

        if (
            state.profileMenuOpen &&
            dom.railProfileMenu &&
            dom.sidebarProfileBtn &&
            !dom.railProfileMenu.contains(event.target) &&
            !dom.sidebarProfileBtn.contains(event.target)
        ) {
            setProfileMenuOpen(false);
        }

        if (state.openThreadMenuId && dom.threadList && !dom.threadList.contains(event.target)) {
            setThreadMenuOpen(null);
        }
    }

    function handleGlobalKeydown(event) {
        if (event.key === "Escape" && state.composerModeMenuOpen) {
            setComposerModeMenuOpen(false);
        }
        if (event.key === "Escape" && state.profileMenuOpen) {
            setProfileMenuOpen(false);
        }
        if (event.key === "Escape" && state.openThreadMenuId) {
            setThreadMenuOpen(null);
        }
    }

    function handleMessagesScroll() {
        const currentTop = dom.messages.scrollTop;
        const scrollingUp = currentTop < state.lastMessagesScrollTop - 2;
        state.lastMessagesScrollTop = currentTop;

        if (scrollingUp) {
            detachAutoFollow();
            return;
        }

        if (isNearBottom()) {
            state.isAutoFollow = true;
            state.showJumpToLatest = false;
            renderJumpLatestButton();
            return;
        }

        state.isAutoFollow = false;
        if (state.busy) {
            state.showJumpToLatest = true;
            renderJumpLatestButton();
        }
    }

    function handleMessagesWheel(event) {
        if (!state.busy) {
            return;
        }
        if (event.deltaY < 0) {
            detachAutoFollow();
        }
    }

    function handleMessagesTouchStart() {
        state.touchScrollStartTop = dom.messages ? dom.messages.scrollTop : 0;
    }

    function handleMessagesTouchMove() {
        if (!state.busy || !dom.messages) {
            return;
        }
        if (dom.messages.scrollTop < state.touchScrollStartTop - 2) {
            detachAutoFollow();
        }
    }

    function handleJumpToLatest() {
        enableAutoFollow({
            scroll: true,
            behavior: "smooth"
        });
    }

    function startNewChat() {
        if (state.busy) {
            return;
        }
        setComposerModeMenuOpen(false);
        state.openThreadMenuId = null;
        state.activeThreadId = null;
        state.messages = [];
        state.reasoningExpanded = {};
        state.visibleMessages = [];
        state.messageVariantMeta = {};
        state.messageTurnKeyById = {};
        state.turnVariantMembers = {};
        state.variantSelectionByTurn = {};
        syncThreadRoute(null);
        utils.setStoredValue(activeStorageKey(), null);
        renderThreadList();
        renderMessages();
        renderThreadState();
        enableAutoFollow();
        setChatFeedback("idle", "Fresh conversation ready. Enter a prompt to start.");
        setActiveView("chat", { focusComposer: true });
    }

    async function handleResetSession() {
        const thread = getActiveThread();
        if (!thread || state.busy) {
            return;
        }
        try {
            await persistThreadUpdate(thread.id, {
                remote_session_id: null,
                remote_parent_id: null,
                last_trace: withPreservedShareTrace(thread, {}),
                updated_at: new Date().toISOString()
            });
            setChatFeedback("reset", "Remote session cleared. The next prompt will start a fresh session.");
            toast("Session reset for this chat.", "success");
        } catch (error) {
            toast(error.message || "Unable to reset the session.", "error");
        }
    }

    async function runRegenerationFromContext(regenerationContext, options) {
        const mergedOptions = Object.assign({
            selected: false
        }, options || {});
        const thread = getActiveThread();
        if (!thread || !regenerationContext || state.busy) {
            return;
        }

        const interactionMode = regenerationContext.interactionMode || "chat";
        const selectedModel = regenerationContext.model || getSelectedComposerModel(interactionMode);
        const selectedMode = regenerationContext.mode || getResolvedComposerMode(interactionMode, selectedModel);
        const regenerationPayload = interactionMode === "chat"
            ? buildRegenerationPayload(thread, regenerationContext)
            : null;

        if (interactionMode === "chat" && !regenerationPayload) {
            toast("Regeneration context is missing for this reply. Send one new prompt, then retry regeneration.", "error");
            return;
        }

        await runPromptTurn({
            prompt: regenerationContext.prompt,
            attachments: regenerationContext.attachments,
            interactionMode: interactionMode,
            model: selectedModel,
            mode: selectedMode,
            thread: thread,
            regeneration: regenerationPayload,
            persistUserMessage: false,
            replaceMessage: regenerationContext.replaceMessage,
            clearComposer: false,
            busyCopy: interactionMode === "image"
                ? "Regenerating image..."
                : mergedOptions.selected
                    ? "Regenerating selected reply..."
                    : "Regenerating the latest reply...",
            successCopy: interactionMode === "image"
                ? "Latest image regenerated."
                : mergedOptions.selected
                    ? "Selected reply regenerated."
                    : "Latest reply regenerated."
        });
    }

    async function handleRegenerateReplyByMessageId(messageId) {
        const latestAssistantId = state.latestRegeneratableAssistantId || getLatestRegeneratableAssistantId();
        if (!latestAssistantId || String(messageId || "") !== String(latestAssistantId)) {
            toast("Only the latest assistant reply can be regenerated right now.", "info");
            return;
        }
        const regenerationContext = getRegenerationContext(messageId);
        await runRegenerationFromContext(regenerationContext, {
            selected: true
        });
    }

    async function handleRegenerateReply() {
        const regenerationContext = getRegenerationContext();
        await runRegenerationFromContext(regenerationContext, {
            selected: false
        });
    }

    async function handleClearAllChats() {
        if (state.busy || !state.threads.length) {
            return;
        }
        const mode = getResolvedThreadMode();
        const activeBot = getActiveBot();
        const activeBotLabel = activeBot && activeBot.name
            ? activeBot.name
            : "Assistant";
        const scopeLabel = mode === "normal"
            ? "normal chats"
            : activeBotLabel + " bot";
        if (!window.confirm('Clear every chat for "' + scopeLabel + '" and start fresh?')) {
            return;
        }

        const threadSnapshot = state.threads.slice();
        const threadIds = threadSnapshot.map(function (thread) {
            return String(thread && thread.id || "").trim();
        }).filter(Boolean);
        const remoteSessionIds = threadSnapshot.map(function (thread) {
            return String(thread && thread.remote_session_id || "").trim();
        }).filter(Boolean);
        const unlinkedRemoteCount = threadSnapshot.filter(threadHasUnlinkedRemoteState).length;

        let result = { error: null };
        if (threadIds.length) {
            result = await client
                .from("chat_threads")
                .delete()
                .in("id", threadIds);
        }

        if (result.error) {
            toast(result.error.message || "Unable to clear chats.", "error");
            return;
        }

        state.threads = [];
        state.activeThreadId = null;
        state.messages = [];
        state.reasoningExpanded = {};
        state.visibleMessages = [];
        state.messageVariantMeta = {};
        state.messageTurnKeyById = {};
        state.turnVariantMembers = {};
        state.variantSelectionByTurn = {};
        state.threadQuery = "";
        utils.setStoredValue(activeStorageKey(), null);
        dom.threadSearchInput.value = "";
        renderThreadList();
        renderMessages();
        renderThreadState();
        enableAutoFollow();
        const summaryLabel = mode === "normal"
            ? "normal chats"
            : "" + activeBotLabel + " bot chats";
        setChatFeedback("idle", "All " + summaryLabel + " cleared. Start a fresh conversation.");
        renderChatMaintenanceStatus("All local " + summaryLabel + " were deleted. Running Qwen cleanup in the background...");
        toast("All " + summaryLabel + " cleared.", "success");

        if (!remoteSessionIds.length && unlinkedRemoteCount === 0) {
            renderChatMaintenanceStatus();
            return;
        }

        Promise.all(remoteSessionIds.map(function (sessionId) {
            return deleteRemoteThreadSession(sessionId);
        }))
            .then(function (remoteResults) {
                const failedCount = remoteResults.filter(function (entry) {
                    return entry.attempted && !entry.deleted;
                }).length;
                const skippedCount = remoteResults.filter(function (entry) {
                    return entry.skipped;
                }).length;

                const issues = [];
                if (failedCount > 0) {
                    issues.push(failedCount + " remote delete failures");
                }
                if (skippedCount > 0) {
                    issues.push(skippedCount + " remote deletes skipped");
                }
                if (unlinkedRemoteCount > 0) {
                    issues.push(unlinkedRemoteCount + " chats had no remote session ID");
                }

                if (!issues.length) {
                    renderChatMaintenanceStatus("All local " + summaryLabel + " were deleted and Qwen cleanup completed.");
                    return;
                }

                const message = "All local " + summaryLabel + " were deleted. " + issues.join("; ") + ".";
                renderChatMaintenanceStatus(message);
                toast(message, failedCount > 0 ? "error" : "info");
            })
            .catch(function (error) {
                const message = "All local " + summaryLabel + " were deleted. Qwen cleanup error: " + (error && error.message ? error.message : "unknown error.");
                renderChatMaintenanceStatus(message);
                toast(message, "error");
            });
    }

    async function saveProfileSettings(event) {
        event.preventDefault();
        const nextDisplayName = (dom.settingsDisplayName.value || "").trim();
        if (!nextDisplayName) {
            toast("Display name cannot be empty.", "error");
            return;
        }

        dom.profileSettingsStatus.textContent = "Saving profile...";

        const rpcResult = await client.rpc("update_own_profile", {
            next_display_name: nextDisplayName
        });

        if (rpcResult.error) {
            throw new Error(
                /update_own_profile/i.test(rpcResult.error.message || "")
                    ? "Run the updated Supabase SQL once to enable profile editing."
                    : rpcResult.error.message || "Unable to save your profile."
            );
        }

        const authResult = await client.auth.updateUser({
            data: {
                display_name: nextDisplayName
            }
        });

        if (authResult.error) {
            throw new Error(authResult.error.message || "Profile updated, but auth metadata could not be synced.");
        }

        state.context.profile = Object.assign({}, state.context.profile, rpcResult.data || {}, {
            display_name: nextDisplayName
        });
        renderProfile();
        dom.profileSettingsStatus.textContent = "Profile saved.";
        toast("Profile updated.", "success");
    }

    function savePreferenceSettings(event) {
        event.preventDefault();
        state.preferences.enterToSend = Boolean(dom.settingsEnterToSend.checked);
        state.preferences.showTimestamps = Boolean(dom.settingsShowTimestamps.checked);
        persistPreferences();
        renderPreferences();
        renderMessages();
        dom.preferencesSettingsStatus.textContent = "Preferences saved in this browser.";
        toast("Preferences updated.", "success");
    }

    function resetLocalPreferences() {
        state.preferences = Object.assign({}, DEFAULT_PREFERENCES, {
            activeView: "settings"
        });
        persistPreferences();
        theme.setThemePreference(window.Lumora.constants.WORKSPACE_THEME_VALUE);
        theme.initialize({
            settings: state.settings,
            authPage: false,
            allowWorkspaceDefault: true
        });
        renderPreferences();
        renderMessages();
        dom.preferencesSettingsStatus.textContent = "Local preferences reset.";
        dom.accountSettingsStatus.textContent = "Theme and local UI preferences were reset.";
        toast("Local preferences reset.", "success");
    }

    async function initializeAdminWorkspace() {
        if (
            !state.context ||
            state.context.profile.role !== "admin" ||
            !dom.embeddedAdminWorkspace
        ) {
            return;
        }

        if (state.adminWorkspace) {
            return;
        }

        const statusNode = dom.embeddedAdminWorkspace.querySelector('[data-admin-el="status-line"]');
        if (statusNode) {
            statusNode.textContent = "Loading admin data...";
        }

        const workspaceApi = await ensureAdminWorkspaceApiLoaded();
        if (!workspaceApi || typeof workspaceApi.create !== "function") {
            throw new Error("Admin workspace module unavailable. Hard refresh and retry.");
        }

        state.adminWorkspace = workspaceApi.create({
            root: dom.embeddedAdminWorkspace,
            context: state.context,
            initialSettings: state.settings,
            notify: toast,
            standalone: false,
            syncHash: false,
            defaultSection: "settings",
            onBackToChat: function () {
                setActiveView("chat", { focusComposer: true });
            },
            onSettingsSaved: async function (nextSettings) {
                const previousActiveThreadId = String(state.activeThreadId || "").trim();
                state.settings = nextSettings;
                ensureActiveBotPreference({ persist: true });
                ensureThreadModePreference({ persist: true });
                await loadThreads();
                if (previousActiveThreadId && state.threads.some(function (thread) {
                    return String(thread.id) === previousActiveThreadId;
                })) {
                    await setActiveThread(previousActiveThreadId);
                } else {
                    syncThreadRoute(null);
                    await restoreInitialThreadSelection();
                }
                await refreshRuntimeGatewayCredentials({ silent: true });
                utils.applyBranding(state.settings);
                theme.initialize({
                    settings: state.settings,
                    authPage: false,
                    allowWorkspaceDefault: true
                });
                renderMessages();
                renderThreadState();
                renderPreferences();
                syncComposerControls();
                if (!state.busy) {
                    setChatFeedback(
                        gateway.gatewayReady(getGatewayRuntimeSettings()) ? "ready" : "setup",
                        gateway.gatewayReady(getGatewayRuntimeSettings())
                            ? "Ready for a new prompt. Enter sends. Shift+Enter adds a new line."
                            : "An admin still needs to finish the assistant runtime setup."
                    );
                }
                applyShellState();
            }
        });

        await state.adminWorkspace.init();
    }

    async function init() {
        setAppReady(false);
        configureMarkdown();
        theme.initialize({
            authPage: false,
            allowWorkspaceDefault: true
        });
        utils.applyBranding();

        if (!auth.hasConfig) {
            utils.renderBlockingState("Supabase setup missing", auth.getConfigError(), "SUPABASE_SETUP.md", "Open setup guide");
            return;
        }

        const context = await auth.guardPage({});
        if (!context) {
            return;
        }
        state.context = context;
        readPreferences();
        if (state.context.profile.role !== "admin" && state.preferences.activeView === "admin") {
            state.preferences.activeView = "chat";
            persistPreferences();
        }
        state.settings = await fetchAppSettings();
        ensureActiveBotPreference({ persist: true });
        ensureThreadModePreference({ persist: true });
        await refreshRuntimeGatewayCredentials({ silent: true });
        utils.applyBranding(state.settings);
        theme.initialize({
            settings: state.settings,
            authPage: false,
            allowWorkspaceDefault: true
        });
        renderProfile();
        renderPreferences();
        setAppReady(true);
        try {
            await initializeAdminWorkspace();
        } catch (adminInitError) {
            console.warn("Admin workspace init skipped:", adminInitError && adminInitError.message ? adminInitError.message : adminInitError);
            const statusNode = dom.embeddedAdminWorkspace
                ? dom.embeddedAdminWorkspace.querySelector('[data-admin-el="status-line"]')
                : null;
            if (statusNode) {
                statusNode.textContent = "Admin load failed. Refresh and retry.";
            }
            toast(adminInitError && adminInitError.message
                ? adminInitError.message
                : "Admin workspace failed to load. Hard refresh and retry.", "error");
        }
        setBusy(false);
        setChatFeedback(
            gateway.gatewayReady(getGatewayRuntimeSettings()) ? "ready" : "setup",
            gateway.gatewayReady(getGatewayRuntimeSettings())
                ? "Ready for a new prompt. Enter sends, Shift+Enter adds a new line."
                : "An admin still needs to finish the assistant runtime setup."
        );

        await loadThreads();
        await restoreInitialThreadSelection();

        if (state.preferences.activeView === "admin" && state.context.profile.role === "admin") {
            openAdminView("settings");
        }
        applyShellState();

        dom.threadSearchInput.addEventListener("input", function () {
            state.threadQuery = dom.threadSearchInput.value || "";
            renderThreadList();
        });
        dom.threadList.addEventListener("click", handleThreadListClick);
        dom.threadList.addEventListener("scroll", handleThreadListScroll, { passive: true });
        if (dom.botList) {
            dom.botList.addEventListener("click", handleBotListClick);
        }
        if (dom.newThreadBtn) {
            dom.newThreadBtn.addEventListener("click", startNewChat);
        }
        if (dom.sidebarRailNewBtn) {
            dom.sidebarRailNewBtn.addEventListener("click", startNewChat);
        }
        if (dom.sidebarRailBotsBtn) {
            dom.sidebarRailBotsBtn.addEventListener("click", handleBotRailClick);
        }
        dom.sidebarToggleBtn.addEventListener("click", function () {
            setSidebarCollapsed(!state.preferences.sidebarCollapsed);
        });
        if (dom.sidebarRailChatsBtn) {
            dom.sidebarRailChatsBtn.addEventListener("click", function () {
                switchToNormalChatContext({ focusComposer: true }).catch(function (error) {
                    toast(error && error.message ? error.message : "Unable to open normal chats right now.", "error");
                });
            });
        }
        dom.sidebarRailSettingsBtn.addEventListener("click", function () {
            setActiveView("settings");
        });
        dom.sidebarProfileBtn.addEventListener("click", function () {
            setProfileMenuOpen(!state.profileMenuOpen);
        });
        if (dom.railProfileSettingsBtn) {
            dom.railProfileSettingsBtn.addEventListener("click", function () {
                setProfileMenuOpen(false);
                setActiveView("settings");
            });
        }
        if (dom.railProfileLogoutBtn) {
            dom.railProfileLogoutBtn.addEventListener("click", function () {
                setProfileMenuOpen(false);
                auth.signOut();
            });
        }
        dom.settingsBackBtn.addEventListener("click", function () {
            setActiveView("chat", { focusComposer: true });
        });
        dom.settingsSidebarToggleBtn.addEventListener("click", function () {
            setSidebarCollapsed(!state.preferences.sidebarCollapsed);
            dom.accountSettingsStatus.textContent = state.preferences.sidebarCollapsed
                ? "Sidebar is now collapsed."
                : "Sidebar is now expanded.";
        });
        dom.profileSettingsForm.addEventListener("submit", function (event) {
            saveProfileSettings(event).catch(function (error) {
                dom.profileSettingsStatus.textContent = error.message || "Unable to save profile.";
                toast(error.message || "Unable to save profile.", "error");
            });
        });
        dom.chatPreferencesForm.addEventListener("submit", function (event) {
            savePreferenceSettings(event);
        });
        dom.resetPreferencesBtn.addEventListener("click", resetLocalPreferences);
        dom.settingsLogoutBtn.addEventListener("click", function () {
            auth.signOut();
        });
        dom.renameThreadBtn.addEventListener("click", handleRenameThread);
        dom.pinThreadBtn.addEventListener("click", handlePinThread);
        if (dom.shareThreadBtn) {
            dom.shareThreadBtn.addEventListener("click", function () {
                handleShareThread().catch(function (error) {
                    toast(error.message || "Unable to generate a secure share link.", "error");
                });
            });
        }
        dom.resetSessionBtn.addEventListener("click", function () {
            handleResetSession().catch(function (error) {
                toast(error.message || "Unable to reset the session.", "error");
            });
        });
        dom.regenerateReplyBtn.addEventListener("click", function () {
            handleRegenerateReply().catch(function (error) {
                toast(error.message || "Unable to regenerate the reply.", "error");
            });
        });
        dom.exportThreadBtn.addEventListener("click", handleExportThread);
        dom.deleteThreadBtn.addEventListener("click", function () {
            handleDeleteThread().catch(function (error) {
                toast(error.message || "Unable to delete the chat.", "error");
            });
        });
        dom.clearChatsBtn.addEventListener("click", function () {
            handleClearAllChats().catch(function (error) {
                toast(error.message || "Unable to clear chats.", "error");
            });
        });
        dom.logoutBtn.addEventListener("click", function () {
            auth.signOut();
        });
        dom.sidebarRailAdminLink.addEventListener("click", function () {
            openAdminView("settings");
        });
        dom.adminLink.addEventListener("click", function () {
            openAdminView("settings");
        });
        dom.settingsAdminLink.addEventListener("click", function () {
            openAdminView("settings");
        });
        dom.composerForm.addEventListener("submit", function (event) {
            handleSend(event).catch(function (error) {
                toast(error.message || "Unable to send the message.", "error");
                setBusy(false);
                setChatFeedback("error", error.message || "Unable to send the message.");
            });
        });
        dom.composerIntentToggle.addEventListener("click", handleInteractionModeClick);
        dom.composerAttachBtn.addEventListener("click", handleComposerAttachClick);
        dom.composerFileInput.addEventListener("change", handleComposerFileChange);
        dom.composerModeTrigger.addEventListener("click", handleComposerModeTrigger);
        dom.composerModeMenu.addEventListener("click", handleComposerModeMenuClick);
        if (dom.composerModelSelect) {
            dom.composerModelSelect.addEventListener("change", handleComposerModelChange);
        }
        dom.stopBtn.addEventListener("click", handleStop);
        dom.composerAttachments.addEventListener("click", handleComposerAttachmentClick);
        dom.messages.addEventListener("click", handleMessageActions);
        dom.messages.addEventListener("scroll", handleMessagesScroll);
        dom.messages.addEventListener("wheel", handleMessagesWheel, { passive: true });
        dom.messages.addEventListener("touchstart", handleMessagesTouchStart, { passive: true });
        dom.messages.addEventListener("touchmove", handleMessagesTouchMove, { passive: true });
        if (dom.jumpLatestBtn) {
            dom.jumpLatestBtn.addEventListener("click", handleJumpToLatest);
        }
        dom.welcomePanel.addEventListener("click", handleQuickPrompt);
        dom.promptInput.addEventListener("input", function () {
            utils.autoResizeTextarea(dom.promptInput);
            updatePromptCount();
        });
        dom.promptInput.addEventListener("keydown", handlePromptKeydown);
        document.addEventListener("pointerdown", handleGlobalPointerDown);
        document.addEventListener("keydown", handleGlobalKeydown);
        window.addEventListener("resize", handleWindowResize);

        updatePromptCount();
        renderComposerAttachments();
        utils.autoResizeTextarea(dom.promptInput);
        syncDocumentTitle();
        if (state.preferences.activeView === "chat") {
            dom.promptInput.focus();
        }
    }

    init().catch(function (error) {
        setAppReady(true);
        utils.renderBlockingState("Chat unavailable", error && error.message ? error.message : "Unable to load the chat workspace.", "login.html", "Back to login");
    });
}());
