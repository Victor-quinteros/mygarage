
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

  // Existing profile elements
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

  // MY FEED elements
  const postForm = document.getElementById("post-form");
  const postCaption = document.getElementById("post-caption");
  const postImage = document.getElementById("post-image");
  const publishButton = document.getElementById("publish-post-button");
  const feedStatus = document.getElementById("feed-status");
  const feedList = document.getElementById("feed-list");

  const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
  const MAX_POST_IMAGE_SIZE = 5 * 1024 * 1024;

  const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  let currentAvatarUrl = "";
  let selectedAvatar = null;
  let previewObjectUrl = null;
  let currentUser = null;

  function setAvatarPreview(url) {
    if (avatarPreview && url) {
      avatarPreview.src = url;
    }
  }

  // Profile picture selection
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

  async function getLoggedInUser() {
    const { data, error } = await client.auth.getUser();

    if (error) throw error;
    if (!data.user) {
      throw new Error("Please log in to use GARAGE.");
    }

    return data.user;
  }

  // Load the existing profile
  async function loadProfile() {
    status.textContent = "Checking your login...";

    try {
      const {
        data: { user },
        error: authError
      } = await client.auth.getUser();

      if (authError || !user) {
        form.hidden = true;

        if (postForm) postForm.hidden = true;

        status.textContent =
          "Please log in to GARAGE before editing your profile.";

        if (feedStatus) {
          feedStatus.textContent =
            "Please log in to publish posts.";
        }

        return;
      }

      currentUser = user;

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

      await loadPosts(user);
    } catch (error) {
      console.error("Profile loading error:", error);
      status.textContent =
        "Could not load your profile: " + error.message;

      if (feedStatus) {
        feedStatus.textContent =
          "Could not initialize your feed: " + error.message;
      }
    }
  }

  // Save the existing profile and profile picture
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
      const user = await getLoggedInUser();
      currentUser = user;

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

  // Format a post's date
  function formatPostDate(dateString) {
    const date = new Date(dateString);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  // Display posts safely using DOM elements
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

      avatar.addEventListener("error", () => {
        avatar.remove();
      }, { once: true });

      header.appendChild(avatar);
    }

    const authorInfo = document.createElement("div");

    const author = document.createElement("p");
    author.className = "feed-post-author";
    author.textContent =
      profile?.display_name ||
      profile?.username ||
      "GARAGE Member";

    const username = document.createElement("p");
    username.className = "feed-post-date";
    username.textContent = profile?.username
      ? "@" + profile.username
      : "";

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

  // Load the signed-in user's posts
  async function loadPosts(user) {
    if (!postForm || !feedList || !feedStatus) return;

    feedStatus.textContent = "Loading your feed...";
    feedList.replaceChildren();

    const { data: posts, error } = await client
      .from("posts")
      .select("id, user_id, caption, image_url, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Feed loading error:", error);
      feedStatus.textContent =
        "Could not load posts. Check the Supabase posts table and access policies.";
      return;
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Could not load feed profile:", profileError);
    }

    if (!posts || posts.length === 0) {
      const empty = document.createElement("p");
      empty.className = "feed-empty";
      empty.textContent =
        "No posts yet. Share your first build or update!";
      feedList.appendChild(empty);
    } else {
      posts.forEach((post) => renderPost(post, profile));
    }

    feedStatus.textContent =
      posts.length + (posts.length === 1 ? " post published." : " posts published.");
  }

  // Publish a new post
  if (postForm) {
    postForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const caption = postCaption.value.trim();
      const imageFile = postImage.files?.[0] || null;

      if (!caption && !imageFile) {
        feedStatus.textContent =
          "Write a caption or choose a photo before posting.";
        return;
      }

      if (caption.length > 2000) {
        feedStatus.textContent =
          "Your caption must be 2,000 characters or fewer.";
        return;
      }

      if (imageFile) {
        if (!ALLOWED_TYPES.includes(imageFile.type)) {
          feedStatus.textContent =
            "Choose a JPG, PNG, WebP, or GIF image.";
          return;
        }

        if (imageFile.size > MAX_POST_IMAGE_SIZE) {
          feedStatus.textContent =
            "Your post image must be 5 MB or smaller.";
          return;
        }
      }

      publishButton.disabled = true;
      feedStatus.textContent = "Publishing your post...";

      try {
        const user = await getLoggedInUser();
        currentUser = user;

        let imageUrl = null;

        if (imageFile) {
          const extensionByType = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif"
          };

          const extension = extensionByType[imageFile.type];
          const filePath =
            `${user.id}/${crypto.randomUUID()}.${extension}`;

          const { error: uploadError } = await client.storage
            .from("post-images")
            .upload(filePath, imageFile, {
              upsert: false,
              contentType: imageFile.type,
              cacheControl: "3600"
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = client.storage
            .from("post-images")
            .getPublicUrl(filePath);

          imageUrl = publicUrlData.publicUrl;
        }

        const { error: insertError } = await client
          .from("posts")
          .insert({
            user_id: user.id,
            caption,
            image_url: imageUrl
          });

        if (insertError) throw insertError;

        postForm.reset();
        feedStatus.textContent = "Post published!";
        await loadPosts(user);
      } catch (error) {
        console.error("Post publishing error:", error);
        feedStatus.textContent =
          "Could not publish your post: " + error.message;
      } finally {
        publishButton.disabled = false;
      }
    });
  }

  loadProfile();
})();
