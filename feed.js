
(() => {
  "use strict";

  // =========================================================
  // 1. Supabase and HTML elements
  // =========================================================
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
        "Supabase did not load. Check supabase-client.js and the script order.";
    }
    console.error("GARAGE Feed: window.garageSupabase is unavailable.");
    return;
  }

  if (
    !form ||
    !captionInput ||
    !imageInput ||
    !publishButton ||
    !feedList
  ) {
    console.error("GARAGE Feed: Required HTML elements were not found.");
    return;
  }

  // =========================================================
  // 2. Configuration
  // =========================================================
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const MAX_VIDEO_SIZE = 5 * 1024 * 1024;
  const MAX_CAPTION_LENGTH = 2000;
  const STORAGE_BUCKET = "post-images";

  const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  const ALLOWED_VIDEO_TYPES = [
    "video/mp4",
    "video/webm",
    "video/quicktime"
  ];

  const EXTENSION_BY_TYPE = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov"
  };

  let currentUser = null;
  let isPublishing = false;
  let isLoading = false;
  let loadRequestNumber = 0;

  // =========================================================
  // 3. Status and error handling
  // =========================================================
  function showStatus(message, isError = false) {
    if (!status) return;

    status.textContent = message;
    status.style.color = isError ? "#ff7777" : "";
  }

  function explainError(error) {
    const message = error?.message || "An unexpected error occurred.";

    if (/row-level security|permission denied/i.test(message)) {
      return (
        "Supabase denied this action. Check your posts table policies " +
        "and the post-images storage bucket policies."
      );
    }

    if (/duplicate key/i.test(message)) {
      return "This post conflicts with an existing database record.";
    }

    if (/failed to fetch|network/i.test(message)) {
      return "Network error. Check your internet connection and try again.";
    }

    return message;
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

    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  // =========================================================
  // 4. File validation
  // =========================================================
  function validateMediaFile(file) {
    if (!file) return null;

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      throw new Error(
        "Unsupported file. Choose JPG, PNG, WebP, GIF" +
        " or an enabled video format."
      );
    }

    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

    if (file.size > maxSize) {
      throw new Error(
        `File is too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)} MB.`
      );
    }

    if (file.size === 0) {
      throw new Error("The selected file is empty.");
    }

    return {
      extension: EXTENSION_BY_TYPE[file.type],
      contentType: file.type,
      isVideo
    };
  }

  // =========================================================
  // 5. Upload media to Supabase Storage
  // =========================================================
  async function uploadMedia(file) {
    if (!file) return null;

    const details = validateMediaFile(file);
    const path =
      `${currentUser.id}/${crypto.randomUUID()}.${details.extension}`;

    const { error } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, {
        upsert: false,
        contentType: details.contentType
      });

    if (error) throw error;

    const { data } = client.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(path);

    if (!data?.publicUrl) {
      throw new Error("The uploaded file URL could not be created.");
    }

    return {
      url: data.publicUrl,
      path
    };
  }

  async function removeUploadedMedia(path) {
    if (!path) return;

    try {
      const { error } = await client.storage
        .from(STORAGE_BUCKET)
        .remove([path]);

      if (error) {
        console.error("Could not clean up uploaded media:", error);
      }
    } catch (error) {
      console.error("Media cleanup failed:", error);
    }
  }

  // =========================================================
  // 6. Render personal posts
  // =========================================================
  function renderPosts(posts) {
    feedList.replaceChildren();

    if (!posts.length) {
      const empty = document.createElement("p");
      empty.className = "feed-empty";
      empty.textContent =
        "You have no personal posts yet. Create one above.";

      feedList.appendChild(empty);
      return;
    }

    posts.forEach((post) => {
      const article = document.createElement("article");
      article.className = "feed-post";
      article.dataset.postId = post.id;

      const header = document.createElement("div");
      header.className = "feed-post-header";

      const author = document.createElement("strong");
      author.className = "feed-post-author";
      author.textContent = "My personal post";

      const time = document.createElement("time");
      time.className = "feed-post-date";

      if (post.created_at) {
        time.dateTime = post.created_at;
        time.textContent = formatDate(post.created_at);
      }

      header.append(author, time);
      article.appendChild(header);

      if (post.caption) {
        const caption = document.createElement("p");
        caption.className = "feed-post-caption";
        caption.textContent = post.caption;
        article.appendChild(caption);
      }

      if (post.image_url) {
        const isVideo = /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(
          post.image_url
        );

        if (isVideo) {
          const video = document.createElement("video");
          video.className = "feed-post-image";
          video.controls = true;
          video.preload = "metadata";
          video.src = post.image_url;
          video.setAttribute("aria-label", "Post video");
          article.appendChild(video);
        } else {
          const image = document.createElement("img");
          image.className = "feed-post-image";
          image.loading = "lazy";
          image.src = post.image_url;
          image.alt = "Photo attached to post";
          article.appendChild(image);
        }
      }

      feedList.appendChild(article);
    });
  }

  // =========================================================
  // 7. Load the signed-in user's personal posts
  // =========================================================
  async function loadPersonalPosts() {
    if (!currentUser) {
      feedList.replaceChildren();

      const empty = document.createElement("p");
      empty.className = "feed-empty";
      empty.textContent = "Please sign in to view your personal posts.";

      feedList.appendChild(empty);
      return;
    }

    if (isLoading) return;

    isLoading = true;
    const requestNumber = ++loadRequestNumber;

    showStatus("Loading your personal posts...");

    try {
      const { data, error } = await client
        .from("posts")
        .select("id, user_id, caption, image_url, created_at, is_community")
        .eq("user_id", currentUser.id)
        .eq("is_community", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (requestNumber !== loadRequestNumber) return;

      renderPosts(data || []);
      showStatus("");
    } catch (error) {
      console.error("GARAGE Feed loading failed:", error);

      if (requestNumber === loadRequestNumber) {
        showStatus(
          "Could not load your posts: " + explainError(error),
          true
        );
      }
    } finally {
      isLoading = false;
    }
  }

  // =========================================================
  // 8. Publish a personal post
  // =========================================================
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isPublishing) return;

    const caption = captionInput.value.trim();
    const file = imageInput.files?.[0] || null;

    if (!caption && !file) {
      showStatus("Write something or choose a photo.", true);
      return;
    }

    if (caption.length > MAX_CAPTION_LENGTH) {
      showStatus("Your post must be 2,000 characters or fewer.", true);
      return;
    }

    try {
      if (file) validateMediaFile(file);
    } catch (error) {
      showStatus(error.message, true);
      return;
    }

    isPublishing = true;
    publishButton.disabled = true;
    showStatus("Publishing your personal post...");

    let uploadedPath = null;

    try {
      const { data: userData, error: userError } =
        await client.auth.getUser();

      if (userError) throw userError;

      currentUser = userData.user;

      if (!currentUser) {
        throw new Error("Please sign in before creating a post.");
      }

      let uploadedUrl = null;

      if (file) {
        const uploaded = await uploadMedia(file);
        uploadedUrl = uploaded.url;
        uploadedPath = uploaded.path;
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

      // The database insert succeeded, so keep the uploaded file.
      uploadedPath = null;

      form.reset();
      showStatus("Your personal post was published successfully.");

      await loadPersonalPosts();
    } catch (error) {
      console.error("GARAGE Feed publishing failed:", error);

      if (uploadedPath) {
        await removeUploadedMedia(uploadedPath);
      }

      showStatus(
        "Could not publish your post: " + explainError(error),
        true
      );
    } finally {
      isPublishing = false;
      publishButton.disabled = false;
    }
  });

  // =========================================================
  // 9. Authentication and initialization
  // =========================================================
  async function initialize() {
    try {
      const { data, error } = await client.auth.getUser();

      if (error) throw error;

      currentUser = data.user;

      if (!currentUser) {
        publishButton.disabled = true;
        showStatus(
          "Please sign in to view and create your personal posts.",
          true
        );

        feedList.replaceChildren();

        const empty = document.createElement("p");
        empty.className = "feed-empty";
        empty.textContent = "Sign in to see your personal feed.";
        feedList.appendChild(empty);
        return;
      }

      publishButton.disabled = false;
      await loadPersonalPosts();
    } catch (error) {
      console.error("GARAGE Feed initialization failed:", error);
      publishButton.disabled = true;
      showStatus(
        "Could not initialize your feed: " + explainError(error),
        true
      );
    }
  }

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;

    if (currentUser) {
      publishButton.disabled = false;
      loadPersonalPosts();
    } else {
      currentUser = null;
      publishButton.disabled = true;
      loadRequestNumber++;
      feedList.replaceChildren();

      const empty = document.createElement("p");
      empty.className = "feed-empty";
      empty.textContent = "Sign in to see your personal feed.";
      feedList.appendChild(empty);

      showStatus("Please sign in to view and create personal posts.");
    }
  });

  initialize();
})();
