
/* =========================================================
   GARAGE — COMPLETE MAIN WEBSITE SCRIPT
   REAL SUPABASE FEATURES:
   - Authentication and profile loading
   - Public community feed
   - Photo/video uploads
   - Persistent likes and comments
   - Private member messaging and read status
   DEMO ONLY:
   - Follows and marketplace listings
========================================================= */
"use strict";

(() => {
  const $ = (id) => document.getElementById(id);
  const client = window.garageSupabase;

  const demoMembers = [
    { name: "Alex Builds", car: "Honda Civic", avatar: "A" },
    { name: "Street Garage", car: "Nissan Silvia", avatar: "S" },
    { name: "Turbo Mike", car: "Subaru WRX", avatar: "T" }
  ];

  let listings = [];
  let followed = new Set();
  let communityPosts = [];
  let currentUser = null;
  let currentProfile = null;
  let likedPostIds = new Set();
  let postLikeCounts = {};
  let postComments = {};
  let toastTimer = null;
  let selectedMedia = null;
  let mediaPreviewUrl = "";
  let isPublishingPost = false;
  let messageBusy = false;
  let messageLoadNumber = 0;
  let activeConversationId = null;
  let memberLoadNumber = 0;
  let authSubscription = null;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
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
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3500);
  }

  function showStatus(message) {
    const feed = $("feed");
    if (!feed) return;
    feed.replaceChildren();
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = message;
    feed.appendChild(p);
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
    return profile?.display_name || profile?.username ||
      (userId ? `Member ${String(userId).slice(0, 6)}` : "Garage Member");
  }

  function makeInitials(name) {
    return escapeHTML((String(name || "G").trim()[0] || "G").toUpperCase());
  }

  function setButtonBusy(button, busy, busyText, idleText) {
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? busyText : idleText;
  }

  function makeUniqueId() {
    return window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    return extensions[file?.type] || "";
  }

  function isVideoUrl(url) {
    return /\.(mp4|webm|mov)(?:[?#].*)?$/i.test(url || "");
  }

  async function getSignedInUser() {
    if (!client?.auth) return null;
    const { data, error } = await client.auth.getUser();
    if (error) {
      console.error("GARAGE authentication error:", error.message);
      return null;
    }
    return data.user || null;
  }

  function updateAuthUI() {
    const signedIn = Boolean(currentUser);
    document.documentElement.dataset.authState =
      signedIn ? "signed-in" : "guest";

    document.querySelectorAll("[data-auth-only]").forEach((element) => {
      element.hidden = !signedIn;
    });

    document.querySelectorAll("[data-guest-only]").forEach((element) => {
      element.hidden = signedIn;
    });

    const status = $("account-status");
    if (status) {
      status.textContent = signedIn
        ? `Signed in as ${getDisplayName(currentProfile, currentUser.id)}`
        : "Browsing as a guest";
    }

    if ($("auth-link")) $("auth-link").hidden = signedIn;
    if ($("logout-btn")) $("logout-btn").hidden = !signedIn;
    if ($("guestPostPrompt")) $("guestPostPrompt").hidden = signedIn;
    if ($("guestMarketPrompt")) $("guestMarketPrompt").hidden = signedIn;
  }

  async function loadCurrentUser() {
    currentUser = null;
    currentProfile = null;

    if (!client?.auth) {
      console.error("GARAGE: Supabase client is unavailable.");
      updateAuthUI();
      return null;
    }

    const { data, error } = await client.auth.getSession();
    if (error) console.error("GARAGE session error:", error.message);

    currentUser = data?.session?.user || null;

    if (currentUser) {
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("id, username, display_name, bio, favorite_car, avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) {
        console.error("GARAGE profile error:", profileError.message);
      }
      currentProfile = profile || null;
    }

    updateAuthUI();
    return currentUser;
  }

  function watchAuthenticationChanges() {
    if (!client?.auth || authSubscription) return;

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      currentUser = nextUser;
      currentProfile = null;
      likedPostIds = new Set();
      activeConversationId = null;
      messageLoadNumber++;

      // Defer network requests until the auth callback has returned.
      Promise.resolve().then(async () => {
        if (nextUser) {
          const { data: profile, error } = await client
            .from("profiles")
            .select("id, username, display_name, bio, favorite_car, avatar_url")
            .eq("id", nextUser.id)
            .maybeSingle();

          if (error) {
            console.error("GARAGE profile refresh error:", error.message);
          }
          if (currentUser?.id !== nextUser.id) return;
          currentProfile = profile || null;
        }

        updateAuthUI();
        await loadCommunityPosts();

        if ($("messageTo")) {
          await loadMessageMembers();
        } else {
          showConversationMessage("Please sign in to use private messages.");
        }
      });
    });

    authSubscription = data?.subscription || null;
  }

  async function loadCommunityPosts() {
    if (!$("feed")) return;

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
      const postIds = posts.map((post) => post.id);
      const userIds = [...new Set(
        posts.map((post) => post.user_id).filter(Boolean)
      )];

      const profilesById = {};
      const likesByPost = {};
      const commentsByPost = {};
      const userLikes = new Set();

      posts.forEach((post) => {
        likesByPost[post.id] = 0;
        commentsByPost[post.id] = [];
      });

      if (userIds.length) {
        const { data: profiles, error: profileError } = await client
          .from("profiles")
          .select("id, username, display_name, avatar_url, favorite_car")
          .in("id", userIds);

        if (profileError) {
          console.warn("GARAGE author lookup:", profileError.message);
        }

        (profiles || []).forEach((profile) => {
          profilesById[profile.id] = profile;
        });
      }

      if (postIds.length) {
        const { data: likes, error: likesError } = await client
          .from("post_likes")
          .select("post_id, user_id")
          .in("post_id", postIds);

        if (likesError) throw likesError;

        (likes || []).forEach((like) => {
          likesByPost[like.post_id] =
            (likesByPost[like.post_id] || 0) + 1;

          if (currentUser && like.user_id === currentUser.id) {
            userLikes.add(like.post_id);
          }
        });

        const { data: comments, error: commentsError } = await client
          .from("post_comments")
          .select("id, post_id, user_id, content, created_at")
          .in("post_id", postIds)
          .order("created_at", { ascending: true });

        if (commentsError) throw commentsError;

        const commentUserIds = [...new Set(
          (comments || []).map((comment) => comment.user_id).filter(Boolean)
        )];

        const commentProfiles = {};

        if (commentUserIds.length) {
          const { data: profiles, error: cpError } = await client
            .from("profiles")
            .select("id, username, display_name")
            .in("id", commentUserIds);

          if (cpError) {
            console.warn("GARAGE comment author lookup:", cpError.message);
          }

          (profiles || []).forEach((profile) => {
            commentProfiles[profile.id] = profile;
          });
        }

        (comments || []).forEach((comment) => {
          const profile = commentProfiles[comment.user_id];

          commentsByPost[comment.post_id].push({
            id: comment.id,
            userId: comment.user_id,
            author: profile?.display_name ||
              profile?.username || "Garage Member",
            text: comment.content,
            createdAt: comment.created_at
          });
        });
      }

      communityPosts = posts.map((post) => ({
        ...post,
        authorProfile: profilesById[post.user_id] || null
      }));

      postLikeCounts = likesByPost;
      postComments = commentsByPost;
      likedPostIds = userLikes;

      renderFeed();
    } catch (error) {
      console.error("GARAGE community feed error:", error);
      showStatus(
        "Could not load community posts: " +
        (error.message || "Unknown error")
      );
    }
  }

  function renderPostMedia(mediaUrl) {
    if (!mediaUrl) return "";
    const safeUrl = escapeHTML(mediaUrl);

    return isVideoUrl(mediaUrl)
      ? `<video class="post-media" controls playsinline preload="metadata" src="${safeUrl}"></video>`
      : `<img class="post-media" loading="lazy" src="${safeUrl}" alt="Photo shared in the GARAGE community">`;
  }

  function renderFeed() {
    const feed = $("feed");
    if (!feed) return;

    const query = ($("search")?.value || "").trim().toLowerCase();

    const visiblePosts = communityPosts.filter((post) => {
      const profile = post.authorProfile;

      return [
        getDisplayName(profile, post.user_id),
        profile?.favorite_car || "",
        profile?.username || "",
        post.caption || ""
      ].join(" ").toLowerCase().includes(query);
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

      const avatar = profile?.avatar_url
        ? `<img class="avatar" src="${escapeHTML(profile.avatar_url)}" alt="${escapeHTML(name)}'s avatar" loading="lazy" style="object-fit:cover;">`
        : `<div class="avatar" aria-hidden="true">${makeInitials(name)}</div>`;

      const caption = post.caption
        ? `<div class="post-copy">${escapeHTML(post.caption).replace(/\n/g, "<br>")}</div>`
        : "";

      const comments = postComments[post.id] || [];

      const commentsHTML = comments.map((comment) => `
        <div class="comment">
          <strong>${escapeHTML(comment.author)}:</strong>
          ${escapeHTML(comment.text).replace(/\n/g, "<br>")}
          <small class="muted">${escapeHTML(formatDate(comment.createdAt))}</small>
        </div>
      `).join("");

      const liked = likedPostIds.has(post.id);

      const commentControls = currentUser
        ? `<form class="comment-form" data-comment="${escapeHTML(post.id)}">
             <input name="comment" type="text" maxlength="1000" placeholder="Write a comment..." aria-label="Write a comment" required>
             <button class="action" type="submit">Send</button>
           </form>`
        : `<p class="guest-inline"><a href="auth.html">Sign in</a> to leave a comment.</p>`;

      return `
        <article class="post" data-post-id="${escapeHTML(post.id)}">
          <div class="post-head">
            ${avatar}
            <div>
              <strong>${escapeHTML(name)}</strong>
              <p class="muted">
                ${escapeHTML(profile?.favorite_car || "Car enthusiast")}
                ${post.created_at ? ` · ${escapeHTML(formatDate(post.created_at))}` : ""}
              </p>
            </div>
          </div>

          ${caption}
          ${renderPostMedia(post.image_url)}

          <div class="post-actions">
            <button class="action ${liked ? "liked" : ""}" type="button"
              data-like="${escapeHTML(post.id)}"
              aria-pressed="${liked ? "true" : "false"}"
              ${currentUser ? "" : 'title="Sign in to like posts"'}>
              ${liked ? "♥ Liked" : "♡ Like"} · ${postLikeCounts[post.id] || 0}
            </button>

            <button class="action" type="button"
              data-focus-comment="${escapeHTML(post.id)}">
              Comments · ${comments.length}
            </button>
          </div>

          <div class="comment-list">${commentsHTML}</div>
          ${commentControls}
        </article>
      `;
    }).join("");
  }

  function clearMediaPreview({ clearInput = true } = {}) {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);

    mediaPreviewUrl = "";
    selectedMedia = null;

    if (clearInput && $("postMedia")) $("postMedia").value = "";
    if ($("fileName")) $("fileName").textContent = "No media selected";
    $("mediaPreview")?.replaceChildren();
  }

  function setupMediaPicker() {
    const input = $("postMedia");
    if (!input) return;

    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;
      clearMediaPreview({ clearInput: false });
      if (!file) return;

      if (!getFileExtension(file)) {
        input.value = "";
        notify("Use JPG, PNG, WebP, GIF, MP4, WebM, or MOV.");
        return;
      }

      if (file.size > 8 * 1024 * 1024) {
        input.value = "";
        notify("Choose a photo or video no larger than 8 MB.");
        return;
      }

      selectedMedia = file;
      mediaPreviewUrl = URL.createObjectURL(file);

      if ($("fileName")) $("fileName").textContent = file.name;

      const preview = $("mediaPreview");
      if (!preview) return;

      preview.replaceChildren();

      const element = document.createElement(
        file.type.startsWith("video/") ? "video" : "img"
      );

      if (element.tagName === "VIDEO") {
        element.controls = true;
        element.playsInline = true;
        element.preload = "metadata";
      } else {
        element.alt = "Selected media preview";
      }

      element.className = "post-media";
      element.src = mediaPreviewUrl;
      preview.appendChild(element);
    });
  }

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

    const { data, error: sessionError } = await client.auth.getSession();

    if (sessionError) {
      notify("Could not check your login. Please try again.");
      return;
    }

    const user = data?.session?.user;

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
        const extension = getFileExtension(selectedMedia);
        if (!extension) throw new Error("Unsupported media type.");

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
        if (!mediaUrl) throw new Error("Could not create the media URL.");
      }

      const { error: insertError } = await client.from("posts").insert({
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
      setButtonBusy(button, false, "Publishing...", "Publish post ↗");
    }
  }

  function setupFeedInteractions() {
    const feed = $("feed");
    if (!feed) return;

    feed.addEventListener("click", async (event) => {
      const likeButton = event.target.closest("[data-like]");
      const commentButton = event.target.closest("[data-focus-comment]");

      if (likeButton) {
        event.preventDefault();
        if (likeButton.disabled) return;

        const user = await getSignedInUser();

        if (!user) {
          notify("Please sign in to like posts.");
          return;
        }

        const postId = likeButton.dataset.like;
        const wasLiked = likedPostIds.has(postId);
        likeButton.disabled = true;

        try {
          if (wasLiked) {
            const { error } = await client.from("post_likes")
              .delete()
              .eq("post_id", postId)
              .eq("user_id", user.id);

            if (error) throw error;

            likedPostIds.delete(postId);
            postLikeCounts[postId] = Math.max(
              0, (postLikeCounts[postId] || 0) - 1
            );
          } else {
            const { error } = await client.from("post_likes").insert({
              post_id: postId,
              user_id: user.id
            });

            if (error && error.code !== "23505") throw error;
            if (!error) {
              postLikeCounts[postId] = (postLikeCounts[postId] || 0) + 1;
            }
            likedPostIds.add(postId);
          }

          renderFeed();
        } catch (error) {
          console.error("GARAGE like error:", error);
          notify("Could not update like: " + error.message);
        }

        return;
      }

      if (commentButton) {
        const postId = commentButton.dataset.focusComment;
        const form = Array.from(feed.querySelectorAll("[data-comment]"))
          .find((item) => item.dataset.comment === postId);

        form?.querySelector('input[name="comment"]')?.focus();
      }
    });

    feed.addEventListener("submit", async (event) => {
      const form = event.target.closest("form[data-comment]");
      if (!form) return;

      event.preventDefault();
      if (form.dataset.busy === "true") return;

      const user = await getSignedInUser();

      if (!user) {
        notify("Please sign in to comment.");
        return;
      }

      const input = form.elements.namedItem("comment");
      const content = input?.value.trim() || "";

      if (!content) return;

      if (content.length > 1000) {
        notify("Comments must be 1,000 characters or fewer.");
        return;
      }

      const postId = form.dataset.comment;
      const button = form.querySelector('button[type="submit"]');

      form.dataset.busy = "true";
      if (button) button.disabled = true;

      try {
        const { error } = await client.from("post_comments").insert({
          post_id: postId,
          user_id: user.id,
          content
        });

        if (error) throw error;

        input.value = "";
        await loadCommunityPosts();
        notify("Comment posted.");
      } catch (error) {
        console.error("GARAGE comment error:", error);
        notify("Could not post comment: " + error.message);
      } finally {
        form.dataset.busy = "false";
        if (button) button.disabled = false;
      }
    });
  }

  function renderMembers() {
    const container = $("members");
    if (!container) return;

    container.innerHTML = demoMembers.map((member) => {
      const following = followed.has(member.name);

      return `<div class="member">
        <div class="avatar" aria-hidden="true">${escapeHTML(member.avatar)}</div>
        <div class="member-name">
          <strong>${escapeHTML(member.name)}</strong>
          <small>${escapeHTML(member.car)}</small>
        </div>
        <button class="action ${following ? "following" : ""}" type="button"
          data-follow="${escapeHTML(member.name)}"
          aria-pressed="${following}">
          ${following ? "Following" : "Follow"}
        </button>
      </div>`;
    }).join("");
  }

  function setupMemberInteractions() {
    $("members")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-follow]");
      if (!button) return;

      const name = button.dataset.follow;
      if (followed.has(name)) followed.delete(name);
      else followed.add(name);

      renderMembers();
      notify(followed.has(name)
        ? `Following ${name} locally.`
        : `Unfollowed ${name} locally.`);
    });
  }

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
    $("listingForm")?.addEventListener("submit", (event) => {
      event.preventDefault();

      const name = $("carName")?.value.trim() || "";
      const price = Number($("carPrice")?.value);
      const details = $("carDetails")?.value.trim() || "";

      if (!name || !Number.isFinite(price) || price < 0) {
        notify("Enter a valid car name and price.");
        return;
      }

      listings.unshift({ name, price, details });
      event.currentTarget.reset();
      renderListings();
      notify("Demo listing added. It is not saved to Supabase.");
    });
  }

  function showConversationMessage(message, isError = false) {
    const conversation = $("conversation");
    if (!conversation) return;

    conversation.replaceChildren();
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = message;

    if (isError) p.style.color = "#ff7777";
    conversation.appendChild(p);
  }

  function memberLabel(profile) {
    return profile.display_name || profile.username ||
      `Member ${String(profile.id).slice(0, 6)}`;
  }

  async function loadMessageMembers() {
    const select = $("messageTo");
    if (!select || !client) return;

    const thisLoad = ++memberLoadNumber;
    const previousValue = select.value;

    select.disabled = true;
    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Loading members...";
    select.appendChild(placeholder);

    try {
      const user = await getSignedInUser();
      if (thisLoad !== memberLoadNumber) return;

      if (!user) {
        placeholder.textContent = "Sign in to message members";
        showConversationMessage("Please sign in to use private messages.");
        return;
      }

      const { data, error } = await client.from("profiles")
        .select("id, username, display_name")
        .neq("id", user.id)
        .order("username", { ascending: true });

      if (error) throw error;
      if (thisLoad !== memberLoadNumber) return;

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

      const requested = new URL(window.location.href).searchParams.get("to");
      const desired = requested || previousValue;
      const validRecipient = Array.from(select.options)
        .some((option) => option.value === desired);

      if (validRecipient && desired) {
        select.value = desired;
        await loadConversation();
      } else {
        activeConversationId = null;
        showConversationMessage("Choose a member to open a conversation.");
      }
    } catch (error) {
      if (thisLoad !== memberLoadNumber) return;

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
    const select = $("messageTo");
    if (!conversation || !select) return;

    const user = await getSignedInUser();

    if (!user) {
      activeConversationId = null;
      showConversationMessage("Please sign in to use private messages.");
      return;
    }

    const recipientId = select.value;

    if (!recipientId) {
      activeConversationId = null;
      messageLoadNumber++;
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
      const { data, error } = await client.from("messages")
        .select("id, sender_id, recipient_id, content, created_at, read_at")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${recipientId}),and(sender_id.eq.${recipientId},recipient_id.eq.${user.id})`
        )
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (thisLoad !== messageLoadNumber ||
          activeConversationId !== recipientId) return;

      const messages = data || [];
      conversation.replaceChildren();

      if (!messages.length) {
        const p = document.createElement("p");
        p.className = "muted";
        p.textContent = "No messages yet. Say hello!";
        conversation.appendChild(p);
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
        meta.textContent =
          `${message.sender_id === user.id ? "You" : "Member"} · ${formatDate(message.created_at)}${message.sender_id === user.id && message.read_at ? " · Read" : ""}`;

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
        const { error: readError } = await client.from("messages")
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
        showConversationMessage("Could not load messages: " + error.message, true);
      }
    }
  }

  function setupMessages() {
    const select = $("messageTo");
    const form = $("messageForm");

    select?.addEventListener("change", loadConversation);

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (messageBusy) return;

      const user = await getSignedInUser();

      if (!user) {
        notify("Please sign in to send private messages.");
        window.location.href = "auth.html";
        return;
      }

      const recipientId = select?.value || "";
      const input = $("messageText");
      const content = input?.value.trim() || "";

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

      const button = form.querySelector('button[type="submit"]');
      messageBusy = true;
      if (button) button.disabled = true;

      try {
        const { error } = await client.from("messages").insert({
          sender_id: user.id,
          recipient_id: recipientId,
          content
        });

        if (error) throw error;

        if (input) input.value = "";
        await loadConversation();
        notify("Message sent.");
      } catch (error) {
        console.error("GARAGE message send error:", error);
        notify("Could not send message: " + error.message);
      } finally {
        messageBusy = false;
        if (button) button.disabled = false;
      }
    });

    if (select && form) loadMessageMembers();
  }

  function showPage(pageName) {
    document.querySelectorAll(".page").forEach((section) => {
      section.classList.add("hidden");
    });

    const target = $(`${pageName}Page`);

    if (target) target.classList.remove("hidden");
    else console.warn(`GARAGE: Could not find page section "${pageName}Page".`);

    document.querySelectorAll(".sidebar .nav[data-page]").forEach((button) => {
      const active = button.dataset.page === pageName;
      button.classList.toggle("active", active);

      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
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
      $("postText")?.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    $("search")?.addEventListener("input", () => {
      renderFeed();
      if ($("search").value.trim()) showPage("feed");
    });
  }

  async function init() {
    setupNavigation();
    setupMediaPicker();
    setupListingForm();
    setupFeedInteractions();
    setupMemberInteractions();

    $("postForm")?.addEventListener("submit", publishPost);

    renderMembers();
    renderListings();

    if (!client) {
      console.error("GARAGE: Supabase client not found. Check supabase-client.js.");
      showStatus("Supabase client not found. Check supabase-client.js.");
      updateAuthUI();
      return;
    }

    await loadCurrentUser();
    watchAuthenticationChanges();
    setupMessages();
    await loadCommunityPosts();

    const params = new URLSearchParams(window.location.search);
    if (params.get("page") === "messages") showPage("messages");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.addEventListener("beforeunload", () => {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
  });
})();
          if (currentUser?.id !== nextUser.id) return;
          currentProfile = profile || null;
        }
        updateAuthUI();
        await loadCommunityPosts();
        if ($("messageTo")) await loadMessageMembers();
        else showConversationMessage("Please sign in to use private messages.");
      });
    });
    authSubscription = data?.subscription || null;
  }

  async function loadCommunityPosts() {
    if (!$("feed")) return;
    if (!client) {
      showStatus("Supabase is not initialized. Check supabase-client.js.");
      return;
    }

    showStatus("Loading community posts...");

    try {
      const { data, error } = await client.from("posts")
        .select("id, user_id, caption, image_url, created_at, is_community")
        .eq("is_community", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const posts = data || [];
      const postIds = posts.map((post) => post.id);
      const userIds = [...new Set(
        posts.map((post) => post.user_id).filter(Boolean)
      )];

      const profilesById = {};
      const likesByPost = {};
      const commentsByPost = {};
      const userLikes = new Set();

      posts.forEach((post) => {
        likesByPost[post.id] = 0;
        commentsByPost[post.id] = [];
      });

      if (userIds.length) {
        const { data: profiles, error: profileError } = await client
          .from("profiles")
          .select("id, username, display_name, avatar_url, favorite_car")
          .in("id", userIds);

        if (profileError) {
          console.warn("GARAGE author lookup:", profileError.message);
        }

        (profiles || []).forEach((profile) => {
          profilesById[profile.id] = profile;
        });
      }

      if (postIds.length) {
        const { data: likes, error: likesError } = await client
          .from("post_likes")
          .select("post_id, user_id")
          .in("post_id", postIds);

        if (likesError) throw likesError;

        (likes || []).forEach((like) => {
          likesByPost[like.post_id] =
            (likesByPost[like.post_id] || 0) + 1;

          if (currentUser && like.user_id === currentUser.id) {
            userLikes.add(like.post_id);
          }
        });

        const { data: comments, error: commentsError } = await client
          .from("post_comments")
          .select("id, post_id, user_id, content, created_at")
          .in("post_id", postIds)
          .order("created_at", { ascending: true });

        if (commentsError) throw commentsError;

        const commentUserIds = [...new Set(
          (comments || []).map((comment) => comment.user_id).filter(Boolean)
        )];

        const commentProfiles = {};

        if (commentUserIds.length) {
          const { data: profiles, error: profileError } = await client
            .from("profiles")
            .select("id, username, display_name")
            .in("id", commentUserIds);

          if (profileError) {
            console.warn("GARAGE comment author lookup:", profileError.message);
          }

          (profiles || []).forEach((profile) => {
            commentProfiles[profile.id] = profile;
          });
        }

        (comments || []).forEach((comment) => {
          const profile = commentProfiles[comment.user_id];

          commentsByPost[comment.post_id].push({
            id: comment.id,
            userId: comment.user_id,
            author: profile?.display_name ||
              profile?.username ||
              "Garage Member",
            text: comment.content,
            createdAt: comment.created_at
          });
        });
      }

      communityPosts = posts.map((post) => ({
        ...post,
        authorProfile: profilesById[post.user_id] || null
      }));

      postLikeCounts = likesByPost;
      postComments = commentsByPost;
      likedPostIds = userLikes;

      renderFeed();
    } catch (error) {
      console.error("GARAGE community feed error:", error);
      showStatus(
        "Could not load community posts: " +
        (error.message || "Unknown error")
      );
    }
  }

  function renderPostMedia(mediaUrl) {
    if (!mediaUrl) return "";

    const safeUrl = escapeHTML(mediaUrl);

    return isVideoUrl(mediaUrl)
      ? `<video class="post-media" controls playsinline preload="metadata" src="${safeUrl}"></video>`
      : `<img class="post-media" loading="lazy" src="${safeUrl}" alt="Photo shared in the GARAGE community">`;
  }

  function renderFeed() {
    const feed = $("feed");
    if (!feed) return;

    const query = ($("search")?.value || "").trim().toLowerCase();

    const visiblePosts = communityPosts.filter((post) => {
      const profile = post.authorProfile;

      return [
        getDisplayName(profile, post.user_id),
        profile?.favorite_car || "",
        profile?.username || "",
        post.caption || ""
      ].join(" ").toLowerCase().includes(query);
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

      const avatar = profile?.avatar_url
        ? `<img class="avatar" src="${escapeHTML(profile.avatar_url)}" alt="${escapeHTML(name)}'s avatar" loading="lazy" style="object-fit:cover;">`
        : `<div class="avatar" aria-hidden="true">${makeInitials(name)}</div>`;

      const caption = post.caption
        ? `<div class="post-copy">${escapeHTML(post.caption).replace(/\n/g, "<br>")}</div>`
        : "";

      const comments = postComments[post.id] || [];

      const commentsHTML = comments.map((comment) => `
        <div class="comment">
          <strong>${escapeHTML(comment.author)}:</strong>
          ${escapeHTML(comment.text).replace(/\n/g, "<br>")}
          <small class="muted">${escapeHTML(formatDate(comment.createdAt))}</small>
        </div>
      `).join("");

      const liked = likedPostIds.has(post.id);

      const commentControls = currentUser
        ? `<form class="comment-form" data-comment="${escapeHTML(post.id)}">
             <input name="comment" type="text" maxlength="1000"
               placeholder="Write a comment..."
               aria-label="Write a comment" required>
             <button class="action" type="submit">Send</button>
           </form>`
        : `<p class="guest-inline"><a href="auth.html">Sign in</a> to leave a comment.</p>`;

      return `
        <article class="post" data-post-id="${escapeHTML(post.id)}">
          <div class="post-head">
            ${avatar}
            <div>
              <strong>${escapeHTML(name)}</strong>
              <p class="muted">
                ${escapeHTML(profile?.favorite_car || "Car enthusiast")}
                ${post.created_at
                  ? ` · ${escapeHTML(formatDate(post.created_at))}`
                  : ""}
              </p>
            </div>
          </div>

          ${caption}
          ${renderPostMedia(post.image_url)}

          <div class="post-actions">
            <button class="action ${liked ? "liked" : ""}"
              type="button"
              data-like="${escapeHTML(post.id)}"
              aria-pressed="${liked ? "true" : "false"}"
              ${currentUser ? "" : 'title="Sign in to like posts"'}>
              ${liked ? "♥ Liked" : "♡ Like"} · ${postLikeCounts[post.id] || 0}
            </button>

            <button class="action" type="button"
              data-focus-comment="${escapeHTML(post.id)}">
              Comments · ${comments.length}
            </button>
          </div>

          <div class="comment-list">${commentsHTML}</div>
          ${commentControls}
        </article>
      `;
    }).join("");
  }

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

    $("mediaPreview")?.replaceChildren();
  }

  function setupMediaPicker() {
    const input = $("postMedia");
    if (!input) return;

    input.addEventListener("change", (event) => {
      const file = event.target.files?.[0] || null;

      clearMediaPreview({ clearInput: false });

      if (!file) return;

      if (!getFileExtension(file)) {
        input.value = "";
        notify("Use JPG, PNG, WebP, GIF, MP4, WebM, or MOV.");
        return;
      }

      if (file.size > 8 * 1024 * 1024) {
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
      } else {
        element = document.createElement("img");
        element.alt = "Selected media preview";
      }

      element.src = mediaPreviewUrl;
      element.className = "post-media";
      preview.appendChild(element);
    });
  }
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

    const { data, error: sessionError } = await client.auth.getSession();

    if (sessionError) {
      notify("Could not check your login. Please try again.");
      return;
    }

    const user = data?.session?.user;

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

      const { error: insertError } = await client.from("posts").insert({
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
          console.warn(
            "GARAGE upload cleanup error:",
            cleanupError.message
          );
        }
      }

      notify("Could not publish: " + (error.message || "Unknown error."));
    } finally {
      isPublishingPost = false;

      setButtonBusy(
        button,
        false,
        "Publishing...",
        "Publish post ↗"
      );
    }
  }

  function setupFeedInteractions() {
    const feed = $("feed");
    if (!feed) return;

    feed.addEventListener("click", async (event) => {
      const likeButton = event.target.closest("[data-like]");
      const commentButton = event.target.closest("[data-focus-comment]");

      if (likeButton) {
        event.preventDefault();

        if (likeButton.disabled) return;

        const user = await getSignedInUser();

        if (!user) {
          notify("Please sign in to like posts.");
          return;
        }

        const postId = likeButton.dataset.like;
        const wasLiked = likedPostIds.has(postId);

        likeButton.disabled = true;

        try {
          if (wasLiked) {
            const { error } = await client
              .from("post_likes")
              .delete()
              .eq("post_id", postId)
              .eq("user_id", user.id);

            if (error) throw error;

            likedPostIds.delete(postId);

            postLikeCounts[postId] = Math.max(
              0,
              (postLikeCounts[postId] || 0) - 1
            );
          } else {
            const { error } = await client
              .from("post_likes")
              .insert({
                post_id: postId,
                user_id: user.id
              });

            if (error && error.code !== "23505") {
              throw error;
            }

            if (!error) {
              postLikeCounts[postId] =
                (postLikeCounts[postId] || 0) + 1;
            }

            likedPostIds.add(postId);
          }

          renderFeed();
        } catch (error) {
          console.error("GARAGE like error:", error);
          notify("Could not update like: " + error.message);
        }

        return;
      }

      if (commentButton) {
        const postId = commentButton.dataset.focusComment;

        const form = Array.from(
          feed.querySelectorAll("[data-comment]")
        ).find((item) => item.dataset.comment === postId);

        form?.querySelector('input[name="comment"]')?.focus();
      }
    });

    feed.addEventListener("submit", async (event) => {
      const form = event.target.closest("form[data-comment]");
      if (!form) return;

      event.preventDefault();

      if (form.dataset.busy === "true") return;

      const user = await getSignedInUser();

      if (!user) {
        notify("Please sign in to comment.");
        return;
      }

      const input = form.elements.namedItem("comment");
      const content = input?.value.trim() || "";

      if (!content) return;

      if (content.length > 1000) {
        notify("Comments must be 1,000 characters or fewer.");
        return;
      }

      const postId = form.dataset.comment;
      const button = form.querySelector('button[type="submit"]');

      form.dataset.busy = "true";

      if (button) button.disabled = true;

      try {
        const { error } = await client.from("post_comments").insert({
          post_id: postId,
          user_id: user.id,
          content
        });

        if (error) throw error;

        input.value = "";

        await loadCommunityPosts();

        notify("Comment posted.");
      } catch (error) {
        console.error("GARAGE comment error:", error);
        notify("Could not post comment: " + error.message);
      } finally {
        form.dataset.busy = "false";

        if (button) button.disabled = false;
      }
    });
  }

  function renderMembers() {
    const container = $("members");
    if (!container) return;

    container.innerHTML = demoMembers.map((member) => {
      const following = followed.has(member.name);

      return `
        <div class="member">
          <div class="avatar" aria-hidden="true">
            ${escapeHTML(member.avatar)}
          </div>

          <div class="member-name">
            <strong>${escapeHTML(member.name)}</strong>
            <small>${escapeHTML(member.car)}</small>
          </div>

          <button
            class="action ${following ? "following" : ""}"
            type="button"
            data-follow="${escapeHTML(member.name)}"
            aria-pressed="${following}">
            ${following ? "Following" : "Follow"}
          </button>
        </div>
      `;
    }).join("");
  }

  function setupMemberInteractions() {
    $("members")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-follow]");
      if (!button) return;

      const name = button.dataset.follow;

      if (followed.has(name)) {
        followed.delete(name);
      } else {
        followed.add(name);
      }

      renderMembers();

      notify(
        followed.has(name)
          ? `Following ${name} locally.`
          : `Unfollowed ${name} locally.`
      );
    });
  }

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
    $("listingForm")?.addEventListener("submit", (event) => {
      event.preventDefault();

      const name = $("carName")?.value.trim() || "";
      const price = Number($("carPrice")?.value);
      const details = $("carDetails")?.value.trim() || "";

      if (!name || !Number.isFinite(price) || price < 0) {
        notify("Enter a valid car name and price.");
        return;
      }

      listings.unshift({ name, price, details });

      event.currentTarget.reset();

      renderListings();

      notify("Demo listing added. It is not saved to Supabase.");
    });
  }

  function showConversationMessage(message, isError = false) {
    const conversation = $("conversation");
    if (!conversation) return;

    conversation.replaceChildren();

    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = message;

    if (isError) {
      p.style.color = "#ff7777";
    }

    conversation.appendChild(p);
  }

  function memberLabel(profile) {
    return profile.display_name ||
      profile.username ||
      `Member ${String(profile.id).slice(0, 6)}`;
  }

  async function loadMessageMembers() {
    const select = $("messageTo");
    if (!select || !client) return;

    const thisLoad = ++memberLoadNumber;
    const previousValue = select.value;

    select.disabled = true;
    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Loading members...";

    select.appendChild(placeholder);

    try {
      const user = await getSignedInUser();

      if (thisLoad !== memberLoadNumber) return;

      if (!user) {
        placeholder.textContent = "Sign in to message members";

        showConversationMessage(
          "Please sign in to use private messages."
        );

        return;
      }

      const { data, error } = await client
        .from("profiles")
        .select("id, username, display_name")
        .neq("id", user.id)
        .order("username", { ascending: true });

      if (error) throw error;
      if (thisLoad !== memberLoadNumber) return;

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

      const requested = new URL(window.location.href)
        .searchParams.get("to");

      const desired = requested || previousValue;

      const validRecipient = Array.from(select.options)
        .some((option) => option.value === desired);

      if (validRecipient && desired) {
        select.value = desired;
        await loadConversation();
      } else {
        activeConversationId = null;

        showConversationMessage(
          "Choose a member to open a conversation."
        );
      }
    } catch (error) {
      if (thisLoad !== memberLoadNumber) return;

      console.error("GARAGE member list error:", error);

      select.replaceChildren();

      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Could not load members";

      select.appendChild(option);

      showConversationMessage(
        "Could not load members: " + error.message,
        true
      );
    }
  }
