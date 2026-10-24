
(() => {
  "use strict";

  const SUPABASE_URL = "https://ovooslmyfavrtlxazykq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_XHfXBMkf6eng2p3gTLqC6g_A8aZB6dF";

  const authLink = document.getElementById("auth-link");
  const logoutBtn = document.getElementById("logout-btn");
  const accountStatus = document.getElementById("account-status");

  if (!authLink || !logoutBtn || !accountStatus) {
    console.error("Account controls are missing from index.html.");
    return;
  }

  if (!window.supabase?.createClient) {
    console.error("Supabase library did not load.");
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  function updateAccount(session) {
    if (session?.user) {
      const name =
        session.user.user_metadata?.display_name ||
        session.user.email ||
        "Garage Member";

      accountStatus.textContent = "Logged in as " + name;
      authLink.hidden = true;
      logoutBtn.hidden = false;
    } else {
      accountStatus.textContent = "";
      authLink.hidden = false;
      logoutBtn.hidden = true;
    }
  }

  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;

    const { error } = await db.auth.signOut();

    logoutBtn.disabled = false;

    if (error) {
      accountStatus.textContent = error.message;
      return;
    }

    updateAccount(null);
  });

  db.auth.onAuthStateChange((_event, session) => {
    updateAccount(session);
  });

  db.auth.getSession().then(({ data, error }) => {
    if (error) {
      console.error("Could not restore login:", error);
      return;
    }

    updateAccount(data.session);
  });
})();
