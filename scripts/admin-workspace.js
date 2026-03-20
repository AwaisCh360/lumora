(function () {
    const auth = window.LumoraAuth;
    const client = auth.client;
    const gateway = window.LumoraGateway;
    const utils = window.Lumora.utils;
    const theme = window.Lumora.theme;
    const VALID_SECTIONS = ["settings", "users", "overview"];
    const DEFAULT_POOL_CAPACITY = 4;
    const POOL_PAGE_SIZE = 10;
    const USER_PAGE_SIZE = 10;

    function getNode(root, key) {
        return root.querySelector('[data-admin-el="' + key + '"]');
    }

    function getSectionId(section) {
        return "#" + section + "-section";
    }

    function normalizeSection(value) {
        return VALID_SECTIONS.indexOf(value) === -1 ? "settings" : value;
    }

    function createWorkspace(options) {
        const root = options && options.root;
        if (!root) {
            throw new Error("Admin workspace root was not provided.");
        }

        const notify = typeof options.notify === "function"
            ? options.notify
            : function () {};
        const state = {
            context: options.context || null,
            settings: options.initialSettings || null,
            users: [],
            userQuery: "",
            userPage: 1,
            dirtyUserIds: new Set(),
            usersSaveInProgress: false,
            poolAccounts: [],
            poolAssignments: {},
            poolPage: 1,
            poolSchemaReady: true,
            liveModels: [],
            modelFilter: "",
            modelAliasesDraft: {},
            botsDraft: [],
            activeSection: normalizeSection(options.defaultSection || "settings"),
            unsupportedSettingColumns: new Set(),
            bound: false
        };

        const dom = {
            profileName: getNode(root, "profile-name"),
            profileEmail: getNode(root, "profile-email"),
            logoutBtn: getNode(root, "logout-btn"),
            backBtn: getNode(root, "back-btn"),
            statusLine: getNode(root, "status-line"),
            metricTotalUsers: getNode(root, "metric-total-users"),
            metricTotalAdmins: getNode(root, "metric-total-admins"),
            metricTotalThreads: getNode(root, "metric-total-threads"),
            metricDefaultModel: getNode(root, "metric-default-model"),
            settingsForm: getNode(root, "settings-form"),
            loadModelsBtn: getNode(root, "load-models-btn"),
            settingsStatus: getNode(root, "settings-status"),
            brandName: getNode(root, "settings-brand-name"),
            brandTagline: getNode(root, "settings-brand-tagline"),
            themeDefault: getNode(root, "settings-theme-default"),
            welcomeTitle: getNode(root, "settings-welcome-title"),
            welcomeCopy: getNode(root, "settings-welcome-copy"),
            gatewayBaseUrl: getNode(root, "settings-gateway-base-url"),
            gatewayProxyTemplate: getNode(root, "settings-gateway-proxy-template"),
            gatewayEmail: getNode(root, "settings-gateway-email"),
            gatewayPassword: getNode(root, "settings-gateway-password"),
            defaultModel: getNode(root, "settings-default-model"),
            defaultImageModel: getNode(root, "settings-default-image-model"),
            thinkingBudget: getNode(root, "settings-thinking-budget"),
            thinkingEnabled: getNode(root, "settings-thinking-enabled"),
            allowedModels: getNode(root, "settings-allowed-models"),
            modelFilter: getNode(root, "settings-model-filter"),
            modelOptions: getNode(root, "settings-model-options"),
            modelSummary: getNode(root, "settings-model-summary"),
            botOptions: getNode(root, "settings-bot-options"),
            botSummary: getNode(root, "settings-bot-summary"),
            botAddBtn: getNode(root, "settings-bot-add-btn"),
            bots: getNode(root, "settings-bots"),
            userSearchInput: getNode(root, "user-search-input"),
            usersSaveAllBtn: getNode(root, "users-save-all-btn"),
            usersSaveSummary: getNode(root, "users-save-summary"),
            usersTableBody: getNode(root, "users-table-body"),
            usersPagination: getNode(root, "users-pagination"),
            usersPagePrev: getNode(root, "users-page-prev"),
            usersPageNext: getNode(root, "users-page-next"),
            usersPageNumbers: getNode(root, "users-page-numbers"),
            usersPageSummary: getNode(root, "users-page-summary"),
            poolSummary: getNode(root, "pool-summary"),
            poolTableBody: getNode(root, "pool-table-body"),
            poolImportJson: getNode(root, "pool-import-json"),
            poolJsonFile: getNode(root, "pool-json-file"),
            poolImportBtn: getNode(root, "pool-import-btn"),
            poolLoadLocalBtn: getNode(root, "pool-load-local-btn"),
            poolRefreshBtn: getNode(root, "pool-refresh-btn"),
            poolAutoAssignBtn: getNode(root, "pool-auto-assign-btn"),
            poolPagination: getNode(root, "pool-pagination"),
            poolPagePrev: getNode(root, "pool-page-prev"),
            poolPageNext: getNode(root, "pool-page-next"),
            poolPageNumbers: getNode(root, "pool-page-numbers"),
            poolPageSummary: getNode(root, "pool-page-summary"),
            navButtons: Array.from(root.querySelectorAll("[data-admin-section-target]")),
            sections: Array.from(root.querySelectorAll("[data-admin-section]"))
        };

        function setStatusLine(message) {
            if (dom.statusLine) {
                dom.statusLine.textContent = message;
            }
        }

        function renderProfile() {
            if (dom.profileName) {
                dom.profileName.textContent = state.context.profile.display_name || "Admin";
            }
            if (dom.profileEmail) {
                dom.profileEmail.textContent = state.context.user.email || "";
            }
        }

        function commitSectionState(optionsOverride) {
            const mergedOptions = Object.assign({ animate: false, syncHash: options.syncHash }, optionsOverride || {});
            dom.navButtons.forEach(function (button) {
                const isActive = button.getAttribute("data-admin-section-target") === state.activeSection;
                button.classList.toggle("is-active", isActive);
                button.setAttribute("aria-pressed", isActive ? "true" : "false");
            });
            dom.sections.forEach(function (section) {
                const shouldShow = section.getAttribute("data-admin-section") === state.activeSection;
                if (!mergedOptions.animate || utils.prefersReducedMotion()) {
                    section.hidden = !shouldShow;
                    section.classList.toggle("is-active-section", shouldShow);
                    return;
                }

                if (shouldShow) {
                    section.hidden = false;
                    section.classList.remove("is-active-section");
                    requestAnimationFrame(function () {
                        section.classList.add("is-active-section");
                    });
                    return;
                }

                if (section.hidden) {
                    section.classList.remove("is-active-section");
                    return;
                }

                section.classList.remove("is-active-section");
                window.setTimeout(function () {
                    if (!section.classList.contains("is-active-section")) {
                        section.hidden = true;
                    }
                }, 180);
            });
            if (mergedOptions.syncHash && window.history && typeof window.history.replaceState === "function") {
                window.history.replaceState(null, "", getSectionId(state.activeSection));
            }
        }

        function renderSectionState() {
            commitSectionState({ animate: false, syncHash: options.syncHash });
        }

        function setActiveSection(section, extraOptions) {
            const mergedOptions = Object.assign({ syncHash: options.syncHash }, extraOptions || {});
            const nextSection = normalizeSection(section);
            const previousSection = state.activeSection;
            state.activeSection = nextSection;

            commitSectionState({
                animate: previousSection !== nextSection,
                syncHash: mergedOptions.syncHash
            });
        }

        function readSectionTargetFromEvent(event) {
            const trigger = event && event.target && typeof event.target.closest === "function"
                ? event.target.closest("[data-admin-section-target]")
                : null;
            if (!trigger || !root.contains(trigger)) {
                return "";
            }
            return String(trigger.getAttribute("data-admin-section-target") || "").trim();
        }

        async function fetchAppSettings() {
            const result = await client
                .from("app_settings")
                .select("*")
                .eq("id", "global")
                .maybeSingle();

            if (result.error) {
                throw new Error(result.error.message || "Unable to load app settings.");
            }

            return gateway.normalizeAppSettings(result.data || {});
        }

        async function ensureSettingsLoaded() {
            if (state.settings) {
                return state.settings;
            }
            state.settings = await fetchAppSettings();
            return state.settings;
        }

        async function loadOverview() {
            const usersCount = await client
                .from("profiles")
                .select("id", { count: "exact", head: true });
            const adminsCount = await client
                .from("profiles")
                .select("id", { count: "exact", head: true })
                .eq("role", "admin");
            const threadsCount = await client
                .from("chat_threads")
                .select("id", { count: "exact", head: true });

            if (usersCount.error || adminsCount.error || threadsCount.error) {
                throw new Error(
                    usersCount.error && usersCount.error.message ||
                    adminsCount.error && adminsCount.error.message ||
                    threadsCount.error && threadsCount.error.message ||
                    "Unable to load overview metrics."
                );
            }

            if (dom.metricTotalUsers) {
                dom.metricTotalUsers.textContent = String(usersCount.count || 0);
            }
            if (dom.metricTotalAdmins) {
                dom.metricTotalAdmins.textContent = String(adminsCount.count || 0);
            }
            if (dom.metricTotalThreads) {
                dom.metricTotalThreads.textContent = String(threadsCount.count || 0);
            }
            if (dom.metricDefaultModel) {
                const defaultModelId = String(state.settings && state.settings.default_model || "").trim();
                dom.metricDefaultModel.textContent = defaultModelId
                    ? getModelUiName(defaultModelId, defaultModelId)
                    : "-";
            }
        }

        async function loadUsers() {
            const result = await client
                .from("profiles")
                .select("*")
                .order("created_at", { ascending: false });

            if (result.error) {
                throw new Error(result.error.message || "Unable to load users.");
            }

            state.users = Array.isArray(result.data) ? result.data : [];
            renderUsers();
            renderPoolSummary();
            renderPoolTable();
        }

        function isPoolSchemaMissingError(error) {
            const message = String(error && error.message || "").toLowerCase();
            if (!message) {
                return false;
            }
            const mentionsPoolObject = /gateway_account_pool|profile_gateway_pool_assignments|resolve_gateway_runtime_credentials/.test(message);
            const mentionsMissingObject = /does not exist|schema cache|relation|function|column/.test(message);
            return mentionsPoolObject && mentionsMissingObject;
        }

        function normalizePoolAccount(record) {
            const item = record && typeof record === "object" ? record : {};
            const maxUsersRaw = Number(item.max_users);
            const maxUsers = Number.isFinite(maxUsersRaw) && maxUsersRaw > 0
                ? Math.floor(maxUsersRaw)
                : DEFAULT_POOL_CAPACITY;
            const status = String(item.status || "active").trim().toLowerCase() === "inactive"
                ? "inactive"
                : "active";
            return {
                id: String(item.id || "").trim(),
                label: String(item.label || "Pool account").trim() || "Pool account",
                email: String(item.email || "").trim(),
                password_hash: String(item.password_hash || "").trim(),
                access_token: String(item.access_token || "").trim(),
                token_expiry: item.token_expiry || null,
                max_users: maxUsers,
                status: status,
                updated_at: item.updated_at || item.created_at || null
            };
        }

        function normalizePoolAssignments(rows) {
            const next = {};
            (Array.isArray(rows) ? rows : []).forEach(function (row) {
                const userId = String(row && row.user_id || "").trim();
                const poolId = String(row && row.pool_id || "").trim();
                if (!userId || !poolId) {
                    return;
                }
                next[userId] = poolId;
            });
            return next;
        }

        function buildPoolUsageMap() {
            const usage = {};
            const userById = new Map(state.users.map(function (entry) {
                return [String(entry.id || ""), entry];
            }));

            Object.keys(state.poolAssignments).forEach(function (userId) {
                const poolId = String(state.poolAssignments[userId] || "").trim();
                if (!poolId) {
                    return;
                }
                const user = userById.get(String(userId));
                if (user && String(user.status || "active") === "inactive") {
                    return;
                }
                usage[poolId] = (usage[poolId] || 0) + 1;
            });

            return usage;
        }

        function poolTokenPreview(value) {
            const token = String(value || "").trim();
            if (!token) {
                return "-";
            }
            if (token.length <= 18) {
                return token;
            }
            return token.slice(0, 10) + "..." + token.slice(-6);
        }

        function resolvePoolTokenExpiry(value) {
            if (!value) {
                return null;
            }

            if (typeof value === "number" && Number.isFinite(value) && value > 0) {
                const ms = value > 1000000000000 ? value : value * 1000;
                const date = new Date(ms);
                return Number.isNaN(date.getTime()) ? null : date.toISOString();
            }

            const text = String(value).trim();
            if (!text) {
                return null;
            }

            if (/^\d+$/.test(text)) {
                const numeric = Number(text);
                if (Number.isFinite(numeric) && numeric > 0) {
                    const ms = numeric > 1000000000000 ? numeric : numeric * 1000;
                    const date = new Date(ms);
                    return Number.isNaN(date.getTime()) ? null : date.toISOString();
                }
            }

            const parsed = new Date(text);
            return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
        }

        function extractPoolNumberFromText(value) {
            const text = String(value || "").trim();
            if (!text) {
                return null;
            }

            const match = text.match(/(\d+)/);
            if (!match || !match[1]) {
                return null;
            }

            const numeric = Number(match[1]);
            if (!Number.isFinite(numeric) || numeric <= 0) {
                return null;
            }

            return Math.floor(numeric);
        }

        function resolvePoolDisplayNumber(pool, fallbackNumber) {
            const fromLabel = extractPoolNumberFromText(pool && pool.label);
            if (Number.isFinite(fromLabel)) {
                return fromLabel;
            }

            const fallback = Number(fallbackNumber);
            if (Number.isFinite(fallback) && fallback > 0) {
                return Math.floor(fallback);
            }

            return null;
        }

        function resolvePoolNumberFromImportRecord(item, fallbackIndex) {
            const source = item && typeof item === "object" ? item : {};
            const directCandidates = [
                source.pool_number,
                source.poolNumber,
                source.pool_no,
                source.poolNo,
                source.pool,
                source.number,
                source.label,
                source.name
            ];

            for (let idx = 0; idx < directCandidates.length; idx += 1) {
                const parsed = extractPoolNumberFromText(directCandidates[idx]);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }

            const rawIndex = Number(source.index);
            if (Number.isFinite(rawIndex) && rawIndex >= 0) {
                return Math.floor(rawIndex) + 1;
            }

            const fallback = Number(fallbackIndex);
            if (Number.isFinite(fallback) && fallback >= 0) {
                return Math.floor(fallback) + 1;
            }

            return 1;
        }

        function formatPoolOptionLabel(pool, usageCount, poolNumber) {
            const usage = Number(usageCount || 0);
            const cap = Number(pool && pool.max_users || DEFAULT_POOL_CAPACITY);
            const statusSuffix = pool && pool.status === "inactive" ? " (inactive)" : "";
            const baseLabel = pool && pool.label
                ? pool.label
                : "Pool";
            const resolvedNumber = resolvePoolDisplayNumber(pool, poolNumber);
            const labelAlreadyHasNumber = Number.isFinite(extractPoolNumberFromText(baseLabel));
            const numberPrefix = Number.isFinite(resolvedNumber) && !labelAlreadyHasNumber
                ? "#" + String(resolvedNumber) + " • "
                : "";
            return numberPrefix + baseLabel + " • " + usage + "/" + cap + " • " + String(pool && pool.email || "-") + statusSuffix;
        }

        function getPoolPageCount() {
            return Math.max(1, Math.ceil(state.poolAccounts.length / POOL_PAGE_SIZE));
        }

        function clampPoolPage() {
            const pageCount = getPoolPageCount();
            if (!Number.isFinite(state.poolPage)) {
                state.poolPage = 1;
            }
            state.poolPage = Math.max(1, Math.min(pageCount, Math.floor(state.poolPage)));
        }

        function getPaginationTokens(currentPage, totalPages) {
            if (totalPages <= 7) {
                return Array.from({ length: totalPages }, function (_entry, index) {
                    return index + 1;
                });
            }

            const tokens = [1];
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            if (start > 2) {
                tokens.push("...");
            }

            for (let page = start; page <= end; page += 1) {
                tokens.push(page);
            }

            if (end < totalPages - 1) {
                tokens.push("...");
            }

            tokens.push(totalPages);
            return tokens;
        }

        function renderPoolPagination(totalCount, shownStart, shownEnd) {
            if (!dom.poolPagination) {
                return;
            }

            if (!state.poolSchemaReady || !totalCount) {
                dom.poolPagination.hidden = true;
                if (dom.poolPageSummary) {
                    dom.poolPageSummary.textContent = "";
                }
                if (dom.poolPageNumbers) {
                    dom.poolPageNumbers.innerHTML = "";
                }
                return;
            }

            const pageCount = getPoolPageCount();
            clampPoolPage();
            const tokens = getPaginationTokens(state.poolPage, pageCount);

            dom.poolPagination.hidden = false;

            if (dom.poolPagePrev) {
                dom.poolPagePrev.disabled = state.poolPage <= 1;
            }
            if (dom.poolPageNext) {
                dom.poolPageNext.disabled = state.poolPage >= pageCount;
            }

            if (dom.poolPageSummary) {
                dom.poolPageSummary.textContent = "Showing "
                    + String(shownStart)
                    + "-"
                    + String(shownEnd)
                    + " of "
                    + String(totalCount)
                    + " accounts";
            }

            if (dom.poolPageNumbers) {
                dom.poolPageNumbers.innerHTML = tokens.map(function (token) {
                    if (token === "...") {
                        return '<span class="pagination-ellipsis">...</span>';
                    }

                    const pageValue = Number(token);
                    const isActive = pageValue === state.poolPage;
                    return '<button class="page-number-btn'
                        + (isActive ? ' is-active' : '')
                        + '" type="button" data-pool-page="'
                        + String(pageValue)
                        + '"'
                        + (isActive ? ' aria-current="page"' : '')
                        + '>'
                        + String(pageValue)
                        + '</button>';
                }).join("");
            }
        }

        function goToPoolPage(nextPage) {
            const parsed = Number(nextPage);
            if (!Number.isFinite(parsed)) {
                return;
            }
            state.poolPage = Math.floor(parsed);
            clampPoolPage();
            renderPoolTable();
        }

        function getUserPageCount(totalCount) {
            return Math.max(1, Math.ceil(totalCount / USER_PAGE_SIZE));
        }

        function clampUserPage(totalCount) {
            const pageCount = getUserPageCount(totalCount);
            if (!Number.isFinite(state.userPage)) {
                state.userPage = 1;
            }
            state.userPage = Math.max(1, Math.min(pageCount, Math.floor(state.userPage)));
        }

        function renderUserPagination(totalCount, shownStart, shownEnd) {
            if (!dom.usersPagination) {
                return;
            }

            if (!totalCount) {
                dom.usersPagination.hidden = true;
                if (dom.usersPageSummary) {
                    dom.usersPageSummary.textContent = "";
                }
                if (dom.usersPageNumbers) {
                    dom.usersPageNumbers.innerHTML = "";
                }
                return;
            }

            const pageCount = getUserPageCount(totalCount);
            clampUserPage(totalCount);
            const tokens = getPaginationTokens(state.userPage, pageCount);

            dom.usersPagination.hidden = false;

            if (dom.usersPagePrev) {
                dom.usersPagePrev.disabled = state.userPage <= 1;
            }
            if (dom.usersPageNext) {
                dom.usersPageNext.disabled = state.userPage >= pageCount;
            }

            if (dom.usersPageSummary) {
                dom.usersPageSummary.textContent = "Showing "
                    + String(shownStart)
                    + "-"
                    + String(shownEnd)
                    + " of "
                    + String(totalCount)
                    + " users";
            }

            if (dom.usersPageNumbers) {
                dom.usersPageNumbers.innerHTML = tokens.map(function (token) {
                    if (token === "...") {
                        return '<span class="pagination-ellipsis">...</span>';
                    }

                    const pageValue = Number(token);
                    const isActive = pageValue === state.userPage;
                    return '<button class="page-number-btn'
                        + (isActive ? ' is-active' : '')
                        + '" type="button" data-user-page="'
                        + String(pageValue)
                        + '"'
                        + (isActive ? ' aria-current="page"' : '')
                        + '>'
                        + String(pageValue)
                        + '</button>';
                }).join("");
            }
        }

        function goToUserPage(nextPage) {
            const parsed = Number(nextPage);
            if (!Number.isFinite(parsed)) {
                return;
            }
            state.userPage = Math.floor(parsed);
            renderUsers();
        }

        function getUserById(userId) {
            const normalized = String(userId || "").trim();
            if (!normalized) {
                return null;
            }
            const match = state.users.find(function (entry) {
                return String(entry.id || "") === normalized;
            });
            return match || null;
        }

        function getEffectiveAssignedPoolId(userId) {
            const normalized = String(userId || "").trim();
            if (!normalized) {
                return "";
            }

            const assignedPoolId = String(state.poolAssignments[normalized] || "").trim();
            if (!assignedPoolId) {
                return "";
            }

            const assignedPool = state.poolAccounts.find(function (pool) {
                return String(pool && pool.id || "") === assignedPoolId;
            });

            return assignedPool && assignedPool.status === "active"
                ? assignedPoolId
                : "";
        }

        function getRowSaveButtonLabel(userId) {
            return String(userId || "") === String(state.context && state.context.user && state.context.user.id || "")
                ? "Save Pool"
                : "Save";
        }

        function getUserRowPayload(row) {
            const userId = row && row.getAttribute("data-user-id");
            if (!userId) {
                return null;
            }

            const roleField = row.querySelector("[data-user-role]");
            const statusField = row.querySelector("[data-user-status]");
            const poolField = row.querySelector("[data-user-pool]");

            return {
                userId: String(userId || "").trim(),
                role: String(roleField && roleField.value || "user").trim() || "user",
                status: String(statusField && statusField.value || "active").trim() || "active",
                selectedPoolId: String(poolField && poolField.value || "").trim()
            };
        }

        function isUserPayloadDirty(payload) {
            if (!payload || !payload.userId) {
                return false;
            }

            const user = getUserById(payload.userId);
            if (!user) {
                return false;
            }

            const currentRole = String(user.role || "user");
            const currentStatus = String(user.status || "active") === "inactive"
                ? "inactive"
                : "active";
            const currentPoolId = getEffectiveAssignedPoolId(payload.userId);

            return payload.role !== currentRole
                || payload.status !== currentStatus
                || payload.selectedPoolId !== currentPoolId;
        }

        function markUserDirty(userId, isDirty) {
            const normalized = String(userId || "").trim();
            if (!normalized) {
                return;
            }

            if (isDirty) {
                state.dirtyUserIds.add(normalized);
            } else {
                state.dirtyUserIds.delete(normalized);
            }
        }

        function setRowDirtyState(row, isDirty) {
            if (!row) {
                return;
            }

            row.classList.toggle("is-user-dirty", Boolean(isDirty));
        }

        function updateUsersSaveAllState() {
            const pendingCount = state.dirtyUserIds.size;

            if (dom.usersSaveSummary) {
                dom.usersSaveSummary.textContent = pendingCount
                    ? String(pendingCount) + " pending user change" + (pendingCount === 1 ? "" : "s")
                    : "All visible user changes saved";
            }

            if (dom.usersSaveAllBtn) {
                if (state.usersSaveInProgress) {
                    dom.usersSaveAllBtn.disabled = true;
                    dom.usersSaveAllBtn.textContent = "Saving...";
                    return;
                }

                dom.usersSaveAllBtn.disabled = pendingCount === 0;
                dom.usersSaveAllBtn.textContent = "Save All Changes";
            }
        }

        function syncDirtyUsersWithRenderedRows() {
            if (!dom.usersTableBody) {
                updateUsersSaveAllState();
                return;
            }

            const rows = Array.from(dom.usersTableBody.querySelectorAll("[data-user-id]"));
            const visibleUserIds = new Set();

            rows.forEach(function (row) {
                const payload = getUserRowPayload(row);
                if (!payload || !payload.userId) {
                    return;
                }

                visibleUserIds.add(payload.userId);
                const isDirty = state.dirtyUserIds.has(payload.userId) && isUserPayloadDirty(payload);
                markUserDirty(payload.userId, isDirty);
                setRowDirtyState(row, isDirty);

                const rowSaveButton = row.querySelector("[data-user-save]");
                if (rowSaveButton) {
                    rowSaveButton.textContent = getRowSaveButtonLabel(payload.userId);
                    rowSaveButton.disabled = false;
                }
            });

            Array.from(state.dirtyUserIds).forEach(function (userId) {
                if (!visibleUserIds.has(userId)) {
                    state.dirtyUserIds.delete(userId);
                }
            });

            updateUsersSaveAllState();
        }

        function renderPoolSummary() {
            if (!dom.poolSummary) {
                return;
            }

            if (!state.poolSchemaReady) {
                dom.poolSummary.textContent = "Pool schema missing. Run the latest supabase_schema.sql migration to enable pooled account routing.";
                return;
            }

            const usage = buildPoolUsageMap();
            const activePools = state.poolAccounts.filter(function (pool) {
                return pool.status === "active";
            });
            const activeCapacity = activePools.reduce(function (total, pool) {
                return total + Number(pool.max_users || DEFAULT_POOL_CAPACITY);
            }, 0);
            const assignedUsers = Object.keys(state.poolAssignments).filter(function (userId) {
                return Boolean(state.poolAssignments[userId]);
            }).length;
            const activeAssignedUsers = Object.keys(usage).reduce(function (total, poolId) {
                return total + Number(usage[poolId] || 0);
            }, 0);
            const unassignedActiveUsers = state.users.filter(function (user) {
                if (String(user.status || "active") === "inactive") {
                    return false;
                }
                return !state.poolAssignments[String(user.id || "")];
            }).length;

            if (!state.poolAccounts.length) {
                dom.poolSummary.textContent = "No pool accounts yet. Import account_pool.json data to enable capacity-based routing.";
                return;
            }

            dom.poolSummary.textContent = activePools.length
                + " active pools, "
                + activeCapacity
                + " active capacity, "
                + activeAssignedUsers
                + " active users assigned ("
                + assignedUsers
                + " total assignments). "
                + (unassignedActiveUsers
                    ? unassignedActiveUsers + " active users still unassigned."
                    : "All active users are assigned.");
        }

        function renderPoolTable() {
            if (!dom.poolTableBody) {
                return;
            }

            if (!state.poolSchemaReady) {
                dom.poolTableBody.innerHTML = '<tr><td colspan="5">Pool schema missing. Run the latest supabase_schema.sql migration first.</td></tr>';
                renderPoolPagination(0, 0, 0);
                return;
            }

            if (!state.poolAccounts.length) {
                dom.poolTableBody.innerHTML = '<tr><td colspan="5">No pool accounts yet. Paste account_pool.json and import it.</td></tr>';
                renderPoolPagination(0, 0, 0);
                return;
            }

            const usage = buildPoolUsageMap();
            const totalCount = state.poolAccounts.length;
            clampPoolPage();
            const startIndex = (state.poolPage - 1) * POOL_PAGE_SIZE;
            const endIndex = Math.min(startIndex + POOL_PAGE_SIZE, totalCount);
            const visiblePools = state.poolAccounts.slice(startIndex, endIndex);

            dom.poolTableBody.innerHTML = visiblePools.map(function (pool, index) {
                const poolId = utils.escapeHtml(String(pool.id || ""));
                const usageCount = Number(usage[pool.id] || 0);
                const maxUsers = Number(pool.max_users || DEFAULT_POOL_CAPACITY);
                const statusLabel = pool.status === "inactive" ? "Inactive" : "Active";
                const tokenPreview = poolTokenPreview(pool.access_token);
                const expiryCopy = pool.token_expiry
                    ? "Expires " + utils.formatDateTime(pool.token_expiry)
                    : "No expiry";
                const poolNumber = resolvePoolDisplayNumber(pool, startIndex + index + 1);

                return [
                    '<tr data-pool-id="' + poolId + '">',
                    '<td><strong>' + utils.escapeHtml(pool.label || "Pool account") + '</strong><span class="mono-copy">' + utils.escapeHtml(poolNumber ? ("#" + String(poolNumber)) : "-") + '</span></td>',
                    '<td><strong>' + utils.escapeHtml(pool.email || "-") + '</strong><span class="mono-copy">' + utils.escapeHtml(String(pool.id || "").slice(0, 8)) + '</span></td>',
                    '<td><strong>' + String(usageCount) + '/' + String(maxUsers) + '</strong><span class="muted-copy">Active assignments</span></td>',
                    '<td><strong class="mono-copy">' + utils.escapeHtml(tokenPreview) + '</strong><span class="muted-copy">' + utils.escapeHtml(expiryCopy) + '</span></td>',
                    '<td><span class="pool-status-badge" data-status="' + utils.escapeHtml(pool.status) + '">' + utils.escapeHtml(statusLabel) + '</span></td>',
                    '</tr>'
                ].join("");
            }).join("");

            renderPoolPagination(totalCount, startIndex + 1, endIndex);
        }

        async function loadPoolAccounts() {
            const result = await client
                .from("gateway_account_pool")
                .select("*")
                .order("created_at", { ascending: true })
                .order("email", { ascending: true });

            if (result.error) {
                if (isPoolSchemaMissingError(result.error)) {
                    state.poolSchemaReady = false;
                    state.poolAccounts = [];
                    return;
                }
                throw new Error(result.error.message || "Unable to load gateway pool accounts.");
            }

            state.poolSchemaReady = true;
            state.poolAccounts = (Array.isArray(result.data) ? result.data : [])
                .map(normalizePoolAccount)
                .filter(function (pool) {
                    return pool.id;
                })
                .sort(function (left, right) {
                    const leftPoolNumber = extractPoolNumberFromText(left && left.label);
                    const rightPoolNumber = extractPoolNumberFromText(right && right.label);

                    if (Number.isFinite(leftPoolNumber) && Number.isFinite(rightPoolNumber) && leftPoolNumber !== rightPoolNumber) {
                        return leftPoolNumber - rightPoolNumber;
                    }
                    if (Number.isFinite(leftPoolNumber) && !Number.isFinite(rightPoolNumber)) {
                        return -1;
                    }
                    if (!Number.isFinite(leftPoolNumber) && Number.isFinite(rightPoolNumber)) {
                        return 1;
                    }

                    const leftLabel = String(left && left.label || "");
                    const rightLabel = String(right && right.label || "");
                    const labelCompare = leftLabel.localeCompare(rightLabel);
                    if (labelCompare !== 0) {
                        return labelCompare;
                    }

                    return String(left && left.email || "").localeCompare(String(right && right.email || ""));
                });
        }

        async function loadPoolAssignments() {
            const result = await client
                .from("profile_gateway_pool_assignments")
                .select("user_id, pool_id");

            if (result.error) {
                if (isPoolSchemaMissingError(result.error)) {
                    state.poolSchemaReady = false;
                    state.poolAssignments = {};
                    return;
                }
                throw new Error(result.error.message || "Unable to load pool assignments.");
            }

            state.poolSchemaReady = true;
            state.poolAssignments = normalizePoolAssignments(result.data);
        }

        async function loadPoolData() {
            await Promise.all([loadPoolAccounts(), loadPoolAssignments()]);
            renderPoolSummary();
            renderPoolTable();
            renderUsers();
        }

        function renderUsers() {
            if (!dom.usersTableBody) {
                return;
            }

            const filtered = state.userQuery
                ? state.users.filter(function (user) {
                    const haystack = [user.display_name, user.email].join(" ").toLowerCase();
                    return haystack.includes(state.userQuery);
                })
                : state.users;

            const usage = buildPoolUsageMap();
            const hasPoolOptions = state.poolSchemaReady && state.poolAccounts.length;
            const poolNumberById = {};
            state.poolAccounts.forEach(function (pool, index) {
                const poolId = String(pool && pool.id || "").trim();
                if (!poolId) {
                    return;
                }
                poolNumberById[poolId] = resolvePoolDisplayNumber(pool, index + 1);
            });

            if (!filtered.length) {
                dom.usersTableBody.innerHTML = '<tr><td colspan="6">No users matched your search.</td></tr>';
                state.dirtyUserIds.clear();
                renderUserPagination(0, 0, 0);
                updateUsersSaveAllState();
                return;
            }

            const totalFiltered = filtered.length;
            clampUserPage(totalFiltered);
            const startIndex = (state.userPage - 1) * USER_PAGE_SIZE;
            const endIndex = Math.min(startIndex + USER_PAGE_SIZE, totalFiltered);
            const visibleUsers = filtered.slice(startIndex, endIndex);

            dom.usersTableBody.innerHTML = visibleUsers.map(function (user) {
                const isCurrent = user.id === state.context.user.id;
                const userId = String(user.id || "");
                const assignedPoolId = String(state.poolAssignments[userId] || "");
                const assignedPool = state.poolAccounts.find(function (pool) {
                    return pool.id === assignedPoolId;
                });
                const effectiveAssignedPoolId = assignedPool && assignedPool.status === "active"
                    ? assignedPoolId
                    : "";
                const poolOptions = ['<option value="">Auto assign (by pool capacity)</option>'];

                if (!state.poolSchemaReady) {
                    poolOptions.push('<option value="" disabled>Schema update required</option>');
                } else {
                    state.poolAccounts.forEach(function (pool) {
                        const label = formatPoolOptionLabel(pool, usage[pool.id] || 0, poolNumberById[pool.id]);
                        const selected = pool.id === effectiveAssignedPoolId ? " selected" : "";
                        const disabled = pool.status !== "active" ? " disabled" : "";
                        poolOptions.push('<option value="' + utils.escapeHtml(pool.id) + '"' + selected + disabled + '>' + utils.escapeHtml(label) + '</option>');
                    });
                }

                return [
                    '<tr data-user-id="' + utils.escapeHtml(user.id) + '">',
                    "<td><strong>" + utils.escapeHtml(user.display_name || "Unnamed user") + "</strong><span>" + utils.escapeHtml(user.email || "-") + "</span></td>",
                    "<td>",
                    '<select class="user-select" data-user-role ' + (isCurrent ? "disabled" : "") + ">",
                    '<option value="user"' + (user.role === "user" ? " selected" : "") + ">User</option>",
                    '<option value="admin"' + (user.role === "admin" ? " selected" : "") + ">Admin</option>",
                    "</select>",
                    "</td>",
                    "<td>",
                    '<select class="user-select" data-user-status ' + (isCurrent ? "disabled" : "") + ">",
                    '<option value="active"' + (user.status !== "inactive" ? " selected" : "") + ">Active</option>",
                    '<option value="inactive"' + (user.status === "inactive" ? " selected" : "") + ">Inactive</option>",
                    "</select>",
                    "</td>",
                    "<td>",
                    '<select class="user-select user-pool-select" data-user-pool ' + (state.poolSchemaReady ? "" : "disabled") + ">",
                    poolOptions.join(""),
                    "</select>",
                    hasPoolOptions
                        ? '<span class="mono-copy">' + utils.escapeHtml(effectiveAssignedPoolId ? "Manual/auto pool" : "Auto routing") + "</span>"
                        : '<span class="mono-copy">' + utils.escapeHtml(state.poolSchemaReady ? "No pool accounts" : "Schema update required") + "</span>",
                    "</td>",
                    "<td>" + utils.escapeHtml(utils.formatDateTime(user.created_at)) + "</td>",
                    "<td>",
                    '<button class="table-action" type="button" data-user-save>' + (isCurrent ? "Save Pool" : "Save") + "</button>",
                    isCurrent
                        ? '<span class="mono-copy">Current session</span>'
                        : "",
                    "</td>",
                    "</tr>"
                ].join("");
            }).join("");

            renderUserPagination(totalFiltered, startIndex + 1, endIndex);
            syncDirtyUsersWithRenderedRows();
        }

        function dedupeModelIds(list) {
            const seen = new Set();
            return (Array.isArray(list) ? list : [])
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

        function normalizeBots(rawBots) {
            const source = Array.isArray(rawBots)
                ? rawBots
                : [];
            const seen = new Set();
            const normalized = [];

            source.forEach(function (entry, index) {
                const value = entry && typeof entry === "object"
                    ? entry
                    : {};
                const baseId = normalizeBotId(value.id, index);
                let nextId = baseId;
                let suffix = 2;
                while (seen.has(nextId)) {
                    nextId = baseId + "-" + String(suffix);
                    suffix += 1;
                }
                seen.add(nextId);

                const defaultName = index === 0
                    ? "Assistant"
                    : "Bot " + String(index + 1);
                const nextName = String(value.name || value.label || "").trim() || defaultName;
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
                    id: "assistant",
                    name: "Assistant",
                    system_prompt: ""
                });
            }

            return normalized;
        }

        function readBotsFromOptions(seedBots) {
            const next = normalizeBots(seedBots || state.botsDraft);
            if (!dom.botOptions) {
                return next;
            }

            const rows = Array.from(dom.botOptions.querySelectorAll("[data-bot-row]"));
            if (!rows.length) {
                return next;
            }

            const fromDom = rows.map(function (row, index) {
                const botId = String(row.getAttribute("data-bot-id") || "").trim();
                const nameInput = row.querySelector("[data-bot-name]");
                const promptInput = row.querySelector("[data-bot-prompt]");
                return {
                    id: botId || (index === 0 ? "assistant" : ("bot-" + String(index + 1))),
                    name: nameInput ? String(nameInput.value || "").trim() : "",
                    system_prompt: promptInput ? String(promptInput.value || "") : ""
                };
            });

            return normalizeBots(fromDom);
        }

        function writeBotsToField(bots) {
            if (!dom.bots) {
                return;
            }
            dom.bots.value = JSON.stringify(bots, null, 2);
        }

        function renderBotSummary() {
            if (!dom.botSummary) {
                return;
            }
            const count = Array.isArray(state.botsDraft) ? state.botsDraft.length : 0;
            if (!count) {
                dom.botSummary.textContent = "No bots configured yet.";
                return;
            }
            dom.botSummary.textContent = count === 1
                ? "1 bot configured. This bot prompt will be used in chat."
                : String(count) + " bots configured. Each bot has its own system prompt.";
        }

        function renderBotOptions() {
            if (!dom.botOptions) {
                return;
            }

            const bots = Array.isArray(state.botsDraft)
                ? state.botsDraft
                : [];
            if (!bots.length) {
                dom.botOptions.innerHTML = '<div class="bot-option-empty">No bots yet. Add one to continue.</div>';
                writeBotsToField([]);
                renderBotSummary();
                return;
            }

            dom.botOptions.innerHTML = bots.map(function (bot, index) {
                const canRemove = bots.length > 1;
                return [
                    '<article class="bot-option" data-bot-row data-bot-id="' + utils.escapeHtml(bot.id) + '">',
                    '<div class="bot-option-head">',
                    '<span class="bot-option-id">' + utils.escapeHtml(bot.id) + '</span>',
                    '<button class="bot-option-remove" type="button" data-bot-remove="' + utils.escapeHtml(bot.id) + '"' + (canRemove ? "" : " disabled") + '>Remove</button>',
                    '</div>',
                    '<div class="bot-option-controls">',
                    '<input type="text" data-bot-name value="' + utils.escapeHtml(bot.name) + '" placeholder="Bot name">',
                    '<textarea data-bot-prompt rows="4" placeholder="System prompt for this bot">' + utils.escapeHtml(bot.system_prompt || "") + '</textarea>',
                    '</div>',
                    '</article>'
                ].join("");
            }).join("");

            writeBotsToField(bots);
            renderBotSummary();
        }

        function syncBotControls(optionsOverride) {
            const options = Object.assign({ reRender: true }, optionsOverride || {});
            state.botsDraft = readBotsFromOptions(state.botsDraft);
            if (options.reRender) {
                renderBotOptions();
                return;
            }
            writeBotsToField(state.botsDraft);
            renderBotSummary();
        }

        function addBotDraft() {
            const currentBots = readBotsFromOptions(state.botsDraft);
            const nextIndex = currentBots.length + 1;
            currentBots.push({
                id: "bot-" + String(nextIndex),
                name: "Bot " + String(nextIndex),
                system_prompt: ""
            });
            state.botsDraft = normalizeBots(currentBots);
            renderBotOptions();
        }

        function handleBotOptionRemove(event) {
            const removeButton = event.target.closest("[data-bot-remove]");
            if (!removeButton) {
                return false;
            }
            const botId = String(removeButton.getAttribute("data-bot-remove") || "").trim();
            if (!botId) {
                return true;
            }
            const nextBots = readBotsFromOptions(state.botsDraft).filter(function (bot) {
                return bot.id !== botId;
            });
            state.botsDraft = normalizeBots(nextBots);
            renderBotOptions();
            return true;
        }

        function normalizeModelAliasesMap(value) {
            const source = value && typeof value === "object" && !Array.isArray(value)
                ? value
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

        function readModelAliasesFromOptions(seedAliases) {
            const next = normalizeModelAliasesMap(seedAliases || state.modelAliasesDraft);
            if (!dom.modelOptions) {
                return next;
            }

            Array.from(dom.modelOptions.querySelectorAll("[data-model-alias]")).forEach(function (input) {
                const modelId = String(input.getAttribute("data-model-alias") || "").trim();
                if (!modelId) {
                    return;
                }
                const alias = String(input.value || "").trim();
                if (alias) {
                    next[modelId] = alias;
                    return;
                }
                delete next[modelId];
            });

            return normalizeModelAliasesMap(next);
        }

        function getModelUiName(modelId, fallbackName) {
            const normalizedId = String(modelId || "").trim();
            const alias = normalizedId && state.modelAliasesDraft
                ? String(state.modelAliasesDraft[normalizedId] || "").trim()
                : "";
            if (alias) {
                return alias;
            }
            const fallback = String(fallbackName || "").trim();
            return fallback || normalizedId;
        }

        function modelLooksImageCapable(modelId) {
            const value = String(modelId || "").toLowerCase();
            return value.indexOf("omni") !== -1
                || value.indexOf("-vl") !== -1
                || value.indexOf("vision") !== -1
                || value.indexOf("qvq") !== -1
                || value.indexOf("wanx") !== -1
                || value.indexOf("flux") !== -1
                || value.indexOf("t2i") !== -1;
        }

        function normalizeLiveModel(model) {
            const modelId = String(model && model.id || "").trim();
            if (!modelId) {
                return null;
            }
            const capabilities = model && model.capabilities && typeof model.capabilities === "object"
                ? model.capabilities
                : {};
            return {
                id: modelId,
                name: String(model && model.name || modelId).trim() || modelId,
                capabilities: {
                    thinking: Boolean(capabilities.thinking),
                    auto_thinking: Boolean(capabilities.auto_thinking),
                    search: Boolean(capabilities.search),
                    image: Boolean(capabilities.image),
                    video: Boolean(capabilities.video),
                    image_edit: Boolean(capabilities.image_edit)
                }
            };
        }

        function readAllowedModelIdsFromField() {
            if (!dom.allowedModels) {
                return [];
            }
            return dedupeModelIds(utils.readList(dom.allowedModels.value));
        }

        function writeAllowedModelIdsToField(modelIds) {
            if (!dom.allowedModels) {
                return;
            }
            dom.allowedModels.value = dedupeModelIds(modelIds).join("\n");
        }

        function buildModelCatalog() {
            const byId = new Map();

            (Array.isArray(state.liveModels) ? state.liveModels : []).forEach(function (entry) {
                const normalized = normalizeLiveModel(entry);
                if (normalized) {
                    byId.set(normalized.id, normalized);
                }
            });

            const seedIds = dedupeModelIds([
                state.settings && state.settings.default_model,
                state.settings && state.settings.default_image_model,
                dom.defaultModel && dom.defaultModel.value,
                dom.defaultImageModel && dom.defaultImageModel.value
            ].concat(
                readAllowedModelIdsFromField(),
                state.settings && Array.isArray(state.settings.allowed_models)
                    ? state.settings.allowed_models
                    : []
            ));

            seedIds.forEach(function (modelId) {
                if (byId.has(modelId)) {
                    return;
                }
                byId.set(modelId, {
                    id: modelId,
                    name: modelId,
                    capabilities: {
                        thinking: false,
                        auto_thinking: false,
                        search: false,
                        image: modelLooksImageCapable(modelId),
                        video: false,
                        image_edit: false
                    }
                });
            });

            return Array.from(byId.values()).sort(function (left, right) {
                return left.id.localeCompare(right.id);
            });
        }

        function ensureDefaultModelsAreEnabled(modelIds) {
            const next = dedupeModelIds(modelIds);
            const defaultModelId = dom.defaultModel
                ? String(dom.defaultModel.value || "").trim()
                : "";
            const defaultImageModelId = dom.defaultImageModel
                ? String(dom.defaultImageModel.value || "").trim()
                : "";

            if (defaultModelId && next.indexOf(defaultModelId) === -1) {
                next.unshift(defaultModelId);
            }
            if (defaultImageModelId && next.indexOf(defaultImageModelId) === -1) {
                next.push(defaultImageModelId);
            }

            return dedupeModelIds(next);
        }

        function setModelSelectOptions(select, models, preferredId, optionsOverride) {
            if (!select) {
                return;
            }

            const options = Object.assign({ allowImageOnly: false }, optionsOverride || {});
            const scoped = options.allowImageOnly
                ? models.filter(function (model) {
                    return Boolean(model.capabilities && model.capabilities.image);
                })
                : models.slice();
            const source = scoped.length ? scoped : models.slice();

            if (!source.length) {
                select.innerHTML = '<option value="">No models loaded</option>';
                select.value = "";
                return;
            }

            const wantedId = String(preferredId || "").trim();
            const hasWanted = wantedId && source.some(function (model) {
                return model.id === wantedId;
            });

            select.innerHTML = source.map(function (model) {
                const uiName = getModelUiName(model.id, model.name);
                const label = uiName && uiName !== model.id
                    ? uiName + " (" + model.id + ")"
                    : model.id;
                return '<option value="' + utils.escapeHtml(model.id) + '">' + utils.escapeHtml(label) + "</option>";
            }).join("");

            select.value = hasWanted
                ? wantedId
                : source[0].id;
        }

        function getModelBadges(model) {
            const badges = [];
            if (model.capabilities && model.capabilities.image) {
                badges.push("Image");
            }
            if (model.capabilities && (model.capabilities.thinking || model.capabilities.auto_thinking)) {
                badges.push("Thinking");
            }
            if (model.capabilities && model.capabilities.search) {
                badges.push("Search");
            }
            if (model.capabilities && model.capabilities.video) {
                badges.push("Video");
            }
            if (!badges.length) {
                badges.push("Chat");
            }
            return badges;
        }

        function renderModelOptions(models, enabledModelIds) {
            if (!dom.modelOptions) {
                return;
            }

            const aliases = normalizeModelAliasesMap(state.modelAliasesDraft);
            const query = String(state.modelFilter || "").trim().toLowerCase();
            const visibleModels = query
                ? models.filter(function (model) {
                    return [model.id, model.name, aliases[model.id] || ""].join(" ").toLowerCase().includes(query);
                })
                : models;

            if (!visibleModels.length) {
                dom.modelOptions.innerHTML = '<div class="model-empty">No models matched your filter.</div>';
                return;
            }

            const enabledSet = new Set(enabledModelIds);
            dom.modelOptions.innerHTML = visibleModels.map(function (model) {
                const badges = getModelBadges(model).map(function (badge) {
                    return '<span class="model-badge">' + utils.escapeHtml(badge) + "</span>";
                }).join("");
                const inputHtml = '<input type="checkbox" data-model-enable value="'
                    + utils.escapeHtml(model.id)
                    + '"'
                    + (enabledSet.has(model.id) ? ' checked' : '')
                    + '>';
                const aliasValue = aliases[model.id] || "";
                const secondaryName = model.name && model.name !== model.id
                    ? '<span class="model-option-name">' + utils.escapeHtml(model.name) + '</span>'
                    : "";

                return [
                    '<div class="model-option" title="' + utils.escapeHtml(model.id) + '">',
                    '<label class="model-option-main">',
                    inputHtml,
                    '<span class="model-option-copy">',
                    '<strong class="model-option-official">' + utils.escapeHtml(model.id) + '</strong>',
                    secondaryName,
                    '<span class="model-option-badges">' + badges + '</span>',
                    '</span>',
                    '</label>',
                    '<label class="model-alias-field">',
                    '<span>Custom UI name</span>',
                    '<input class="model-alias-input" type="text" data-model-alias="' + utils.escapeHtml(model.id) + '" value="' + utils.escapeHtml(aliasValue) + '" placeholder="Keep official name">',
                    '</label>',
                    '</div>'
                ].join('');
            }).join("");
        }

        function renderModelSummary(totalCount, enabledCount) {
            if (!dom.modelSummary) {
                return;
            }
            if (!totalCount) {
                dom.modelSummary.textContent = "Load live models to choose defaults and control which models are enabled for chat.";
                return;
            }
            const sourceLabel = state.liveModels.length
                ? "live catalog"
                : "saved configuration";
            dom.modelSummary.textContent = enabledCount + " enabled out of " + totalCount + " models (" + sourceLabel + ").";
        }

        function syncModelControls() {
            state.modelAliasesDraft = readModelAliasesFromOptions(state.modelAliasesDraft);
            const models = buildModelCatalog();
            const preferredDefaultModel = dom.defaultModel
                ? String(dom.defaultModel.value || state.settings && state.settings.default_model || "").trim()
                : "";
            const preferredDefaultImageModel = dom.defaultImageModel
                ? String(dom.defaultImageModel.value || state.settings && state.settings.default_image_model || preferredDefaultModel || "").trim()
                : "";

            setModelSelectOptions(dom.defaultModel, models, preferredDefaultModel, {
                allowImageOnly: false
            });
            setModelSelectOptions(dom.defaultImageModel, models, preferredDefaultImageModel, {
                allowImageOnly: true
            });

            let enabledModelIds = readAllowedModelIdsFromField();
            if (!enabledModelIds.length && state.settings && Array.isArray(state.settings.allowed_models)) {
                enabledModelIds = dedupeModelIds(state.settings.allowed_models);
            }
            if (!enabledModelIds.length && dom.defaultModel && dom.defaultModel.value) {
                enabledModelIds = [dom.defaultModel.value];
            }
            enabledModelIds = ensureDefaultModelsAreEnabled(enabledModelIds);

            writeAllowedModelIdsToField(enabledModelIds);
            renderModelOptions(models, enabledModelIds);
            renderModelSummary(models.length, enabledModelIds.length);
        }

        function handleModelOptionToggle(event) {
            const toggle = event.target.closest("[data-model-enable]");
            if (!toggle) {
                return;
            }
            const modelId = String(toggle.value || "").trim();
            if (!modelId) {
                return;
            }

            const enabledSet = new Set(readAllowedModelIdsFromField());
            if (toggle.checked) {
                enabledSet.add(modelId);
            } else {
                enabledSet.delete(modelId);
            }

            let enabledModelIds = ensureDefaultModelsAreEnabled(Array.from(enabledSet));
            if (!enabledModelIds.length) {
                enabledModelIds = [modelId];
            }
            writeAllowedModelIdsToField(enabledModelIds);
            syncModelControls();
        }

        function handleModelAliasInput(event) {
            const aliasInput = event.target.closest("[data-model-alias]");
            if (!aliasInput) {
                return false;
            }

            const modelId = String(aliasInput.getAttribute("data-model-alias") || "").trim();
            if (!modelId) {
                return false;
            }

            const aliases = normalizeModelAliasesMap(state.modelAliasesDraft);
            const alias = String(aliasInput.value || "").trim();
            if (alias) {
                aliases[modelId] = alias;
            } else {
                delete aliases[modelId];
            }
            state.modelAliasesDraft = aliases;
            return true;
        }

        function handleDefaultModelSelectionChange() {
            const enabledModelIds = ensureDefaultModelsAreEnabled(readAllowedModelIdsFromField());
            writeAllowedModelIdsToField(enabledModelIds);
            syncModelControls();
        }

        function renderSettingsForm() {
            if (!state.settings || !dom.settingsForm) {
                return;
            }
            dom.brandName.value = state.settings.brand_name;
            dom.brandTagline.value = state.settings.brand_tagline;
            dom.themeDefault.value = state.settings.theme_default || "obsidian";
            if (dom.themeDefault) {
                const unsupportedThemeDefault = state.unsupportedSettingColumns.has("theme_default");
                dom.themeDefault.disabled = unsupportedThemeDefault;
                dom.themeDefault.title = unsupportedThemeDefault
                    ? "This field is not available in your current Supabase schema. Run the latest SQL migration to enable it."
                    : "";
            }
            dom.welcomeTitle.value = state.settings.welcome_title;
            dom.welcomeCopy.value = state.settings.welcome_copy;
            dom.gatewayBaseUrl.value = state.settings.gateway_base_url;
            dom.gatewayProxyTemplate.value = state.settings.gateway_proxy_template;
            dom.gatewayEmail.value = state.settings.gateway_email;
            dom.gatewayPassword.value = "";
            if (dom.defaultModel) {
                dom.defaultModel.value = state.settings.default_model;
            }
            if (dom.defaultImageModel) {
                dom.defaultImageModel.value = state.settings.default_image_model || state.settings.default_model;
                const unsupportedDefaultImageModel = state.unsupportedSettingColumns.has("default_image_model");
                dom.defaultImageModel.disabled = unsupportedDefaultImageModel;
                dom.defaultImageModel.title = unsupportedDefaultImageModel
                    ? "This field is not available in your current Supabase schema. Run the latest SQL migration to enable it."
                    : "";
            }
            dom.thinkingBudget.value = String(state.settings.thinking_budget);
            dom.thinkingEnabled.checked = Boolean(state.settings.thinking_enabled);
            writeAllowedModelIdsToField(state.settings.allowed_models);
            state.botsDraft = normalizeBots(state.settings.bots);
            state.modelAliasesDraft = normalizeModelAliasesMap(state.settings.model_aliases);
            if (dom.modelFilter) {
                dom.modelFilter.value = state.modelFilter;
            }
            syncModelControls();
            renderBotOptions();
            const unsupportedBots = state.unsupportedSettingColumns.has("bots");
            if (dom.botAddBtn) {
                dom.botAddBtn.disabled = unsupportedBots;
                dom.botAddBtn.title = unsupportedBots
                    ? "This field is not available in your current Supabase schema. Run the latest SQL migration to enable it."
                    : "";
            }
            if (dom.botOptions) {
                dom.botOptions.setAttribute("aria-disabled", unsupportedBots ? "true" : "false");
                dom.botOptions.title = unsupportedBots
                    ? "This field is not available in your current Supabase schema. Run the latest SQL migration to enable it."
                    : "";
            }
            if (unsupportedBots && dom.botSummary) {
                dom.botSummary.textContent = "Bots column missing in schema. Run latest SQL migration to enable multi-bot prompts.";
            }
            if (dom.settingsStatus) {
                dom.settingsStatus.textContent = state.settings.updated_at
                    ? "Last updated " + utils.formatDateTime(state.settings.updated_at)
                    : "Changes are saved to Supabase and applied to the user chat after refresh.";
            }
        }

        async function buildSettingsPayload() {
            const currentSettings = await ensureSettingsLoaded();
            const passwordValue = dom.gatewayPassword.value.trim();
            let enabledModelIds = readAllowedModelIdsFromField();
            if (!enabledModelIds.length && currentSettings && Array.isArray(currentSettings.allowed_models)) {
                enabledModelIds = dedupeModelIds(currentSettings.allowed_models);
            }

            const selectedDefaultModel = dom.defaultModel
                ? String(dom.defaultModel.value || "").trim()
                : "";
            const selectedDefaultImageModel = dom.defaultImageModel
                ? String(dom.defaultImageModel.value || "").trim()
                : "";

            const resolvedDefaultModel = selectedDefaultModel
                || currentSettings.default_model
                || "qwen3.5-plus";
            const resolvedDefaultImageModel = selectedDefaultImageModel
                || currentSettings.default_image_model
                || resolvedDefaultModel;

            enabledModelIds = ensureDefaultModelsAreEnabled(enabledModelIds.concat([
                resolvedDefaultModel,
                resolvedDefaultImageModel
            ]));

            writeAllowedModelIdsToField(enabledModelIds);

            const modelAliases = readModelAliasesFromOptions(state.modelAliasesDraft);
            const enabledSet = new Set(enabledModelIds);
            const filteredModelAliases = {};
            Object.keys(modelAliases).forEach(function (modelId) {
                if (enabledSet.has(modelId) && modelAliases[modelId]) {
                    filteredModelAliases[modelId] = modelAliases[modelId];
                }
            });
            state.modelAliasesDraft = filteredModelAliases;

            const bots = normalizeBots(readBotsFromOptions(state.botsDraft));
            state.botsDraft = bots;
            writeBotsToField(bots);

            const payload = {
                id: "global",
                brand_name: dom.brandName.value.trim() || "Lumora",
                brand_tagline: dom.brandTagline.value.trim(),
                theme_default: dom.themeDefault.value || "obsidian",
                welcome_title: dom.welcomeTitle.value.trim() || "Start a new conversation",
                welcome_copy: dom.welcomeCopy.value.trim(),
                gateway_base_url: dom.gatewayBaseUrl.value.trim() || "https://chat.qwen.ai",
                gateway_proxy_template: dom.gatewayProxyTemplate.value.trim(),
                gateway_email: dom.gatewayEmail.value.trim(),
                gateway_password_hash: passwordValue
                    ? await utils.sha256Hex(passwordValue)
                    : currentSettings.gateway_password_hash,
                default_model: resolvedDefaultModel,
                default_image_model: resolvedDefaultImageModel,
                allowed_models: enabledModelIds,
                model_aliases: filteredModelAliases,
                bots: bots,
                thinking_enabled: dom.thinkingEnabled.checked,
                thinking_budget: Number(dom.thinkingBudget.value) || 81920,
                updated_by: state.context.user.id
            };

            state.unsupportedSettingColumns.forEach(function (columnName) {
                if (Object.prototype.hasOwnProperty.call(payload, columnName)) {
                    delete payload[columnName];
                }
            });

            return payload;
        }

        function extractMissingAppSettingsColumn(error) {
            const message = error && error.message ? error.message : String(error || "");

            let match = message.match(/Could not find the '([^']+)' column of 'app_settings' in the schema cache/i);
            if (match && match[1]) {
                return match[1];
            }

            match = message.match(/column\s+"?([a-zA-Z0-9_]+)"?\s+of\s+relation\s+"?app_settings"?\s+does\s+not\s+exist/i);
            if (match && match[1]) {
                return match[1];
            }

            return null;
        }

        function markUnsupportedSettingColumn(columnName) {
            const normalized = String(columnName || "").trim();
            if (!normalized) {
                return;
            }

            state.unsupportedSettingColumns.add(normalized);

            const hint = "This field is not available in your current Supabase schema. Run the latest SQL migration to enable it.";
            if (normalized === "theme_default" && dom.themeDefault) {
                dom.themeDefault.disabled = true;
                dom.themeDefault.title = hint;
            }
            if (normalized === "default_image_model" && dom.defaultImageModel) {
                dom.defaultImageModel.disabled = true;
                dom.defaultImageModel.title = hint;
            }
            if (normalized === "bots") {
                if (dom.botAddBtn) {
                    dom.botAddBtn.disabled = true;
                    dom.botAddBtn.title = hint;
                }
                if (dom.botOptions) {
                    dom.botOptions.setAttribute("aria-disabled", "true");
                    dom.botOptions.title = hint;
                }
                if (dom.botSummary) {
                    dom.botSummary.textContent = "Bots column missing in schema. Run latest SQL migration to enable multi-bot prompts.";
                }
            }
        }

        async function upsertSettingsWithSchemaFallback(payload) {
            let workingPayload = Object.assign({}, payload);
            const skippedColumns = [];
            const seenColumns = new Set();
            let result = null;

            while (true) {
                result = await client
                    .from("app_settings")
                    .upsert(workingPayload)
                    .select("*")
                    .single();

                if (!result.error) {
                    return {
                        result: result,
                        persistedPayload: workingPayload,
                        skippedColumns: skippedColumns
                    };
                }

                const missingColumn = extractMissingAppSettingsColumn(result.error);
                if (!missingColumn || seenColumns.has(missingColumn) || !Object.prototype.hasOwnProperty.call(workingPayload, missingColumn)) {
                    return {
                        result: result,
                        persistedPayload: workingPayload,
                        skippedColumns: skippedColumns
                    };
                }

                seenColumns.add(missingColumn);
                skippedColumns.push(missingColumn);
                delete workingPayload[missingColumn];
                markUnsupportedSettingColumn(missingColumn);
            }
        }

        async function saveSettings(event) {
            if (event) {
                event.preventDefault();
            }
            if (dom.settingsStatus) {
                dom.settingsStatus.textContent = "Saving settings...";
            }

            try {
                const payload = await buildSettingsPayload();
                const saveAttempt = await upsertSettingsWithSchemaFallback(payload);
                const result = saveAttempt.result;

                if (result.error) {
                    throw new Error(result.error.message || "Unable to save settings.");
                }

                state.settings = gateway.normalizeAppSettings(result.data || saveAttempt.persistedPayload);
                utils.applyBranding(state.settings);
                theme.initialize({
                    settings: state.settings,
                    allowWorkspaceDefault: true,
                    authPage: false
                });
                renderSettingsForm();
                await loadOverview();
                if (saveAttempt.skippedColumns.length) {
                    notify(
                        "Settings saved, but your schema is missing: " + saveAttempt.skippedColumns.join(", ") + ". Run the latest Supabase SQL migration.",
                        "info"
                    );
                }
                if (dom.settingsStatus) {
                    dom.settingsStatus.textContent = "Settings saved successfully.";
                }
                setStatusLine("Settings updated.");
                if (typeof options.onSettingsSaved === "function") {
                    options.onSettingsSaved(state.settings);
                }
                notify("Settings saved.", "success");
            } catch (error) {
                if (dom.settingsStatus) {
                    dom.settingsStatus.textContent = error.message || "Unable to save settings.";
                }
                notify(error.message || "Unable to save settings.", "error");
            }
        }

        async function loadLiveModels() {
            if (dom.loadModelsBtn) {
                dom.loadModelsBtn.disabled = true;
            }
            if (dom.settingsStatus) {
                dom.settingsStatus.textContent = "Loading live models...";
            }
            try {
                await ensureSettingsLoaded();
                const payload = await buildSettingsPayload();
                const models = await gateway.loadModels(payload);
                state.liveModels = models.map(normalizeLiveModel).filter(Boolean);
                if (!models.length) {
                    throw new Error("No models were returned.");
                }

                syncModelControls();
                if (dom.settingsStatus) {
                    dom.settingsStatus.textContent = models.length + " models loaded.";
                }
                notify(models.length + " live models loaded.", "success");
            } catch (error) {
                if (dom.settingsStatus) {
                    dom.settingsStatus.textContent = error.message || "Unable to load models.";
                }
                notify(error.message || "Unable to load models.", "error");
            } finally {
                if (dom.loadModelsBtn) {
                    dom.loadModelsBtn.disabled = false;
                }
            }
        }

        async function saveUserPoolAssignment(userId, selectedPoolId) {
            if (!state.poolSchemaReady) {
                return;
            }

            const normalizedUserId = String(userId || "").trim();
            const normalizedPoolId = String(selectedPoolId || "").trim();
            if (!normalizedUserId) {
                return;
            }

            if (normalizedPoolId) {
                const selectedPool = state.poolAccounts.find(function (pool) {
                    return pool.id === normalizedPoolId;
                });
                if (!selectedPool) {
                    throw new Error("Selected pool account is no longer available. Refresh and try again.");
                }
                if (selectedPool.status !== "active") {
                    throw new Error("Selected pool account is inactive. Choose an active pool account.");
                }
                if (!selectedPool.access_token && !selectedPool.password_hash) {
                    throw new Error("Selected pool account has no token/password credentials.");
                }

                const upsertResult = await client
                    .from("profile_gateway_pool_assignments")
                    .upsert({
                        user_id: normalizedUserId,
                        pool_id: normalizedPoolId,
                        assigned_by: state.context.user.id,
                        assigned_at: new Date().toISOString()
                    }, {
                        onConflict: "user_id"
                    })
                    .select("user_id, pool_id")
                    .single();

                if (upsertResult.error) {
                    if (isPoolSchemaMissingError(upsertResult.error)) {
                        state.poolSchemaReady = false;
                        return;
                    }
                    throw new Error(upsertResult.error.message || "Unable to assign pool account.");
                }

                state.poolAssignments[normalizedUserId] = normalizedPoolId;
                return;
            }

            const deleteResult = await client
                .from("profile_gateway_pool_assignments")
                .delete()
                .eq("user_id", normalizedUserId);

            if (deleteResult.error && !isPoolSchemaMissingError(deleteResult.error)) {
                throw new Error(deleteResult.error.message || "Unable to clear pool assignment.");
            }

            delete state.poolAssignments[normalizedUserId];

            const rpcResult = await client.rpc("resolve_gateway_runtime_credentials", {
                target_user_id: normalizedUserId
            });
            if (!rpcResult.error) {
                const row = Array.isArray(rpcResult.data)
                    ? rpcResult.data[0]
                    : rpcResult.data;
                const resolvedPoolId = String(row && row.pool_id || "").trim();
                if (resolvedPoolId) {
                    state.poolAssignments[normalizedUserId] = resolvedPoolId;
                }
            }
        }

        async function loadLocalPoolJsonIntoForm() {
            if (!dom.poolImportJson) {
                return;
            }

            const candidates = [
                "../account_pool.json",
                "account_pool.json",
                "/account_pool.json"
            ];

            let loadedText = "";
            let lastError = null;

            for (let index = 0; index < candidates.length; index += 1) {
                const url = candidates[index];
                try {
                    const response = await fetch(url, {
                        cache: "no-store"
                    });
                    if (!response.ok) {
                        lastError = new Error("HTTP " + response.status);
                        continue;
                    }
                    loadedText = await response.text();
                    if (loadedText.trim()) {
                        break;
                    }
                } catch (error) {
                    lastError = error;
                }
            }

            if (!loadedText.trim()) {
                throw new Error(
                    "Could not load account_pool.json automatically. Paste JSON manually."
                        + (lastError && lastError.message ? " (" + lastError.message + ")" : "")
                );
            }

            let parsed;
            try {
                parsed = JSON.parse(loadedText);
            } catch (_error) {
                throw new Error("Loaded account_pool.json is not valid JSON.");
            }

            if (!Array.isArray(parsed)) {
                throw new Error("Loaded account_pool.json must contain an array.");
            }

            dom.poolImportJson.value = JSON.stringify(parsed, null, 2);
            setStatusLine("Local pool JSON loaded.");
            notify("Loaded account_pool.json into the import form.", "success");
        }

        async function loadUploadedPoolJsonIntoForm(file) {
            if (!dom.poolImportJson) {
                return;
            }

            const selectedFile = file;
            if (!selectedFile || typeof selectedFile.text !== "function") {
                throw new Error("Choose a valid JSON file first.");
            }

            const fileName = String(selectedFile.name || "pool.json");
            const rawText = await selectedFile.text();
            if (!String(rawText || "").trim()) {
                throw new Error("Selected JSON file is empty.");
            }

            let parsed;
            try {
                parsed = JSON.parse(rawText);
            } catch (_error) {
                throw new Error("Uploaded JSON file is invalid.");
            }

            if (!Array.isArray(parsed)) {
                throw new Error("Uploaded JSON must contain an array of account records.");
            }

            dom.poolImportJson.value = JSON.stringify(parsed, null, 2);
            setStatusLine("Pool JSON file loaded: " + fileName);
            notify("JSON uploaded. Click Import / Update Pool to save changes.", "success");
        }

        function normalizePoolImportRecord(entry, index) {
            const item = entry && typeof entry === "object" ? entry : {};
            const email = String(item.email || "").trim().toLowerCase();
            if (!email) {
                return null;
            }

            const accessToken = String(item.token || item.access_token || "").trim();
            const passwordHash = String(item.password_hash || item.gateway_password_hash || "").trim();
            if (!accessToken && !passwordHash) {
                return null;
            }

            const maxUsersRaw = Number(item.max_users);
            const maxUsers = Number.isFinite(maxUsersRaw) && maxUsersRaw > 0
                ? Math.floor(maxUsersRaw)
                : DEFAULT_POOL_CAPACITY;
            const status = String(item.status || "active").trim().toLowerCase() === "inactive"
                ? "inactive"
                : "active";
            const tokenExpiry = resolvePoolTokenExpiry(item.exp || item.token_expiry || item.tokenExpiry);
            const poolNumber = resolvePoolNumberFromImportRecord(item, index);
            const label = String(item.label || item.name || item.pool_label || ("Pool " + String(poolNumber))).trim() || ("Pool " + String(poolNumber));

            return {
                label: label,
                email: email,
                password_hash: passwordHash,
                access_token: accessToken,
                token_expiry: tokenExpiry,
                max_users: maxUsers,
                status: status,
                created_by: state.context.user.id
            };
        }

        async function importPoolJson() {
            if (!state.poolSchemaReady) {
                throw new Error("Pool schema is missing. Run the latest supabase_schema.sql migration first.");
            }
            if (!dom.poolImportJson) {
                return;
            }

            const raw = String(dom.poolImportJson.value || "").trim();
            if (!raw) {
                throw new Error("Paste account_pool.json content first.");
            }

            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (_error) {
                throw new Error("Pool JSON is invalid. Fix JSON syntax and try again.");
            }

            if (!Array.isArray(parsed)) {
                throw new Error("Pool JSON must be an array of account records.");
            }

            const payload = parsed.map(function (entry, index) {
                return normalizePoolImportRecord(entry, index);
            }).filter(Boolean);

            if (!payload.length) {
                throw new Error("No valid pool records found. Each entry needs email plus token or password_hash.");
            }

            if (dom.poolImportBtn) {
                dom.poolImportBtn.disabled = true;
            }
            setStatusLine("Importing pool accounts...");

            try {
                const result = await client
                    .from("gateway_account_pool")
                    .upsert(payload, {
                        onConflict: "email"
                    })
                    .select("*");

                if (result.error) {
                    if (isPoolSchemaMissingError(result.error)) {
                        state.poolSchemaReady = false;
                        throw new Error("Pool schema is missing. Run the latest supabase_schema.sql migration first.");
                    }
                    throw new Error(result.error.message || "Unable to import pool accounts.");
                }

                await loadPoolData();
                await autoAssignPoolsByCapacity({
                    onlyUnassigned: true,
                    silent: true
                });
                renderPoolSummary();
                renderPoolTable();
                renderUsers();
                setStatusLine("Pool accounts imported.");
                notify(payload.length + " pool accounts imported/updated.", "success");
            } finally {
                if (dom.poolImportBtn) {
                    dom.poolImportBtn.disabled = false;
                }
            }
        }

        async function autoAssignPoolsByCapacity(optionsOverride) {
            const options = Object.assign({
                onlyUnassigned: false,
                silent: false
            }, optionsOverride || {});

            if (!state.poolSchemaReady) {
                throw new Error("Pool schema is missing. Run the latest supabase_schema.sql migration first.");
            }

            const activePools = state.poolAccounts.filter(function (pool) {
                const hasCredential = Boolean(pool.access_token || pool.password_hash);
                return pool.status === "active" && hasCredential;
            });

            if (!activePools.length) {
                throw new Error("No active pool accounts with credentials are available.");
            }

            const activeUsers = state.users
                .filter(function (user) {
                    return String(user.status || "active") !== "inactive";
                })
                .sort(function (left, right) {
                    const leftTime = new Date(left.created_at || 0).getTime();
                    const rightTime = new Date(right.created_at || 0).getTime();
                    if (leftTime !== rightTime) {
                        return leftTime - rightTime;
                    }
                    return String(left.email || left.id || "").localeCompare(String(right.email || right.id || ""));
                });

            const initialUsage = options.onlyUnassigned
                ? buildPoolUsageMap()
                : {};

            const buckets = activePools.map(function (pool) {
                return {
                    pool: pool,
                    assigned: Number(initialUsage[pool.id] || 0),
                    capacity: Number(pool.max_users || DEFAULT_POOL_CAPACITY)
                };
            });

            const upserts = [];
            let overflowAssignments = 0;

            activeUsers.forEach(function (user) {
                const userId = String(user.id || "").trim();
                if (!userId) {
                    return;
                }

                const existingPoolId = String(state.poolAssignments[userId] || "").trim();
                const hasValidExistingPool = existingPoolId && activePools.some(function (pool) {
                    return pool.id === existingPoolId;
                });
                if (options.onlyUnassigned && hasValidExistingPool) {
                    return;
                }

                let selectedBucket = buckets.find(function (bucket) {
                    return bucket.assigned < bucket.capacity;
                });
                if (!selectedBucket) {
                    selectedBucket = buckets.reduce(function (best, current) {
                        return current.assigned < best.assigned ? current : best;
                    }, buckets[0]);
                    overflowAssignments += 1;
                }

                selectedBucket.assigned += 1;
                upserts.push({
                    user_id: userId,
                    pool_id: selectedBucket.pool.id,
                    assigned_by: state.context.user.id,
                    assigned_at: new Date().toISOString()
                });
            });

            if (!upserts.length) {
                renderPoolSummary();
                renderPoolTable();
                renderUsers();
                if (!options.silent) {
                    notify("No users needed auto-assignment.", "info");
                }
                return;
            }

            const result = await client
                .from("profile_gateway_pool_assignments")
                .upsert(upserts, {
                    onConflict: "user_id"
                })
                .select("user_id, pool_id");

            if (result.error) {
                if (isPoolSchemaMissingError(result.error)) {
                    state.poolSchemaReady = false;
                    throw new Error("Pool schema is missing. Run the latest supabase_schema.sql migration first.");
                }
                throw new Error(result.error.message || "Unable to auto-assign pool accounts.");
            }

            state.poolAssignments = Object.assign({}, state.poolAssignments, normalizePoolAssignments(result.data));
            renderPoolSummary();
            renderPoolTable();
            renderUsers();

            if (!options.silent) {
                const overflowCopy = overflowAssignments
                    ? " " + overflowAssignments + " users exceeded pool capacity and were balanced to the least-loaded accounts."
                    : "";
                notify(upserts.length + " users assigned across pool accounts." + overflowCopy, overflowAssignments ? "info" : "success");
            }
        }

        function collectDirtyUserRowsFromDom() {
            if (!dom.usersTableBody) {
                return [];
            }

            return Array.from(dom.usersTableBody.querySelectorAll("[data-user-id]"))
                .map(function (row) {
                    return {
                        row: row,
                        payload: getUserRowPayload(row)
                    };
                })
                .filter(function (entry) {
                    return Boolean(entry.payload && entry.payload.userId && isUserPayloadDirty(entry.payload));
                });
        }

        async function persistUserPayload(payload) {
            if (!payload || !payload.userId) {
                return;
            }

            const result = await client
                .from("profiles")
                .update({
                    role: payload.role,
                    status: payload.status
                })
                .eq("id", payload.userId)
                .select("*")
                .single();

            if (result.error) {
                throw new Error(result.error.message || "Unable to update the user.");
            }

            const index = state.users.findIndex(function (entry) {
                return entry.id === payload.userId;
            });
            if (index !== -1) {
                state.users[index] = result.data;
            }

            await saveUserPoolAssignment(payload.userId, payload.selectedPoolId);
            markUserDirty(payload.userId, false);
        }

        async function finalizeUserAccessUpdates() {
            renderUsers();
            renderPoolSummary();
            renderPoolTable();
            await loadOverview();
            setStatusLine("User access updated.");
            if (typeof options.onUsersUpdated === "function") {
                options.onUsersUpdated(state.users.slice());
            }
        }

        function handleUserRowFieldChange(event) {
            const changedField = event.target.closest("[data-user-role], [data-user-status], [data-user-pool]");
            if (!changedField) {
                return;
            }

            const row = changedField.closest("[data-user-id]");
            if (!row) {
                return;
            }

            const payload = getUserRowPayload(row);
            if (!payload || !payload.userId) {
                return;
            }

            const isDirty = isUserPayloadDirty(payload);
            markUserDirty(payload.userId, isDirty);
            setRowDirtyState(row, isDirty);
            updateUsersSaveAllState();
        }

        async function handleUserTableClick(event) {
            const button = event.target.closest("[data-user-save]");
            if (!button) {
                return;
            }

            const row = button.closest("[data-user-id]");
            const payload = getUserRowPayload(row);
            if (!payload || !payload.userId) {
                return;
            }

            if (!isUserPayloadDirty(payload)) {
                markUserDirty(payload.userId, false);
                setRowDirtyState(row, false);
                updateUsersSaveAllState();
                notify("No changes to save for this user.", "info");
                return;
            }

            button.disabled = true;
            button.textContent = "Saving...";

            try {
                await persistUserPayload(payload);
                await finalizeUserAccessUpdates();
                notify("User updated.", "success");
            } catch (error) {
                button.disabled = false;
                button.textContent = getRowSaveButtonLabel(payload.userId);
                notify(error.message || "Unable to update the user.", "error");
            } finally {
                updateUsersSaveAllState();
            }
        }

        async function saveAllVisibleUserChanges() {
            const dirtyEntries = collectDirtyUserRowsFromDom();
            if (!dirtyEntries.length) {
                state.dirtyUserIds.clear();
                updateUsersSaveAllState();
                notify("No pending user changes on this page.", "info");
                return;
            }

            state.usersSaveInProgress = true;
            updateUsersSaveAllState();
            setStatusLine("Saving user access changes...");

            let successCount = 0;
            const failedMessages = [];

            for (let index = 0; index < dirtyEntries.length; index += 1) {
                const entry = dirtyEntries[index];
                const row = entry.row;
                const payload = entry.payload;
                const rowButton = row.querySelector("[data-user-save]");

                if (rowButton) {
                    rowButton.disabled = true;
                    rowButton.textContent = "Saving...";
                }

                try {
                    await persistUserPayload(payload);
                    successCount += 1;
                    setRowDirtyState(row, false);
                } catch (error) {
                    failedMessages.push(error && error.message ? error.message : "Unable to update one user.");
                    markUserDirty(payload.userId, true);
                    setRowDirtyState(row, true);
                } finally {
                    if (rowButton) {
                        rowButton.disabled = false;
                        rowButton.textContent = getRowSaveButtonLabel(payload.userId);
                    }
                }
            }

            state.usersSaveInProgress = false;

            if (successCount > 0 && !failedMessages.length) {
                await finalizeUserAccessUpdates();
                notify(String(successCount) + " users updated.", "success");
                updateUsersSaveAllState();
                return;
            }

            if (successCount > 0) {
                renderPoolSummary();
                renderPoolTable();
                await loadOverview();
                setStatusLine("User access partially updated.");
                if (typeof options.onUsersUpdated === "function") {
                    options.onUsersUpdated(state.users.slice());
                }
                notify(String(successCount) + " users updated. Fix highlighted rows and retry.", "info");
            }

            if (failedMessages.length) {
                notify("Some users failed to save: " + failedMessages[0], "error");
            }

            updateUsersSaveAllState();
        }

        function bindEvents() {
            if (state.bound) {
                return;
            }
            state.bound = true;

            root.addEventListener("click", function (event) {
                const targetSection = readSectionTargetFromEvent(event);
                if (!targetSection) {
                    return;
                }
                event.preventDefault();
                setActiveSection(targetSection);
            });

            if (dom.settingsForm) {
                dom.settingsForm.addEventListener("submit", function (event) {
                    saveSettings(event).catch(function (error) {
                        notify(error.message || "Unable to save settings.", "error");
                    });
                });
            }

            if (dom.loadModelsBtn) {
                dom.loadModelsBtn.addEventListener("click", function () {
                    loadLiveModels().catch(function (error) {
                        notify(error.message || "Unable to load live models.", "error");
                    });
                });
            }

            if (dom.defaultModel) {
                dom.defaultModel.addEventListener("change", function () {
                    handleDefaultModelSelectionChange();
                });
            }

            if (dom.defaultImageModel) {
                dom.defaultImageModel.addEventListener("change", function () {
                    handleDefaultModelSelectionChange();
                });
            }

            if (dom.modelFilter) {
                dom.modelFilter.addEventListener("input", function () {
                    state.modelFilter = (dom.modelFilter.value || "").trim().toLowerCase();
                    syncModelControls();
                });
            }

            if (dom.modelOptions) {
                dom.modelOptions.addEventListener("input", function (event) {
                    handleModelAliasInput(event);
                });
                dom.modelOptions.addEventListener("change", function (event) {
                    handleModelOptionToggle(event);
                    if (handleModelAliasInput(event)) {
                        syncModelControls();
                    }
                });
            }

            if (dom.botAddBtn) {
                dom.botAddBtn.addEventListener("click", function () {
                    addBotDraft();
                });
            }

            if (dom.botOptions) {
                dom.botOptions.addEventListener("input", function () {
                    syncBotControls({ reRender: false });
                });
                dom.botOptions.addEventListener("click", function (event) {
                    if (handleBotOptionRemove(event)) {
                        return;
                    }
                });
            }

            if (dom.userSearchInput) {
                dom.userSearchInput.addEventListener("input", function () {
                    state.userQuery = (dom.userSearchInput.value || "").trim().toLowerCase();
                    state.userPage = 1;
                    renderUsers();
                });
            }

            if (dom.poolRefreshBtn) {
                dom.poolRefreshBtn.addEventListener("click", function () {
                    loadPoolData()
                        .then(function () {
                            setStatusLine("Pool data refreshed.");
                            notify("Pool data refreshed.", "success");
                        })
                        .catch(function (error) {
                            notify(error.message || "Unable to refresh pool data.", "error");
                        });
                });
            }

            if (dom.poolImportBtn) {
                dom.poolImportBtn.addEventListener("click", function () {
                    importPoolJson().catch(function (error) {
                        notify(error.message || "Unable to import pool JSON.", "error");
                    });
                });
            }

            if (dom.poolLoadLocalBtn) {
                dom.poolLoadLocalBtn.addEventListener("click", function () {
                    loadLocalPoolJsonIntoForm().catch(function (error) {
                        notify(error.message || "Unable to load local account_pool.json.", "error");
                    });
                });
            }

            if (dom.poolJsonFile) {
                dom.poolJsonFile.addEventListener("change", function () {
                    const selectedFile = dom.poolJsonFile.files && dom.poolJsonFile.files[0];
                    if (!selectedFile) {
                        return;
                    }

                    loadUploadedPoolJsonIntoForm(selectedFile)
                        .catch(function (error) {
                            notify(error.message || "Unable to load uploaded pool JSON.", "error");
                        })
                        .finally(function () {
                            dom.poolJsonFile.value = "";
                        });
                });
            }

            if (dom.poolAutoAssignBtn) {
                dom.poolAutoAssignBtn.addEventListener("click", function () {
                    autoAssignPoolsByCapacity({
                        onlyUnassigned: false,
                        silent: false
                    }).catch(function (error) {
                        notify(error.message || "Unable to auto-assign pools.", "error");
                    });
                });
            }

            if (dom.poolPagePrev) {
                dom.poolPagePrev.addEventListener("click", function () {
                    goToPoolPage(state.poolPage - 1);
                });
            }

            if (dom.poolPageNext) {
                dom.poolPageNext.addEventListener("click", function () {
                    goToPoolPage(state.poolPage + 1);
                });
            }

            if (dom.poolPageNumbers) {
                dom.poolPageNumbers.addEventListener("click", function (event) {
                    const pageTrigger = event.target.closest("[data-pool-page]");
                    if (!pageTrigger) {
                        return;
                    }

                    const selectedPage = Number(pageTrigger.getAttribute("data-pool-page"));
                    goToPoolPage(selectedPage);
                });
            }

            if (dom.usersPagePrev) {
                dom.usersPagePrev.addEventListener("click", function () {
                    goToUserPage(state.userPage - 1);
                });
            }

            if (dom.usersPageNext) {
                dom.usersPageNext.addEventListener("click", function () {
                    goToUserPage(state.userPage + 1);
                });
            }

            if (dom.usersPageNumbers) {
                dom.usersPageNumbers.addEventListener("click", function (event) {
                    const pageTrigger = event.target.closest("[data-user-page]");
                    if (!pageTrigger) {
                        return;
                    }

                    const selectedPage = Number(pageTrigger.getAttribute("data-user-page"));
                    goToUserPage(selectedPage);
                });
            }

            if (dom.usersTableBody) {
                dom.usersTableBody.addEventListener("change", function (event) {
                    handleUserRowFieldChange(event);
                });

                dom.usersTableBody.addEventListener("click", function (event) {
                    handleUserTableClick(event).catch(function (error) {
                        notify(error.message || "Unable to update the user.", "error");
                    });
                });
            }

            if (dom.usersSaveAllBtn) {
                dom.usersSaveAllBtn.addEventListener("click", function () {
                    saveAllVisibleUserChanges().catch(function (error) {
                        state.usersSaveInProgress = false;
                        updateUsersSaveAllState();
                        notify(error.message || "Unable to save all user changes.", "error");
                    });
                });
            }

            if (dom.backBtn && typeof options.onBackToChat === "function") {
                dom.backBtn.addEventListener("click", function () {
                    options.onBackToChat();
                });
            }

            if (dom.logoutBtn) {
                dom.logoutBtn.addEventListener("click", function () {
                    if (typeof options.onLogout === "function") {
                        options.onLogout();
                        return;
                    }
                    auth.signOut();
                });
            }
        }

        async function init() {
            if (!state.context || state.context.profile.role !== "admin") {
                throw new Error("Admin access is required.");
            }

            if (dom.themeDefault) {
                dom.themeDefault.innerHTML = theme.getAvailableThemes().map(function (entry) {
                    return '<option value="' + utils.escapeHtml(entry.id) + '">' + utils.escapeHtml(entry.label) + "</option>";
                }).join("");
            }

            renderProfile();
            bindEvents();

            if (!state.settings) {
                state.settings = await fetchAppSettings();
            }

            utils.applyBranding(state.settings);
            theme.initialize({
                settings: state.settings,
                authPage: false,
                allowWorkspaceDefault: true
            });
            renderSettingsForm();
            setActiveSection(state.activeSection, { syncHash: Boolean(options.syncHash) });
            await loadOverview();
            await loadUsers();
            await loadPoolData();
            if (!state.poolSchemaReady) {
                notify("Pool routing schema is missing. Run the latest supabase_schema.sql migration.", "info");
            }
            setStatusLine("Admin workspace ready.");
            return state.settings;
        }

        async function refresh() {
            await loadOverview();
            await loadUsers();
            await loadPoolData();
        }

        function getSettings() {
            return state.settings;
        }

        return {
            init: init,
            refresh: refresh,
            getSettings: getSettings,
            setActiveSection: setActiveSection
        };
    }

    window.LumoraAdminWorkspace = {
        create: createWorkspace
    };
}());
