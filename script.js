
/* =========================================================
   GARAGE — MAIN WEBSITE SCRIPT
   Supabase:
     - Authentication state and profiles
     - Public community feed
     - Photo/video uploads
     - Persistent likes and comments
     - Private conversations and read status

   Browser demo only:
     - Follows
     - Marketplace listings

   Required:
     - window.garageSupabase initialized before this file
     - Supabase tables and RLS policies described below
     - Public Storage bucket: post-images
========================================================= */
"use strict";

(() => {
  if (window.garageMainScriptLoaded) return;
  window.garageMainScriptLoaded = true;

  const $ = (id) => document.getElementById(id);
  const client = window.garageSupabase;

  if (!client) {
    console.error(
      "GARAGE: window.garageSupabase is missing. Load your Supabase client before script.js."
    );
    return;
  }

  const STORAGE_KEYS = {
    follows: "garage_demo_follows_v1",
    listings: "garage_demo_listings_v1"
  };

  const state = {
    user: null,
    profile: null,
    profiles: [],
    posts: [],
    activeConversationId: null,
    activeRecipientId: null,
    messageChannel: null,
    feedChannel: null,
    messageLoadToken: 0,
    busy: false
  };

  const escapeHTML = (value = "") =>
    String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);

  const textOf = (value) => String(value ?? "").trim();

  function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value ?? "";
  }

  function toast(message) {
    const element = $("toast");
    if (element) {
      element.textContent = message;
      element.hidden = false;
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => {
        element.hidden = true;
      }, 3500);
    } else {
      console.info("GARAGE:", message);
    }
  }

  function setBusy(form, busy, buttonText = "Please wait…") {
    if (!form) return;
    const submit = form.querySelector('[type="submit"]');
    if (!submit) return;

    if (busy) {
      submit.dataset.originalText = submit.textContent;
      submit.disabled = true;
      submit.textContent = buttonText;
    } else {
      submit.disabled = false;
      if (submit.dataset.originalText) {
        submit.textContent = submit.dataset.originalText;
        delete submit.dataset.originalText;
      }
    }
  }

  function getLocal(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function setLocal(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("GARAGE: Could not save demo data.", error);
      toast("Browser storage is unavailable.");
    }
  }

  function currentUserId() {
    return state.user?.id ?? null;
  }

  function requireUser() {
    if (!state.user) {
      toast("Please sign in to use this feature.");
      return false;
    }
    return true;
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleString();
  }

  function initials(name = "G") {
    return textOf(name)
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || "")
      .join("")
      .toUpperCase() || "G";
  }

  function profileName(profile) {
    return profile?.display_name ||
      profile?.username ||
      profile?.email ||
      "GARAGE member";
  }

  function profileLabel(profile) {
    const name = profileName(profile);
    return profile?.username && profile?.username !== name
      ? `${name} (@${profile.username})`
      : name;
  }

  function mediaHTML(url, type) {
    if (!url) return "";
    const safeURL = escapeHTML(url);

    if (type === "video") {
      return `<video class="post-media" src="${safeURL}" controls preload="metadata"></video>`;
    }

    return `<img class="post-media" src="${safeURL}" alt="Community post media" loading="lazy">`;
  }

  function renderAuth() {
    const signedIn = Boolean(state.user);
    const name = profileName(state.profile || {
      email: state.user?.email
    });

    document.documentElement.dataset.authState =
      signedIn ? "signed-in" : "guest";

    document.querySelectorAll("[data-auth-only]").forEach((element) => {
      element.hidden = !signedIn;
    });

    document.querySelectorAll("[data-guest-only]").forEach((element) => {
      element.hidden = signedIn;
    });

    setText(
      "account-status",
      signedIn ? `Signed in as ${name}` : "Not signed in"
    );

    const authLink = $("auth-link");
    if (authLink) {
      authLink.textContent = signedIn ? name : "Sign in";
      authLink.hidden = signedIn;
    }

    const logoutButton = $("logout-btn");
    if (logoutButton) logoutButton.hidden = !signedIn;

    const profileButton = $("profileBtn");
    if (profileButton) {
      profileButton.textContent = signedIn ? name : "Profile";
    }

    const guestPostPrompt = $("guestPostPrompt");
    if (guestPostPrompt) guestPostPrompt.hidden = signedIn;

    const guestMarketPrompt = $("guestMarketPrompt");
    if (guestMarketPrompt) guestMarketPrompt.hidden = signedIn;

    updateMessageRecipientOptions();
  }

  async function loadProfile() {
    if (!state.user) {
      state.profile = null;
      renderAuth();
      return;
    }

    const { data, error } = await client
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url")
      .eq("id", state.user.id)
      .maybeSingle();

    if (error) {
      console.error("GARAGE profile load:", error);
      state.profile = {
        id: state.user.id,
        username: state.user.email?.split("@")[0] || "member",
        display_name: state.user.email || "GARAGE member"
      };
      renderAuth();
      return;
    }

    state.profile = data;

    // Create a basic profile if this account has none yet.
    if (!data) {
      const username = (
        state.user.user_metadata?.username ||
        state.user.email?.split("@")[0] ||
        `member_${state.user.id.slice(0, 8)}`
      ).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 30);

      const { data: created, error: insertError } = await client
        .from("profiles")
        .upsert({
          id: state.user.id,
          username,
          display_name:
            state.user.user_metadata?.display_name ||
            state.user.email?.split("@")[0] ||
            "GARAGE member"
        }, { onConflict: "id" })
        .select("id, username, display_name, bio, avatar_url")
        .maybeSingle();

      if (insertError) {
        console.warn("GARAGE profile creation:", insertError.message);
      } else {
        state.profile = created;
      }
    }

    renderAuth();
  }

  async function loadProfiles() {
    const { data, error } = await client
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .order("username", { ascending: true })
      .limit(500);

    if (error) {
      console.error("GARAGE member directory:", error);
      return;
    }

    state.profiles = data || [];
    renderMembers();
    updateMessageRecipientOptions();
  }

  function renderMembers() {
    const members = $("members");
    const directory = $("memberDirectory");

    const html = state.profiles
      .filter((profile) => profile.id !== currentUserId())
      .map((profile) => `
        <article class="member-card">
          <div class="member-avatar">${escapeHTML(initials(profileName(profile)))}</div>
          <div class="member-info">
            <strong>${escapeHTML(profileName(profile))}</strong>
            <div>@${escapeHTML(profile.username || "member")}</div>
          </div>
          <button type="button"
            data-message-member="${escapeHTML(profile.id)}">
            Message
          </button>
          <button type="button"
            data-follow-member="${escapeHTML(profile.id)}">
            ${getLocal(STORAGE_KEYS.follows, []).includes(profile.id)
              ? "Unfollow" : "Follow"}
          </button>
        </article>
      `).join("");

    if (members) members.innerHTML = html || "<p>No other members found.</p>";
    if (directory) directory.innerHTML = html || "<p>No other members found.</p>";
  }

  function updateMessageRecipientOptions() {
    const select = $("messageTo");
    if (!select) return;

    const previousValue = select.value;
    const options = state.profiles
      .filter((profile) => profile.id !== currentUserId())
      .map((profile) => `
        <option value="${escapeHTML(profile.id)}">
          ${escapeHTML(profileLabel(profile))}
        </option>
      `).join("");

    select.innerHTML =
      `<option value="">Choose a member…</option>${options}`;

    if (state.profiles.some((p) => p.id === previousValue)) {
      select.value = previousValue;
    }
  }

  // -------------------- Public community feed --------------------

  async function loadFeed() {
    const feed = $("feed");
    if (!feed) return;

    feed.innerHTML = "<p>Loading community posts…</p>";

   const { data, error } = await client
  .from("posts")
  .select(`
    id,
    user_id,
    content,
    media_url,
    media_type,
    created_at,
    likes(user_id),
    comments(
      id,
      user_id,
      content,
      created_at
    )
  `)
  .order("created_at", { ascending: false })
  .limit(100);

    if (error) {
      console.error("GARAGE feed:", error);
      feed.innerHTML = "<p>Could not load posts. Check Supabase tables and RLS.</p>";
      return;
    }

    state.posts = data || [];
    renderFeed();
  }

  function renderFeed() {
    const feed = $("feed");
    if (!feed) return;

    const userId = currentUserId();

    if (!state.posts.length) {
      feed.innerHTML = "<p>No posts yet. Be the first to share something.</p>";
      return;
    }

    feed.innerHTML = state.posts.map((post) => {
      const author = post.profiles || {};
      const likes = post.likes || [];
      const comments = post.comments || [];
      const liked = likes.some((like) => like.user_id === userId);

      return `
        <article class="community-post" data-post-id="${escapeHTML(post.id)}">
          <header class="post-header">
            <div class="member-avatar">
              ${escapeHTML(initials(profileName(author)))}
            </div>
            <div>
              <strong>${escapeHTML(profileName(author))}</strong>
              <div class="post-date">${escapeHTML(formatDate(post.created_at))}</div>
            </div>
          </header>

          ${post.content
            ? `<p class="post-content">${escapeHTML(post.content).replace(/\n/g, "<br>")}</p>`
            : ""}

          ${mediaHTML(post.media_url, post.media_type)}

          <div class="post-actions">
            <button type="button" data-like-post="${escapeHTML(post.id)}"
              ${!userId ? 'title="Sign in to like"' : ""}>
              ${liked ? "♥ Liked" : "♡ Like"} (${likes.length})
            </button>
            <span>${comments.length} comment${comments.length === 1 ? "" : "s"}</span>
          </div>

          <div class="post-comments">
            ${comments.map((comment) => `
              <div class="post-comment">
                <strong>${escapeHTML(
                  profileName(comment.profiles || {})
                )}</strong>
                ${escapeHTML(comment.content)}
              </div>
            `).join("")}
          </div>

          <form data-comment-form="${escapeHTML(post.id)}" class="comment-form">
            <input name="comment" type="text" maxlength="2000"
              placeholder="${userId ? "Write a comment…" : "Sign in to comment"}"
              required ${userId ? "" : "disabled"}>
            <button type="submit" ${userId ? "" : "disabled"}>Comment</button>
          </form>
        </article>
      `;
    }).join("");
  }

  async function createPost(event) {
    event.preventDefault();
    if (!requireUser()) return;

    const form = event.currentTarget;
    const content = textOf($("postText")?.value);
    const file = $("postMedia")?.files?.[0];

    if (!content && !file) {
      toast("Write something or select a photo/video.");
      return;
    }

    setBusy(form, true, "Publishing…");

    try {
      let mediaURL = null;
      let mediaType = null;

      if (file) {
        const allowed = [
          "image/jpeg", "image/png", "image/webp", "image/gif",
          "video/mp4", "video/webm", "video/quicktime"
        ];

        if (!allowed.includes(file.type)) {
          throw new Error("Choose a supported image or video file.");
        }

        const maxBytes = file.type.startsWith("video/")
          ? 50 * 1024 * 1024
          : 10 * 1024 * 1024;

        if (file.size > maxBytes) {
          throw new Error(file.type.startsWith("video/")
            ? "Videos must be 50 MB or smaller."
            : "Images must be 10 MB or smaller.");
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${state.user.id}/${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await client.storage
          .from("post-images")
          .upload(path, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type
          });

        if (uploadError) throw uploadError;

        const { data: publicData } = client.storage
          .from("post-images")
          .getPublicUrl(path);

        mediaURL = publicData.publicUrl;
        mediaType = file.type.startsWith("video/") ? "video" : "image";
      }

      const { error } = await client.from("posts").insert({
        user_id: state.user.id,
        content: content || "",
        media_url: mediaURL,
        media_type: mediaType
      });

      if (error) throw error;

      form.reset();
      if ($("fileName")) $("fileName").textContent = "No file selected";
      if ($("mediaPreview")) $("mediaPreview").innerHTML = "";

      toast("Post published.");
      await loadFeed();
    } catch (error) {
      console.error("GARAGE publish post:", error);
      toast(error.message || "Could not publish the post.");
    } finally {
      setBusy(form, false);
    }
  }

  async function toggleLike(postId) {
    if (!requireUser()) return;

    const existingPost = state.posts.find((post) => post.id === postId);
    const alreadyLiked = (existingPost?.likes || [])
      .some((like) => like.user_id === state.user.id);

    if (alreadyLiked) {
      const { error } = await client.from("likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", state.user.id);

      if (error) {
        console.error("GARAGE unlike:", error);
        toast("Could not remove like.");
        return;
      }
    } else {
      const { error } = await client.from("likes").insert({
        post_id: postId,
        user_id: state.user.id
      });

      if (error && error.code !== "23505") {
        console.error("GARAGE like:", error);
        toast("Could not like this post.");
        return;
      }
    }

    await loadFeed();
  }

  async function addComment(postId, content) {
    if (!requireUser()) return;

    const { error } = await client.from("comments").insert({
      post_id: postId,
      user_id: state.user.id,
      content
    });

    if (error) {
      console.error("GARAGE comment:", error);
      toast("Could not add comment.");
      return;
    }

    await loadFeed();
  }

  function setupMediaPreview() {
    const input = $("postMedia");
    if (!input) return;

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      const preview = $("mediaPreview");
      const fileName = $("fileName");

      if (fileName) {
        fileName.textContent = file ? file.name : "No file selected";
      }

      if (!preview) return;
      preview.innerHTML = "";

      if (!file) return;

      const url = URL.createObjectURL(file);
      const media = document.createElement(
        file.type.startsWith("video/") ? "video" : "img"
      );

      media.src = url;
      media.className = "media-preview";
      if (media.tagName === "VIDEO") media.controls = true;
      media.addEventListener("load", () => URL.revokeObjectURL(url), { once: true });
      preview.appendChild(media);
    });
  }

  // -------------------- Demo-only follows --------------------

  function toggleFollow(profileId) {
    const follows = getLocal(STORAGE_KEYS.follows, []);
    const next = follows.includes(profileId)
      ? follows.filter((id) => id !== profileId)
      : [...follows, profileId];

    setLocal(STORAGE_KEYS.follows, next);
    renderMembers();
    toast("Demo follow list updated in this browser.");
  }

  // -------------------- Demo-only marketplace --------------------

  function loadListings() {
    const list = $("carListings");
    if (!list) return;

    const listings = getLocal(STORAGE_KEYS.listings, []);

    if (!listings.length) {
      list.innerHTML = "<p>No demo listings yet.</p>";
      return;
    }

    list.innerHTML = listings.map((item) => `
      <article class="market-listing">
        <h3>${escapeHTML(item.name)}</h3>
        <p><strong>${escapeHTML(item.price)}</strong></p>
        <p>${escapeHTML(item.details)}</p>
        <small>Demo listing · saved in this browser only</small>
        ${item.ownerId === currentUserId()
          ? `<button type="button" data-delete-listing="${escapeHTML(item.id)}">Delete</button>`
          : ""}
      </article>
    `).join("");
  }

  function createListing(event) {
    event.preventDefault();
    if (!requireUser()) return;

    const name = textOf($("carName")?.value);
    const price = textOf($("carPrice")?.value);
    const details = textOf($("carDetails")?.value);

    if (!name || !price) {
      toast("Enter a listing name and price.");
      return;
    }

    const listings = getLocal(STORAGE_KEYS.listings, []);
    listings.unshift({
      id: crypto.randomUUID(),
      ownerId: state.user.id,
      name,
      price,
      details,
      createdAt: new Date().toISOString()
    });

    setLocal(STORAGE_KEYS.listings, listings);
    event.currentTarget.reset();
    loadListings();
    toast("Demo listing saved in this browser only.");
  }

  function deleteListing(id) {
    const listings = getLocal(STORAGE_KEYS.listings, []);
    setLocal(
      STORAGE_KEYS.listings,
      listings.filter((item) =>
        item.id !== id || item.ownerId !== currentUserId()
      )
    );
    loadListings();
  }

  // -------------------- Garage vehicle list --------------------
  // This is a browser-local personal garage, not marketplace data.

  function loadGarageCars() {
    const list = $("carList");
    if (!list) return;

    const key = `garage_vehicles_${currentUserId() || "guest"}`;
    const cars = getLocal(key, []);

    list.innerHTML = cars.length
      ? cars.map((car) => `
          <article class="garage-car">
            <h3>${escapeHTML(car.make)} ${escapeHTML(car.model)}</h3>
            <p>${escapeHTML(car.year || "")}</p>
            <p>${escapeHTML(car.description || "")}</p>
            <p>${escapeHTML(car.mods || "")}</p>
            <button type="button" data-delete-car="${escapeHTML(car.id)}">
              Remove
            </button>
          </article>
        `).join("")
      : "<p>Your garage is empty.</p>";
  }

  function createGarageCar(event) {
    event.preventDefault();
    if (!requireUser()) return;

    const make = textOf($("carMake")?.value);
    const model = textOf($("carModel")?.value);

    if (!make || !model) {
      toast("Enter the vehicle make and model.");
      return;
    }

    const key = `garage_vehicles_${currentUserId()}`;
    const cars = getLocal(key, []);

    cars.unshift({
      id: crypto.randomUUID(),
      make,
      model,
      year: textOf($("carYear")?.value),
      description: textOf($("carDescription")?.value),
      mods: textOf($("carMods")?.value)
    });

    setLocal(key, cars);
    event.currentTarget.reset();
    loadGarageCars();
    setText("carMessage", "Vehicle saved in this browser.");
  }

  function deleteGarageCar(id) {
    if (!requireUser()) return;

    const key = `garage_vehicles_${currentUserId()}`;
    const cars = getLocal(key, []);
    setLocal(key, cars.filter((car) => car.id !== id));
    loadGarageCars();
  }

  // -------------------- Conversation-based messaging --------------------

  async function findOrCreateConversation(recipientId) {
    if (!requireUser()) return null;
    if (!recipientId || recipientId === state.user.id) {
      toast("Choose another member.");
      return null;
    }

    // Find conversations where this user is a participant.
    const { data: mine, error: mineError } = await client
      .from("conversations")
      .select("id, participant_one, participant_two")
      .or(
        `participant_one.eq.${state.user.id},participant_two.eq.${state.user.id}`
      );

    if (mineError) throw mineError;

    const existing = (mine || []).find((conversation) =>
      (conversation.participant_one === state.user.id &&
        conversation.participant_two === recipientId) ||
      (conversation.participant_one === recipientId &&
        conversation.participant_two === state.user.id)
    );

    if (existing) return existing.id;

    // Canonical ordering avoids duplicate pairs.
    const [participantOne, participantTwo] =
      [state.user.id, recipientId].sort();

    const { data, error } = await client
      .from("conversations")
      .insert({ participant_one: participantOne, participant_two: participantTwo })
      .select("id")
      .single();

    // A unique constraint protects against simultaneous duplicate creation.
    if (error?.code === "23505") {
      const { data: retryData, error: retryError } = await client
        .from("conversations")
        .select("id")
        .eq("participant_one", participantOne)
        .eq("participant_two", participantTwo)
        .single();

      if (retryError) throw retryError;
      return retryData.id;
    }

    if (error) throw error;
    return data.id;
  }

  async function openConversation(recipientId) {
    if (!requireUser()) return;

    const recipient = state.profiles.find((p) => p.id === recipientId);
    if (!recipient) {
      toast("Member not found. Refresh the member list and try again.");
      return;
    }

    try {
      const conversationId = await findOrCreateConversation(recipientId);
      if (!conversationId) return;

      state.activeConversationId = conversationId;
      state.activeRecipientId = recipientId;

      const select = $("messageTo");
      if (select) select.value = recipientId;

      setText("carMessage", "");
      await loadMessages();

      const page = $("messagesPage");
      if (page) page.hidden = false;
    } catch (error) {
      console.error("GARAGE open conversation:", error);
      toast("Could not open this conversation.");
    }
  }

  async function loadMessages() {
    const conversation = $("conversation");
    if (!conversation || !state.activeConversationId) return;

    const loadToken = ++state.messageLoadToken;
    conversation.innerHTML = "<p>Loading messages…</p>";

    const { data, error } = await client
      .from("messages")
      .select(`
        id, conversation_id, sender_id, body, created_at, read_at,
        profiles:sender_id (username, display_name)
      `)
      .eq("conversation_id", state.activeConversationId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (loadToken !== state.messageLoadToken) return;

    if (error) {
      console.error("GARAGE load messages:", error);
      conversation.innerHTML = "<p>Could not load messages.</p>";
      return;
    }

    const messages = data || [];
    conversation.innerHTML = messages.length
      ? messages.map((message) => {
          const own = message.sender_id === currentUserId();
          return `
            <article class="chat-message ${own ? "own-message" : ""}">
              <strong>${own ? "You" : escapeHTML(
                profileName(message.profiles || {})
              )}</strong>
              <p>${escapeHTML(message.body).replace(/\n/g, "<br>")}</p>
              <small>${escapeHTML(formatDate(message.created_at))}
                ${own && message.read_at ? " · Read" : ""}
              </small>
            </article>
          `;
        }).join("")
      : "<p>No messages yet. Say hello.</p>";

    conversation.scrollTop = conversation.scrollHeight;

    // Mark unread messages sent by the other participant as read.
    const unreadIds = messages
      .filter((message) =>
        message.sender_id !== currentUserId() && !message.read_at
      )
      .map((message) => message.id);

    if (unreadIds.length) {
      const { error: readError } = await client
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", unreadIds)
        .eq("conversation_id", state.activeConversationId);

      if (readError) console.warn("GARAGE mark read:", readError.message);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!requireUser()) return;

    const form = event.currentTarget;
    const recipientId = textOf($("messageTo")?.value);
    const body = textOf($("messageText")?.value);

    if (!recipientId) {
      toast("Choose a member to message.");
      return;
    }

    if (!body) {
      toast("Write a message first.");
      return;
    }

    setBusy(form, true, "Sending…");

    try {
      let conversationId = state.activeConversationId;

      if (!conversationId || state.activeRecipientId !== recipientId) {
        conversationId = await findOrCreateConversation(recipientId);
        state.activeConversationId = conversationId;
        state.activeRecipientId = recipientId;
      }

      if (!conversationId) return;

      const { error } = await client.from("messages").insert({
        conversation_id: conversationId,
        sender_id: state.user.id,
        body
      });

      if (error) throw error;

      $("messageText").value = "";
      await loadMessages();
    } catch (error) {
      console.error("GARAGE send message:", error);
      toast(error.message || "Could not send the message.");
    } finally {
      setBusy(form, false);
    }
  }

  function setupRealtime() {
    if (state.feedChannel) {
      client.removeChannel(state.feedChannel);
      state.feedChannel = null;
    }

    state.feedChannel = client
      .channel("garage-public-feed")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "posts"
      }, loadFeed)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "likes"
      }, loadFeed)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "comments"
      }, loadFeed)
      .subscribe();

    if (state.messageChannel) {
      client.removeChannel(state.messageChannel);
      state.messageChannel = null;
    }

    if (state.user) {
      state.messageChannel = client
        .channel(`garage-messages-${state.user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "messages"
        }, (payload) => {
          const message = payload.new || payload.old;
          if (
            message?.conversation_id &&
            message.conversation_id === state.activeConversationId
          ) {
            loadMessages();
          }
        })
        .subscribe();
    }
  }

  // -------------------- Existing UI wiring --------------------

  function setupNavigation() {
    document.querySelectorAll("[data-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const pageId = button.dataset.page;
        document.querySelectorAll("[id$='Page']").forEach((page) => {
          page.hidden = page.id !== pageId;
        });
      });
    });

    const profileButton = $("profileBtn");
    if (profileButton) {
      profileButton.addEventListener("click", () => {
        const page = $("garagePage");
        if (page) page.hidden = false;
      });
    }

    const shareButton = $("shareBtn");
    if (shareButton) {
      shareButton.addEventListener("click", async () => {
        const shareData = {
          title: "GARAGE",
          text: "Join me on GARAGE, the car community.",
          url: window.location.href
        };

        try {
          if (navigator.share) {
            await navigator.share(shareData);
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(shareData.url);
            toast("Website link copied.");
          } else {
            toast("Copy the website URL from your browser.");
          }
        } catch (error) {
          if (error.name !== "AbortError") {
            console.warn("GARAGE share:", error);
          }
        }
      });
    }

    const search = $("search");
    if (search) {
      search.addEventListener("input", () => {
        const query = textOf(search.value).toLowerCase();

        document.querySelectorAll(
          ".community-post, .market-listing, .member-card, .garage-car"
        ).forEach((item) => {
          item.hidden = !item.textContent.toLowerCase().includes(query);
        });
      });
    }
  }

  function setupEvents() {
    $("postForm")?.addEventListener("submit", createPost);
    $("listingForm")?.addEventListener("submit", createListing);
    $("carForm")?.addEventListener("submit", createGarageCar);
    $("messageForm")?.addEventListener("submit", sendMessage);

    $("messageTo")?.addEventListener("change", async (event) => {
      const recipientId = event.currentTarget.value;
      if (recipientId) await openConversation(recipientId);
    });

    $("logout-btn")?.addEventListener("click", async () => {
      const { error } = await client.auth.signOut();
      if (error) {
        console.error("GARAGE sign out:", error);
        toast("Could not sign out.");
      }
    });

    $("postMedia")?.addEventListener("change", () => {
      const input = $("postMedia");
      const file = input?.files?.[0];
      const preview = $("mediaPreview");

      setText("fileName", file?.name || "No file selected");
      if (!preview) return;

      preview.innerHTML = "";
      if (!file) return;

      const url = URL.createObjectURL(file);
      const media = document.createElement(
        file.type.startsWith("video/") ? "video" : "img"
      );

      media.src = url;
      media.className = "media-preview";
      if (media.tagName === "VIDEO") media.controls = true;

      media.addEventListener("loadeddata", () => {
        URL.revokeObjectURL(url);
      }, { once: true });

      preview.appendChild(media);
    });

    document.addEventListener("click", async (event) => {
      const likeButton = event.target.closest("[data-like-post]");
      if (likeButton) {
        await toggleLike(likeButton.dataset.likePost);
        return;
      }

      const messageButton = event.target.closest("[data-message-member]");
      if (messageButton) {
        await openConversation(messageButton.dataset.messageMember);
        return;
      }

      const followButton = event.target.closest("[data-follow-member]");
      if (followButton) {
        toggleFollow(followButton.dataset.followMember);
        return;
      }

      const deleteListingButton = event.target.closest("[data-delete-listing]");
      if (deleteListingButton) {
        deleteListing(deleteListingButton.dataset.deleteListing);
        return;
      }

      const deleteCarButton = event.target.closest("[data-delete-car]");
      if (deleteCarButton) {
        deleteGarageCar(deleteCarButton.dataset.deleteCar);
      }
    });

    document.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-comment-form]");
      if (!form) return;

      event.preventDefault();
      const input = form.querySelector('[name="comment"]');
      const content = textOf(input?.value);

      if (!content) return;

      await addComment(form.dataset.commentForm, content);
    });
  }

  async function refreshForUser() {
    await loadProfile();
    await loadProfiles();
    await loadFeed();
    loadListings();
    loadGarageCars();
    setupRealtime();
  }

  async function init() {
    setupEvents();
    setupNavigation();

    const { data, error } = await client.auth.getSession();

    if (error) {
      console.error("GARAGE session:", error);
      toast("Could not check your sign-in session.");
    }

    state.user = data?.session?.user || null;
    await refreshForUser();

    client.auth.onAuthStateChange((_event, session) => {
      // Defer Supabase queries outside the auth callback.
      state.user = session?.user || null;
      state.profile = null;
      state.activeConversationId = null;
      state.activeRecipientId = null;

      setTimeout(() => {
        refreshForUser();
      }, 0);
    });
  }

  init().catch((error) => {
    console.error("GARAGE initialization failed:", error);
    toast("GARAGE could not finish loading. Check the console.");
  });
})();
