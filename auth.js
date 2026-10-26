
(() => {
  "use strict";

  const client = window.garageSupabase;

  const $ = (id) => document.getElementById(id);

  const loginForm = $("loginForm");
  const signupForm = $("signupForm");
  const authForm = $("authForm");

  const authStatus = $("auth-status") || $("authMessage");
  const accountStatus = $("account-status");
  const authLink = $("auth-link");
  const logoutButton = $("logout-btn");
  const accountBar = $("account-bar");

  function showStatus(message, isError = false) {
    if (authStatus) {
      authStatus.textContent = message;
      authStatus.style.color = isError ? "#ff7777" : "#39ff14";
    }

    if (accountStatus) {
      accountStatus.textContent = message;
    }

    console.log("GARAGE:", message);
  }

  function setBusy(form, busy, buttonText) {
    if (!form) return;

    const button = form.querySelector('[type="submit"]');

    if (button) {
      if (busy) {
        button.dataset.originalText = button.textContent;
        button.textContent = buttonText;
      } else {
        button.textContent =
          button.dataset.originalText || button.textContent;
        delete button.dataset.originalText;
      }

      button.disabled = busy;
    }
  }

  function getInput(form, selectors) {
    for (const selector of selectors) {
      const input = form?.querySelector(selector);

      if (input) return input;
    }

    return null;
  }

  function getEmail(form) {
    return getInput(form, [
      '[name="email"]',
      "#email",
      "#loginEmail",
      "#signupEmail",
      'input[type="email"]'
    ])?.value.trim() || "";
  }

  function getPassword(form) {
    return getInput(form, [
      '[name="password"]',
      "#password",
      "#loginPassword",
      "#signupPassword",
      'input[type="password"]'
    ])?.value || "";
  }

  function getDisplayName(form) {
    return getInput(form, [
      '[name="display_name"]',
      '[name="displayName"]',
      '[name="username"]',
      "#displayName",
      "#username",
      "#signupName"
    ])?.value.trim() || "";
  }

  async function updateAccountUI(session) {
    const user = session?.user || null;

    if (accountStatus) {
      accountStatus.textContent = user
        ? `Signed in: ${user.email || "GARAGE member"}`
        : "You are browsing as a guest.";
    }

    if (authLink) {
      authLink.textContent = user ? "My account" : "Sign in";
      authLink.href = user ? "index.html#account" : "auth.html";
    }

    if (logoutButton) {
      logoutButton.hidden = !user;
    }

    if (accountBar) {
      accountBar.hidden = !user;
    }

    document.querySelectorAll("[data-auth-required]").forEach((element) => {
      element.hidden = !user;
    });

    document.querySelectorAll("[data-guest-only]").forEach((element) => {
      element.hidden = Boolean(user);
    });
  }

  async function refreshSession() {
    if (!client) {
      showStatus(
        "Supabase is not connected. Check supabase-client.js.",
        true
      );
      return;
    }

    try {
      const { data, error } = await client.auth.getSession();

      if (error) throw error;

      await updateAccountUI(data.session);

      if (data.session) {
        showStatus("You are signed in.");
      }
    } catch (error) {
      console.error("GARAGE: Session check failed:", error);
      showStatus(error.message || "Could not check your account.", true);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const email = getEmail(form);
    const password = getPassword(form);

    if (!email || !password) {
      showStatus("Enter your email and password.", true);
      return;
    }

    setBusy(form, true, "Signing in...");

    try {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      await updateAccountUI(data.session);
      showStatus("Login successful!");

      window.location.href = "index.html";
    } catch (error) {
      console.error("GARAGE: Login failed:", error);
      showStatus(error.message || "Could not sign in.", true);
    } finally {
      setBusy(form, false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const email = getEmail(form);
    const password = getPassword(form);
    const displayName = getDisplayName(form);

    if (!email || !password) {
      showStatus("Enter your email and password.", true);
      return;
    }

    if (password.length < 6) {
      showStatus("Your password must have at least 6 characters.", true);
      return;
    }

    setBusy(form, true, "Creating account...");

    try {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split("@")[0],
            username: displayName || email.split("@")[0]
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        await updateAccountUI(data.session);
        showStatus("Your GARAGE account has been created!");
        window.location.href = "index.html";
      } else {
        showStatus(
          "Account created. Check your email to confirm your account before signing in."
        );
      }
    } catch (error) {
      console.error("GARAGE: Signup failed:", error);
      showStatus(error.message || "Could not create your account.", true);
    } finally {
      setBusy(form, false);
    }
  }

  async function handleLogout() {
    if (!client) {
      showStatus("Supabase is not connected.", true);
      return;
    }

    if (logoutButton) {
      logoutButton.disabled = true;
      logoutButton.textContent = "Signing out...";
    }

    try {
      const { error } = await client.auth.signOut();

      if (error) throw error;

      await updateAccountUI(null);
      showStatus("You have signed out.");

      if (window.location.pathname.endsWith("auth.html")) {
        window.location.reload();
      }
    } catch (error) {
      console.error("GARAGE: Logout failed:", error);
      showStatus(error.message || "Could not sign out.", true);
    } finally {
      if (logoutButton) {
        logoutButton.disabled = false;
        logoutButton.textContent = "Log out";
      }
    }
  }

  if (!client) {
    showStatus(
      "Supabase is not connected. Check supabase-client.js and script order.",
      true
    );
    return;
  }

  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  if (signupForm) {
    signupForm.addEventListener("submit", handleSignup);
  }

  if (authForm) {
    authForm.addEventListener("submit", async (event) => {
      const mode = authForm.dataset.mode;

      if (mode === "signup") {
        await handleSignup(event);
      } else {
        await handleLogin(event);
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", handleLogout);
  }

  client.auth.onAuthStateChange((_event, session) => {
    Promise.resolve().then(() => updateAccountUI(session));
  });

  refreshSession();
})();
