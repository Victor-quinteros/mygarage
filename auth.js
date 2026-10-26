
/* =========================================================
   GARAGE — AUTHENTICATION UI
   ---------------------------------------------------------
   Responsibilities:
   1. Display the current account status.
   2. Show login or logout controls.
   3. Handle logout.
   4. Keep account controls updated after auth changes.

   script.js handles the rest of the application UI.
   Uses the shared Supabase client from supabase-client.js.
========================================================= */

(() => {
  "use strict";

  const client = window.garageSupabase;

  const authLink = document.getElementById("auth-link");
  const logoutBtn = document.getElementById("logout-btn");
  const accountStatus = document.getElementById("account-status");

  if (!client?.auth) {
    console.error(
      "GARAGE AUTH: Shared Supabase client is unavailable."
    );
    return;
  }

  if (!authLink || !logoutBtn || !accountStatus) {
    console.error(
      "GARAGE AUTH: Account controls are missing from index.html."
    );
    return;
  }

  let logoutInProgress = false;

  function getAccountName(user) {
    return (
      user?.user_metadata?.display_name ||
      user?.user_metadata?.username ||
      user?.email ||
      "Garage Member"
    );
  }

  function updateAccount(session) {
    const user = session?.user || null;

    if (user) {
      accountStatus.textContent =
        `Logged in as ${getAccountName(user)}`;

      authLink.hidden = true;
      logoutBtn.hidden = false;
      logoutBtn.disabled = logoutInProgress;

      document.documentElement.dataset.authState = "signed-in";
    } else {
      accountStatus.textContent = "";

      authLink.hidden = false;
      logoutBtn.hidden = true;
      logoutBtn.disabled = false;

      document.documentElement.dataset.authState = "guest";
    }
  }

  async function handleLogout() {
    if (logoutInProgress) return;

    logoutInProgress = true;
    logoutBtn.disabled = true;
    accountStatus.textContent = "Signing out...";

    try {
      const { error } = await client.auth.signOut();

      if (error) throw error;

      // The auth-state listener will update the account controls.
      // script.js will handle the application's signed-out state.
    } catch (error) {
      console.error("GARAGE AUTH: Logout failed:", error);

      accountStatus.textContent =
        error?.message || "Could not sign out. Please try again.";

      logoutInProgress = false;
      logoutBtn.disabled = false;
    }
  }

  logoutBtn.addEventListener("click", handleLogout);

  // Register the listener before restoring the saved session.
  client.auth.onAuthStateChange((_event, session) => {
    logoutInProgress = false;
    updateAccount(session);
  });

  async function restoreSession() {
    try {
      const { data, error } = await client.auth.getSession();

      if (error) throw error;

      updateAccount(data.session);
    } catch (error) {
      console.error("GARAGE AUTH: Session restore failed:", error);
      updateAccount(null);
    }
  }

  updateAccount(null);
  restoreSession();
})();
