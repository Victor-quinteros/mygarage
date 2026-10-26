/* =========================================================
   GARAGE — MAIN WEBSITE SCRIPT
   ---------------------------------------------------------
   Handles:
   1. Authentication state and profile loading
   2. Public community feed (visible to guests)
   3. Creating posts and uploading media
   4. Search, navigation, and feed interactions
   5. Demo-only members, marketplace, comments, and messages

   IMPORTANT:
   - Public feed visibility is controlled by the Supabase query
     AND your Supabase Row Level Security (RLS) policies.
   - Likes, comments, follows, listings, and messages in this
     version are local demo features; they are not saved to
     Supabase.
========================================================= */

"use strict";

/* =========================================================
   1. SHARED STATE AND ELEMENT HELPERS
========================================================= */

const $ = (id) => document.getElementById(id);
const client = window.garageSupabase;

const demoMembers = [
  { name: "Alex Builds", car: "Honda Civic", avatar: "A" },
  { name: "Street Garage", car: "Nissan Silvia", avatar: "S" },
  { name: "Turbo Mike", car: "Subaru WRX", avatar: "T" }
];

// These arrays/objects are intentionally temporary demo data.
let listings = [];
let messages = {};
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

/* =========================================================
   2. GENERAL HELPERS
========================================================= */

// Escape text before inserting it into HTML.
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

// Display a small status message if the page has a toast element.
function notify(message) {
  const toast = $("toast");

  if (!toast) {
    console.log(`[GARAGE] ${message}`);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);

  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

// Show a safe loading/error message in the community feed.
function showStatus(message) {
  const feed = $("feed");
  if (!feed) return;

  feed.innerHTML = `<p class="muted">${escapeHTML(message)}</p>`;
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
  return escapeHTML((String(name || "G").trim()[0] || "G").toUpperCase());
}

function setButtonBusy(button, busy, busyText, idleText) {
  if (!button) return;

  button.disabled = busy;
  button.textContent = busy ? busyText : idleText;
}

/* =========================================================
   3. AUTHENTICATION AND CURRENT PROFILE
========================================================= */

// Use getSession() here. A visitor who is logged out is normal;
// a missing session should not be reported as a login failure.
async function loadCurrentUser() {
  currentUser = null;
  currentProfile = null;

  if (!client?.auth) {
    console.error("GARAGE: Supabase client is not available.");
    return null;
  }

  const { data, error } = await client.auth.getSession();

  if (error) {
    console.error("GARAGE: Could not read the current session:", error.message);
    return null;
  }

  currentUser = data.session?.user || null;

  // Guests are allowed to continue and read public community posts.
  if (!currentUser) return null;

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, username, display_name, bio, favorite_car, avatar_url")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileError) {
    console.error("GARAGE: Could not load the profile:", profileError.message);
  }

  currentProfile = profile || null;
  return currentUser;
}

// Keep state updated if someone signs in or out while the page is open.
function watchAuthenticationChanges() {
  if (!client?.auth) return;

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;

    if (!currentUser) {
      currentProfile = null;
      // Do not clear the public feed when a user signs out.
      renderFeed();
      return;
    }

    // Supabase recommends keeping auth-state callbacks lightweight.
    // Load the profile after the callback completes.
    Promise.resolve().then(async () => {
      const { data: profile, error } = await client
        .from("profiles")
        .select("id, username, display_name, bio, favorite_car, avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (error) {
        console.error("GARAGE: Could not refresh the profile:", error.message);
        return;
      }

      // Ignore a stale profile response if the user changed meanwhile.
      if (currentUser?.id === session?.user?.id) {
        currentProfile = profile || null;
        renderFeed();
      }
    });
  });
}

/* =========================================================
   4. PUBLIC COMMUNITY FEED
========================================================= */

// This query deliberately does NOT require a logged-in user.
// Guests can read community posts when Supabase RLS permits public
// SELECT access for rows where is_community = true.
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
    console.error("GARAGE: Could not load public posts:", error.message);
    showStatus(
      "Could not load community posts. Check your Supabase connection and public-post permissions."
    );
    return;
  }

  const posts = data || [];
  const userIds = [...new Set(posts.map((post) => post.user_id).filter(Boolean))];
  const profilesById = {};

  // Author profiles are optional. A profile lookup failure should not
  // prevent the public posts themselves from being displayed.
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, username, display_name, avatar_url, favorite_car")
      .in("id", userIds);

    if (profilesError) {
      console.warn("GARAGE: Could not load some post authors:", profilesError.message);
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
        : "No public community posts yet. Be the first to share a build!"
    );
    return;
  }

  feed.innerHTML = visiblePosts.map((post) => {
    const profile = post.authorProfile;
    const name = getDisplayName(profile, post.user_id);
    const avatarUrl = profile?.avatar_url || "";
    const isOwnPost = Boolean(currentUser && currentUser.id === post.user_id);
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
            aria-pressed="${liked ? "true" : "false"}"
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
   5. POST IMAGE / VIDEO PICKER AND PREVIEW
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
    $("mediaPreview").innerHTML = "";
  }
}

