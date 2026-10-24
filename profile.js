
(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ovooslmyfavrtlxazykq.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_XHfXBMkf6eng2p3gTLqC6g_A8aZB6dF";

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const form = document.getElementById("profile-form");
  const status = document.getElementById("profile-status");

  if (!form || !status) {
    console.error("Profile form or status message is missing.");
    return;
  }

  const usernameInput = document.getElementById("username");
  const displayNameInput = document.getElementById("display-name");
  const bioInput = document.getElementById("bio");
  const favoriteCarInput = document.getElementById("favorite-car");
  const saveButton = form.querySelector('button[type="submit"]');

  async function loadProfile() {
    status.textContent = "Checking your login...";

    try {
      const {
        data: { user },
        error: authError
      } = await client.auth.getUser();

      if (authError || !user) {
        form.hidden = true;
        status.textContent =
          "Please log in to GARAGE before editing your profile.";
        return;
      }

      const { data, error } = await client
        .from("profiles")
        .select("username, display_name, bio, favorite_car")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        usernameInput.value = data.username || "";
        displayNameInput.value = data.display_name || "";
        bioInput.value = data.bio || "";
        favoriteCarInput.value = data.favorite_car || "";

        status.textContent = "Your profile is loaded.";
      } else {
        displayNameInput.value =
          user.user_metadata?.display_name || "";
        status.textContent =
          "Welcome! Complete your profile and save it.";
      }
    } catch (error) {
      console.error("Profile loading error:", error);
      status.textContent =
        "Could not load your profile: " + error.message;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = usernameInput.value.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      status.textContent =
        "Username must be 3–24 characters using lowercase letters, numbers, or underscores.";
      return;
    }

    saveButton.disabled = true;
    status.textContent = "Saving your profile...";

    try {
      const {
        data: { user },
        error: authError
      } = await client.auth.getUser();

      if (authError || !user) {
        throw new Error("Please log in before saving your profile.");
      }

      const profile = {
        id: user.id,
        username,
        display_name: displayNameInput.value.trim(),
        bio: bioInput.value.trim(),
        favorite_car: favoriteCarInput.value.trim(),
        updated_at: new Date().toISOString()
      };

      const { error } = await client
        .from("profiles")
        .upsert(profile, { onConflict: "id" });

      if (error) {
        if (error.code === "23505") {
          throw new Error(
            "That username is already taken. Please choose another."
          );
        }

        throw error;
      }

      status.textContent = "Profile saved successfully!";
    } catch (error) {
      console.error("Profile saving error:", error);
      status.textContent = "Error: " + error.message;
    } finally {
      saveButton.disabled = false;
    }
  });

  loadProfile();
})();
