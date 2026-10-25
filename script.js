
const $ = (id) => document.getElementById(id);

const demoMembers = [
  { name: "Alex Builds", car: "Honda Civic", avatar: "A" },
  { name: "Street Garage", car: "Nissan Silvia", avatar: "S" },
  { name: "Turbo Mike", car: "Subaru WRX", avatar: "T" }
];

let posts = [
  {
    id: 1,
    author: "Alex Builds",
    car: "Honda Civic EK",
    text: "Weekend project: finally getting this build closer to the vision. What wheels would you run?",
    likes: 12,
    liked: false,
    comments: ["Bronze wheels would look great!"],
    media: ""
  },
  {
    id: 2,
    author: "Street Garage",
    car: "Nissan Silvia S15",
    text: "Fresh workshop day. Keeping the build clean and focusing on reliability before adding more power.",
    likes: 8,
    liked: false,
    comments: [],
    media: ""
  }
];

let listings = [];
let repairs = [];
let messages = {};
let followed = new Set();
let nextPostId = 3;
let selectedMedia = null;
let mediaPreviewUrl = "";
let toastTimer;

function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

// Escape user text before inserting it into HTML.
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function getProfile() {
  return {
    name: localStorage.getItem("garageName") || "Garage Member",
    bio: localStorage.getItem("garageBio") || "Car enthusiast"
  };
}

function renderMembers() {
  $("members").innerHTML = demoMembers.map(member => `
    <div class="member">
      <div class="avatar">${escapeHTML(member.avatar)}</div>
      <div class="member-name">
        <strong>${escapeHTML(member.name)}</strong>
        <small>${escapeHTML(member.car)}</small>
      </div>
      <button class="action ${followed.has(member.name) ? "following" : ""}"
        data-follow="${escapeHTML(member.name)}">
        ${followed.has(member.name) ? "Following" : "Follow"}
      </button>
    </div>
  `).join("");
}

function renderFeed() {
  const query = $("search").value.trim().toLowerCase();

  const visiblePosts = posts.filter(post =>
    `${post.author} ${post.car} ${post.text}`
      .toLowerCase().includes(query)
  );

  $("feed").innerHTML = visiblePosts.length
    ? visiblePosts.map(post => `
      <article class="post">
        <div class="post-head">
          <div class="avatar">${escapeHTML(post.author.charAt(0).toUpperCase())}</div>
          <div>
            <strong>${escapeHTML(post.author)}</strong>
            <p class="muted">${escapeHTML(post.car)} · Community post</p>
          </div>
        </div>

        <div class="post-copy">${escapeHTML(post.text).replace(/\n/g, "<br>")}</div>

        ${post.media ? `
          ${post.media.startsWith("data:video/")
            ? `<video class="post-media" controls src="${post.media}"></video>`
            : `<img class="post-media" src="${post.media}" alt="Car community post">`}
        ` : ""}

        <div class="post-actions">
          <button class="action ${post.liked ? "liked" : ""}"
            data-like="${post.id}">
            ${post.liked ? "♥ Liked" : "♡ Like"} · ${post.likes}
          </button>
          <button class="action" data-focus-comment="${post.id}">
            ▢ Comments · ${post.comments.length}
          </button>
        </div>

        <div class="comment-list">
          ${post.comments.map(comment => `
            <div class="comment">
              <strong>${escapeHTML(comment.author || "Community member")}:</strong>
              ${escapeHTML(comment.text || comment)}
            </div>
          `).join("")}
        </div>

        <form class="comment-form" data-comment="${post.id}">
          <input name="comment" placeholder="Write a comment..." required>
          <button class="action" type="submit">Send</button>
        </form>
      </article>
    `).join("")
    : `<p class="muted">No matching posts. Try another search.</p>`;
}