function setupMediaPicker() {
  const input = $("postMedia");
  if (!input) return;

  input.addEventListener("change", (event) => {
    // Save the file BEFORE clearing the old preview. Clearing the input
    // first would also clear the newly selected file in some browsers.
    const file = event.target.files?.[0] || null;

    clearMediaPreview({ clearInput: false });

    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      input.value = "";
      notify("Choose an image or video file.");
      return;
    }

    const maxFileSize = 8 * 1024 * 1024;

    if (file.size > maxFileSize) {
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
      const safePreviewUrl = escapeHTML(mediaPreviewUrl);

      $("mediaPreview").innerHTML = file.type.startsWith("video/")
        ? `<video class="post-media" controls preload="metadata" src="${safePreviewUrl}"></video>`
        : `<img class="post-media" src="${safePreviewUrl}" alt="Selected media preview">`;
    }
  });
}

/* =========================================================
   6. CREATE A PUBLIC COMMUNITY POST
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

  // Use getSession so a logged-out visitor is handled as a normal guest.
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    console.error("GARAGE: Could not check the current session:", sessionError.message);
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

    // Upload selected media to the public post-images bucket.
    if (selectedMedia) {
      const extensionFromName = selectedMedia.name.includes(".")
        ? selectedMedia.name.split(".").pop().toLowerCase()
        : "";

      const extension = /^[a-z0-9]{1,8}$/.test(extensionFromName)
        ? extensionFromName
        : "bin";

      const uniqueId = (
        window.crypto?.randomUUID
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      );

      uploadedPath = `${user.id}/${uniqueId}.${extension}`;

      const { error: uploadError } = await client
        .storage
        .from("post-images")
        .upload(uploadedPath, selectedMedia, {
          contentType: selectedMedia.type || "application/octet-stream",
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = client
        .storage
        .from("post-images")
        .getPublicUrl(uploadedPath);

      mediaUrl = publicData?.publicUrl || null;

      if (!mediaUrl) {
        throw new Error("The uploaded media URL could not be created.");
      }
    }

    // is_community=true makes this a public community post.
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
    console.error("GARAGE: Post publishing failed:", error);

    // Remove the uploaded file if saving the database row failed.
    if (uploadedPath) {
      const { error: cleanupError } = await client
        .storage
        .from("post-images")
        .remove([uploadedPath]);

      if (cleanupError) {
        console.error("GARAGE: Uploaded file cleanup failed:", cleanupError.message);
      }
    }

    notify(error?.message || "Could not publish your post.");
  } finally {
    isPublishingPost = false;
    setButtonBusy(submitButton, false, "Publishing...", "Publish post ↗");
  }
}
/* =========================================================
   7. DEMO MEMBERS AND FOLLOW BUTTONS
   These actions are temporary and are not saved to Supabase.
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
          aria-pressed="${isFollowing ? "true" : "false"}"
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
    notify(followed.has(name) ? `Following ${name} locally.` : `Unfollowed ${name} locally.`);
  });
}

/* =========================================================
   8. DEMO MARKETPLACE
   Listings are temporary and disappear when the page reloads.
========================================================= */

