
/* =========================================================
   GARAGE — MAIN WEBSITE SCRIPT
   Community feed, posts, media, members, marketplace,
   and private messaging using Supabase.
========================================================= */

"use strict";

/* =========================================================
   1. SHARED STATE AND HELPERS
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
  }, 2800);
}

function showStatus(message) {
  const feed = $("feed");
  if (!feed) return;

  feed.innerHTML = `<p class="muted">${escapeHTML(message)}</p>`;
}

function getDisplayName(profile, userId) {
  return (
    profile?.display_name ||
    profile?.username ||
    (userId ? `Member ${String(userId).slice(0, 6)}` : "GARAGE Member")
  );
}

function getCurrentDisplayName() {
  return getDisplayName(currentProfile, currentUser?.id);
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

function isVideoUrl(url) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url || "");
}

function makeInitials(name) {
  return escapeHTML(
    (String(name || "G").trim()[0] || "G").toUpperCase()
  );
}

function setButtonBusy(button, busy, busyText, idleText) {
  if (!button) return;

  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

/* =========================================================
   2. AUTHENTICATION AND PROFILE
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
    console.error("GARAGE: Session check failed:", error.message);
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
    console.error("GARAGE: Profile loading failed:", profileError.message);
  }

  currentProfile = profile || null;
  return currentUser;
}

function watchAuthenticationChanges() {
  if (!client?.auth) return;

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;

    if (!currentUser) {
      currentProfile = null;
      renderFeed();
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
        console.error("GARAGE: Profile refresh failed:", error.message);
        return;
      }

      if (currentUser?.id === userId) {
        currentProfile = data || null;
        renderFeed();
      }
    });
  });
}

/* =========================================================
   3. COMMUNITY FEED
========================================================= */

async function loadCommunityPosts() {
  const feed = $("feed");
  if (!feed) return;

  if (!client) {
    showStatus("Supabase is not initialized. Check supabase-client.js.");
    return;
  }

  showStatus("Loading community posts...");

  const { data, error } = await client
    .from("posts")
    .select("id, user_id, caption, image_url, created_at, is_community")
    .eq("is_community", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("GARAGE: Could not load posts:", error.message);
    showStatus("Could not load posts. Check Supabase permissions.");
    return;
  }

  const posts = data || [];
  const userIds = [...new Set(
    posts.map((post) => post.user_id).filter(Boolean)
  )];

  const profilesById = {};

  if (userIds.length) {
    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, username, display_name, avatar_url, favorite_car")
      .in("id", userIds);

    if (profilesError) {
      console.warn("GARAGE: Could not load post authors:", profilesError.message);
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
}

function renderPostMedia(mediaUrl) {
  if (!mediaUrl) return "";

  const safeUrl = escapeHTML(mediaUrl);

  if (isVideoUrl(mediaUrl)) {
    return `
      <video
        class="post-media"
        controls
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
      post.caption || ""
    ].join(" ").toLowerCase();

    return searchableText.includes(query);
  });

  if (!visiblePosts.length) {
    showStatus(
      communityPosts.length
        ? "No matching posts. Try another search."
        : "No public posts yet. Be the first to share a build!"
    );
    return;
  }

  feed.innerHTML = visiblePosts.map((post) => {
    const profile = post.authorProfile;
    const name = getDisplayName(profile, post.user_id);
    const avatarUrl = profile?.avatar_url || "";
    const isOwnPost = Boolean(
      currentUser && currentUser.id === post.user_id
    );

    const liked = localLikes.has(post.id);
    const comments = localComments[post.id] || [];

    const avatarMarkup = avatarUrl
      ? `
        <img
          class="avatar"
          src="${escapeHTML(avatarUrl)}"
          alt="${escapeHTML(name)}'s avatar"
          loading="lazy"
          style="object-fit:cover;"
        >
      `
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
          <button
            class="action ${liked ? "liked" : ""}"
            type="button"
            data-like="${escapeHTML(post.id)}"
            aria-pressed="${liked}"
          >${liked ? "♥ Liked" : "♡ Like"}</button>

          <button
            class="action"
            type="button"
            data-focus-comment="${escapeHTML(post.id)}"
          >Comments · ${comments.length}</button>

          ${isOwnPost ? `<span class="muted">Your post</span>` : ""}
        </div>

        <div class="comment-list">${commentsMarkup}</div>

        <form class="comment-form" data-comment="${escapeHTML(post.id)}">
          <input
            name="comment"
            type="text"
            placeholder="Write a comment..."
            maxlength="1000"
            aria-label="Write a comment"
            required
          >
          <button class="action" type="submit">Send</button>
        </form>
      </article>
    `;
  }).join("");
}

/* =========================================================
   4. POST MEDIA PICKER
========================================================= */

function clearMediaPreview({ clearInput = true } = {}) {
  if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);

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

    if (!file.type.startsWith("image/") &&
        !file.type.startsWith("video/")) {
      input.value = "";
      notify("Choose an image or video file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      input.value = "";
      notify("Choose a photo or video under 8 MB.");
      return;
    }

    selectedMedia = file;
    mediaPreviewUrl = URL.createObjectURL(file);

    if ($("fileName")) {
      $("fileName").textContent = file.name;
    }

    if ($("mediaPreview")) {
      const url = escapeHTML(mediaPreviewUrl);

      $("mediaPreview").innerHTML = file.type.startsWith("video/")
        ? `<video class="post-media" controls preload="metadata" src="${url}"></video>`
        : `<img class="post-media" src="${url}" alt="Selected media preview">`;
    }
  });
}

