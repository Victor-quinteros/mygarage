
/* =========================================================
   GARAGE — PUBLIC MEMBER DIRECTORY AND PROFILES
   File: members.js
   ========================================================= */

(() => {
  "use strict";

  // 1. SUPABASE CLIENT AND PAGE ELEMENTS
  const client = window.garageSupabase;

  if (!client) {
    console.error(
      "GARAGE: Supabase client was not found. Check supabase-client.js."
    );
    return;
  }

  const $ = (id) => document.getElementById(id);

  const directoryView = $("directory-view");
  const memberView = $("member-view");
  const membersGrid = $("members-grid");
  const memberSearch = $("member-search");
  const membersMessage = $("members-message");

  const newestMembersGrid = $("newest-members-grid");
  const newestMembersMessage = $("newest-members-message");

  const topContributorsGrid = $("top-contributors-grid");
  const topContributorsMessage = $("top-contributors-message");

  const memberDetail = $("member-detail");
  const memberMessage = $("member-message");

  const PROFILE_FIELDS =
    "id, username, display_name, bio, favorite_car, avatar_url, created_at";

  let allProfiles = [];
  let publicPostCounts = {};
  let signedInUser = null;

  // 2. GENERAL HELPERS
  function setMessage(element, message) {
    if (element) {
      element.textContent = message || "";
    }
  }

  function addTextElement(parent, tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text ?? "";

    if (className) {
      element.className = className;
    }

    parent.appendChild(element);
    return element;
  }

  function getMemberName(profile) {
    return (
      profile.display_name?.trim() ||
      profile.username?.trim() ||
      "GARAGE Member"
    );
  }

  function getMemberProfileUrl(profile) {
    return (
      "members.html?username=" +
      encodeURIComponent(profile.username || "")
    );
  }

  function getPublicPostCount(profile) {
    return Number(publicPostCounts[profile.id] || 0);
  }

  function sortNewestFirst(profiles) {
    return [...profiles].sort((a, b) => {
      return (
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
      );
    });
  }

  function createAvatar(profile, className = "member-avatar") {
    const wrapper = document.createElement("div");
    wrapper.className = className;

    const initial = getMemberName(profile).charAt(0).toUpperCase();

    if (profile.avatar_url) {
      const image = document.createElement("img");
      image.src = profile.avatar_url;
      image.alt = getMemberName(profile) + " avatar";
      image.loading = "lazy";

      image.addEventListener("error", () => {
        wrapper.replaceChildren();
        addTextElement(wrapper, "span", initial);
      }, { once: true });

      wrapper.appendChild(image);
    } else {
      addTextElement(wrapper, "span", initial);
    }

    return wrapper;
  }

  function clearElement(element) {
    if (element) {
      element.replaceChildren();
    }
  }

  // 3. MEMBER CARDS
  function createMemberCard(profile, options = {}) {
    const card = document.createElement("a");
    card.className = "member-card";
    card.href = getMemberProfileUrl(profile);

    card.appendChild(createAvatar(profile));

    const details = document.createElement("div");
    details.className = "member-card-details";

    addTextElement(
      details,
      "h3",
      getMemberName(profile),
      "member-name"
    );

    addTextElement(
      details,
      "p",
      "@" + profile.username,
      "member-username"
    );

    if (profile.favorite_car) {
      addTextElement(
        details,
        "p",
        "Favorite car: " + profile.favorite_car,
        "member-favorite-car"
      );
    }

    if (profile.bio && options.showBio) {
      addTextElement(
        details,
        "p",
        profile.bio,
        "member-bio"
      );
    }

    if (options.showPostCount) {
      addTextElement(
        details,
        "p",
        getPublicPostCount(profile) + " public posts",
        "member-post-count"
      );
    }

    card.appendChild(details);
    return card;
  }

  // 4. RENDER MEMBER COLLECTIONS
  function renderNewestMembers(profiles) {
    clearElement(newestMembersGrid);

    const newest = sortNewestFirst(profiles).slice(0, 6);

    if (!newestMembersGrid) return;

    if (!newest.length) {
      setMessage(newestMembersMessage, "No members found yet.");
      return;
    }

    setMessage(newestMembersMessage, "");

    newest.forEach((profile) => {
      newestMembersGrid.appendChild(createMemberCard(profile));
    });
  }

  function renderTopContributors(profiles) {
    clearElement(topContributorsGrid);

    const ranked = [...profiles].sort((a, b) => {
      return (
        getPublicPostCount(b) - getPublicPostCount(a) ||
        getMemberName(a).localeCompare(getMemberName(b))
      );
    }).slice(0, 6);

    if (!topContributorsGrid) return;

    if (!ranked.length) {
      setMessage(topContributorsMessage, "No contributors found yet.");
      return;
    }

    setMessage(topContributorsMessage, "");

    ranked.forEach((profile) => {
      topContributorsGrid.appendChild(
        createMemberCard(profile, { showPostCount: true })
      );
    });
  }

  function renderDirectory(profiles) {
    clearElement(membersGrid);

    if (!membersGrid) return;

    if (!profiles.length) {
      setMessage(membersMessage, "No matching members found.");
      return;
    }

    setMessage(membersMessage, "");

    profiles.forEach((profile) => {
      membersGrid.appendChild(
        createMemberCard(profile, {
          showBio: true,
          showPostCount: true
        })
      );
    });
  }

  // 5. LOAD MEMBER PROFILES AND POST COUNTS
  async function loadProfiles() {
    const { data, error } = await client
      .from("profiles")
      .select(PROFILE_FIELDS)
      .not("username", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GARAGE: Could not load profiles:", error);
      setMessage(membersMessage, "Could not load members. Please try again.");
      setMessage(newestMembersMessage, "Could not load members.");
      setMessage(topContributorsMessage, "Could not load contributors.");
      return [];
    }

    return data || [];
  }

  async function loadPublicPostCounts() {
    const { data, error } = await client
      .from("posts")
      .select("user_id")
      .eq("is_community", true);

    if (error) {
      console.warn("GARAGE: Could not load public post counts:", error);
      publicPostCounts = {};
      return;
    }

    publicPostCounts = {};

    (data || []).forEach((post) => {
      if (post.user_id) {
        publicPostCounts[post.user_id] =
          (publicPostCounts[post.user_id] || 0) + 1;
      }
    });
  }

  // 6. PUBLIC MEMBER PROFILE AND MESSAGE BUTTON
  async function loadMember(username) {
    if (directoryView) directoryView.hidden = true;
    if (memberView) memberView.hidden = false;

    clearElement(memberDetail);
    setMessage(memberMessage, "Loading member profile...");

    const { data: profile, error } = await client
      .from("profiles")
      .select(PROFILE_FIELDS)
      .eq("username", username)
      .maybeSingle();

    if (error || !profile) {
      console.error("GARAGE: Could not load member profile:", error);
      setMessage(memberMessage, "Member profile not found.");
      return;
    }

    setMessage(memberMessage, "");

    // Avatar and profile information
    memberDetail.appendChild(createAvatar(profile, "member-avatar-large"));

    addTextElement(
      memberDetail,
      "h2",
      getMemberName(profile),
      "member-name"
    );

    addTextElement(
      memberDetail,
      "p",
      "@" + profile.username,
      "member-username"
    );

    if (profile.bio) {
      addTextElement(memberDetail, "p", profile.bio, "member-bio");
    }

    if (profile.favorite_car) {
      addTextElement(
        memberDetail,
        "p",
        "Favorite car: " + profile.favorite_car,
        "member-favorite-car"
      );
    }

    addTextElement(
      memberDetail,
      "p",
      getPublicPostCount(profile) + " public posts",
      "member-post-count"
    );

    // Add the messaging button only when signed in and viewing another member.
    if (signedInUser && signedInUser.id !== profile.id) {
      const messageLink = document.createElement("a");
      messageLink.className = "primary message-member-button";
      messageLink.textContent = "Message Member";
      messageLink.href =
        "index.html?page=messages&to=" +
        encodeURIComponent(profile.id);

      memberDetail.appendChild(messageLink);
    } else if (!signedInUser) {
      const signInNote = document.createElement("p");
      signInNote.className = "muted";
      signInNote.textContent =
        "Sign in to message this member.";
      memberDetail.appendChild(signInNote);
    }

    // Show the member's public posts, if available.
    const postsHeading = document.createElement("h3");
    postsHeading.textContent = "Community Posts";
    memberDetail.appendChild(postsHeading);

    const postsContainer = document.createElement("div");
    postsContainer.className = "member-public-posts";
    memberDetail.appendChild(postsContainer);

    const { data: posts, error: postsError } = await client
      .from("posts")
      .select("id, caption, image_url, created_at")
      .eq("user_id", profile.id)
      .eq("is_community", true)
      .order("created_at", { ascending: false });

    if (postsError) {
      console.warn("GARAGE: Could not load member posts:", postsError);
      addTextElement(
        postsContainer,
        "p",
        "Could not load this member's posts."
      );
      return;
    }

    if (!posts || posts.length === 0) {
      addTextElement(postsContainer, "p", "No public posts yet.");
      return;
    }

    posts.forEach((post) => {
      const postCard = document.createElement("article");
      postCard.className = "member-post-card";

      if (post.image_url) {
        const image = document.createElement("img");
        image.src = post.image_url;
        image.alt = "Community post";
        image.loading = "lazy";
        postCard.appendChild(image);
      }

      if (post.caption) {
        addTextElement(postCard, "p", post.caption, "member-post-caption");
      }

      if (post.created_at) {
        const date = new Date(post.created_at);
        addTextElement(
          postCard,
          "p",
          date.toLocaleDateString(),
          "member-post-date"
        );
      }

      postsContainer.appendChild(postCard);
    });
  }

  // 7. SEARCH AND PAGE INITIALIZATION
  function setupSearch() {
    if (!memberSearch) return;

    memberSearch.addEventListener("input", () => {
      const query = memberSearch.value.trim().toLowerCase();

      const filtered = allProfiles.filter((profile) => {
        const searchable = [
          profile.username,
          profile.display_name,
          profile.bio,
          profile.favorite_car
        ].filter(Boolean).join(" ").toLowerCase();

        return searchable.includes(query);
      });

      renderDirectory(filtered);
    });
  }

  async function loadSignedInUser() {
    const { data, error } = await client.auth.getUser();

    if (error) {
      console.warn("GARAGE: Could not check sign-in status:", error);
      signedInUser = null;
      return;
    }

    signedInUser = data?.user || null;
  }

  async function initializeMembersPage() {
    await loadSignedInUser();

    const params = new URLSearchParams(window.location.search);
    const username = params.get("username");

    if (username) {
      await loadPublicPostCounts();
      await loadMember(username);
      return;
    }

    if (directoryView) directoryView.hidden = false;
    if (memberView) memberView.hidden = true;

    const [profiles] = await Promise.all([
      loadProfiles(),
      loadPublicPostCounts()
    ]);

    allProfiles = profiles;

    renderDirectory(allProfiles);
    renderNewestMembers(allProfiles);
    renderTopContributors(allProfiles);
    setupSearch();
  }

  // Refresh the profile button after sign-in/sign-out in this tab.
  client.auth.onAuthStateChange((_event, session) => {
    signedInUser = session?.user || null;

    const params = new URLSearchParams(window.location.search);
    const username = params.get("username");

    if (username) {
      loadMember(username);
    }
  });

  initializeMembersPage();
})();
