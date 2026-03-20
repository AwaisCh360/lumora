(function () {
    const STORAGE_PREFIX = "lumora";
    const DEFAULT_THEME = "obsidian";
    const THEME_PREFERENCE_KEY = "theme-preference";
    const THEME_LAST_RESOLVED_KEY = "theme-last-resolved";
    const WORKSPACE_THEME_VALUE = "workspace-default";
    const THEME_REGISTRY = [
        { id: "obsidian", label: "Obsidian", scheme: "dark" },
        { id: "porcelain", label: "Porcelain", scheme: "light" },
        { id: "graphite", label: "Graphite", scheme: "dark" },
        { id: "terminal", label: "Terminal", scheme: "dark" },
        { id: "ember", label: "Ember", scheme: "dark" },
        { id: "oceanic", label: "Oceanic", scheme: "dark" },
        { id: "noir", label: "Noir", scheme: "dark" },
        { id: "ivory", label: "Ivory", scheme: "light" },
        { id: "aurora", label: "Aurora", scheme: "dark" },
        { id: "atelier", label: "Atelier", scheme: "light" }
    ];

    const themeState = {
        settings: null,
        authPage: true,
        allowWorkspaceDefault: false
    };

    function uid() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function (char) {
            return (
                char ^
                window.crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> char / 4
            ).toString(16);
        });
    }

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function truncateText(text, maxLength) {
        const clean = String(text == null ? "" : text).trim();
        if (!clean) {
            return "";
        }
        if (clean.length <= maxLength) {
            return clean;
        }
        return clean.slice(0, Math.max(0, maxLength - 1)).trimEnd() + "…";
    }

    function formatDateTime(value) {
        if (!value) {
            return "-";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "-";
        }
        return new Intl.DateTimeFormat("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function formatTime(value) {
        if (!value) {
            return "-";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "-";
        }
        return new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function formatRole(value) {
        return value === "admin" ? "Admin" : "User";
    }

    function formatStatus(value) {
        return value === "inactive" ? "Inactive" : "Active";
    }

    async function sha256Hex(text) {
        const encoded = new TextEncoder().encode(text);
        const buffer = await crypto.subtle.digest("SHA-256", encoded);
        return Array.from(new Uint8Array(buffer))
            .map(function (byte) {
                return byte.toString(16).padStart(2, "0");
            })
            .join("");
    }

    function decodeJwtPayload(token) {
        if (!token || token.split(".").length < 2) {
            return null;
        }
        try {
            const normalized = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
            const json = atob(normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, "="));
            return JSON.parse(json);
        } catch (_error) {
            return null;
        }
    }

    function getTokenExpiry(token) {
        const payload = decodeJwtPayload(token);
        return payload && Number.isFinite(payload.exp) ? payload.exp * 1000 : 0;
    }

    function readList(value) {
        if (Array.isArray(value)) {
            return value.map(function (item) {
                return String(item).trim();
            }).filter(Boolean);
        }
        return String(value || "")
            .split(/\r?\n|,/)
            .map(function (item) {
                return item.trim();
            })
            .filter(Boolean);
    }

    function downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }

    function downloadJson(filename, data) {
        downloadFile(filename, JSON.stringify(data, null, 2), "application/json");
    }

    function createNotifier(element) {
        let timer = null;
        return function show(message, kind) {
            if (!element) {
                return;
            }
            element.hidden = false;
            element.textContent = message;
            element.dataset.kind = kind || "info";
            window.clearTimeout(timer);
            timer = window.setTimeout(function () {
                element.hidden = true;
            }, 3200);
        };
    }

    function setFlash(message, kind) {
        sessionStorage.setItem(
            STORAGE_PREFIX + ":flash",
            JSON.stringify({
                message: message,
                kind: kind || "info"
            })
        );
    }

    function consumeFlash() {
        const key = STORAGE_PREFIX + ":flash";
        const raw = sessionStorage.getItem(key);
        if (!raw) {
            return null;
        }
        sessionStorage.removeItem(key);
        try {
            return JSON.parse(raw);
        } catch (_error) {
            return null;
        }
    }

    function setStoredValue(key, value) {
        localStorage.setItem(STORAGE_PREFIX + ":" + key, JSON.stringify(value));
    }

    function getStoredValue(key, fallbackValue) {
        const raw = localStorage.getItem(STORAGE_PREFIX + ":" + key);
        if (!raw) {
            return fallbackValue;
        }
        try {
            return JSON.parse(raw);
        } catch (_error) {
            return fallbackValue;
        }
    }

    function isValidThemeId(value) {
        return THEME_REGISTRY.some(function (theme) {
            return theme.id === value;
        });
    }

    function getThemeDefinition(themeId) {
        return THEME_REGISTRY.find(function (theme) {
            return theme.id === themeId;
        }) || THEME_REGISTRY[0];
    }

    function getThemePreference() {
        return getStoredValue(THEME_PREFERENCE_KEY, null);
    }

    function setThemePreference(value) {
        if (!value) {
            localStorage.removeItem(STORAGE_PREFIX + ":" + THEME_PREFERENCE_KEY);
            return;
        }
        setStoredValue(THEME_PREFERENCE_KEY, value);
    }

    function resolveThemeId(settings, options) {
        const mergedOptions = Object.assign({
            authPage: false,
            allowWorkspaceDefault: false
        }, options || {});

        const storedPreference = getThemePreference();
        if (isValidThemeId(storedPreference)) {
            return storedPreference;
        }

        if (
            mergedOptions.allowWorkspaceDefault &&
            storedPreference === WORKSPACE_THEME_VALUE &&
            settings &&
            isValidThemeId(settings.theme_default)
        ) {
            return settings.theme_default;
        }

        if (!mergedOptions.authPage && settings && isValidThemeId(settings.theme_default)) {
            return settings.theme_default;
        }

        return DEFAULT_THEME;
    }

    function getThemeControlValue(settings, options, resolvedThemeId) {
        const mergedOptions = Object.assign({
            authPage: false,
            allowWorkspaceDefault: false
        }, options || {});
        const storedPreference = getThemePreference();
        if (mergedOptions.allowWorkspaceDefault && storedPreference === WORKSPACE_THEME_VALUE) {
            return WORKSPACE_THEME_VALUE;
        }
        if (isValidThemeId(storedPreference)) {
            return storedPreference;
        }
        if (!mergedOptions.authPage && mergedOptions.allowWorkspaceDefault && settings) {
            return WORKSPACE_THEME_VALUE;
        }
        return resolvedThemeId;
    }

    function applyTheme(themeId) {
        const definition = getThemeDefinition(themeId);
        document.documentElement.dataset.theme = definition.id;
        if (document.body) {
            document.body.dataset.theme = definition.id;
        }
        document.documentElement.style.colorScheme = definition.scheme;
    }

    function populateThemeSelect(select, options) {
        const mergedOptions = Object.assign({
            allowWorkspaceDefault: false
        }, options || {});
        const choices = [];
        if (mergedOptions.allowWorkspaceDefault) {
            choices.push({
                value: WORKSPACE_THEME_VALUE,
                label: "Workspace Default"
            });
        }
        THEME_REGISTRY.forEach(function (theme) {
            choices.push({
                value: theme.id,
                label: theme.label
            });
        });
        select.innerHTML = choices.map(function (choice) {
            return '<option value="' + escapeHtml(choice.value) + '">' + escapeHtml(choice.label) + "</option>";
        }).join("");
    }

    function syncThemeControls() {
        const resolvedThemeId = resolveThemeId(themeState.settings, themeState);
        const controlValue = getThemeControlValue(themeState.settings, themeState, resolvedThemeId);
        setStoredValue(THEME_LAST_RESOLVED_KEY, resolvedThemeId);
        document.querySelectorAll("[data-theme-select]").forEach(function (select) {
            populateThemeSelect(select, {
                allowWorkspaceDefault: themeState.allowWorkspaceDefault
            });
            select.value = controlValue;
        });
        applyTheme(resolvedThemeId);
        return resolvedThemeId;
    }

    function handleThemeSelectChange(event) {
        const nextValue = event.target.value;
        if (nextValue === WORKSPACE_THEME_VALUE) {
            setThemePreference(WORKSPACE_THEME_VALUE);
        } else if (isValidThemeId(nextValue)) {
            setThemePreference(nextValue);
        } else {
            setThemePreference(null);
        }
        syncThemeControls();
    }

    function initializeThemeControls(options) {
        const mergedOptions = Object.assign({
            settings: themeState.settings,
            authPage: themeState.authPage,
            allowWorkspaceDefault: themeState.allowWorkspaceDefault
        }, options || {});

        themeState.settings = mergedOptions.settings || null;
        themeState.authPage = Boolean(mergedOptions.authPage);
        themeState.allowWorkspaceDefault = Boolean(mergedOptions.allowWorkspaceDefault);

        document.querySelectorAll("[data-theme-select]").forEach(function (select) {
            if (!select.dataset.themeBound) {
                select.addEventListener("change", handleThemeSelectChange);
                select.dataset.themeBound = "true";
            }
        });

        return syncThemeControls();
    }

    function applyResolvedTheme(settings, options) {
        if (typeof settings !== "undefined") {
            themeState.settings = settings || null;
        }
        if (options) {
            themeState.authPage = Object.prototype.hasOwnProperty.call(options, "authPage")
                ? Boolean(options.authPage)
                : themeState.authPage;
            themeState.allowWorkspaceDefault = Object.prototype.hasOwnProperty.call(options, "allowWorkspaceDefault")
                ? Boolean(options.allowWorkspaceDefault)
                : themeState.allowWorkspaceDefault;
        }
        return syncThemeControls();
    }

    function getAvailableThemes() {
        return THEME_REGISTRY.slice();
    }

    function applyBranding(settings) {
        const config = window.LumoraConfig || {};
        const defaults = config.defaults || {};
        const brandName = (settings && settings.brand_name) || defaults.brandName || "Lumora";
        const brandTagline = (settings && settings.brand_tagline) || defaults.brandTagline || "";

        document.querySelectorAll("[data-brand-name]").forEach(function (node) {
            node.textContent = brandName;
        });
        document.querySelectorAll("[data-brand-tagline]").forEach(function (node) {
            node.textContent = brandTagline;
        });

        const title = document.title;
        if (title.includes("|")) {
            document.title = title.split("|")[0].trim() + " | " + brandName;
        }
    }

    function renderBlockingState(title, copy, linkHref, linkLabel) {
        document.body.innerHTML = [
            '<div class="app-backdrop" aria-hidden="true">',
            '<div class="grid-layer"></div>',
            '<div class="glow-layer glow-left"></div>',
            '<div class="glow-layer glow-right"></div>',
            '<div class="noise-layer"></div>',
            "</div>",
            '<main class="gate-shell">',
            '<section class="panel gate-card">',
            '<p class="eyebrow">Setup Required</p>',
            "<h1>" + escapeHtml(title) + "</h1>",
            '<p class="muted-copy">' + escapeHtml(copy) + "</p>",
            linkHref && linkLabel
                ? '<a class="ghost-link centered-link" href="' + escapeHtml(linkHref) + '">' + escapeHtml(linkLabel) + "</a>"
                : "",
            "</section>",
            "</main>"
        ].join("");
        applyResolvedTheme(null, {
            authPage: true,
            allowWorkspaceDefault: false
        });
    }

    function autoResizeTextarea(textarea) {
        if (!textarea) {
            return;
        }
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 220) + "px";
    }

    function prefersReducedMotion() {
        return Boolean(
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        );
    }

    function markPageReady() {
        if (!document.body) {
            return;
        }
        if (prefersReducedMotion()) {
            document.body.classList.add("is-page-ready");
            return;
        }
        requestAnimationFrame(function () {
            if (document.body) {
                document.body.classList.add("is-page-ready");
            }
        });
    }

    function isSafeNavigationTarget(value) {
        const target = String(value || "").trim();
        if (!target) {
            return false;
        }
        if (/^(javascript|data|vbscript):/i.test(target)) {
            return false;
        }
        try {
            const parsed = new URL(target, window.location.href);
            const parsedProtocol = String(parsed.protocol || "").toLowerCase();
            const currentProtocol = String(window.location.protocol || "").toLowerCase();

            if (/^https?:$/i.test(parsedProtocol)) {
                if (parsed.origin !== window.location.origin) {
                    return false;
                }
                return true;
            }

            if (parsedProtocol === "file:") {
                if (currentProtocol !== "file:") {
                    return false;
                }

                const currentPath = String(window.location.pathname || "");
                const currentDir = currentPath.replace(/[^/]*$/, "");
                const targetPath = String(parsed.pathname || "");
                return targetPath.startsWith(currentDir);
            }

            return false;
        } catch (_error) {
            return false;
        }
    }

    function navigateTo(url, options) {
        const mergedOptions = Object.assign({
            replace: false
        }, options || {});
        const target = String(url || "").trim();
        if (!target) {
            return false;
        }
        if (!isSafeNavigationTarget(target)) {
            console.warn("Blocked unsafe navigation target.");
            return false;
        }

        const commit = function () {
            if (mergedOptions.replace) {
                window.location.replace(target);
                return;
            }
            window.location.assign(target);
        };

        if (!document.body || prefersReducedMotion()) {
            commit();
            return true;
        }
        commit();
        return true;
    }

    function shouldHandleLinkTransition(anchor) {
        if (!anchor) {
            return false;
        }
        if (anchor.target && anchor.target !== "_self") {
            return false;
        }
        if (anchor.hasAttribute("download")) {
            return false;
        }

        const href = (anchor.getAttribute("href") || "").trim();
        if (!href || href.startsWith("#")) {
            return false;
        }
        if (/^(mailto:|tel:|javascript:)/i.test(href)) {
            return false;
        }
        if (/^[a-z]+:/i.test(href) && !/^file:/i.test(href)) {
            return false;
        }

        return /\.html(?:[?#].*)?$/i.test(href);
    }

    function bindPageLinkTransitions() {
        if (!document.body || document.body.dataset.pageLinksBound === "true") {
            return;
        }
        document.body.dataset.pageLinksBound = "true";
        document.addEventListener("click", function (event) {
            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            ) {
                return;
            }

            const anchor = event.target.closest("a[href]");
            if (!shouldHandleLinkTransition(anchor)) {
                return;
            }

            const href = anchor.getAttribute("href");
            event.preventDefault();
            navigateTo(href);
        });
    }

    function startViewTransition(update) {
        const applyUpdate = typeof update === "function" ? update : function () {};
        if (
            prefersReducedMotion() ||
            typeof document.startViewTransition !== "function"
        ) {
            applyUpdate();
            return Promise.resolve();
        }

        try {
            const transition = document.startViewTransition(function () {
                applyUpdate();
            });
            return transition.finished.catch(function () {
                return undefined;
            });
        } catch (_error) {
            applyUpdate();
            return Promise.resolve();
        }
    }

    window.Lumora = {
        constants: {
            STORAGE_PREFIX: STORAGE_PREFIX,
            DEFAULT_THEME: DEFAULT_THEME,
            WORKSPACE_THEME_VALUE: WORKSPACE_THEME_VALUE
        },
        utils: {
            uid: uid,
            escapeHtml: escapeHtml,
            truncateText: truncateText,
            formatDateTime: formatDateTime,
            formatTime: formatTime,
            formatRole: formatRole,
            formatStatus: formatStatus,
            sha256Hex: sha256Hex,
            decodeJwtPayload: decodeJwtPayload,
            getTokenExpiry: getTokenExpiry,
            readList: readList,
            downloadFile: downloadFile,
            downloadJson: downloadJson,
            createNotifier: createNotifier,
            setFlash: setFlash,
            consumeFlash: consumeFlash,
            setStoredValue: setStoredValue,
            getStoredValue: getStoredValue,
            applyBranding: applyBranding,
            renderBlockingState: renderBlockingState,
            autoResizeTextarea: autoResizeTextarea,
            prefersReducedMotion: prefersReducedMotion,
            navigateTo: navigateTo,
            bindPageLinkTransitions: bindPageLinkTransitions,
            markPageReady: markPageReady,
            startViewTransition: startViewTransition
        },
        theme: {
            getAvailableThemes: getAvailableThemes,
            initialize: initializeThemeControls,
            applyResolvedTheme: applyResolvedTheme,
            applyTheme: applyTheme,
            resolveThemeId: resolveThemeId,
            setThemePreference: setThemePreference,
            getThemePreference: getThemePreference,
            getThemeDefinition: getThemeDefinition
        }
    };

    applyResolvedTheme(null, {
        authPage: true,
        allowWorkspaceDefault: false
    });
    bindPageLinkTransitions();
    markPageReady();
}());
