(function () {
    const auth = window.LumoraAuth;
    const lumora = window.Lumora || {};
    const utils = lumora.utils || null;
    const theme = lumora.theme || null;
    const gateStatus = document.getElementById("gate-status");
    const gateCopy = document.getElementById("gate-copy");
    const ROUTER_TIMEOUT_MS = 12000;
    const ROUTER_LOG_PREFIX = "[LumoraRouter]";

    function logRouter(level, message, extra) {
        if (!window.console) {
            return;
        }
        const logger = typeof console[level] === "function"
            ? console[level]
            : console.log;
        if (typeof extra === "undefined") {
            logger(ROUTER_LOG_PREFIX + " " + message);
            return;
        }
        logger(ROUTER_LOG_PREFIX + " " + message, extra);
    }

    function setGateState(statusText, copyText) {
        if (gateStatus && typeof statusText === "string" && statusText.trim()) {
            gateStatus.textContent = statusText;
        }
        if (gateCopy && typeof copyText === "string" && copyText.trim()) {
            gateCopy.textContent = copyText;
        }
    }

    function resolveWithTimeout(promise, label, timeoutMs) {
        const duration = Number(timeoutMs) > 0 ? Number(timeoutMs) : ROUTER_TIMEOUT_MS;
        return Promise.race([
            promise,
            new Promise(function (_resolve, reject) {
                window.setTimeout(function () {
                    reject(new Error(label + " timed out after " + duration + "ms"));
                }, duration);
            })
        ]);
    }

    function routeWithFallback(targetPath) {
        if (!utils || typeof utils.navigateTo !== "function") {
            setGateState(
                "Routing unavailable",
                "Navigation helper is missing. Make sure scripts/shared.js loaded successfully (HTTP 200)."
            );
            return false;
        }

        const ok = utils.navigateTo(targetPath, { replace: true });
        if (ok) {
            logRouter("info", "Redirecting to " + targetPath);
            return true;
        }
        setGateState(
            "Redirect blocked",
            "Automatic redirect was blocked. Open " + targetPath + " directly."
        );
        logRouter("warn", "Redirect blocked for target: " + targetPath);
        return false;
    }

    if (!auth || !utils || !theme) {
        setGateState(
            "Bootstrap error",
            "Required scripts failed to initialize. Check that scripts/config.js, scripts/shared.js, scripts/auth.js, and scripts/router.js load without 404 errors."
        );
        logRouter("error", "Bootstrap dependency missing.", {
            hasAuth: Boolean(auth),
            hasUtils: Boolean(utils),
            hasTheme: Boolean(theme)
        });
        return;
    }

    function applyGateVisualSettings(settings) {
        const normalized = settings && typeof settings === "object"
            ? settings
            : null;
        theme.initialize({
            settings: normalized,
            authPage: true,
            allowWorkspaceDefault: false
        });
        utils.applyBranding(normalized);
    }

    applyGateVisualSettings(null);
    if (typeof auth.loadPublicUiSettings === "function") {
        auth.loadPublicUiSettings().then(function (publicSettings) {
            if (publicSettings) {
                applyGateVisualSettings(publicSettings);
            }
        }).catch(function () {
            return null;
        });
    }

    if (!auth.hasConfig) {
        if (gateStatus) {
            gateStatus.textContent = "Setup required";
        }
        if (gateCopy) {
            gateCopy.textContent = auth.getConfigError();
        }
        logRouter("error", "Supabase config missing or invalid.");
        return;
    }

    setGateState("Authorizing", "Checking your session and routing you to the correct dashboard.");
    logRouter("info", "Starting auth gate check.");

    resolveWithTimeout(
        auth.getCurrentContext(),
        "auth.getCurrentContext",
        ROUTER_TIMEOUT_MS
    )
        .then(function (context) {
            if (context.error) {
                setGateState("Unable to load", context.error);
                logRouter("warn", "Auth context returned error.", context.error);
                if (/timed out|network|fetch/i.test(String(context.error || ""))) {
                    setGateState("Auth delayed", "Session check timed out. Opening login...");
                    window.setTimeout(function () {
                        routeWithFallback("login.html");
                    }, 350);
                }
                return;
            }
            if (!context.session) {
                logRouter("info", "No active session found. Going to login.");
                routeWithFallback("login.html");
                return;
            }
            if (context.profileWarning) {
                logRouter("warn", "Profile fallback used during gate routing.", context.profileWarning);
            }
            logRouter("info", "Session found. Going to home route.");
            routeWithFallback(auth.roleHomePath(context.profile));
        })
        .catch(function (error) {
            const message = error && error.message
                ? error.message
                : "Unexpected auth error.";
            setGateState("Unable to continue", message);
            logRouter("error", "Auth gate crashed.", error);
            window.setTimeout(function () {
                routeWithFallback("login.html");
            }, 400);
        });
}());
