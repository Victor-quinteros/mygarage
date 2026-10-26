
/* =========================================================
   1. GARAGE PROFILE AND MY FEED
   Uses the shared Supabase client from supabase-client.js.
========================================================= */

(() => {
  "use strict";

  const client = window.garageSupabase;

  const form = document.getElementById("profile-form");
  const status = document.getElementById("profile-status");

  const usernameInput = document.getElementById("username");
  const displayNameInput = document.getElementById("display-name");
  const bioInput = document.getElementById("bio");
  const favoriteCarInput = document.getElementById("favorite-car");
  const avatarInput = document.getElementById("avatar-file");
  const avatarPreview = document.getElementById("avatar-preview");
  const saveButton = form?.querySelector('button[type="submit"]');

  const postForm = document.getElementById("post-form");
  const postCaption = document.getElementById("post-caption");
  const postImage = document.getElementById("post-image");
  const publishButton = document.getElementById("publish-post-button");
  const feedStatus = document.getElementById("feed-status");
  const feedList = document.getElementById("feed-list");

  const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
  const MAX_POST_IMAGE_SIZE = 5 * 1024 * 1024;
  const MAX_CAPTION_LENGTH = 2000;

  const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  let currentUser = null;
  let currentAvatarUrl = "";
  let selectedAvatar = null;
  let previewObjectUrl = null;
  let savingProfile = false;
  let publishingPost = false;

  /* =========================================================
     2. HELPERS AND ERROR MESSAGES
  ========================================================= */

  function setStatus(element, text, isError = false) {
    if (!element) return;

    element.textContent = text;
    element.setAttribute("role", isError ? "alert" : "status");
    element.classList.toggle("error", isError);
  }

  function explainError(error) {
    const text = error?.message || "An unexpected error occurred.";

    if (/row-level security|permission denied|not allowed/i.test(text)) {
      return "Supabase denied the operation. Check the table or storage bucket permissions.";
    }

    if (/duplicate key|already exists|unique constraint/i.test(text)) {
      return "That username is already taken. Please choose another.";
    }

    if (/failed to fetch|network/i.test(text)) {
      return "Could not connect to Supabase. Check your internet connection.";
    }

    return text;
  }

  function setAvatarPreview(url) {
    if (!avatarPreview) return;

    if (url) {
      avatarPreview.src = url;
      avatarPreview.hidden = false;
    } else {
      avatarPreview.removeAttribute("src");
      avatarPreview.hidden = true;
    }
  }

  function clearAvatarPreviewUrl() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
  }

  function setBusy(button, busy, normalText, busyText) {
    if (!button) return;

    button.disabled = busy;
    button.textContent = busy ? busyText : normalText;
  }

  async function getLoggedInUser() {
    if (!client?.auth) {
      throw new Error("Supabase is not initialized. Check supabase-client.js.");
    }

    const { data, error } = await client.auth.getUser();

    if (error) throw error;

    if (!data.user) {
      throw new Error("Please log in to use this feature.");
    }

    return data.user;
  }

  async function uploadPublicImage(bucket, filePath, file) {
    const { error } = await client.storage
      .from(bucket)
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600"
      });

    if (error) throw error;

    const { data } = client.storage.from(bucket).getPublicUrl(filePath);

    if (!data?.publicUrl) {
      throw new Error("Could not create a public URL for the uploaded image.");
    }

    return data.publicUrl;
  }

  function getExtension(file) {
    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif"
    };

    return extensions[file.type] || null;
  }

  /* =========================================================
     3. INITIAL VALIDATION
  ========================================================= */

  if (!client?.auth || !client?.from || !client?.storage) {
    setStatus(
      status,
      "Supabase did not load. Check the script order in your HTML.",
      true
    );
    console.error("GARAGE: window.garageSupabase is unavailable.");
    return;
  }

  if (!form || !status) {
    console.error("GARAGE: Profile form or profile-status element is missing.");
    return;
  }

  if (
    !usernameInput ||
    !displayNameInput ||
    !bioInput ||
    !favoriteCarInput
  ) {
    setStatus(
      status,
      "The profile form is missing a required input. Check its HTML IDs.",
      true
    );
    console.error("GARAGE: One or more profile fields are missing.");
    return;
  }

  /* =========================================================
     4. AVATAR SELECTION AND PREVIEW
  ========================================================= */

  if (avatarInput) {
    avatarInput.addEventListener("change", () => {
      const file = avatarInput.files?.[0] || null;
      selectedAvatar = null;

      if (!file) {
        setAvatarPreview(currentAvatarUrl);
        return;
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        avatarInput.value = "";
        setAvatarPreview(currentAvatarUrl);
        setStatus(status, "Choose a JPG, PNG, WebP, or GIF image.", true);
        return;
      }

      if (file.size > MAX_AVATAR_SIZE) {
        avatarInput.value = "";
        setAvatarPreview(currentAvatarUrl);
        setStatus(status, "Your profile picture must be 2 MB or smaller.", true);
        return;
      }

      selectedAvatar = file;
      clearAvatarPreviewUrl();

      previewObjectUrl = URL.createObjectURL(file);
      setAvatarPreview(previewObjectUrl);

      setStatus(status, "Picture selected. Save your profile to upload it.");
    });
  }

  /* =========================================================
     5. LOAD PROFILE
  ========================================================= */

  async function loadProfile() {
    setStatus(status, "Loading your profile...");

    try {
      const { data: sessionData, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) throw sessionError;

      const user = sessionData.session?.user || null;

      if (!user) {
        currentUser = null;
        form.hidden = true;

        if (postForm) postForm.hidden = true;

        setStatus(status, "Please log in before editing your profile.");

        setStatus(
          feedStatus,
          "Please log in to publish and view your posts."
        );

        return;
      }

      currentUser = user;
      form.hidden = false;

      if (postForm) postForm.hidden = false;

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("id, username, display_name, bio, favorite_car, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profile) {
        usernameInput.value = profile.username || "";
        displayNameInput.value = profile.display_name || "";
        bioInput.value = profile.bio || "";
        favoriteCarInput.value = profile.favorite_car || "";
        currentAvatarUrl = profile.avatar_url || "";

        setAvatarPreview(currentAvatarUrl);
      } else {
        usernameInput.value = user.user_metadata?.username || "";
        displayNameInput.value = user.user_metadata?.display_name || "";
        bioInput.value = "";
        favoriteCarInput.value = "";
        currentAvatarUrl = "";

        setAvatarPreview("");
      }

      setStatus(
        status,
        profile
          ? "Your profile is loaded."
          : "Welcome! Complete your profile and save it."
      );

      await loadPosts(user);
    } catch (error) {
      console.error("GARAGE: Profile loading failed:", error);
      setStatus(status, "Could not load your profile: " + explainError(error), true);
      setStatus(feedStatus, "Could not load your feed: " + explainError(error), true);
    }
  }

  /* =========================================================
     6. SAVE PROFILE
     Uses the authenticated user's ID as the profile ID.
  ========================================================= */

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (savingProfile) return;

    const username = usernameInput.value.trim().toLowerCase();
    const displayName = displayNameInput.value.trim();
    const bio = bioInput.value.trim();
    const favoriteCar = favoriteCarInput.value.trim();

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setStatus(
        status,
        "Username must be 3–24 characters using lowercase letters, numbers, or underscores.",
        true
      );
      usernameInput.focus();
      return;
    }

    if (displayName.length > 80) {
      setStatus(status, "Display name must be 80 characters or fewer.", true);
      return;
    }

    if (bio.length > 500) {
      setStatus(status, "Bio must be 500 characters or fewer.", true);
      return;
    }

    if (favoriteCar.length > 100) {
      setStatus(status, "Favorite car must be 100 characters or fewer.", true);
      return;
    }

    savingProfile = true;
    setBusy(saveButton, true, "Save profile", "Saving...");

    let uploadedAvatarPath = null;

    try {
      const user = await getLoggedInUser();
      currentUser = user;

      if (selectedAvatar) {
        const extension = getExtension(selectedAvatar);

        if (!extension) {
          throw new Error("Unsupported profile picture format.");
        }

        uploadedAvatarPath = `${user.id}/avatar.${extension}`;

        currentAvatarUrl = await uploadPublicImage(
          "avatars",
          uploadedAvatarPath,
          selectedAvatar
        );
      }

      const profile = {
        id: user.id,
        username,
        display_name: displayName || null,
        bio: bio || null,
        favorite_car: favoriteCar || null,
        avatar_url: currentAvatarUrl || null,
        updated_at: new Date().toISOString()
      };

      const { error } = await client
        .from("profiles")
        .upsert(profile, { onConflict: "id" });

      if (error) {
        if (error.code === "23505") {
          throw new Error("That username is already taken. Please choose another.");
        }

        throw error;
      }

      selectedAvatar = null;
      if (avatarInput) avatarInput.value = "";

      clearAvatarPreviewUrl();
      setAvatarPreview(currentAvatarUrl);

      setStatus(status, "Profile saved successfully!");
    } catch (error) {
      console.error("GARAGE: Profile saving failed:", error);
      setStatus(status, "Could not save profile: " + explainError(error), true);
    } finally {
      savingProfile = false;
      setBusy(saveButton, false, "Save profile", "Saving...");
    }
  });

  /* =========================================================
     7. POST DATE AND POST RENDERING
  ========================================================= */

  function formatPostDate(dateString) {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) return "Date unavailable";

    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function renderPost(post, profile) {
    const article = document.createElement("article");
    article.className = "feed-post";

    const header = document.createElement("div");
    header.className = "feed-post-header";

    if (profile?.avatar_url) {
      const avatar = document.createElement("img");
      avatar.className = "feed-post-avatar";
      avatar.src = profile.avatar_url;
      avatar.alt = "Your profile picture";
      avatar.loading = "lazy";

      avatar.addEventListener("error", () => avatar.remove(), { once: true });
      header.appendChild(avatar);
    }

    const authorInfo = document.createElement("div");

    const author = document.createElement("p");
    author.className = "feed-post-author";
    author.textContent =
      profile?.display_name || profile?.username || "GARAGE Member";

    const username = document.createElement("p");
    username.className = "feed-post-date";
    username.textContent = profile?.username ? "@" + profile.username : "";

    authorInfo.append(author, username);
    header.appendChild(authorInfo);
    article.appendChild(header);

    const date = document.createElement("p");
    date.className = "feed-post-date";
    date.textContent = formatPostDate(post.created_at);
    article.appendChild(date);

    if (post.caption) {
      const caption = document.createElement("p");
      caption.className = "feed-post-caption";
      caption.textContent = post.caption;
      article.appendChild(caption);
    }

    if (post.image_url) {
      const image = document.createElement("img");
      image.className = "feed-post-image";
      image.src = post.image_url;
      image.alt = "Photo attached to your post";
      image.loading = "lazy";

      image.addEventListener("error", () => {
        image.alt = "Post image could not be loaded";
      }, { once: true });

      article.appendChild(image);
    }

    feedList.appendChild(article);
  }

  /* =========================================================
     8. LOAD MY POSTS
  ========================================================= */

  async function loadPosts(user) {
    if (!postForm || !feedList || !feedStatus) return;

    setStatus(feedStatus, "Loading your posts...");
    feedList.replaceChildren();

    try {
      const { data: posts, error: postsError } = await client
        .from("posts")
        .select("id, user_id, caption, image_url, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (postsError) throw postsError;

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.warn("GARAGE: Could not load the post author profile:", profileError);
      }

      if (!posts || posts.length === 0) {
        const empty = document.createElement("p");
        empty.className = "feed-empty";
        empty.textContent = "No posts yet. Share your first build or update!";
        feedList.appendChild(empty);
      } else {
        posts.forEach((post) => renderPost(post, profile));
      }

      setStatus(
        feedStatus,
        `${posts.length} ${posts.length === 1 ? "post" : "posts"} found.`
      );
    } catch (error) {
      console.error("GARAGE: Feed loading failed:", error);
      setStatus(feedStatus, "Could not load posts: " + explainError(error), true);
    }
  }

  /* =========================================================
     9. PUBLISH A POST
     Uploads an optional image and then creates the post row.
  ========================================================= */

  if (postForm && postCaption && postImage && feedStatus && publishButton) {
    postForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (publishingPost) return;

      const caption = postCaption.value.trim();
      const imageFile = postImage.files?.[0] || null;

      if (!caption && !imageFile) {
        setStatus(feedStatus, "Write a caption or choose a photo first.", true);
        return;
      }

      if (caption.length > MAX_CAPTION_LENGTH) {
        setStatus(feedStatus, "Caption must be 2,000 characters or fewer.", true);
        return;
      }

      if (imageFile && !ALLOWED_TYPES.includes(imageFile.type)) {
        setStatus(feedStatus, "Choose a JPG, PNG, WebP, or GIF image.", true);
        return;
      }

      if (imageFile && imageFile.size > MAX_POST_IMAGE_SIZE) {
        setStatus(feedStatus, "Post images must be 5 MB or smaller.", true);
        return;
      }

      publishingPost = true;
      setBusy(publishButton, true, "Publish post", "Publishing...");

      let uploadedPath = null;

      try {
        const user = await getLoggedInUser();
        currentUser = user;

        let imageUrl = null;

        if (imageFile) {
          const extension = getExtension(imageFile);

          if (!extension) {
            throw new Error("Unsupported image format.");
          }

          const uniqueId = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

          uploadedPath = `${user.id}/${uniqueId}.${extension}`;

          imageUrl = await uploadPublicImage(
            "post-images",
            uploadedPath,
            imageFile
          );
        }

        const { error: insertError } = await client
          .from("posts")
          .insert({
            user_id: user.id,
            caption: caption || null,
            image_url: imageUrl
          });

        if (insertError) throw insertError;

        postForm.reset();
        setStatus(feedStatus, "Post published successfully!");

        await loadPosts(user);
        setStatus(feedStatus, "Post published successfully!");
      } catch (error) {
        console.error("GARAGE: Publishing post failed:", error);

        // Clean up an uploaded image if the post itself could not be saved.
        if (uploadedPath) {
          const { error: cleanupError } = await client.storage
            .from("post-images")
            .remove([uploadedPath]);

          if (cleanupError) {
            console.warn("GARAGE: Could not clean up uploaded image:", cleanupError);
          }
        }

        setStatus(feedStatus, "Could not publish post: " + explainError(error), true);
      } finally {
        publishingPost = false;
        setBusy(publishButton, false, "Publish post", "Publishing...");
      }
    });
  }

  /* =========================================================
     10. STARTUP
  ========================================================= */

  loadProfile();
})();
