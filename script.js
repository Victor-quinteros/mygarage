
"use strict";

const $ = (id) => document.getElementById(id);

const client = window.garageSupabase;

const demoMembers = [
  { name: "Alex Builds", car: "Honda Civic", avatar: "A" },
  { name: "Street Garage", car: "Nissan Silvia", avatar: "S" },
  { name: "Turbo Mike", car: "Subaru WRX", avatar: "T" }
];

// Local-only demo features.
let listings = [];
let messages = {};
let followed = new Set();
let localLikes = new Set();
let localComments = {};
let toastTimer;

let communityPosts = [];
let currentUser = null;
let currentProfile = null;
let selectedMedia = null;
let mediaPreviewUrl = "";

// =========================
// GENERAL HELPERS
// =========================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function notify(message) {
  const toast = $("toast");
  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function showStatus(message) {
  const feed = $("feed");
  if (feed) {
    feed.innerHTML = `<p class="muted">${escapeHTML(message)}</p>`;
  }
}

function getDisplayName(profile, userId) {
  return (
    profile?.display_name ||
    profile?.username ||
    (userId ? `Member ${userId.slice(0, 6)}` : "Garage Member")
  );
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

// =========================
// SUPABASE PROFILE
// =========================

async function loadCurrentUser() {
  if (!client) {
    console.error("Supabase client not found.");
    return;
  }

  const { data, error } = await client.auth.getUser();

  if (error) {
    console.error("Could not check login:", error.message);
    return;
  }

  currentUser = data.user || null;

  if (!currentUser) {
    currentProfile = null;
    return;
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, username, display_name, bio, favorite_car, avatar_url")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileError) {
    console.error("Could not load profile:", profileError.message);
  }

  currentProfile = profile || null;
}

function getCurrentDisplayName() {
  return getDisplayName(currentProfile, currentUser?.id);
}

// =========================
// COMMUNITY FEED
// =========================

async function loadCommunityPosts() {
  const feed = $("feed");
  if (!feed) return;

  if (!client) {
    showStatus("Supabase is not initialized. Check supabase-client.js.");
    return;
  }

  feed.innerHTML = `<p class="muted">Loading community posts...</p>`;

  
const { data, error } = await client
  .from("posts")
  .select("id, user_id, caption, image_url, created_at")
  .eq("is_community", true)
  .order("created_at", { ascending: false });


  if (error) {
    console.error("Could not load posts:", error.message);
    showStatus("Could not load posts. Check your Supabase login and table permissions.");
    return;
  }

  const posts = data || [];
  const userIds = [...new Set(posts.map(post => post.user_id).filter(Boolean))];

  let profilesById = {};

  if (userIds.length) {
    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, username, display_name, avatar_url, favorite_car")
      .in("id", userIds);

    if (profilesError) {
      console.error("Could not load post authors:", profilesError.message);
    }

    for (const profile of profiles || []) {
      profilesById[profile.id] = profile;
    }
  }

  communityPosts = posts.map(post => ({
    ...post,
    authorProfile: profilesById[post.user_id] || null
  }));

  renderFeed();
}

function renderFeed() {
  const feed = $("feed");
  if (!feed) return;

  const searchInput = $("search");
  const query = (searchInput?.value || "").trim().toLowerCase();

  const visiblePosts = communityPosts.filter(post => {
    const profile = post.authorProfile;
    const searchableText = [
      getDisplayName(profile, post.user_id),
      profile?.favorite_car || "",
      post.caption || ""
    ].join(" ").toLowerCase();

    return searchableText.includes(query);
  });

  if (!visiblePosts.length) {
    feed.innerHTML = communityPosts.length
      ? `<p class="muted">No matching posts. Try another search.</p>`
      : `<p class="muted">No community posts yet. Be the first to share a build!</p>`;
    return;
  }

  feed.innerHTML = visiblePosts.map(post => {
    const profile = post.authorProfile;
    const name = getDisplayName(profile, post.user_id);
    const avatar = profile?.avatar_url;

    const initials = escapeHTML(name.charAt(0).toUpperCase());
    const isOwnPost = currentUser?.id === post.user_id;
    const liked = localLikes.has(post.id);
    const comments = localComments[post.id] || [];
    const mediaUrl = post.image_url || "";

    const avatarMarkup = avatar
      ? `<img class="avatar" src="${escapeHTML(avatar)}" alt="" style="object-fit:cover;">`
      : `<div class="avatar">${initials}</div>`;

    let mediaMarkup = "";

    if (mediaUrl) {
      mediaMarkup = isVideoUrl(mediaUrl)
        ? `<video class="post-media" controls preload="metadata" src="${escapeHTML(mediaUrl)}"></video>`
        : `<img class="post-media" loading="lazy" src="${escapeHTML(mediaUrl)}" alt="Community post media">`;
    }

    return `
      <article class="post" data-post-id="${escapeHTML(post.id)}">
        <div class="post-head">
          ${avatarMarkup}
          <div>
            <strong>${escapeHTML(name)}</strong>
            <p class="muted">
              ${escapeHTML(profile?.favorite_car || "Car enthusiast")}
              · ${escapeHTML(formatDate(post.created_at))}
            </p>
          </div>
        </div>

        ${post.caption
          ? `<div class="post-copy">${escapeHTML(post.caption).replace(/\n/g, "<br>")}</div>`
          : ""}

        ${mediaMarkup}

        <div class="post-actions">
          <button class="action ${liked ? "liked" : ""}"
            type="button" data-like="${escapeHTML(post.id)}">
            ${liked ? "♥ Liked" : "♡ Like"}
          </button>

          <button class="action" type="button"
            data-focus-comment="${escapeHTML(post.id)}">
            ▢ Comments · ${comments.length}
          </button>

          ${isOwnPost ? `<span class="muted">Your post</span>` : ""}
        </div>

        <div class="comment-list">
          ${comments.map(comment => `
            <div class="comment">
              <strong>${escapeHTML(comment.author)}:</strong>
              ${escapeHTML(comment.text)}
            </div>
          `).join("")}
        </div>

        <form class="comment-form" data-comment="${escapeHTML(post.id)}">
          <input name="comment" placeholder="Write a comment..." maxlength="1000" required>
          <button class="action" type="submit">Send</button>
        </form>
      </article>
    `;
  }).join("");
}

// =========================
// POST MEDIA PREVIEW
// =========================

function clearMediaPreview() {
  if (mediaPreviewUrl) {
    URL.revokeObjectURL(mediaPreviewUrl);
  }

  mediaPreviewUrl = "";
  selectedMedia = null;

  if ($("postMedia")) $("postMedia").value = "";
  if ($("fileName")) $("fileName").textContent = "No media selected";
  if ($("mediaPreview")) $("mediaPreview").innerHTML = "";
}

function setupMediaPicker() {
  const input = $("postMedia");
  if (!input) return;

  input.addEventListener("change", event => {
    clearMediaPreview();

    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") &&
        !file.type.startsWith("video/")) {
      notify("Choose an image or video file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      notify("Choose a photo or video under 8 MB.");
      return;
    }

    selectedMedia = file;
    mediaPreviewUrl = URL.createObjectURL(file);

    if ($("fileName")) $("fileName").textContent = file.name;

    if ($("mediaPreview")) {
      $("mediaPreview").innerHTML = file.type.startsWith("video/")
        ? `<video class="post-media" controls src="${mediaPreviewUrl}"></video>`
        : `<img class="post-media" src="${mediaPreviewUrl}" alt="Selected media preview">`;
    }
  });
}

// =========================
// CREATE SUPABASE POST
// =========================

async function publishPost(event) {
  event.preventDefault();

  if (!client) {
    notify("Supabase is not initialized.");
    return;
  }

  const text = $("postText")?.value.trim() || "";

  if (!text && !selectedMedia) {
    notify("Write something or choose a photo/video.");
    return;
  }

  const { data: authData, error: authError } = await client.auth.getUser();

  if (authError || !authData.user) {
    notify("Please log in before publishing a post.");
    return;
  }

  const user = authData.user;
  const submitButton = $("postForm")?.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Publishing...";
  }

  let uploadedPath = null;

  try {
    let mediaUrl = null;

    if (selectedMedia) {
      const extension = selectedMedia.name.includes(".")
        ? selectedMedia.name.split(".").pop().toLowerCase()
        : "bin";

      uploadedPath =
        `${user.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await client
        .storage
        .from("post-images")
        .upload(uploadedPath, selectedMedia, {
          contentType: selectedMedia.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = client
        .storage
        .from("post-images")
        .getPublicUrl(uploadedPath);

      mediaUrl = publicData.publicUrl;
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
    console.error("Post publishing failed:", error);

    // If the database insert failed after an upload, try to remove
    // the unused uploaded file.
    if (uploadedPath) {
      const { error: cleanupError } = await client
        .storage
        .from("post-images")
        .remove([uploadedPath]);

      if (cleanupError) {
        console.error("Uploaded file cleanup failed:", cleanupError.message);
      }
    }

    notify(error.message || "Could not publish your post.");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Publish post ↗";
    }
  }
}

// =========================
// DEMO MEMBERS
// =========================

function renderMembers() {
  const container = $("members");
  if (!container) return;

  container.innerHTML = demoMembers.map(member => `
    <div class="member">
      <div class="avatar">${escapeHTML(member.avatar)}</div>

      <div class="member-name">
        <strong>${escapeHTML(member.name)}</strong>
        <small>${escapeHTML(member.car)}</small>
      </div>

      <button class="action ${followed.has(member.name) ? "following" : ""}"
        type="button" data-follow="${escapeHTML(member.name)}">
        ${followed.has(member.name) ? "Following" : "Follow"}
      </button>
    </div>
  `).join("");
}

// =========================
// DEMO MARKETPLACE
// =========================

function renderListings() {
  const container = $("carListings");
  if (!container) return;

  container.innerHTML = listings.length
    ? listings.map(car => `
      <article class="listing-card">
        <div class="feature-icon">🚘</div>
        <h3>${escapeHTML(car.name)}</h3>
        <p class="price">$${Number(car.price).toLocaleString("en-US")}</p>
        <p>${escapeHTML(car.details || "No additional details provided.")}</p>
      </article>
    `).join("")
    : `<p class="muted">No cars listed yet. Add your first listing above.</p>`;
}

function setupListingForm() {
  const form = $("listingForm");
  if (!form) return;

  form.addEventListener("submit", event => {
    event.preventDefault();

    const name = $("carName")?.value.trim();
    const price = Number($("carPrice")?.value);
    const details = $("carDetails")?.value.trim();

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

// =========================
// DEMO COMMENTS AND LIKES
// =========================

function setupFeedInteractions() {
  const feed = $("feed");
  if (!feed) return;

  feed.addEventListener("click", event => {
    const likeButton = event.target.closest("[data-like]");
    const commentButton = event.target.closest("[data-focus-comment]");

    if (likeButton) {
      const id = likeButton.dataset.like;

      if (localLikes.has(id)) {
        localLikes.delete(id);
      } else {
        localLikes.add(id);
      }

      renderFeed();
    }

    if (commentButton) {
      const id = commentButton.dataset.focusComment;
      feed.querySelector(`[data-comment="${CSS.escape(id)}"] input`)?.focus();
    }
  });

  feed.addEventListener("submit", event => {
    const form = event.target.closest("[data-comment]");
    if (!form) return;

    event.preventDefault();

    const input = form.elements.comment;
    const text = input.value.trim();
    if (!text) return;

    const id = form.dataset.comment;

    if (!localComments[id]) localComments[id] = [];

    localComments[id].push({
      author: getCurrentDisplayName(),
      text
    });

    renderFeed();
    notify("Comment added locally. It is not saved to Supabase.");
  });
}

// =========================
// DEMO FOLLOWS
// =========================

function setupMemberInteractions() {
  const container = $("members");
  if (!container) return;

  container.addEventListener("click", event => {
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
      ? `Following ${name} locally`
      : `Unfollowed ${name} locally`);
  });
}

// =========================
// DEMO MESSAGES
// =========================

function renderMessages() {
  const name = $("messageTo")?.value.trim();
  const conversationElement = $("conversation");

  if (!conversationElement) return;

  const conversation = messages[name] || [];

  conversationElement.innerHTML = conversation.map(message => `
    <div class="message">
      <strong>${escapeHTML(message.from)}:</strong>
      ${escapeHTML(message.text)}
    </div>
  `).join("") || `<p class="muted">No messages in this demo conversation.</p>`;
}

function setupMessages() {
  $("messageTo")?.addEventListener("input", renderMessages);

  $("messageForm")?.addEventListener("submit", event => {
    event.preventDefault();

    const name = $("messageTo")?.value.trim();
    const text = $("messageText")?.value.trim();

    if (!name || !text) return;

    if (!messages[name]) messages[name] = [];

    messages[name].push({
      from: getCurrentDisplayName(),
      text
    });

    $("messageText").value = "";
    renderMessages();
    notify("Demo message added. It is not saved to Supabase.");
  });
}

// =========================
// HOMEPAGE NAVIGATION
// =========================

function showPage(page) {
  document.querySelectorAll(".page").forEach(section => {
    section.classList.add("hidden");
  });

  const target = $(page + "Page");
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".sidebar .nav[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
}

function setupNavigation() {
  document.querySelectorAll(".sidebar .nav[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;

      if (page === "members") {
        window.location.href = "members.html";
        return;
      }

      showPage(page);
    });
  });

  $("shareBtn")?.addEventListener("click", () => {
    showPage("feed");
    $("postText")?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("search")?.addEventListener("input", () => {
    renderFeed();

    if ($("search").value.trim()) {
      showPage("feed");
    }
  });
}

// =========================
// STARTUP
// =========================

async function init() {
  setupNavigation();
  setupMediaPicker();
  setupListingForm();
  setupFeedInteractions();
  setupMemberInteractions();
  setupMessages();

  $("postForm")?.addEventListener("submit", publishPost);

  if (!client) {
    showStatus("Supabase client not found. Check supabase-client.js.");
    renderMembers();
    renderListings();
    renderMessages();
    return;
  }

  await loadCurrentUser();

  renderMembers();
  renderListings();
  renderMessages();

  await loadCommunityPosts();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.addEventListener("beforeunload", () => {
  if (mediaPreviewUrl) {
    URL.revokeObjectURL(mediaPreviewUrl);
  }
});
