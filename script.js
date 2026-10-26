
/* =========================================================
   GARAGE — COMPLETE MAIN WEBSITE SCRIPT
   ---------------------------------------------------------
   Features:
   1. Supabase authentication and profiles
   2. Public community feed
   3. Photo and video uploads
   4. Private Supabase messaging
   5. Registered-member selector and direct conversations
   6. Message read status
   7. Search, navigation, and media previews
   8. Demo likes, comments, follows, and marketplace
========================================================= */

"use strict";

/* =========================================================
   1. SHARED STATE
========================================================= */

const $ = (id) => document.getElementById(id);
const client = window.garageSupabase;

const demoMembers = [
  { name: "Alex Builds", car: "Honda Civic", avatar: "A" },
  { name: "Street Garage", car: "Nissan Silvia", avatar: "S" },
  { name: "Turbo Mike", car: "Subaru WRX", avatar: "T" }
];

let listings = [];
let followed = new Set();
let localLikes = new Set();
let localComments = {};

let toastTimer = null;
let communityPosts = [];
let currentUser = null;
let currentProfile = null;

let selectedMedia = null;
let mediaPreviewUrl = "";
let isPublishingPost = false;

let activeConversationId = null;
let messageBusy = false;
let messageLoadNumber = 0;

/* =========================================================
   2. GENERAL HELPERS
========================================================= */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function notify(message) {
  const toast = $("toast");

  if (!toast) {
    console.log("[GARAGE]", message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);

  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function showStatus(message) {
  const feed = $("feed");
  if (!feed) return;

  feed.replaceChildren();

  const paragraph = document.createElement("p");
  paragraph.className = "muted";
  paragraph.textContent = message;
  feed.appendChild(paragraph);
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

function getDisplayName(profile, userId) {
  return (
    profile?.display_name ||
    profile?.username ||
    (userId ? `Member ${String(userId).slice(0, 6)}` : "Garage Member")
  );
}

function getCurrentDisplayName() {
  return getDisplayName(currentProfile, currentUser?.id);
}

function makeInitials(name) {
  return escapeHTML((String(name || "G").trim()[0] || "G").toUpperCase());
}

function setButtonBusy(button, busy, busyText, idleText) {
  if (!button) return;

  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

function getFileExtension(file) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov"
  };

  return extensions[file.type] || "";
}

function isVideoUrl(url) {
  return /\.(mp4|webm|mov)(\?[^#]*)?(#.*)?$/i.test(url || "");
}

function makeUniqueId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* =========================================================
   3. AUTHENTICATION AND PROFILE
========================================================= */

async function loadCurrentUser() {
  currentUser = null;
  currentProfile = null;

  if (!client?.auth) {
    console.error("GARAGE: Supabase client is unavailable.");
    return null;
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    console.error("GARAGE session error:", error.message);
    return null;
  }

  currentUser = data.session?.user || null;

  if (!currentUser) return null;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, username, display_name, bio, favorite_car, avatar_url")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileError) {
    console.error("GARAGE profile error:", profileError.message);
  }

  currentProfile = profile || null;
  return currentUser;
}

function watchAuthenticationChanges() {
  if (!client?.auth) return;

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    currentProfile = null;

    if (!currentUser) {
      renderFeed();

      if ($("messageTo")) {
        loadMessageMembers();
      }

      return;
    }

    const userId = currentUser.id;

    Promise.resolve().then(async () => {
      const { data, error } = await client
        .from("profiles")
        .select("id, username, display_name, bio, favorite_car, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("GARAGE profile refresh error:", error.message);
        return;
      }

      if (currentUser?.id !== userId) return;

      currentProfile = data || null;
      renderFeed();

      if ($("messageTo")) {
        await loadMessageMembers();
      }
    });
  });
}

/* =========================================================
   4. PUBLIC COMMUNITY FEED
========================================================= */

async function loadCommunityPosts() {
  const feed = $("feed");
  if (!feed) return;

  if (!client) {
    showStatus("Supabase is not initialized. Check supabase-client.js.");
    return;
  }

  showStatus("Loading community posts...");

  try {
    const { data, error } = await client
      .from("posts")
      .select("id, user_id, caption, image_url, created_at, is_community")
      .eq("is_community", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const posts = data || [];
    const userIds = [
      ...new Set(posts.map((post) => post.user_id).filter(Boolean))
    ];

    const profilesById = {};

    if (userIds.length) {
      const { data: profiles, error: profileError } = await client
        .from("profiles")
        .select("id, username, display_name, avatar_url, favorite_car")
        .in("id", userIds);

      if (profileError) {
        console.warn("GARAGE author lookup:", profileError.message);
      }

      for (const profile of profiles || []) {
        profilesById[profile.id] = profile;
      }
    }

    communityPosts = posts.map((post) => ({
      ...post,
      authorProfile: profilesById[post.user_id] || null
    }));

    renderFeed();
  } catch (error) {
    console.error("GARAGE community feed error:", error);
    showStatus("Could not load community posts: " + error.message);
  }
}

function renderPostMedia(mediaUrl) {
  if (!mediaUrl) return "";

  const safeUrl = escapeHTML(mediaUrl);

  if (isVideoUrl(mediaUrl)) {
    return `
      <video
        class="post-media"
        controls
        playsinline
        preload="metadata"
        src="${safeUrl}"
      ></video>
    `;
  }

  return `
    <img
      class="post-media"
      loading="lazy"
      src="${safeUrl}"
      alt="Photo shared in the GARAGE community"
    >
  `;
}

function renderFeed() {
  const feed = $("feed");
  if (!feed) return;

  const query = ($("search")?.value || "").trim().toLowerCase();

  const visiblePosts = communityPosts.filter((post) => {
    const profile = post.authorProfile;

    const searchableText = [
      getDisplayName(profile, post.user_id),
      profile?.favorite_car || "",
      profile?.username || "",
      post.caption || ""
    ].join(" ").toLowerCase();

    return searchableText.includes(query);
  });

  if (!visiblePosts.length) {
    showStatus(
      communityPosts.length
        ? "No matching posts. Try another search."
        : "No public community posts yet. Be the first to share a build!"
    );
    return;
  }

  feed.innerHTML = visiblePosts.map((post) => {
    const profile = post.authorProfile;
    const name = getDisplayName(profile, post.user_id);
    const avatarUrl = profile?.avatar_url || "";
    const liked = localLikes.has(post.id);
    const comments = localComments[post.id] || [];

    const avatarMarkup = avatarUrl
      ? `<img class="avatar" src="${escapeHTML(avatarUrl)}"
           alt="${escapeHTML(name)}'s avatar"
           loading="lazy" style="object-fit:cover;">`
      : `<div class="avatar" aria-hidden="true">${makeInitials(name)}</div>`;

    const captionMarkup = post.caption
      ? `<div class="post-copy">${escapeHTML(post.caption).replace(/\n/g, "<br>")}</div>`
      : "";

    const commentsMarkup = comments.map((comment) => `
      <div class="comment">
        <strong>${escapeHTML(comment.author)}:</strong>
        ${escapeHTML(comment.text)}
      </div>
    `).join("");

    return `
      <article class="post" data-post-id="${escapeHTML(post.id)}">
        <div class="post-head">
          ${avatarMarkup}
          <div>
            <strong>${escapeHTML(name)}</strong>
            <p class="muted">
              ${escapeHTML(profile?.favorite_car || "Car enthusiast")}
              ${post.created_at ? ` · ${escapeHTML(formatDate(post.created_at))}` : ""}
            </p>
          </div>
        </div>

        ${captionMarkup}
        ${renderPostMedia(post.image_url)}

        <div class="post-actions">
          <button class="action ${liked ? "liked" : ""}"
            type="button" data-like="${escapeHTML(post.id)}"
            aria-pressed="${liked ? "true" : "false"}">
            ${liked ? "♥ Liked" : "♡ Like"}
          </button>

          <button class="action" type="button"
            data-focus-comment="${escapeHTML(post.id)}">
            Comments · ${comments.length}
          </button>
        </div>

        <div class="comment-list">${commentsMarkup}</div>

        <form class="comment-form" data-comment="${escapeHTML(post.id)}">
          <input name="comment" type="text" maxlength="1000"
            placeholder="Write a comment..." aria-label="Write a comment" required>
          <button class="action" type="submit">Send</button>
        </form>
      </article>
    `;
  }).join("");
}

/* =========================================================
   5. PHOTO AND VIDEO PICKER
========================================================= */

function clearMediaPreview({ clearInput = true } = {}) {
  if (mediaPreviewUrl) {
    URL.revokeObjectURL(mediaPreviewUrl);
  }

  mediaPreviewUrl = "";
  selectedMedia = null;

  if (clearInput && $("postMedia")) {
    $("postMedia").value = "";
  }

  if ($("fileName")) {
    $("fileName").textContent = "No media selected";
  }

  if ($("mediaPreview")) {
    $("mediaPreview").replaceChildren();
  }
}

function setupMediaPicker() {
  const input = $("postMedia");
  if (!input) return;

  input.addEventListener("change", (event) => {
    const file = event.target.files?.[0] || null;

    clearMediaPreview({ clearInput: false });

    if (!file) return;

    const extension = getFileExtension(file);

    if (!extension) {
      input.value = "";
      notify("Use JPG, PNG, WebP, GIF, MP4, WebM, or MOV.");
      return;
    }

    const maxSize = 8 * 1024 * 1024;

    if (file.size > maxSize) {
      input.value = "";
      notify("Choose a photo or video no larger than 8 MB.");
      return;
    }

    selectedMedia = file;
    mediaPreviewUrl = URL.createObjectURL(file);

    if ($("fileName")) {
      $("fileName").textContent = file.name;
    }

    const preview = $("mediaPreview");
    if (!preview) return;

    preview.replaceChildren();

    let element;

    if (file.type.startsWith("video/")) {
      element = document.createElement("video");
      element.controls = true;
      element.playsInline = true;
      element.preload = "metadata";
    } else {
      element = document.createElement("img");
      element.alt = "Selected media preview";
    }

    element.className = "post-media";
    element.src = mediaPreviewUrl;
    preview.appendChild(element);
  });
}

/* =========================================================
   6. PUBLISH PUBLIC COMMUNITY POSTS
========================================================= */

async function publishPost(event) {
  event.preventDefault();

  if (isPublishingPost) return;

  if (!client?.auth) {
    notify("Supabase is not initialized.");
    return;
  }

  const caption = $("postText")?.value.trim() || "";

  if (!caption && !selectedMedia) {
    notify("Write something or choose a photo or video.");
    return;
  }

  const { data: sessionData, error: sessionError } =
    await client.auth.getSession();

  if (sessionError) {
    notify("Could not check your login. Please try again.");
    return;
  }

  const user = sessionData.session?.user || null;

  if (!user) {
    notify("Please sign in before publishing a post.");
    window.location.href = "auth.html";
    return;
  }

  const form = $("postForm");
  const submitButton = form?.querySelector('button[type="submit"]');

  isPublishingPost = true;
  setButtonBusy(submitButton, true, "Publishing...", "Publish post ↗");

  let uploadedPath = null;

  try {
    let mediaUrl = null;

    if (selectedMedia) {
      const extension = getFileExtension(selectedMedia);

      if (!extension) {
        throw new Error("Unsupported media type.");
      }

      uploadedPath = `${user.id}/${makeUniqueId()}.${extension}`;

      const { error: uploadError } = await client.storage
        .from("post-images")
        .upload(uploadedPath, selectedMedia, {
          contentType: selectedMedia.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = client.storage
        .from("post-images")
        .getPublicUrl(uploadedPath);

      mediaUrl = publicData?.publicUrl || null;

      if (!mediaUrl) {
        throw new Error("Could not create the media URL.");
      }
    }

    const { error: insertError } = await client
      .from("posts")
      .insert({
        user_id: user.id,
        caption,
        image_url: mediaUrl,
        is_community: true
      });

    if (insertError) throw insertError;

    if ($("postText")) $("postText").value = "";

    clearMediaPreview();

    await loadCommunityPosts();
    notify("Your post was published!");
  } catch (error) {
    console.error("GARAGE publish error:", error);

    if (uploadedPath) {
      const { error: cleanupError } = await client.storage
        .from("post-images")
        .remove([uploadedPath]);

      if (cleanupError) {
        console.warn("GARAGE upload cleanup error:", cleanupError.message);
      }
    }

    notify("Could not publish: " + (error.message || "Unknown error."));
  } finally {
    isPublishingPost = false;
    setButtonBusy(submitButton, false, "Publishing...", "Publish post ↗");
  }
}

/* =========================================================
   7. DEMO MEMBERS AND FOLLOWS
========================================================= */

function renderMembers() {
  const container = $("members");
  if (!container) return;

  container.innerHTML = demoMembers.map((member) => {
    const isFollowing = followed.has(member.name);

    return `
      <div class="member">
        <div class="avatar" aria-hidden="true">${escapeHTML(member.avatar)}</div>
        <div class="member-name">
          <strong>${escapeHTML(member.name)}</strong>
          <small>${escapeHTML(member.car)}</small>
        </div>
        <button class="action ${isFollowing ? "following" : ""}"
          type="button" data-follow="${escapeHTML(member.name)}"
          aria-pressed="${isFollowing ? "true" : "false"}">
          ${isFollowing ? "Following" : "Follow"}
        </button>
      </div>
    `;
  }).join("");
}

function setupMemberInteractions() {
  const container = $("members");
  if (!container) return;

  container.addEventListener("click", (event) => {
    const button = event.target.closest("[data-follow]");
    if (!button) return;

    const name = button.dataset.follow;

    if (followed.has(name)) {
      followed.delete(name);
    } else {
      followed.add(name);
    }

    renderMembers();
    notify(followed.has(name)
      ? `Following ${name} locally.`
      : `Unfollowed ${name} locally.`);
  });
}

/* =========================================================
   8. DEMO MARKETPLACE
========================================================= */

function renderListings() {
  const container = $("carListings");
  if (!container) return;

  if (!listings.length) {
    container.innerHTML =
      '<p class="muted">No demo listings yet. Add a listing to try this feature.</p>';
    return;
  }

  container.innerHTML = listings.map((car) => `
    <article class="listing-card">
      <div class="feature-icon" aria-hidden="true">🚘</div>
      <h3>${escapeHTML(car.name)}</h3>
      <p class="price">$${Number(car.price).toLocaleString("en-US")}</p>
      <p>${escapeHTML(car.details || "No additional details provided.")}</p>
    </article>
  `).join("");
}

function setupListingForm() {
  const form = $("listingForm");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = $("carName")?.value.trim() || "";
    const price = Number($("carPrice")?.value);
    const details = $("carDetails")?.value.trim() || "";

    if (!name || !Number.isFinite(price) || price < 0) {
      notify("Enter a valid car name and price.");
      return;
    }

    listings.unshift({ name, price, details });
    form.reset();
    renderListings();
    notify("Demo listing added. It is not saved to Supabase.");
  });
}

/* =========================================================
   9. DEMO LIKES AND COMMENTS
========================================================= */

function setupFeedInteractions() {
  const feed = $("feed");
  if (!feed) return;

  feed.addEventListener("click", (event) => {
    const likeButton = event.target.closest("[data-like]");
    const commentButton = event.target.closest("[data-focus-comment]");

    if (likeButton) {
      const postId = likeButton.dataset.like;

      if (localLikes.has(postId)) {
        localLikes.delete(postId);
      } else {
        localLikes.add(postId);
      }

      renderFeed();
      return;
    }

    if (commentButton) {
      const postId = commentButton.dataset.focusComment;
      const form = [...feed.querySelectorAll("[data-comment]")]
        .find((item) => item.dataset.comment === postId);

      form?.querySelector('input[name="comment"]')?.focus();
    }
  });

  feed.addEventListener("submit", (event) => {
    const form = event.target.closest("form[data-comment]");
    if (!form) return;

    event.preventDefault();

    const input = form.elements.namedItem("comment");
    const text = input?.value.trim() || "";
    if (!text) return;

    const postId = form.dataset.comment;

    if (!localComments[postId]) {
      localComments[postId] = [];
    }

    localComments[postId].push({
      author: getCurrentDisplayName(),
      text
    });

    renderFeed();
    notify("Comment added locally. It is not saved to Supabase.");
  });
}

/* =========================================================
   10. SUPABASE PRIVATE MESSAGING
========================================================= */

async function getSignedInUser() {
  if (!client?.auth) return null;

  const { data, error } = await client.auth.getUser();

  if (error) {
    console.error("GARAGE messaging authentication error:", error.message);
    return null;
  }

  return data.user || null;
}

function showConversationMessage(text, isError = false) {
  const conversation = $("conversation");
  if (!conversation) return;

  conversation.replaceChildren();

  const paragraph = document.createElement("p");
  paragraph.className = "muted";
  paragraph.textContent = text;

  if (isError) paragraph.style.color = "#ff7777";

  conversation.appendChild(paragraph);
}

function memberLabel(profile) {
  return (
    profile.display_name ||
    profile.username ||
    `Member ${String(profile.id).slice(0, 6)}`
  );
}

async function loadMessageMembers() {
  const select = $("messageTo");
  if (!select || !client) return;

  const previousValue = select.value;
  select.disabled = true;
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Loading members...";
  select.appendChild(placeholder);

  try {
    const user = await getSignedInUser();

    if (!user) {
      placeholder.textContent = "Sign in to message members";
      showConversationMessage("Please sign in to use private messages.");
      return;
    }

    const { data, error } = await client
      .from("profiles")
      .select("id, username, display_name")
      .neq("id", user.id)
      .order("username", { ascending: true });

    if (error) throw error;

    select.replaceChildren();

    const first = document.createElement("option");
    first.value = "";
    first.textContent = data?.length
      ? "Choose a member..."
      : "No other members found";

    select.appendChild(first);

    for (const profile of data || []) {
      const option = document.createElement("option");
      option.value = profile.id;
      option.textContent = memberLabel(profile);
      select.appendChild(option);
    }

    select.disabled = !(data && data.length);

    const url = new URL(window.location.href);
    const requestedRecipient = url.searchParams.get("to");
    const desiredValue = requestedRecipient || previousValue;

    const validRecipient = [...select.options].some(
      (option) => option.value === desiredValue
    );

    if (validRecipient && desiredValue) {
      select.value = desiredValue;
      await loadConversation();
    } else {
      activeConversationId = null;
      showConversationMessage("Choose a member to open a conversation.");
    }
  } catch (error) {
    console.error("GARAGE member list error:", error);

    select.replaceChildren();

    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Could not load members";
    select.appendChild(option);

    showConversationMessage("Could not load members: " + error.message, true);
  }
}

async function loadConversation() {
  const conversation = $("conversation");
  const recipientSelect = $("messageTo");

  if (!conversation || !recipientSelect) return;

  const user = await getSignedInUser();

  if (!user) {
    showConversationMessage("Please sign in to use private messages.");
    return;
  }

  const recipientId = recipientSelect.value;

  if (!recipientId) {
    activeConversationId = null;
    showConversationMessage("Choose a member to open a conversation.");
    return;
  }

  if (recipientId === user.id) {
    showConversationMessage("You cannot message yourself.", true);
    return;
  }

  activeConversationId = recipientId;
  const thisLoad = ++messageLoadNumber;

  showConversationMessage("Loading conversation...");

  try {
    const { data, error } = await client
      .from("messages")
      .select("id, sender_id, recipient_id, content, created_at, read_at")
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${recipientId}),` +
        `and(sender_id.eq.${recipientId},recipient_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (
      thisLoad !== messageLoadNumber ||
      activeConversationId !== recipientId
    ) {
      return;
    }

    const messages = data || [];
    conversation.replaceChildren();

    if (!messages.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No messages yet. Say hello!";
      conversation.appendChild(empty);
    }

    for (const message of messages) {
      const article = document.createElement("article");

      article.className = "message " +
        (message.sender_id === user.id
          ? "message-own"
          : "message-incoming");

      const body = document.createElement("p");
      body.textContent = message.content || "";

      const meta = document.createElement("small");
      meta.className = "muted";

      const senderLabel = message.sender_id === user.id ? "You" : "Member";
      const readLabel =
        message.sender_id === user.id && message.read_at ? " · Read" : "";

      meta.textContent =
        `${senderLabel} · ${formatDate(message.created_at)}${readLabel}`;

      article.append(body, meta);
      conversation.appendChild(article);
    }

    conversation.scrollTop = conversation.scrollHeight;

    const unreadIds = messages
      .filter((message) =>
        message.recipient_id === user.id && !message.read_at
      )
      .map((message) => message.id);

    if (unreadIds.length) {
      const { error: readError } = await client
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds)
        .eq("recipient_id", user.id);

      if (readError) {
        console.warn("GARAGE read status error:", readError.message);
      }
    }
  } catch (error) {
    console.error("GARAGE conversation error:", error);

    if (thisLoad === messageLoadNumber) {
      showConversationMessage(
        "Could not load messages: " + error.message,
        true
      );
    }
  }
}

function setupMessages() {
  const recipientSelect = $("messageTo");
  const form = $("messageForm");

  recipientSelect?.addEventListener("change", loadConversation);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (messageBusy) return;

    const user = await getSignedInUser();

    if (!user) {
      notify("Please sign in to send private messages.");
      window.location.href = "auth.html";
      return;
    }

    const recipientId = recipientSelect?.value || "";
    const content = $("messageText")?.value.trim() || "";

    if (!recipientId) {
      notify("Choose a member first.");
      return;
    }

    if (recipientId === user.id) {
      notify("You cannot message yourself.");
      return;
    }

    if (!content) {
      notify("Write a message first.");
      return;
    }

    if (content.length > 5000) {
      notify("Messages must be 5,000 characters or fewer.");
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');

    messageBusy = true;
    if (submitButton) submitButton.disabled = true;

    try {
      const { error } = await client
        .from("messages")
        .insert({
          sender_id: user.id,
          recipient_id: recipientId,
          content
        });

      if (error) throw error;

      $("messageText").value = "";
      await loadConversation();
      notify("Message sent.");
    } catch (error) {
      console.error("GARAGE message send error:", error);
      notify("Could not send message: " + error.message);
    } finally {
      messageBusy = false;
      if (submitButton) submitButton.disabled = false;
    }
  });

  if (recipientSelect && form) {
    loadMessageMembers();
  }
}

