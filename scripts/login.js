(function () {
    const auth = window.LumoraAuth;
    const utils = window.Lumora.utils;
    const theme = window.Lumora.theme;
    const flashNode = document.getElementById("auth-flash");
    const form = document.getElementById("login-form");
    const submitButton = document.getElementById("login-submit");
    const googleButton = document.getElementById("login-google");
    const toast = utils.createNotifier(document.getElementById("toast"));

    function setBusy(isBusy, submitLabel, googleLabel) {
        submitButton.disabled = isBusy;
        submitButton.textContent = submitLabel || "Sign In";
        if (googleButton) {
            googleButton.disabled = isBusy;
            googleButton.textContent = googleLabel || "Continue with Google";
        }
    }

    function revealAuthUi() {
        if (!document.body) {
            return;
        }
        document.body.classList.remove("auth-ui-loading");
        document.body.classList.add("auth-ui-ready");
    }

    function markAuthUiReady() {
        if (!document.fonts || !document.fonts.ready) {
            requestAnimationFrame(revealAuthUi);
            return;
        }
        Promise.race([
            document.fonts.ready,
            new Promise(function (resolve) {
                window.setTimeout(resolve, 900);
            })
        ]).then(revealAuthUi).catch(revealAuthUi);
    }

    markAuthUiReady();

    function applyAuthVisualSettings(settings) {
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

    applyAuthVisualSettings(null);
    if (typeof auth.loadPublicUiSettings === "function") {
        auth.loadPublicUiSettings().then(function (publicSettings) {
            if (publicSettings) {
                applyAuthVisualSettings(publicSettings);
            }
        }).catch(function () {
            return null;
        });
    }

    if (!auth.hasConfig) {
        utils.renderBlockingState("Supabase setup missing", auth.getConfigError(), "SUPABASE_SETUP.md", "Open setup guide");
        return;
    }

    auth.guardPage({ authPage: true }).then(function (context) {
        if (context === null) {
            return;
        }
        if (context && context.error) {
            utils.renderBlockingState("Login unavailable", context.error, "SUPABASE_SETUP.md", "Open setup guide");
            return;
        }

        const flash = utils.consumeFlash();
        if (flash && flashNode) {
            flashNode.hidden = false;
            flashNode.dataset.kind = flash.kind || "info";
            flashNode.textContent = flash.message;
        }

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            setBusy(true, "Signing in...");

            const email = document.getElementById("login-email").value.trim();
            const password = document.getElementById("login-password").value;

            try {
                const result = await auth.signIn(email, password);
                const contextAfterLogin = await auth.getCurrentContext();
                utils.navigateTo(auth.roleHomePath(contextAfterLogin.profile), { replace: true });
            } catch (error) {
                toast(error && error.message ? error.message : "Unable to sign in.", "error");
                setBusy(false, "Sign In");
            }
        });

        if (googleButton) {
            googleButton.addEventListener("click", async function () {
                setBusy(true, "Sign In", "Redirecting...");
                try {
                    const result = await auth.signInWithGoogle({
                        redirectPath: "chat.html"
                    });
                    if (result && result.url) {
                        window.location.assign(result.url);
                        return;
                    }
                    toast("Google sign-in could not start. Check Supabase Google provider settings.", "error");
                    setBusy(false, "Sign In", "Continue with Google");
                } catch (error) {
                    toast(error && error.message ? error.message : "Unable to continue with Google.", "error");
                    setBusy(false, "Sign In", "Continue with Google");
                }
            });
        }
    });
}());
