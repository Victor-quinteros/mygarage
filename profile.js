
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
  const avatarInput = document.getElementById("avatar-file");
  const avatarPreview = document.getElementById("avatar-preview");
  const saveButton = form.querySelector('button[type="submit"]');

  const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
  const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  let currentAvatarUrl = "";
  let selectedAvatar = null;
  let previewObjectUrl = null;

  function setAvatarPreview(url) {
    if (!avatarPreview || !url) return;
    avatarPreview.src = url;
  }

  if (avatarInput) {
    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files?.[0];

      selectedAvatar = null;

      if (!file) return;

      if (!ALLOWED_TYPES.includes(file.type)) {
        avatarInput.value = "";
        status.textContent =
          "Please choose a JPG, PNG, WebP, or GIF image.";
        return;
      }

      if (file.size > MAX_AVATAR_SIZE) {
        avatarInput.value = "";
        status.textContent =
          "Your profile picture must be 2 MB or smaller.";
        return;
      }

      selectedAvatar = file;

      if (avatarPreview) {
        if (previewObjectUrl) {
          URL.revokeObjectURL(previewObjectUrl);
        }

        previewObjectUrl = URL.createObjectURL(file);
        setAvatarPreview(previewObjectUrl);
      }

      status.textContent =
        "Picture selected. Save your profile to upload it.";
    });
  }

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
        .select(
          "username, display_name, bio, favorite_car, avatar_url"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        usernameInput.value = data.username || "";
        displayNameInput.value = data.display_name || "";
        bioInput.value = data.bio || "";
        favoriteCarInput.value = data.favorite_car || "";

        currentAvatarUrl = data.avatar_url || "";

        if (currentAvatarUrl) {
          setAvatarPreview(currentAvatarUrl);
        }

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
        throw new Error(
          "Please log in before saving your profile."
        );
      }

      // Upload the picture only when a new one was selected.
      if (selectedAvatar) {
        const extensionByType = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif"
        };

        const extension = extensionByType[selectedAvatar.type];

        if (!extension) {
          throw new Error("Unsupported profile picture format.");
        }

        const filePath = `${user.id}/avatar.${extension}`;

        const { error: uploadError } = await client.storage
          .from("avatars")
          .upload(filePath, selectedAvatar, {
            upsert: true,
            contentType: selectedAvatar.type,
            cacheControl: "3600"
          });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = client.storage
          .from("avatars")
          .getPublicUrl(filePath);

        currentAvatarUrl = publicUrlData.publicUrl;
      }

      const profile = {
        id: user.id,
        username,
        display_name: displayNameInput.value.trim(),
        bio: bioInput.value.trim(),
        favorite_car: favoriteCarInput.value.trim(),
        avatar_url: currentAvatarUrl || null,
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

      selectedAvatar = null;
      if (avatarInput) avatarInput.value = "";

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
