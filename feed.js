
(() => {
  "use strict";

  const client = window.garageSupabase;

  const form = document.getElementById("post-form");
  const captionInput = document.getElementById("post-caption");
  const imageInput = document.getElementById("post-image");
  const publishButton = document.getElementById("publish-post-button");
  const status = document.getElementById("feed-status");
  const feedList = document.getElementById("feed-list");

  if (!client) {
    if (status) {
      status.textContent =
        "Supabase did not load. Check supabase-client.js and index.html.";
    }
    return;
  }

  if (!form || !captionInput || !publishButton || !feedList) {
    console.error("My Feed: Required HTML elements were not found.");
    return;
  }

  let currentUser = null;
  let isPublishing = false;

  function showStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? "#ff7777" : "";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  function getFileExtension(file) {
    const nameExtension = file.name.includes(".")
      ? file.name.split(".").pop().toLowerCase()
      : "";

    const allowed = [
      "jpg", "jpeg", "png", "gif", "webp",
      "mp4", "webm", "mov"
    ];

    if (allowed.includes(nameExtension)) return nameExtension;

    const mimeMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov"
    };

    return mimeMap[file.type] || "";
  }

  async function uploadMedia(file) {
    if (!file) return null;

    const maxSize = 8 * 1024 * 1024;

    if (file.size > maxSize) {
      throw new Error("Choose a file smaller than 8 MB.");
    }

    const extension = getFileExtension(file);

    if (!extension) {
      throw new Error(
        "Unsupported file. Use JPG, PNG, GIF, WebP, MP4, WebM, or MOV."
      );
    }

    const path =
      `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await client.storage
      .from("post-images")
      .upload(path, file, {
        upsert: false,
        contentType: file.type || undefined
      });

    if (uploadError) throw uploadError;

    const { data } = client.storage
      .from("post-images")
      .getPublicUrl(path);

    return data.publicUrl;
  }

  function renderPosts(posts) {
    if (!posts.length) {
      feedList.innerHTML =
        '<p class="feed-empty">You have no personal posts yet. Create one above.</p>';
      return;
    }

    feedList.innerHTML = posts.map((post) => {
      const caption = escapeHtml(post.caption);
      const date = escapeHtml(formatDate(post.created_at));
      const mediaUrl = post.image_url
        ? escapeHtml(post.image_url)
        : "";

      let media = "";

      if (mediaUrl) {
        const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(mediaUrl);

        media = isVideo
          ? `<video class="post-media" controls preload="metadata"
               src="${mediaUrl}"></video>`
          : `<img class="post-media" loading="lazy"
               src="${mediaUrl}" alt="Post media">`;
      }

      return `
        <article class="post" data-post-id="${escapeHtml(post.id)}">
          <div class="post-header">
            <strong>My personal post</strong>
            <time>${date}</time>
          </div>
          ${caption ? `<p>${caption}</p>` : ""}
          ${media}
        </article>
      `;
    }).join("");
  }

  async function loadPersonalPosts() {
    if (!currentUser) return;

    showStatus("Loading your personal posts…");

    const { data, error } = await client
      .from("posts")
      .select("id, user_id, caption, image_url, created_at, is_community")
      .eq("user_id", currentUser.id)
      .eq("is_community", false)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("My Feed load error:", error);
      showStatus(
        "Could not load your posts: " + error.message,
        true
      );
      return;
    }

    renderPosts(data || []);
    showStatus("");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isPublishing) return;

    const caption = captionInput.value.trim();
    const file = imageInput?.files?.[0] || null;

    if (!caption && !file) {
      showStatus("Write something or choose a photo/video.", true);
      return;
    }

    isPublishing = true;
    publishButton.disabled = true;
    showStatus("Publishing your personal post…");

    let uploadedUrl = null;

    try {
      const { data: userData, error: userError } =
        await client.auth.getUser();

      if (userError) throw userError;

      currentUser = userData.user;

      if (!currentUser) {
        throw new Error("Please sign in before creating a post.");
      }

      if (file) {
        uploadedUrl = await uploadMedia(file);
      }

      const { error: insertError } = await client
        .from("posts")
        .insert({
          user_id: currentUser.id,
          caption,
          image_url: uploadedUrl,
          is_community: false
        });

      if (insertError) throw insertError;

      form.reset();
      showStatus("Your personal post was saved.");
      await loadPersonalPosts();
    } catch (error) {
      console.error("My Feed publish error:", error);
      showStatus(error.message || "Could not publish your post.", true);
    } finally {
      isPublishing = false;
      publishButton.disabled = false;
    }
  });

  async function initialize() {
    const { data, error } = await client.auth.getUser();

    if (error || !data.user) {
      showStatus("Please sign in to view and create your personal posts.", true);
      publishButton.disabled = true;
      return;
    }

    currentUser = data.user;
    await loadPersonalPosts();
  }

  initialize();
})();
