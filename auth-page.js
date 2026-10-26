
/* =========================================================
   GARAGE — AUTHENTICATION PAGE
   FILE: auth-page.js

   SECTIONS:
   1. Supabase configuration
   2. HTML elements and setup
   3. Status messages
   4. Login/signup tab switching
   5. Password visibility
   6. Username validation
   7. Signup and unique username handling
   8. Login
   9. Existing session check
========================================================= */

(() => {
  "use strict";

  console.log("GARAGE auth-page.js loaded");

  /* =======================================================
     SECTION 1 — SUPABASE CONFIGURATION
  ======================================================= */

  const SUPABASE_URL =
    "https://ovooslmyfavrtlxazykq.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_XHfXBMkf6eng2p3gTLqC6g_A8aZB6dF";

  /* =======================================================
     SECTION 2 — HTML ELEMENTS
  ======================================================= */

  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");

  const loginTab = document.getElementById("show-login");
  const signupTab = document.getElementById("show-signup");

  const status = document.getElementById("auth-status");

  const usernameInput = document.getElementById("signup-username");
  const nameInput = document.getElementById("signup-name");
  const emailInput = document.getElementById("signup-email");
  const passwordInput = document.getElementById("signup-password");

  const loginEmailInput = document.getElementById("login-email");
  const loginPasswordInput = document.getElementById("login-password");

  /* =======================================================
     SECTION 3 — CHECK PAGE SETUP
  ======================================================= */

  function showStatus(message, isError = false) {
    if (!status) return;

    status.textContent = message;
    status.style.color = isError ? "#ff8585" : "#39ff14";
  }

  if (!loginForm || !signupForm || !status) {
    console.error(
      "GARAGE AUTH: Required form elements are missing."
    );
    showStatus("Setup error: Check the form IDs in auth.html.", true);
    return;
  }

  if (!usernameInput || !nameInput || !emailInput || !passwordInput) {
    console.error(
      "GARAGE AUTH: Signup fields are missing from auth.html."
    );
    showStatus(
      "Setup error: Check the signup fields in auth.html.",
      true
    );
    return;
  }

  if (!window.supabase?.createClient) {
    showStatus(
      "Could not load Supabase. Check your internet connection.",
      true
    );
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  /* =======================================================
     SECTION 4 — LOGIN/SIGNUP TAB SWITCHING
  ======================================================= */

  function showTab(tab) {
    const signup = tab === "signup";

    loginForm.hidden = signup;
    signupForm.hidden = !signup;

    if (loginTab) {
      loginTab.classList.toggle("active", !signup);
      loginTab.setAttribute("aria-pressed", String(!signup));
    }

    if (signupTab) {
      signupTab.classList.toggle("active", signup);
      signupTab.setAttribute("aria-pressed", String(signup));
    }

    showStatus("");
  }

  loginTab?.addEventListener("click", () => showTab("login"));
  signupTab?.addEventListener("click", () => showTab("signup"));

  /* =======================================================
     SECTION 5 — SHOW/HIDE SIGNUP PASSWORD
  ======================================================= */

  const toggleSignupPassword = document.getElementById(
    "toggle-signup-password"
  );

  if (passwordInput && toggleSignupPassword) {
    toggleSignupPassword.addEventListener("click", () => {
      const showing = passwordInput.type === "text";

      passwordInput.type = showing ? "password" : "text";
      toggleSignupPassword.textContent = showing ? "👁️" : "🙈";

      toggleSignupPassword.setAttribute(
        "aria-label",
        showing ? "Show password" : "Hide password"
      );

      toggleSignupPassword.setAttribute(
        "aria-pressed",
        String(!showing)
      );
    });
  }

  /* =======================================================
     SECTION 6 — USERNAME VALIDATION
  ======================================================= */

  function normalizeUsername(value) {
    return value.trim().toLowerCase();
  }

  function isValidUsername(username) {
    return /^[a-z0-9_]{3,24}$/.test(username);
  }

  /* =======================================================
     SECTION 7 — SIGNUP AND UNIQUE USERNAME HANDLING
  ======================================================= */

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    // SECTION 7A — READ FORM VALUES
    const username = normalizeUsername(usernameInput.value);
    const displayName = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    // SECTION 7B — VALIDATE REQUIRED FIELDS
    if (!username || !displayName || !email || !password) {
      showStatus("Please complete all fields.", true);
      return;
    }

    if (!isValidUsername(username)) {
      showStatus(
        "Username must be 3–24 characters using letters, numbers, or underscores.",
        true
      );
      usernameInput.focus();
      return;
    }

    if (displayName.length > 40) {
      showStatus(
        "Your display name must be 40 characters or fewer.",
        true
      );
      return;
    }

    if (password.length < 8) {
      showStatus(
        "Your password must be at least 8 characters.",
        true
      );
      return;
    }

    // SECTION 7C — PREVENT DOUBLE SUBMISSION
    const button = signupForm.querySelector(
      'button[type="submit"]'
    );

    if (button) button.disabled = true;

    try {
      // SECTION 7D — CHECK USERNAME AVAILABILITY
      showStatus("Checking username...");

      const { data: existing, error: checkError } = await db
        .from("profiles")
        .select("id")
        .ilike("username", username)
        .limit(1);

      if (checkError) {
        console.error(
          "GARAGE AUTH: Username check failed:",
          checkError
        );

        showStatus(
          "We couldn't check that username. Please try again.",
          true
        );
        return;
      }

      if (existing && existing.length > 0) {
        showStatus(
          "That username is already taken. Please choose another.",
          true
        );
        usernameInput.focus();
        return;
      }

      // SECTION 7E — CREATE SUPABASE AUTH ACCOUNT
      showStatus("Creating your account...");

      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username,
            display_name: displayName
          },
          emailRedirectTo: window.location.href.split("?")[0]
        }
      });

      if (error) {
        console.error("GARAGE AUTH: Signup failed:", error);

        // SECTION 7F — HANDLE DUPLICATE USERNAME ERRORS
        const errorDetails = [
          error.message,
          error.details,
          error.hint,
          error.code
        ].filter(Boolean).join(" ").toLowerCase();

        if (
          errorDetails.includes("profiles_username_unique") ||
          errorDetails.includes("duplicate key") ||
          errorDetails.includes("23505")
        ) {
          showStatus(
            "That username is already taken. Please choose another.",
            true
          );
        } else {
          showStatus(
            error.message || "Signup failed. Please try again.",
            true
          );
        }

        return;
      }

      // SECTION 7G — REPORT SIGNUP SUCCESS
      if (data.session) {
        showStatus("Account created! Opening GARAGE...");
        window.location.href = "index.html";
      } else {
        showStatus(
          "Signup received! Check your email to confirm your account, then log in."
        );

        showTab("login");
      }
    } catch (error) {
      console.error(
        "GARAGE AUTH: Unexpected signup error:",
        error
      );

      showStatus(
        "Something went wrong. Please try again.",
        true
      );
    } finally {
      if (button) button.disabled = false;
    }
  });

  /* =======================================================
     SECTION 8 — LOGIN
  ======================================================= */

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = loginEmailInput?.value.trim();
    const password = loginPasswordInput?.value;

    if (!email || !password) {
      showStatus("Enter your email and password.", true);
      return;
    }

    const button = loginForm.querySelector(
      'button[type="submit"]'
    );

    if (button) button.disabled = true;

    showStatus("Logging in...");

    try {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error("GARAGE AUTH: Login failed:", error);

        showStatus(
          "Login failed. Check your email and password.",
          true
        );
        return;
      }

      showStatus("Login successful! Opening GARAGE...");
      window.location.href = "index.html";
    } catch (error) {
      console.error(
        "GARAGE AUTH: Unexpected login error:",
        error
      );

      showStatus(
        "Something went wrong. Please try again.",
        true
      );
    } finally {
      if (button) button.disabled = false;
    }
  });

  /* =======================================================
     SECTION 9 — CHECK EXISTING LOGIN SESSION
  ======================================================= */

  db.auth.getSession()
    .then(({ data, error }) => {
      if (error) {
        console.error(
          "GARAGE AUTH: Could not check session:",
          error
        );
        return;
      }

      if (data.session) {
        showStatus("You're already logged in.");
      }
    })
    .catch((error) => {
      console.error(
        "GARAGE AUTH: Session check failed:",
        error
      );
    });

})();
