(function () {
    const utils = window.Lumora && window.Lumora.utils;
    const config = window.LumoraConfig || {};
    const hasSupabaseCredentials = Boolean(
        config.supabaseUrl &&
        config.supabaseAnonKey &&
        !String(config.supabaseUrl).includes("YOUR-PROJECT") &&
        !String(config.supabaseAnonKey).includes("YOUR_SUPABASE_ANON_KEY")
    );
    const hasSupabaseClient = Boolean(
        window.supabase &&
        typeof window.supabase.createClient === "function"
    );
    const hasConfig = hasSupabaseCredentials && hasSupabaseClient;

    const client = hasConfig
        ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        })
        : null;
    const CHAT_HOME_PATH = "chat.html?new=1";
    const AUTH_TIMEOUT_MS = 12000;
    const AUTH_LOG_PREFIX = "[LumoraAuth]";
    const PUBLIC_UI_RPC_NAME = "get_public_workspace_ui_settings";
    let publicUiSettingsCache = null;

    function logAuth(level, message, extra) {
        if (!window.console) {
            return;
        }
        const logger = typeof console[level] === "function"
            ? console[level]
            : console.log;
        if (typeof extra === "undefined") {
            logger(AUTH_LOG_PREFIX + " " + message);
            return;
        }
        logger(AUTH_LOG_PREFIX + " " + message, extra);
    }

    function timeoutError(label, timeoutMs) {
        const duration = Number(timeoutMs) > 0 ? Number(timeoutMs) : AUTH_TIMEOUT_MS;
        return new Promise(function (_resolve, reject) {
            window.setTimeout(function () {
                reject(new Error(label + " timed out after " + duration + "ms"));
            }, duration);
        });
    }

    function withTimeout(promise, label, timeoutMs) {
        return Promise.race([
            promise,
            timeoutError(label, timeoutMs)
        ]);
    }

    function getConfigError() {
        if (!hasSupabaseCredentials) {
            return "Open qwen_chatbot_scratch/scripts/config.js and fill in your Supabase URL and anon key.";
        }
        if (!hasSupabaseClient) {
            return "Supabase SDK failed to load. Check your internet or CDN access, then refresh the page.";
        }
        return "Open qwen_chatbot_scratch/scripts/config.js and fill in your Supabase URL and anon key.";
    }

    function buildProfilePayload(user) {
        const email = user && user.email ? user.email : "";
        const displayName = user && user.user_metadata && typeof user.user_metadata.display_name === "string"
            ? user.user_metadata.display_name.trim()
            : email.split("@")[0] || "User";
        return {
            id: user.id,
            email: email,
            display_name: displayName || "User"
        };
    }

    function buildFallbackProfile(user) {
        const payload = buildProfilePayload(user || {});
        payload.role = "user";
        payload.status = "active";
        return payload;
    }

    function attachAuthDiagnostics() {
        if (!client || !client.auth || typeof client.auth.onAuthStateChange !== "function") {
            return;
        }
        try {
            client.auth.onAuthStateChange(function (eventName, session) {
                logAuth("info", "Auth state changed: " + String(eventName || "unknown"), {
                    hasSession: Boolean(session)
                });
            });
        } catch (error) {
            logAuth("warn", "Unable to attach auth-state diagnostics listener.", error);
        }
    }

    function normalizePublicUiSettings(value) {
        const row = value && typeof value === "object" ? value : {};
        const themeDefault = String(row.theme_default || "").trim();
        const normalized = {
            brand_name: String(row.brand_name || "").trim(),
            brand_tagline: String(row.brand_tagline || "").trim(),
            theme_default: themeDefault || "obsidian"
        };
        return normalized;
    }

    async function loadPublicUiSettings(options) {
        const settings = Object.assign({
            force: false
        }, options || {});

        if (publicUiSettingsCache && !settings.force) {
            return Object.assign({}, publicUiSettingsCache);
        }

        if (!client) {
            return null;
        }

        let rpcResult = null;
        try {
            rpcResult = await withTimeout(
                client.rpc(PUBLIC_UI_RPC_NAME),
                "rpc." + PUBLIC_UI_RPC_NAME,
                AUTH_TIMEOUT_MS
            );
        } catch (error) {
            logAuth("warn", "Public UI settings RPC timed out or failed.", error);
            return null;
        }

        if (rpcResult && rpcResult.error) {
            const message = String(rpcResult.error.message || "");
            if (/does not exist|schema cache|permission denied|not allowed/i.test(message)) {
                logAuth("info", "Public UI settings RPC unavailable yet; falling back to local defaults.");
                return null;
            }
            logAuth("warn", "Public UI settings RPC returned an error.", rpcResult.error);
            return null;
        }

        const row = Array.isArray(rpcResult && rpcResult.data)
            ? rpcResult.data[0]
            : rpcResult && rpcResult.data;
        if (!row || typeof row !== "object") {
            return null;
        }

        publicUiSettingsCache = normalizePublicUiSettings(row);
        return Object.assign({}, publicUiSettingsCache);
    }

    async function ensureOwnProfile(user) {
        if (!user || !user.id) {
            return buildFallbackProfile(user || {});
        }

        const selected = await withTimeout(
            client
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .maybeSingle(),
            "profiles.select"
        );

        if (selected.error) {
            throw new Error(selected.error.message || "Unable to load your profile.");
        }
        if (selected.data) {
            return selected.data;
        }

        const inserted = await withTimeout(
            client
                .from("profiles")
                .insert(buildProfilePayload(user))
                .select("*")
                .single(),
            "profiles.insert"
        );

        if (inserted.error) {
            throw new Error(inserted.error.message || "Unable to create your profile.");
        }

        return inserted.data;
    }

    async function getCurrentContext() {
        if (!client) {
            return { error: getConfigError() };
        }

        let sessionResult = null;
        try {
            sessionResult = await withTimeout(
                client.auth.getSession(),
                "auth.getSession"
            );
        } catch (error) {
            logAuth("error", "Session lookup failed.", error);
            return {
                error: error && error.message
                    ? error.message
                    : "Unable to read your session."
            };
        }

        if (sessionResult.error) {
            return { error: sessionResult.error.message || "Unable to read your session." };
        }

        const session = sessionResult.data.session;
        if (!session) {
            return { session: null, user: null, profile: null };
        }

        let profile = null;
        let profileWarning = null;
        try {
            profile = await withTimeout(
                ensureOwnProfile(session.user),
                "profile.ensure"
            );
        } catch (error) {
            profile = buildFallbackProfile(session.user);
            profileWarning = error && error.message
                ? error.message
                : "Profile lookup failed.";
            logAuth("warn", "Profile lookup failed; continuing with fallback profile.", error);
        }

        return {
            session: session,
            user: session.user,
            profile: profile,
            profileWarning: profileWarning
        };
    }

    function roleHomePath(profile) {
        return CHAT_HOME_PATH;
    }

    async function guardPage(options) {
        const settings = Object.assign({
            authPage: false,
            requireAdmin: false,
            redirectUnauthedTo: "login.html",
            redirectAuthedTo: null
        }, options || {});

        if (!client) {
            return { error: getConfigError() };
        }

        const context = await getCurrentContext();
        if (context.error) {
            return context;
        }

        if (!context.session) {
            if (settings.authPage) {
                return context;
            }
            utils.navigateTo(settings.redirectUnauthedTo, { replace: true });
            return null;
        }

        if (context.profile && context.profile.status === "inactive") {
            utils.setFlash("Your account is inactive. Contact an administrator.", "error");
            await client.auth.signOut();
            utils.navigateTo("login.html", { replace: true });
            return null;
        }

        if (settings.authPage) {
            utils.navigateTo(settings.redirectAuthedTo || roleHomePath(context.profile), { replace: true });
            return null;
        }

        if (settings.requireAdmin && context.profile.role !== "admin") {
            utils.navigateTo("chat.html", { replace: true });
            return null;
        }

        return context;
    }

    async function signIn(email, password) {
        if (!client) {
            throw new Error(getConfigError());
        }
        const result = await client.auth.signInWithPassword({
            email: email,
            password: password
        });
        if (result.error) {
            throw new Error(result.error.message || "Login failed.");
        }
        try {
            await withTimeout(
                ensureOwnProfile(result.data.user),
                "profile.ensure-after-signin"
            );
        } catch (error) {
            logAuth("warn", "Profile sync after sign-in failed.", error);
        }
        return result.data;
    }

    async function signUp(displayName, email, password) {
        if (!client) {
            throw new Error(getConfigError());
        }
        const result = await client.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    display_name: displayName
                }
            }
        });
        if (result.error) {
            throw new Error(result.error.message || "Signup failed.");
        }
        if (result.data.user && result.data.session) {
            try {
                await withTimeout(
                    ensureOwnProfile(result.data.user),
                    "profile.ensure-after-signup"
                );
            } catch (error) {
                logAuth("warn", "Profile sync after signup failed.", error);
            }
        }
        return result.data;
    }

    async function signInWithGoogle(options) {
        if (!client) {
            throw new Error(getConfigError());
        }

        const settings = Object.assign({
            redirectPath: roleHomePath(null)
        }, options || {});

        const redirectPath = String(settings.redirectPath || roleHomePath(null)).trim() || roleHomePath(null);
        const redirectTo = new URL(redirectPath, window.location.href).toString();

        const result = await client.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: redirectTo,
                queryParams: {
                    prompt: "select_account"
                }
            }
        });

        if (result.error) {
            throw new Error(result.error.message || "Google sign-in failed.");
        }

        return result.data;
    }

    async function signOut() {
        if (!client) {
            return;
        }
        await client.auth.signOut();
        utils.navigateTo("login.html", { replace: true });
    }

    window.LumoraAuth = {
        client: client,
        hasConfig: hasConfig,
        getConfigError: getConfigError,
        getCurrentContext: getCurrentContext,
        guardPage: guardPage,
        signIn: signIn,
        signUp: signUp,
        signInWithGoogle: signInWithGoogle,
        signOut: signOut,
        ensureOwnProfile: ensureOwnProfile,
        loadPublicUiSettings: loadPublicUiSettings,
        roleHomePath: roleHomePath
    };

    attachAuthDiagnostics();
}());