/* =========================================================
   5. PUBLISH A COMMUNITY POST
========================================================= */

async function publishPost(event) {
  event.preventDefault();

  if (isPublishingPost) return;

  if (!client?.auth) {
    notify("Supabase is not initialized.");
    return;
  }

  const text = $("postText")?.value.trim() || "";

  if (!text && !selectedMedia) {
    notify("Write something or choose a photo/video.");
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
    notify("Please sign in before publishing.");
    window.location.href = "auth.html";
    return;
  }

  const form = $("postForm");
  const button = form?.querySelector('button[type="submit"]');

  isPublishingPost = true;
  setButtonBusy(button, true, "Publishing...", "Publish post ↗");

  let uploadedPath = null;

  try {
    let mediaUrl = null;

    if (selectedMedia) {
      const rawExtension = selectedMedia.name.includes(".")
        ? selectedMedia.name.split(".").pop().toLowerCase()
        : "";

      const extension = /^[a-z0-9]{1,8}$/.test(rawExtension)
        ? rawExtension
        : "bin";

      const uniqueId = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      uploadedPath = `${user.id}/${uniqueId}.${extension}`;

      const { error: uploadError } = await client.storage
        .from("post-images")
        .upload(uploadedPath, selectedMedia, {
          contentType: selectedMedia.type || "application/octet-stream",
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
        caption: text,
        image_url: mediaUrl,
        is_community: true
      });

    if (insertError) throw insertError;

    if ($("postText")) $("postText").value = "";

    clearMediaPreview();
    await loadCommunityPosts();
    notify("Your post was published!");
  } catch (error) {
    console.error("GARAGE: Publishing failed:", error);

    if (uploadedPath) {
      const { error: cleanupError } = await client.storage
        .from("post-images")
        .remove([uploadedPath]);

      if (cleanupError) {
        console.error("GARAGE: Media cleanup failed:", cleanupError.message);
      }
    }

    notify(error?.message || "Could not publish your post.");
  } finally {
    isPublishingPost = false;
    setButtonBusy(button, false, "Publishing...", "Publish post ↗");
  }
}

/* =========================================================
   6. MEMBERS AND FOLLOW BUTTONS
   Demo-only follows.
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
        <button
          class="action ${isFollowing ? "following" : ""}"
          type="button"
          data-follow="${escapeHTML(member.name)}"
          aria-pressed="${isFollowing}"
        >${isFollowing ? "Following" : "Follow"}</button>
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
   7. DEMO MARKETPLACE
   These listings are not saved to Supabase.
========================================================= */

function renderListings() {
  const container = $("carListings");
  if (!container) return;

  if (!listings.length) {
    container.innerHTML =
      `<p class="muted">No demo listings yet. Add a listing to try this feature.</p>`;
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
   8. DEMO LIKES AND COMMENTS
   These are temporary and not saved to Supabase.
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

    if (!localComments[postId]) localComments[postId] = [];

    localComments[postId].push({
      author: getCurrentDisplayName(),
      text
    });

    renderFeed();
    notify("Comment added locally. It is not saved to Supabase.");
  });
}

