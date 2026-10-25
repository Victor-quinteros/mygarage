
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

  const form = document.getElementById("post-form");
  const captionInput = document.getElementById("post-caption");
  const imageInput = document.getElementById("post-image");
  const publishButton = document.getElementById("publish-post-button");
  const status = document.getElementById("feed-status");
  const feedList = document.getElementById("feed-list");

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  async function getUser() {
    const { data, error } = await client.auth.getUser();

    if (error) throw error;

    if (!data.user) {
      throw new Error("Please log in before using My Feed.");
    }

    return data.user;
  }

  function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

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
      avatar.alt = "Profile picture";
      avatar.loading = "lazy";

      avatar.addEventListener("error", () => avatar.remove(), {
        once: true
      });

      header.appendChild(avatar);
    }

    const author = document.createElement("p");
    author.className = "feed-post-author";
    author.textContent =
      profile?.display_name || profile?.username || "GARAGE Member";

    header.appendChild(author);
    article.appendChild(header);

    const date = document.createElement("p");
    date.className = "feed-post-date";
    date.textContent = formatDate(post.created_at);
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
      image.alt = "Photo attached to post";
      image.loading = "lazy";

      image.addEventListener("error", () => {
        image.alt = "Post image could not be loaded";
      }, { once: true });

      article.appendChild(image);
    }

    feedList.appendChild(article);
  }

  async function loadPosts(user) {
    status.textContent = "Loading your posts...";
    feedList.replaceChildren();

    const { data: posts, error } = await client
      .from("posts")
      .select("id, user_id, caption, image_url, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!posts || posts.length === 0) {
      const empty = document.createElement("p");
      empty.className = "feed-empty";
      empty.textContent =
        "No posts yet. Share your first build or update!";
      feedList.appendChild(empty);
    } else {
      posts.forEach((post) => renderPost(post, profile));
    }

    status.textContent =
      posts.length + (posts.length === 1
        ? " post published."
        : " posts published.");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const caption = captionInput.value.trim();
    const imageFile = imageInput.files?.[0] || null;

    if (!caption && !imageFile) {
      status.textContent = "Write a caption or choose a photo first.";
      return;
    }

    if (imageFile && !ALLOWED_TYPES.includes(imageFile.type)) {
      status.textContent = "Choose a JPG, PNG, WebP, or GIF image.";
      return;
    }

    if (imageFile && imageFile.size > MAX_IMAGE_SIZE) {
      status.textContent = "Your photo must be 5 MB or smaller.";
      return;
    }

    publishButton.disabled = true;
    status.textContent = "Publishing your post...";

    try {
      const user = await getUser();
      let imageUrl = null;

      if (imageFile) {
        const extensions = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif"
        };

        const path =
          `${user.id}/${crypto.randomUUID()}.${extensions[imageFile.type]}`;

        const { error: uploadError } = await client.storage
          .from("post-images")
          .upload(path, imageFile, {
            contentType: imageFile.type,
            cacheControl: "3600",
            upsert: false
          });

        if (uploadError) throw uploadError;

        imageUrl = client.storage
          .from("post-images")
          .getPublicUrl(path).data.publicUrl;
      }

      const { error: insertError } = await client
        .from("posts")
        .insert({
          user_id: user.id,
          caption,
          image_url: imageUrl
        });

      if (insertError) throw insertError;

      form.reset();
      await loadPosts(user);
      status.textContent = "Post published successfully!";
    } catch (error) {
      console.error("My Feed error:", error);
      status.textContent = "Could not publish/load posts: " + error.message;
    } finally {
      publishButton.disabled = false;
    }
  });

  async function init() {
    try {
      const user = await getUser();
      await loadPosts(user);
    } catch (error) {
      console.error("My Feed initialization error:", error);
      status.textContent = error.message;
      feedList.replaceChildren();
    }
  }

  init();
})();
