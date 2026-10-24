
(() => {
  "use strict";

  const SUPABASE_URL = "https://ovooslmyfavrtlxazykq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_XHfXBMkf6eng2p3gTLqC6g_A8aZB6dF";

  const panel = document.getElementById("auth-panel");
  const accountBar = document.getElementById("account-bar");
  const accountLabel = document.getElementById("account-label");
  const status = document.getElementById("auth-status");
  const signupForm = document.getElementById("signup-form");
  const loginForm = document.getElementById("login-form");
  const logoutButton = document.getElementById("logout-button");

  if (!panel || !accountBar || !accountLabel || !status ||
      !signupForm || !loginForm || !logoutButton) {
    console.error("Account interface missing from index.html.");
    return;
  }

  if (SUPABASE_URL.includes("PASTE_YOUR") ||
      SUPABASE_KEY.includes("PASTE_YOUR")) {
    status.textContent = "Please configure the Supabase URL and publishable key.";
    return;
  }

  if (!window.supabase?.createClient) {
    status.textContent = "Supabase library did not load. Check your connection.";
    return;
  }

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  function setStatus(message) {
    status.textContent = message;
  }

  function displaySession(session) {
    const user = session?.user;

    if (user) {
      const displayName =
        user.user_metadata?.display_name || user.email || "Garage Member";

      accountLabel.textContent = "Signed in as " + displayName;
      accountBar.hidden = false;
      panel.hidden = true;
    } else {
      accountLabel.textContent = "";
      accountBar.hidden = true;
      panel.hidden = false;
    }
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const displayName =
      document.getElementById("signup-name").value.trim();
    const email =
      document.getElementById("signup-email").value.trim();
    const password =
      document.getElementById("signup-password").value;

    if (!displayName || displayName.length > 40 || password.length < 8) {
      setStatus("Enter a display name and a password of at least 8 characters.");
      return;
    }

    const button = signupForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus("Creating your account...");

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: window.location.href
        }
      });

      if (error) throw error;

      if (data.session) {
        displaySession(data.session);
        setStatus("Welcome to the Garage!");
      } else {
        setStatus(
          "Account created. Check your email to confirm your address, then log in."
        );
      }
    } catch (error) {
      console.error("Registration error:", error);
      setStatus(error.message || "Could not create your account.");
    } finally {
      button.disabled = false;
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email =
      document.getElementById("login-email").value.trim();
    const password =
      document.getElementById("login-password").value;
    const button = loginForm.querySelector('button[type="submit"]');

    button.disabled = true;
    setStatus("Signing in...");

    try {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      displaySession(data.session);
      setStatus("Welcome back!");
    } catch (error) {
      console.error("Login error:", error);
      setStatus(error.message || "Login failed.");
    } finally {
      button.disabled = false;
    }
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    setStatus("Signing out...");

    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) throw error;

      displaySession(null);
      setStatus("You have logged out.");
    } catch (error) {
      console.error("Logout error:", error);
      setStatus(error.message || "Could not log out.");
    } finally {
      logoutButton.disabled = false;
    }
  });

  // Restore the session on refresh and react to future login/logout events.
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    displaySession(session);
  });

  supabaseClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      setStatus("Could not restore your login session.");
      return;
    }

    displaySession(data.session);
  });
})();
