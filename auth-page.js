
(() => {
  "use strict";
  console.log("GARAGE auth-page.js loaded");

  // Replace these with your own Supabase project details.
  const SUPABASE_URL = "https://ovooslmyfavrtlxazykq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_XHfXBMkf6eng2p3gTLqC6g_A8aZB6dF";

  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const loginTab = document.getElementById("show-login");
  const signupTab = document.getElementById("show-signup");
  const status = document.getElementById("auth-status");

  function showStatus(message) {
    if (status) status.textContent = message;
  }

  // Check that the HTML elements exist.
  if (!loginForm || !signupForm || !status) {
    console.error("Auth page: Required form elements are missing.");
    showStatus("Setup error: Check the form IDs in auth.html.");
    return;
  }

  // Check that Supabase loaded.
  if (!window.supabase?.createClient) {
    showStatus("Could not load Supabase. Check your internet connection.");
    return;
  }

  if (
    SUPABASE_URL.includes("PASTE_YOUR") ||
    SUPABASE_KEY.includes("PASTE_YOUR")
  ) {
    showStatus("Setup needed: Add your Supabase URL and publishable key.");
    return;
  }

  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  function showTab(tab) {
    const signup = tab === "signup";

    loginForm.hidden = signup;
    signupForm.hidden = !signup;

    if (loginTab) loginTab.classList.toggle("active", !signup);
    if (signupTab) signupTab.classList.toggle("active", signup);

    showStatus("");
  }

  if (loginTab) {
    loginTab.addEventListener("click", () => showTab("login"));
  }

  if (signupTab) {
    signupTab.addEventListener("click", () => showTab("signup"));
  }

  // SIGN UP

  
const signupPassword = document.getElementById("signup-password");
const toggleSignupPassword = document.getElementById("toggle-signup-password");

if (signupPassword && toggleSignupPassword) {
  toggleSignupPassword.addEventListener("click", () => {
    const showing = signupPassword.type === "text";

    signupPassword.type = showing ? "password" : "text";
    toggleSignupPassword.textContent = showing ? "👁️" : "🙈";
    toggleSignupPassword.setAttribute(
      "aria-label",
      showing ? "Show password" : "Hide password"
    );
    toggleSignupPassword.setAttribute("aria-pressed", String(!showing));
  });
}

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("signup-name")?.value.trim();
    const email = document.getElementById("signup-email")?.value.trim();
    const password = document.getElementById("signup-password")?.value;

    if (!name || !email || !password) {
      showStatus("Please complete all fields.");
      return;
    }

    if (name.length > 40) {
      showStatus("Your display name must be 40 characters or fewer.");
      return;
    }

    if (password.length < 8) {
      showStatus("Your password must be at least 8 characters.");
      return;
    }

    const button = signupForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    showStatus("Creating your account...");

    try {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: name
          },
          emailRedirectTo: window.location.href.split("?")[0]
        }
      });

      if (error) throw error;

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
      console.error("Signup error:", error);
      showStatus(error.message || "Signup failed. Please try again.");
    } finally {
      if (button) button.disabled = false;
    }
  });

  // LOG IN
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email")?.value.trim();
    const password = document.getElementById("login-password")?.value;

    if (!email || !password) {
      showStatus("Enter your email and password.");
      return;
    }

    const button = loginForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    showStatus("Logging in...");

    try {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      showStatus("Login successful! Opening GARAGE...");
      window.location.href = "index.html";
    } catch (error) {
      console.error("Login error:", error);
      showStatus(error.message || "Login failed. Please try again.");
    } finally {
      if (button) button.disabled = false;
    }
  });

  // Check whether a user is already logged in.
  db.auth.getSession().then(({ data, error }) => {
    if (!error && data.session) {
      showStatus("You're already logged in.");
    }
  });
})();
