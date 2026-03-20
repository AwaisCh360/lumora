(function () {
    const auth = window.LumoraAuth;
    const utils = window.Lumora.utils;
    const theme = window.Lumora.theme;
    let workspaceApi = window.LumoraAdminWorkspace;
    const ADMIN_WORKSPACE_SCRIPT_SRC = "scripts/admin-workspace.js?v=20260320-poolux8";
    const toast = utils.createNotifier(document.getElementById("toast"));

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

    async function ensureWorkspaceApiLoaded() {
        workspaceApi = window.LumoraAdminWorkspace;
        if (workspaceApi && typeof workspaceApi.create === "function") {
            return workspaceApi;
        }
        await loadScriptWithFreshQuery(ADMIN_WORKSPACE_SCRIPT_SRC);
        workspaceApi = window.LumoraAdminWorkspace;
        if (!workspaceApi || typeof workspaceApi.create !== "function") {
            throw new Error("Admin workspace module is unavailable.");
        }
        return workspaceApi;
    }

    function setAppReady(isReady) {
        if (!document.body) {
            return;
        }
        document.body.classList.toggle("is-app-ready", Boolean(isReady));
    }

    function resolveSectionFromHash() {
        const hash = (window.location.hash || "").replace(/^#/, "").trim();
        if (hash === "overview-section") {
            return "overview";
        }
        if (hash === "users-section") {
            return "users";
        }
        return "settings";
    }

    async function init() {
        setAppReady(false);
        theme.initialize({
            authPage: false,
            allowWorkspaceDefault: true
        });
        utils.applyBranding();

        if (!auth.hasConfig) {
            utils.renderBlockingState("Supabase setup missing", auth.getConfigError(), "SUPABASE_SETUP.md", "Open setup guide");
            return;
        }

        const context = await auth.guardPage({ requireAdmin: true });
        if (!context) {
            return;
        }

        const resolvedWorkspaceApi = await ensureWorkspaceApiLoaded();

        const workspace = resolvedWorkspaceApi.create({
            root: document.querySelector("[data-admin-workspace]"),
            context: context,
            notify: toast,
            standalone: true,
            syncHash: true,
            defaultSection: resolveSectionFromHash(),
            onLogout: function () {
                auth.signOut();
            }
        });

        await workspace.init();
        setAppReady(true);

        window.addEventListener("hashchange", function () {
            workspace.setActiveSection(resolveSectionFromHash(), { syncHash: false });
        });
    }

    init().catch(function (error) {
        setAppReady(true);
        utils.renderBlockingState("Admin unavailable", error && error.message ? error.message : "Unable to load the admin workspace.", "chat.html", "Open chat");
    });
}());
