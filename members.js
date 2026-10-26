
/* =========================================================
   GARAGE — MEMBERS PAGE
   ---------------------------------------------------------
   FEATURES
   1. Load public member profiles from Supabase
   2. Display newest members
   3. Rank top contributors by public post count
   4. Search all members
   5. Display individual member profiles

   REQUIREMENTS
   - supabase-client.js must load before this file.
   - Public profile and community-post read policies must
     permit the relevant queries.
========================================================= */

(() => {
  "use strict";

  /* =======================================================
     1. SUPABASE CLIENT
  ======================================================= */

  const client = window.garageSupabase;

  if (!client) {
    console.error(
      "GARAGE Members: Supabase client is not initialized."
    );
    return;
  }


  /* =======================================================
     2. PAGE ELEMENTS
  ======================================================= */

  const directoryView = document.getElementById("directory-view");
  const memberView = document.getElementById("member-view");

  const grid = document.getElementById("members-grid");
  const search = document.getElementById("member-search");
  const message = document.getElementById("members-message");

  const newestGrid = document.getElementById("newest-members-grid");
  const newestMessage = document.getElementById("newest-members-message");

  const contributorsGrid = document.getElementById(
    "top-contributors-grid"
  );
  const contributorsMessage = document.getElementById(
    "top-contributors-message"
  );

  const detail = document.getElementById("member-detail");
  const detailMessage = document.getElementById("member-message");

  const REQUIRED_ELEMENTS = [
    directoryView,
    memberView,
    grid,
    search,
    message,
    newestGrid,
    newestMessage,
    contributorsGrid,
    contributorsMessage,
    detail,
    detailMessage
  ];

  if (REQUIRED_ELEMENTS.some((element) => !element)) {
    console.error(
      "GARAGE Members: One or more required HTML elements are missing."
    );
    return;
  }


  /* =======================================================
     3. CONFIGURATION AND PAGE STATE
  ======================================================= */

  // Maximum number of cards in the two featured sections.
  const NEWEST_MEMBERS_LIMIT = 6;
  const TOP_CONTRIBUTORS_LIMIT = 6;

  // Shared public profile fields.
  const PROFILE_FIELDS = [
    "id",
    "username",
    "display_name",
    "bio",
    "favorite_car",
    "avatar_url",
    "created_at"
  ].join(", ");

  let profiles = [];
  let publicPostCounts = new Map();


  /* =======================================================
     4. GENERAL HELPER FUNCTIONS
  ======================================================= */

  // Add text safely without interpreting it as HTML.
  function addTextElement(parent, tag, text, className) {
    const element = document.createElement(tag);

    element.textContent = text ?? "";

    if (className) {
      element.className = className;
    }

    parent.appendChild(element);

    return element;
  }


  // Display a message in a section.
  function setMessage(element, text) {
    element.textContent = text;
  }


  // Get a member's display name.
  function getMemberName(profile) {
    return (
      profile.display_name ||
      profile.username ||
      "GARAGE Member"
    );
  }


  // Create a URL for an individual member profile.
  function getMemberProfileUrl(profile) {
    return (
      "members.html?username=" +
      encodeURIComponent(profile.username)
    );
  }


  // Get the number of public posts made by a member.
  function getPublicPostCount(profile) {
    if (!profile.id) {
      return 0;
    }

    return publicPostCounts.get(profile.id) || 0;
  }


  // Sort profiles by creation date, newest first.
  function sortProfilesNewestFirst(list) {
    return [...list].sort((a, b) => {
      const dateA = Date.parse(a.created_at || "");
      const dateB = Date.parse(b.created_at || "");

      // Profiles without a valid date go after dated profiles.
      const validA = Number.isFinite(dateA);
      const validB = Number.isFinite(dateB);

      if (validA && validB) {
        return dateB - dateA;
      }

      if (validA) return -1;
      if (validB) return 1;

      return getMemberName(a).localeCompare(getMemberName(b));
    });
  }


  /* =======================================================
     5. MEMBER AVATARS
  ======================================================= */

  function addAvatar(parent, profile, isDetail = false) {
    const name = getMemberName(profile);
    const initial = name.trim().charAt(0).toUpperCase() || "?";

    const avatar = document.createElement("img");

    avatar.className = isDetail
      ? "member-detail-avatar"
      : "member-avatar";

    avatar.alt = name + "'s profile picture";
    avatar.loading = "lazy";

    // Replace missing or broken images with an initial.
    function showFallback() {
      if (!avatar.isConnected) {
        return;
      }

      const fallback = document.createElement("div");

      fallback.className =
        avatar.className + " member-avatar-fallback";

      fallback.setAttribute("role", "img");
      fallback.setAttribute(
        "aria-label",
        "No profile picture for " + name
      );

      fallback.textContent = initial;
      avatar.replaceWith(fallback);
    }

    if (!profile.avatar_url) {
      // The image is not attached yet, so add the fallback directly.
      const fallback = document.createElement("div");

      fallback.className =
        avatar.className + " member-avatar-fallback";

      fallback.setAttribute("role", "img");
      fallback.setAttribute(
        "aria-label",
        "No profile picture for " + name
      );

      fallback.textContent = initial;
      parent.appendChild(fallback);

      return;
    }

    avatar.addEventListener(
      "error",
      showFallback,
      { once: true }
    );

    avatar.src = profile.avatar_url;
    parent.appendChild(avatar);
  }


  /* =======================================================
     6. MEMBER CARD CREATION
     Shared by newest members, contributors, and directory.
  ======================================================= */

  function createMemberCard(profile, options = {}) {
    const {
      showBio = true,
      showFavoriteCar = true,
      showPostCount = false
    } = options;

    const card = document.createElement("a");

    card.className = "member-card";
    card.href = getMemberProfileUrl(profile);

    // Profile picture.
    addAvatar(card, profile);

    // Display name.
    addTextElement(
      card,
      "h2",
      getMemberName(profile)
    );

    // Username.
    addTextElement(
      card,
      "p",
      "@" + profile.username,
      "member-username"
    );

    // Favorite car.
    if (showFavoriteCar && profile.favorite_car) {
      addTextElement(
        card,
        "p",
        "Favorite car: " + profile.favorite_car
      );
    }

    // Short biography.
    if (showBio && profile.bio) {
      const shortBio = profile.bio.length > 120
        ? profile.bio.slice(0, 120) + "..."
        : profile.bio;

      addTextElement(card, "p", shortBio);
    }

    // Public community post count.
    if (showPostCount) {
      const count = getPublicPostCount(profile);
      const label = count === 1 ? "public post" : "public posts";

      addTextElement(
        card,
        "p",
        count + " " + label,
        "member-post-count"
      );
    }

    return card;
  }


  /* =======================================================
     7. NEWEST MEMBERS SECTION
  ======================================================= */

  function renderNewestMembers() {
    newestGrid.replaceChildren();

    const newestMembers = sortProfilesNewestFirst(profiles)
      .slice(0, NEWEST_MEMBERS_LIMIT);

    if (newestMembers.length === 0) {
      setMessage(
        newestMessage,
        "No public member profiles yet."
      );

      return;
    }

    setMessage(
      newestMessage,
      "The latest members to join GARAGE."
    );

    newestMembers.forEach((profile) => {
      newestGrid.appendChild(
        createMemberCard(profile, {
          showBio: false,
          showFavoriteCar: true
        })
      );
    });
  }


  /* =======================================================
     8. TOP CONTRIBUTORS SECTION
     Rank profiles by the number of public community posts.
  ======================================================= */

  function renderTopContributors() {
    contributorsGrid.replaceChildren();

    const contributors = [...profiles]
      .filter((profile) => getPublicPostCount(profile) > 0)
      .sort((a, b) => {
        const countDifference =
          getPublicPostCount(b) - getPublicPostCount(a);

        if (countDifference !== 0) {
          return countDifference;
        }

        return getMemberName(a).localeCompare(getMemberName(b));
      })
      .slice(0, TOP_CONTRIBUTORS_LIMIT);

    if (contributors.length === 0) {
      setMessage(
        contributorsMessage,
        "No public community posts yet. Share a build to become a top contributor!"
      );

      return;
    }

    setMessage(
      contributorsMessage,
      "Ranked by public community posts."
    );

    contributors.forEach((profile, index) => {
      const card = createMemberCard(profile, {
        showBio: false,
        showFavoriteCar: true,
        showPostCount: true
      });

      // Add a rank label.
      const rank = document.createElement("p");
      rank.className = "member-rank";
      rank.textContent = "#" + (index + 1) + " Contributor";

      card.insertBefore(rank, card.children[1]);

      contributorsGrid.appendChild(card);
    });
  }


  /* =======================================================
     9. ALL MEMBERS DIRECTORY AND SEARCH
  ======================================================= */

  function renderDirectory() {
    const term = search.value.trim().toLowerCase();

    const matches = profiles.filter((profile) => {
      const searchable = [
        profile.username,
        profile.display_name,
        profile.favorite_car,
        profile.bio
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });

    grid.replaceChildren();

    if (matches.length === 0) {
      setMessage(
        message,
        profiles.length
          ? "No members match your search."
          : "No public profiles yet. Be the first to create one!"
      );

      return;
    }

    setMessage(
      message,
      matches.length + (
        matches.length === 1
          ? " member found."
          : " members found."
      )
    );

    matches.forEach((profile) => {
      grid.appendChild(
        createMemberCard(profile, {
          showBio: true,
          showFavoriteCar: true
        })
      );
    });
  }


  /* =======================================================
     10. LOAD PROFILES FROM SUPABASE
  ======================================================= */

  async function loadProfiles() {
    setMessage(newestMessage, "Loading newest members...");
    setMessage(contributorsMessage, "Loading top contributors...");
    setMessage(message, "Loading members...");

    const { data, error } = await client
      .from("profiles")
      .select(PROFILE_FIELDS)
      .not("username", "is", null);

    if (error) {
      console.error(
        "GARAGE Members: Could not load profiles:",
        error
      );

      setMessage(
        newestMessage,
        "Could not load newest members."
      );

      setMessage(
        contributorsMessage,
        "Could not load top contributors."
      );

      setMessage(
        message,
        "Could not load members. Check your profiles table and its read policy."
      );

      return;
    }

    profiles = data || [];

    // Some profiles may not have a database ID in older schemas.
    // Such profiles can appear in the directory but cannot be
    // matched to posts for contributor counts.
    renderNewestMembers();
    renderDirectory();
  }


  /* =======================================================
     11. LOAD PUBLIC COMMUNITY POST COUNTS
     Only counts posts marked is_community = true.
  ======================================================= */

  async function loadPublicPostCounts() {
    const { data, error } = await client
      .from("posts")
      .select("user_id")
      .eq("is_community", true);

    if (error) {
      console.error(
        "GARAGE Members: Could not load public post counts:",
        error
      );

      publicPostCounts = new Map();

      setMessage(
        contributorsMessage,
        "Contributor rankings are unavailable. Check public post read permissions."
      );

      return;
    }

    const counts = new Map();

    (data || []).forEach((post) => {
      if (!post.user_id) {
        return;
      }

      counts.set(
        post.user_id,
        (counts.get(post.user_id) || 0) + 1
      );
    });

    publicPostCounts = counts;

    renderTopContributors();
  }


  /* =======================================================
     12. INDIVIDUAL MEMBER PROFILE
  ======================================================= */

  async function loadMember(username) {
    directoryView.hidden = true;
    memberView.hidden = false;

    setMessage(detailMessage, "Loading profile...");
    detail.replaceChildren();

    const { data, error } = await client
      .from("profiles")
      .select(PROFILE_FIELDS)
      .eq("username", username)
      .maybeSingle();

    if (error) {
      console.error(
        "GARAGE Members: Could not load profile:",
        error
      );

      setMessage(
        detailMessage,
        "Could not load this profile. Please try again later."
      );

      return;
    }

    if (!data) {
      setMessage(
        detailMessage,
        "Member not found. They may not have created a public profile yet."
      );

      return;
    }

    // Profile picture.
    addAvatar(detail, data, true);

    // Name and username.
    addTextElement(
      detail,
      "h2",
      getMemberName(data)
    );

    addTextElement(
      detail,
      "p",
      "@" + data.username,
      "member-username"
    );

    // Biography.
    addTextElement(detail, "h3", "About");

    addTextElement(
      detail,
      "p",
      data.bio || "This member hasn't added a bio yet."
    );

    // Favorite car.
    addTextElement(detail, "h3", "Favorite car");

    addTextElement(
      detail,
      "p",
      data.favorite_car || "Not specified yet."
    );

    // Public contribution count.
    if (data.id) {
      const postCount = getPublicPostCount(data);
      const label = postCount === 1
        ? "public community post"
        : "public community posts";

      addTextElement(
        detail,
        "h3",
        "Community contributions"
      );

      addTextElement(
        detail,
        "p",
        postCount + " " + label
      );
    }

    setMessage(detailMessage, "");
  }


  /* =======================================================
     13. SEARCH EVENTS
  ======================================================= */

  search.addEventListener("input", renderDirectory);


  /* =======================================================
     14. PAGE STARTUP
  ======================================================= */

  async function initializeMembersPage() {
    // A profile link takes priority over directory rendering.
    const username = new URLSearchParams(
      window.location.search
    ).get("username");

    if (username) {
      await loadMember(username.trim().toLowerCase());
      return;
    }

    // Load profiles and post counts independently.
    // Contributor cards render when both results are available.
    const [profilesResult, postsResult] = await Promise.all([
      loadProfiles(),
      loadPublicPostCounts()
    ]);

    // Render contributors again after both requests finish,
    // ensuring profiles and post counts are both available.
    renderTopContributors();
  }

  initializeMembersPage();

})();