function renderListings() {
  const container = $("carListings");
  if (!container) return;

  if (!listings.length) {
    container.innerHTML = `<p class="muted">No demo listings yet. Add a listing to try this feature.</p>`;
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
   These actions are temporary and are not saved to Supabase.
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
   10. DEMO MESSAGES
   Messages are temporary and are not saved to Supabase.
========================================================= */


/* =========================================================
   10. SUPABASE PRIVATE MESSAGES
========================================================= */

let activeConversationId = null;
let messageBusy = false;

async function getSignedInUser() {
  if (!client?.auth) return null;

  const { data, error } = await client.auth.getUser();

  if (error) {
    console.error("GARAGE auth error:", error.message);
    return null;
  }

  return data.user || null;
}

async function loadConversation() {
  const conversation = $("conversation");
  const recipientInput = $("messageTo");

  if (!conversation || !recipientInput) return;

  const user = await getSignedInUser();

  if (!user) {
    conversation.innerHTML =
      '<p class="muted">Sign in to use private messages.</p>';
    return;
  }

  const recipientId = recipientInput.value.trim();

  if (!recipientId) {
    conversation.innerHTML =
      '<p class="muted">Choose a member to open a conversation.</p>';
    return;
  }

  if (recipientId === user.id) {
    conversation.innerHTML =
      '<p class="muted">You cannot message yourself.</p>';
    return;
  }

  activeConversationId = recipientId;
  conversation.innerHTML =
    '<p class="muted">Loading conversation...</p>';

  const { data, error } = await client
    .from("messages")
    .select("id, sender_id, recipient_id, content, created_at, read_at")
    .or(
      `and(sender_id.eq.${user.id},recipient_id.eq.${recipientId}),` +
      `and(sender_id.eq.${recipientId},recipient_id.eq.${user.id})`
    )
    .order("created_at", { ascending: true });

  if (error) {
    console.error("GARAGE message load error:", error.message);
    conversation.innerHTML =
      '<p class="muted">Could not load messages. Check your database policies.</p>';
    return;
  }

  if (activeConversationId !== recipientId) return;

  const messages = data || [];

  conversation.innerHTML = messages.length
    ? messages.map(message => `
        <article class="message ${
          message.sender_id === user.id ? "message-own" : "message-incoming"
        }">
          <p>${escapeHTML(message.content).replace(/\n/g, "<br>")}</p>
          <small class="muted">
            ${message.sender_id === user.id ? "You" : "Member"}
            · ${escapeHTML(formatDate(message.created_at))}
            ${message.sender_id === user.id && message.read_at ? " · Read" : ""}
          </small>
        </article>
      `).join("")
    : '<p class="muted">No messages yet. Say hello!</p>';

  // Mark messages received from this member as read.
  const unreadIds = messages
    .filter(message =>
      message.recipient_id === user.id && !message.read_at
    )
    .map(message => message.id);

  if (unreadIds.length) {
    const { error: readError } = await client
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadIds);

    if (readError) {
      console.warn("GARAGE read-status update:", readError.message);
    }
  }

  conversation.scrollTop = conversation.scrollHeight;
}

function setupMessages() {
  $("messageTo")?.addEventListener("change", loadConversation);

  $("messageForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    if (messageBusy) return;

    const user = await getSignedInUser();
    if (!user) {
      notify("Please sign in to send private messages.");
      window.location.href = "auth.html";
      return;
    }

    const recipientId = $("messageTo")?.value.trim() || "";
    const content = $("messageText")?.value.trim() || "";

    if (!recipientId || !content) {
      notify("Choose a recipient and enter a message.");
      return;
    }

    if (recipientId === user.id) {
      notify("You cannot message yourself.");
      return;
    }

    if (content.length > 5000) {
      notify("Messages must be 5,000 characters or less.");
      return;
    }

    messageBusy = true;
    const submitButton = $("messageForm")
      ?.querySelector('button[type="submit"]');

    if (submitButton) submitButton.disabled = true;

    try {
      const { error } = await client.from("messages").insert({
        sender_id: user.id,
        recipient_id: recipientId,
        content
      });

      if (error) throw error;

      $("messageText").value = "";
      await loadConversation();
      notify("Message sent.");
    } catch (error) {
      console.error("GARAGE send message error:", error.message);
      notify(error.message || "Could not send the message.");
    } finally {
      messageBusy = false;
      if (submitButton) submitButton.disabled = false;
    }
  });
}

/* =========================================================
   11. HOMEPAGE NAVIGATION AND SEARCH
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
}

function setupNavigation() {
  document.querySelectorAll(".sidebar .nav[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const pageName = button.dataset.page;
      if (!pageName) return;

      // The members area is a separate page in this website.
      if (pageName === "members") {
        window.location.href = "members.html";
        return;
      }

      showPage(pageName);
    });
  });

  // The main page's inline authentication code may also handle this
  // button. This listener only handles the normal in-page navigation.
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
  renderMessages();

  if (!client) {
    console.error("GARAGE: Supabase client not found. Check supabase-client.js.");
    showStatus("Supabase client not found. Check supabase-client.js.");
    return;
  }

  // Subscribe before loading the initial session so later sign-in/sign-out
  // events keep the page state in sync.
  watchAuthenticationChanges();

  await loadCurrentUser();

  // Always load the public feed, whether the visitor is signed in or not.
  await loadCommunityPosts();
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
