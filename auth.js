/* =========================================================
   GARAGE — AUTHENTICATION
   ---------------------------------------------------------
   Responsibilities:
   1. Connect to the shared Supabase client
   2. Display the current account status
   3. Show sign-in or logout controls
   4. Handle logout
   5. Keep the account display updated when auth changes

   IMPORTANT:
   - supabase-client.js must load before this file.
   - This file does not create a second Supabase client.
   - Public community posts are handled separately by script.js.
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     1. GET SHARED SUPABASE CLIENT
  ======================================================= */

  const client = window.garageSupabase;

  if (!window.supabase?.createClient) {
    console.error(
      "GARAGE AUTH: The Supabase library did not load. Check index.html."
    );
    return;
  }

  if (!client?.auth) {
    console.error(
      "GARAGE AUTH: Supabase client is missing. Check supabase-client.js."
    );
    return;
  }

  /* =======================================================
     2. FIND ACCOUNT CONTROLS
  ======================================================= */

  const authLink = document.getElementById("auth-link");
  const logoutBtn = document.getElementById("logout-btn");
  const accountStatus = document.getElementById("account-status");

  if (!authLink || !logoutBtn || !accountStatus) {
    console.error(
      "GARAGE AUTH: Account controls are missing from index.html."
    );
    return;
  }

  /* =======================================================
     3. GET THE DISPLAY NAME
  ======================================================= */

  function getAccountName(user) {
    return (
      user?.user_metadata?.display_name ||
      user?.user_metadata?.username ||
      user?.email ||
      "Garage Member"
    );
  }

  /* =======================================================
     4. UPDATE ACCOUNT CONTROLS
  ======================================================= */

  function updateAccount(session) {
    const user = session?.user || null;

    if (user) {
      // Signed-in member.
      accountStatus.textContent = `Logged in as ${getAccountName(user)}`;

      authLink.hidden = true;
      logoutBtn.hidden = false;
      logoutBtn.disabled = false;

      // Expose the current authentication state to other UI code.
      document.documentElement.dataset.authState = "signed-in";
    } else {
      // Guest visitor.
      accountStatus.textContent = "";

      authLink.hidden = false;
      logoutBtn.hidden = true;
      logoutBtn.disabled = false;

      document.documentElement.dataset.authState = "guest";
    }
  }

  /* =======================================================
     5. LOGOUT
  ======================================================= */

  async function handleLogout() {
    if (logoutBtn.disabled) return;

    logoutBtn.disabled = true;
    accountStatus.textContent = "Signing out...";

    try {
      const { error } = await client.auth.signOut();

      if (error) {
        console.error("GARAGE AUTH: Logout failed:", error.message);

        accountStatus.textContent = error.message;
        logoutBtn.disabled = false;
        return;
      }

      // Supabase's auth-state listener also updates the controls.
      updateAccount(null);

      // Stay on the current page. Public community posts should
      // remain available to visitors who are logged out.
    } catch (error) {
      console.error("GARAGE AUTH: Unexpected logout error:", error);

      accountStatus.textContent = "Could not sign out. Please try again.";
      logoutBtn.disabled = false;
    }
  }

  logoutBtn.addEventListener("click", handleLogout);

  /* =======================================================
     6. WATCH SIGN-IN AND SIGN-OUT EVENTS
  ======================================================= */

  client.auth.onAuthStateChange((_event, session) => {
    updateAccount(session);
  });

  /* =======================================================
     7. RESTORE EXISTING SESSION
  ======================================================= */

  async function restoreSession() {
    try {
      const { data, error } = await client.auth.getSession();

      if (error) {
        console.error(
          "GARAGE AUTH: Could not restore login:",
          error.message
        );

        // Treat the page as a guest if the session cannot be restored.
        updateAccount(null);
        return;
      }

      updateAccount(data.session);
    } catch (error) {
      console.error(
        "GARAGE AUTH: Unexpected session error:",
        error
      );

      updateAccount(null);
    }
  }

  /* =======================================================
     8. INITIALIZE
  ======================================================= */

  // Start with the guest controls visible until the session is checked.
  updateAccount(null);

  // Restore the saved login, if one exists.
  restoreSession();
})();
