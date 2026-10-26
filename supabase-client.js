/* =========================================================
   GARAGE — SUPABASE CLIENT
   ---------------------------------------------------------
   Responsibilities:
   1. Verify the Supabase library is loaded.
   2. Initialize the shared Supabase client.
   3. Make the client available to auth.js and script.js.

   IMPORTANT:
   - Load the Supabase CDN library before this file.
   - Use the publishable key in browser-side code.
   - Never put a Supabase service_role key in this file.
========================================================= */


/* =========================================================
   1. SUPABASE PROJECT CONFIGURATION
========================================================= */

const GARAGE_SUPABASE_URL =
  "https://ovooslmyfavrtlxazykq.supabase.com";

const GARAGE_SUPABASE_KEY =
  "sb_publishable_XHfXBMkf6eng2p3gTLqC6g_A8aZB6dF";


/* =========================================================
   2. CHECK THAT THE SUPABASE LIBRARY LOADED
========================================================= */

if (!window.supabase?.createClient) {
  console.error(
    "GARAGE: Supabase library did not load. Check the Supabase CDN script in index.html."
  );
} else {


  /* =======================================================
     3. CREATE THE SHARED CLIENT
  ======================================================= */

  window.garageSupabase = window.supabase.createClient(
    GARAGE_SUPABASE_URL,
    GARAGE_SUPABASE_KEY
  );

  console.info("GARAGE: Supabase client initialized.");
}