function renderListings() {
  $("carListings").innerHTML = listings.length
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

function renderRepairs() {
  $("repairs").innerHTML = repairs.length
    ? repairs.map(project => `
      <article class="post">
        <p class="eyebrow green">GARAGE PROJECT</p>
        <h3>${escapeHTML(project.title)}</h3>
        <p>${escapeHTML(project.details || "Project details coming soon.")}</p>
      </article>
    `).join("")
    : `<p class="muted">Your repair portfolio will appear here.</p>`;
}

function renderProfile() {
  const profile = getProfile();
  $("username").value = profile.name === "Garage Member" ? "" : profile.name;
  $("bio").value = profile.bio === "Car enthusiast" ? "" : profile.bio;
  $("profileSummary").innerHTML = `
    <div class="post-head">
      <div class="avatar">${escapeHTML(profile.name.charAt(0).toUpperCase())}</div>
      <div>
        <strong>${escapeHTML(profile.name)}</strong>
        <p class="muted">${escapeHTML(profile.bio)}</p>
      </div>
    </div>
    <p class="muted">${posts.filter(p => p.author === profile.name).length} posts · ${repairs.length} projects</p>
  `;
}

function renderMessages() {
  const name = $("messageTo").value.trim();
  const conversation = messages[name] || [];

  $("conversation").innerHTML = conversation.map(message => `
    <div class="message">
      <strong>${escapeHTML(message.from)}:</strong>
      ${escapeHTML(message.text)}
    </div>
  `).join("") || `<p class="muted">No messages in this demo conversation.</p>`;
}

function showPage(page) {
  document.querySelectorAll(".page").forEach(section => {
    section.classList.add("hidden");
  });

  const target = $(page + "Page");
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
}


document.querySelectorAll(".nav").forEach(button => {
  button.addEventListener("click", () => {
    if (button.dataset.page === "members") {
      window.location.href = "members.html";
      return;
    }

    showPage(button.dataset.page);
  });
});


$("search").addEventListener("input", () => {
  renderFeed();
  if ($("search").value.trim()) showPage("feed");
});

$("shareBtn").addEventListener("click", () => {
  showPage("feed");
  $("postText").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

$("profileBtn").addEventListener("click", () => showPage("garage"));

$("postMedia").addEventListener("change", event => {
  const file = event.target.files[0];
  selectedMedia = null;

  if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
  mediaPreviewUrl = "";
  $("mediaPreview").innerHTML = "";
  $("fileName").textContent = "No media selected";

  if (!file) return;

  const maxSize = 8 * 1024 * 1024;
  if (file.size > maxSize) {
    event.target.value = "";
    notify("Choose a photo or video under 8 MB.");
    return;
  }

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    event.target.value = "";
    notify("Choose an image or video file.");
    return;
  }

  selectedMedia = file;
  mediaPreviewUrl = URL.createObjectURL(file);
  $("fileName").textContent = file.name;

  $("mediaPreview").innerHTML = file.type.startsWith("video/")
    ? `<video class="post-media" controls src="${mediaPreviewUrl}"></video>`
    : `<img class="post-media" src="${mediaPreviewUrl}" alt="Selected media preview">`;
});

$("postForm").addEventListener("submit", event => {
  event.preventDefault();

  const text = $("postText").value.trim();
  if (!text) return;

  const profile = getProfile();

  // Media preview is temporary until a backend is connected.
  posts.unshift({
    id: nextPostId++,
    author: profile.name,
    car: "My garage",
    text,
    likes: 0,
    liked: false,
    comments: [],
    media: selectedMedia ? mediaPreviewUrl : ""
  });

  // Keep the selected media URL alive while its post exists.
  mediaPreviewUrl = "";
  selectedMedia = null;
  $("postMedia").value = "";
  $("fileName").textContent = "No media selected";
  $("mediaPreview").innerHTML = "";
  $("postText").value = "";

  renderFeed();
  renderProfile();
  notify("Post added to your local feed!");
});

$("feed").addEventListener("click", event => {
  const likeButton = event.target.closest("[data-like]");
  const commentButton = event.target.closest("[data-focus-comment]");

  if (likeButton) {
    const post = posts.find(p => p.id === Number(likeButton.dataset.like));
    if (!post) return;

    post.liked = !post.liked;
    post.likes += post.liked ? 1 : -1;
    renderFeed();
  }

  if (commentButton) {
    const form = document.querySelector(
      `[data-comment="${commentButton.dataset.focusComment}"]`
    );
    form?.querySelector("input")?.focus();
  }
});

$("feed").addEventListener("submit", event => {
  const form = event.target.closest("[data-comment]");
  if (!form) return;

  event.preventDefault();
  const input = form.elements.comment;
  const text = input.value.trim();
  if (!text) return;

  const post = posts.find(p => p.id === Number(form.dataset.comment));
  if (!post) return;

  post.comments.push({ author: getProfile().name, text });
  renderFeed();
  notify("Comment added!");
});

$("members").addEventListener("click", event => {
  const button = event.target.closest("[data-follow]");
  if (!button) return;

  const name = button.dataset.follow;
  if (followed.has(name)) {
    followed.delete(name);
  } else {
    followed.add(name);
  }

  renderMembers();
  notify(followed.has(name) ? `Following ${name}` : `Unfollowed ${name}`);
});

const saveProfileButton = $("saveProfile");

if (saveProfileButton) saveProfileButton.addEventListener("click", () => {  const name = $("username").value.trim();
  const bio = $("bio").value.trim();

  if (!name) {
    notify("Enter a display name first.");
    return;
  }

  localStorage.setItem("garageName", name);
  localStorage.setItem("garageBio", bio);
  renderProfile();
  notify("Profile saved on this device.");
});

$("carForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("carName").value.trim();
  const price = Number($("carPrice").value);
  if (!name || !Number.isFinite(price) || price < 0) return;

  listings.unshift({
    name,
    price,
    details: $("carDetails").value.trim()
  });

  event.target.reset();
  renderListings();
  notify("Car listing added!");
});

$("repairForm").addEventListener("submit", event => {
  event.preventDefault();

  repairs.unshift({
    title: $("repairTitle").value.trim(),
    details: $("repairDetails").value.trim()
  });

  event.target.reset();
  renderRepairs();
  renderProfile();
  notify("Project added to your portfolio.");
});

$("messageTo").addEventListener("input", renderMessages);

$("messageForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = $("messageTo").value.trim();
  const text = $("messageText").value.trim();
  if (!name || !text) return;

  if (!messages[name]) messages[name] = [];
  messages[name].push({ from: getProfile().name, text });

  $("messageText").value = "";
  renderMessages();
  notify("Demo message added on this device.");
});

// Initial render
renderMembers();
renderFeed();
renderListings();
renderRepairs();
renderProfile();
renderMessages();
