(function () {
    const auth = window.LumoraAuth;
    const utils = window.Lumora.utils;
    const theme = window.Lumora.theme;
    const flashNode = document.getElementById("auth-flash");
    const form = document.getElementById("signup-form");
    const submitButton = document.getElementById("signup-submit");
    const googleButton = document.getElementById("signup-google");
    const toast = utils.createNotifier(document.getElementById("toast"));

    function setBusy(isBusy, submitLabel, googleLabel) {
        submitButton.disabled = isBusy;
        submitButton.textContent = submitLabel || "Create Account";
        if (googleButton) {
            googleButton.disabled = isBusy;
            googleButton.textContent = googleLabel || "Continue with Google";
        }
    }

    function passwordPolicyError(password) {
        const value = String(password || "");
        if (value.length < 8) {
            return "Password must be at least 8 characters.";
        }
        if (!/[A-Z]/.test(value)) {
            return "Password must include at least one uppercase letter.";
        }
        if (!/[a-z]/.test(value)) {
            return "Password must include at least one lowercase letter.";
        }
        if (!/[0-9]/.test(value)) {
            return "Password must include at least one number.";
        }
        if (!/[^A-Za-z0-9]/.test(value)) {
            return "Password must include at least one special character.";
        }
        return "";
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
            utils.renderBlockingState("Signup unavailable", context.error, "SUPABASE_SETUP.md", "Open setup guide");
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

            const displayName = document.getElementById("signup-name").value.trim();
            const email = document.getElementById("signup-email").value.trim();
            const password = document.getElementById("signup-password").value;
            const confirmPassword = document.getElementById("signup-password-confirm").value;

            if (password !== confirmPassword) {
                toast("Passwords do not match.", "error");
                return;
            }
            const policyError = passwordPolicyError(password);
            if (policyError) {
                toast(policyError, "error");
                return;
            }

            setBusy(true, "Creating account...");

            try {
                const result = await auth.signUp(displayName, email, password);
                if (result.session) {
                    const contextAfterSignup = await auth.getCurrentContext();
                    utils.navigateTo(auth.roleHomePath(contextAfterSignup.profile), { replace: true });
                    return;
                }
                utils.setFlash("Account created. Check your email if confirmation is enabled, then sign in.", "success");
                utils.navigateTo("login.html", { replace: true });
            } catch (error) {
                toast(error && error.message ? error.message : "Unable to create account.", "error");
                setBusy(false, "Create Account");
            }
        });

        if (googleButton) {
            googleButton.addEventListener("click", async function () {
                setBusy(true, "Create Account", "Redirecting...");
                try {
                    const result = await auth.signInWithGoogle({
                        redirectPath: "chat.html"
                    });
                    if (result && result.url) {
                        window.location.assign(result.url);
                        return;
                    }
                    toast("Google sign-in could not start. Check Supabase Google provider settings.", "error");
                    setBusy(false, "Create Account", "Continue with Google");
                } catch (error) {
                    toast(error && error.message ? error.message : "Unable to continue with Google.", "error");
                    setBusy(false, "Create Account", "Continue with Google");
                }
            });
        }
    });
}());
