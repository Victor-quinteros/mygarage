
(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ovooslmyfavrtlxazykq.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_XHfXBMkf6eng2p3gTLqC6g_A8aZB6dF";

  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const directoryView = document.getElementById("directory-view");
  const memberView = document.getElementById("member-view");
  const grid = document.getElementById("members-grid");
  const search = document.getElementById("member-search");
  const message = document.getElementById("members-message");
  const detail = document.getElementById("member-detail");
  const detailMessage = document.getElementById("member-message");

  let profiles = [];

  function addTextElement(parent, tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;

    if (className) {
      element.className = className;
    }

    parent.appendChild(element);
    return element;
  }

  function renderDirectory() {
    const term = search.value.trim().toLowerCase();

    const matches = profiles.filter((profile) => {
      const searchable = [
        profile.username,
        profile.display_name,
        profile.favorite_car,
        profile.bio
      ].join(" ").toLowerCase();

      return searchable.includes(term);
    });

    grid.replaceChildren();

    if (matches.length === 0) {
      message.textContent = profiles.length
        ? "No members match your search."
        : "No public profiles yet. Be the first to create one!";
      return;
    }

    message.textContent = matches.length + " member(s) found.";

    matches.forEach((profile) => {
      const card = document.createElement("a");
      card.className = "member-card";
      card.href =
        "members.html?username=" +
        encodeURIComponent(profile.username);

      addTextElement(
        card,
        "h2",
        profile.display_name || profile.username
      );

       addTextElement(
        card,
        "p",
        "@" + profile.username,
        "member-username"
      );

      if (profile.favorite_car) {
        addTextElement(
          card,
          "p",
          "Favorite car: " + profile.favorite_car
        );
      }

      if (profile.bio) {
        const shortBio = profile.bio.length > 120
          ? profile.bio.slice(0, 120) + "..."
          : profile.bio;

        addTextElement(card, "p", shortBio);
      }

      grid.appendChild(card);
    });
  }

  async function loadDirectory() {
    message.textContent = "Loading members...";

    const { data, error } = await client
      .from("profiles")
      .select("username, display_name, bio, favorite_car")
      .not("username", "is", null)
      .order("username");

    if (error) {
      console.error("Could not load members:", error);
      message.textContent =
        "Could not load members. Check your Supabase table and public read policy.";
      return;
    }

    profiles = data || [];
    renderDirectory();
  }

  async function loadMember(username) {
    directoryView.hidden = true;
    memberView.hidden = false;
    detailMessage.textContent = "Loading profile...";

    const { data, error } = await client
      .from("profiles")
      .select("username, display_name, bio, favorite_car")
      .eq("username", username)
      .maybeSingle();

    detail.replaceChildren();

    if (error) {
      console.error("Could not load profile:", error);
      detailMessage.textContent =
        "Could not load this profile. Please try again later.";
      return;
    }

    if (!data) {
      detailMessage.textContent =
        "Member not found. They may not have created a public profile yet.";
      return;
    }

    addTextElement(
      detail,
      "h2",
      data.display_name || data.username
    );

    addTextElement(
      detail,
      "p",
      "@" + data.username,
      "member-username"
    );

    addTextElement(
      detail,
      "h3",
      "About"
    );

    addTextElement(
      detail,
      "p",
      data.bio || "This member hasn't added a bio yet."
    );

    addTextElement(
      detail,
      "h3",
      "Favorite car"
    );

    addTextElement(
      detail,
      "p",
      data.favorite_car || "Not specified yet."
    );

    detailMessage.textContent = "";
  }

  search.addEventListener("input", renderDirectory);

  const username = new URLSearchParams(
    window.location.search
  ).get("username");

  if (username) {
    loadMember(username.trim().toLowerCase());
  } else {
    loadDirectory();
  }
})();