/* =========================================================
   11. NAVIGATION AND SEARCH
========================================================= */

function showPage(pageName) {
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.add("hidden");
  });

  const target = $(`${pageName}Page`);

  if (target) {
    target.classList.remove("hidden");
  } else {
    console.warn(`GARAGE: Could not find page section "${pageName}Page".`);
  }

  document.querySelectorAll(".sidebar .nav[data-page]").forEach((button) => {
    const isActive = button.dataset.page === pageName;
    button.classList.toggle("active", isActive);

    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  if (pageName === "messages" && $("messageTo")) {
    loadMessageMembers();
  }
}

function setupNavigation() {
  document.querySelectorAll(".sidebar .nav[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const pageName = button.dataset.page;
      if (!pageName) return;

      if (pageName === "members") {
        window.location.href = "members.html";
        return;
      }

      showPage(pageName);
    });
  });

  $("shareBtn")?.addEventListener("click", () => {
    showPage("feed");

    window.setTimeout(() => {
      $("postText")?.focus();
    }, 0);

    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("search")?.addEventListener("input", () => {
    renderFeed();

    if ($("search").value.trim()) {
      showPage("feed");
    }
  });
}

/* =========================================================
   12. STARTUP
========================================================= */

async function init() {
  setupNavigation();
  setupMediaPicker();
  setupListingForm();
  setupFeedInteractions();
  setupMemberInteractions();
  setupMessages();

  $("postForm")?.addEventListener("submit", publishPost);

  renderMembers();
  renderListings();

  if (!client) {
    console.error("GARAGE: Supabase client not found. Check supabase-client.js.");
    showStatus("Supabase client not found. Check supabase-client.js.");
    return;
  }

  watchAuthenticationChanges();
  await loadCurrentUser();
  await loadCommunityPosts();

  // Support direct links such as index.html?page=messages&to=UUID.
  const params = new URLSearchParams(window.location.search);

  if (params.get("page") === "messages") {
    showPage("messages");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

/* =========================================================
   13. CLEANUP
========================================================= */

window.addEventListener("beforeunload", () => {
  if (mediaPreviewUrl) {
    URL.revokeObjectURL(mediaPreviewUrl);
  }
});