/* =========================================================
   9. PRIVATE MESSAGING — SUPABASE
   Table columns:
   id, sender_id, recipient_id, content, created_at, read_at
========================================================= */

let activeRecipientId = null;
let messagesLoading = false;
let messagingInitialized = false;

function renderConversationMessage(message, userId) {
  const article = document.createElement("article");
  article.className = "message";

  const heading = document.createElement("strong");
  heading.textContent = message.sender_id === userId ? "You" : "Member";

  const content = document.createElement("p");
  content.textContent = message.content;

  const time = document.createElement("small");
  time.textContent = formatDate(message.created_at);

  article.append(heading, content, time);

  if (message.sender_id === userId && message.read_at) {
    const readStatus = document.createElement("small");
    readStatus.textContent = " · Read";
    article.appendChild(readStatus);
  }

  return article;
}

function showConversationStatus(message) {
  const container = $("conversation");
  if (!container) return;

  container.replaceChildren();

  const paragraph = document.createElement("p");
  paragraph.className = "muted";
  paragraph.textContent = message;

  container.appendChild(paragraph);
}

async function getMessagingUser() {
  const { data, error } = await client.auth.getUser();

  if (error) throw error;

  if (!data.user) {
    throw new Error("Please sign in to use private messages.");
  }

  return data.user;
}

async function loadMessageRecipients() {
  const select = $("messageTo");
  if (!select || !client) return;

  try {
    const user = await getMessagingUser();

    const { data, error } = await client
      .from("profiles")
      .select("id, username, display_name")
      .neq("id", user.id)
      .order("display_name", { ascending: true });

    if (error) throw error;

    const previousValue = select.value;

    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Choose a member";
    select.appendChild(placeholder);

    for (const profile of data || []) {
      const option = document.createElement("option");

      option.value = profile.id;
      option.textContent =
        profile.display_name ||
        profile.username ||
        "GARAGE Member";

      select.appendChild(option);
    }

    if ([...select.options].some((option) => option.value === previousValue)) {
      select.value = previousValue;
    }

    if (select.value) {
      await loadPrivateMessages(select.value);
    } else {
      showConversationStatus(
        data?.length
          ? "Choose a member to start messaging."
          : "No other members are available yet."
      );
    }
  } catch (error) {
    console.error("GARAGE: Could not load message recipients:", error);
    showConversationStatus(
      error.message || "Could not load members. Please sign in."
    );
  }
}

