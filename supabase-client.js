
(() => {
  "use strict";

  // Replace these with your own Supabase project details.
  const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
  const SUPABASE_KEY = "YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY";

  if (!window.supabase?.createClient) {
    console.error(
      "GARAGE: Supabase library did not load. Check the CDN script in index.html."
    );
    return;
  }

  if (
    !SUPABASE_URL.startsWith("https://") ||
    SUPABASE_URL.includes("YOUR_SUPABASE")
  ) {
    console.error("GARAGE: Add your Supabase project URL in supabase-client.js.");
    return;
  }

  if (
    !SUPABASE_KEY ||
    SUPABASE_KEY.includes("YOUR_SUPABASE")
  ) {
    console.error("GARAGE: Add your Supabase anon/publishable key in supabase-client.js.");
    return;
  }

  try {
    // Reuse the existing client if another script already created it.
    if (!window.garageSupabase) {
      window.garageSupabase = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );
    }

    console.log("GARAGE: Supabase client initialized.");
  } catch (error) {
    console.error("GARAGE: Could not initialize Supabase:", error);
  }
})();
