
(() => {
  "use strict";

  const SUPABASE_URL = "PASTE_YOUR_PROJECT_URL_HERE";
  const SUPABASE_KEY = "PASTE_YOUR_PUBLISHABLE_KEY_HERE";

  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const loginTab = document.getElementById("show-login");
  const signupTab = document.getElementById("show-signup");
  const status = document.getElementById("auth-status");

  const client = window.supabase?.createClient;

  if (!client) {
    status.textContent = "Could not load Supabase. Check your internet connection.";
    return;
  }

  if (SUPABASE_URL.includes("PASTE_YOUR") ||
      SUPABASE_KEY.includes("PASTE_YOUR")) {
    status.textContent = "Add your Supabase URL and publishable key in auth-page.js.";
    return;
  }

  const db = client(SUPABASE_URL, SUPABASE_KEY);

  function showTab(tab) {
    const signup = tab === "signup";

    loginForm.hidden = signup;
    signupForm.hidden = !signup;
    loginTab.classList.toggle("active", !signup);
    signupTab.classList.toggle("active", signup);
    status.textContent = "";
  }

  loginTab.addEventListener("click", () => showTab("login"));
  signupTab.addEventListener("click", () => showTab("signup"));

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;

    if (!name || name.length > 40 || password.length < 8) {
      status.textContent = "Enter a display name and a password of at least 8 characters.";
      return;
    }

    const button = signupForm.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = "Creating account...";

    try {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name },
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) throw error;

      if (data.session) {
        status.textContent = "Account created! Returning to your garage...";
        window.location.href = "index.html";
      } else {
        status.textContent = "Account created. Check your email to confirm, then log in here.";
        showTab("login");
      }
    } catch (error) {
      console.error(error);
      status.textContent = error.message || "Registration failed.";
    } finally {
      button.disabled = false;
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const button = loginForm.querySelector('button[type="submit"]');

    button.disabled = true;
    status.textContent = "Logging in...";

    try {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      status.textContent = "Login successful! Returning to your garage...";
      window.location.href = "index.html";
    } catch (error) {
      console.error(error);
      status.textContent = error.message || "Login failed.";
    } finally {
      button.disabled = false;
    }
  });

  db.auth.getSession().then(({ data, error }) => {
    if (!error && data.session) {
      status.textContent = "You're already logged in.";
    }
  });
})();