async function loadPrivateMessages(recipientId) {
  const container = $("conversation");

  if (!container || !client || messagesLoading) return;

  if (!recipientId) {
    activeRecipientId = null;
    showConversationStatus("Choose a member to view messages.");
    return;
  }

  messagesLoading = true;
  activeRecipientId = recipientId;

  try {
    const user = await getMessagingUser();

    // UUID values come from authenticated Supabase user/profile records.
    // Filter sent and received messages without needing a conversations table.
    const { data, error } = await client
      .from("messages")
      .select("id, sender_id, recipient_id, content, created_at, read_at")
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true });

    if (error) throw error;

    container.replaceChildren();

    if (!data?.length) {
      showConversationStatus("No messages yet. Start the conversation!");
      return;
    }

    for (const message of data) {
      container.appendChild(renderConversationMessage(message, user.id));
    }

    container.scrollTop = container.scrollHeight;

    const unreadIds = data
      .filter((message) =>
        message.sender_id === recipientId &&
        message.recipient_id === user.id &&
        !message.read_at
      )
      .map((message) => message.id);

    if (unreadIds.length) {
      const { error: readError } = await client
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds)
        .eq("recipient_id", user.id);

      if (readError) {
        console.warn("GARAGE: Could not mark messages read:", readError.message);
      }
    }
  } catch (error) {
    console.error("GARAGE: Could not load messages:", error);
    showConversationStatus(error.message || "Could not load messages.");
  } finally {
    messagesLoading = false;
  }
}

async function sendPrivateMessage(event) {
  event.preventDefault();

  if (!client) {
    showConversationStatus("Supabase is not connected.");
    return;
  }

  const form = $("messageForm");
  const input = $("messageText");
  const recipientId = $("messageTo")?.value || "";
  const content = input?.value.trim() || "";

  if (!recipientId) {
    showConversationStatus("Choose a member first.");
    return;
  }

  if (!content) {
    notify("Enter a message first.");
    return;
  }

  if (content.length > 5000) {
    notify("Messages must be 5,000 characters or fewer.");
    return;
  }

  const button = form?.querySelector('[type="submit"]');

  if (button) button.disabled = true;

  try {
    const user = await getMessagingUser();

    if (recipientId === user.id) {
      throw new Error("You cannot send a message to yourself.");
    }

    const { error } = await client
      .from("messages")
      .insert({
        sender_id: user.id,
        recipient_id: recipientId,
        content
      });

    if (error) throw error;

    input.value = "";
    await loadPrivateMessages(recipientId);
  } catch (error) {
    console.error("GARAGE: Could not send message:", error);
    notify(error.message || "Could not send message.");
  } finally {
    if (button) button.disabled = false;
  }
}

function setupPrivateMessaging() {
  if (messagingInitialized) return;
  messagingInitialized = true;

  const form = $("messageForm");
  const recipient = $("messageTo");

  if (form) {
    form.addEventListener("submit", sendPrivateMessage);
  }

  if (recipient) {
    recipient.addEventListener("change", () => {
      loadPrivateMessages(recipient.value);
    });
  }

  if (!client) {
    showConversationStatus("Supabase is not connected.");
    return;
  }

  loadMessageRecipients();
}

/* =========================================================
   10. NAVIGATION AND SEARCH
========================================================= */

function showPage(pageName) {
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.add("hidden");
  });

  const target = $(`${pageName}Page`);

  if (target) {
    target.classList.remove("hidden");
  } else {
    console.warn(`GARAGE: Could not find "${pageName}Page".`);
  }

  document.querySelectorAll(".sidebar .nav[data-page]").forEach((button) => {
    const active = button.dataset.page === pageName;

    button.classList.toggle("active", active);

    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
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

      if (pageName === "messages") {
        loadMessageRecipients();
      }
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
   11. STARTUP
========================================================= */

async function init() {
  setupNavigation();
  setupMediaPicker();
  setupListingForm();
  setupFeedInteractions();
  setupMemberInteractions();
  setupPrivateMessaging();

  $("postForm")?.addEventListener("submit", publishPost);

  renderMembers();
  renderListings();

  if (!client) {
    console.error(
      "GARAGE: Supabase client not found. Check supabase-client.js."
    );
    showStatus("Supabase client not found. Check supabase-client.js.");
    return;
  }

  watchAuthenticationChanges();

  await loadCurrentUser();
  await loadCommunityPosts();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

/* =========================================================
   12. CLEANUP
========================================================= */

window.addEventListener("beforeunload", () => {
  if (mediaPreviewUrl) {
    URL.revokeObjectURL(mediaPreviewUrl);
  }
});
