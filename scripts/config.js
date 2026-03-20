window.LumoraConfig = {
    supabaseUrl: "https://btgtiwgjoxnbgwmjkeqh.supabase.co",
    supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Z3Rpd2dqb3huYmd3bWprZXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3OTA1MTAsImV4cCI6MjA4OTM2NjUxMH0.V-hFR77ShdWRqUp-32CkoucPx6Zf1FcAOE7AlowEZ20",
    defaults: {
        brandName: "Lumora",
        brandTagline: "Secure AI workspace with clean chat and separate admin controls.",
        welcomeTitle: "Start a new conversation",
        welcomeCopy: "Ask for writing help, product strategy, coding support, reviews, or deep analysis."
    },
    runtimeDefaults: {
        gatewayBaseUrl: "https://chat.qwen.ai",
        gatewayProxyTemplate: "https://cors-bypass.quotesiaofficial.workers.dev",
        defaultModel: "qwen3.5-plus",
        defaultImageModel: "qwen3.5-plus",
        allowedModels: ["qwen3.5-plus"],
        thinkingEnabled: false,
        thinkingBudget: 81920
    }
};
