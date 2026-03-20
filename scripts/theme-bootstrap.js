(function () {
    var storagePrefix = "lumora";
    var preferenceStorageKey = storagePrefix + ":theme-preference";
    var lastResolvedStorageKey = storagePrefix + ":theme-last-resolved";
    var workspaceDefaultValue = "workspace-default";
    var defaultThemeId = "obsidian";
    var themeSchemeById = {
        obsidian: "dark",
        porcelain: "light",
        graphite: "dark",
        terminal: "dark",
        ember: "dark",
        oceanic: "dark",
        noir: "dark",
        ivory: "light",
        aurora: "dark",
        atelier: "light"
    };

    function parseStoredValue(key) {
        var raw;
        try {
            raw = window.localStorage.getItem(key);
        } catch (_storageReadError) {
            return null;
        }

        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch (_parseError) {
            return null;
        }
    }

    function isValidThemeId(themeId) {
        return Object.prototype.hasOwnProperty.call(themeSchemeById, themeId);
    }

    var preferredTheme = parseStoredValue(preferenceStorageKey);
    var lastResolvedTheme = parseStoredValue(lastResolvedStorageKey);
    var resolvedTheme = defaultThemeId;

    if (isValidThemeId(preferredTheme)) {
        resolvedTheme = preferredTheme;
    } else if (preferredTheme === workspaceDefaultValue && isValidThemeId(lastResolvedTheme)) {
        resolvedTheme = lastResolvedTheme;
    } else if (isValidThemeId(lastResolvedTheme)) {
        resolvedTheme = lastResolvedTheme;
    }

    var root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = themeSchemeById[resolvedTheme] || themeSchemeById[defaultThemeId];
}());
