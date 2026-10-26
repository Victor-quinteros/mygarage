(() => {
  "use strict";

  const client = window.garageSupabase;

  const form = document.getElementById("carForm");
  const list = document.getElementById("carList");
  const message = document.getElementById("carMessage");

  if (!form || !list || !message) {
    console.error(
      "GARAGE: carForm, carList, or carMessage was not found."
    );
    return;
  }

  if (!client) {
    message.textContent =
      "Supabase is not connected. Check supabase-client.js.";
    return;
  }

  let currentUser = null;
  let isLoading = false;

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.style.color = isError ? "#ff7777" : "#39ff14";
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function setBusy(busy) {
    const button = form.querySelector('[type="submit"]');

    if (button) {
      button.disabled = busy;
      button.textContent = busy ? "Saving..." : "Add car";
    }

    isLoading = busy;
  }

  async function getUser() {
    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    currentUser = data.session?.user || null;
    return currentUser;
  }

  function renderCars(cars) {
    list.replaceChildren();

    if (!cars.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No cars listed yet. Add your first car!";
      list.appendChild(empty);
      return;
    }

    for (const car of cars) {
      const article = document.createElement("article");
      article.className = "car-card";

      const title = document.createElement("h3");
      title.textContent = car.title || car.name || "Untitled car";

      const details = document.createElement("p");
      details.textContent = car.description || car.details || "No details provided.";

      const price = document.createElement("p");
      const numericPrice = Number(car.price);

      price.textContent = Number.isFinite(numericPrice)
        ? `$${numericPrice.toLocaleString("en-US")}`
        : "Price not provided";

      article.append(title, price, details);
      list.appendChild(article);
    }
  }

  async function loadCars() {
    try {
      showMessage("Loading cars...");

      const { data, error } = await client
        .from("cars")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      renderCars(data || []);

      if (!data?.length) {
        showMessage("No cars listed yet.");
      } else {
        showMessage(`${data.length} car(s) loaded.`);
      }
    } catch (error) {
      console.error("GARAGE: Could not load cars:", error);
      showMessage(
        "Could not load cars: " + error.message,
        true
      );
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isLoading) return;

    try {
      setBusy(true);

      const user = await getUser();

      if (!user) {
        showMessage("Please sign in before adding a car.", true);
        return;
      }

      const titleInput =
        form.querySelector('[name="title"]') ||
        form.querySelector('[name="name"]') ||
        form.querySelector("#carTitle") ||
        form.querySelector("#carName");

      const descriptionInput =
        form.querySelector('[name="description"]') ||
        form.querySelector("#carDescription") ||
        form.querySelector("#carDetails");

      const priceInput =
        form.querySelector('[name="price"]') ||
        form.querySelector("#carPrice");

      const title = titleInput?.value.trim() || "";
      const description = descriptionInput?.value.trim() || "";
      const priceText = priceInput?.value.trim() || "";

      if (!title) {
        showMessage("Enter a car title or name.", true);
        return;
      }

      const price = priceText === "" ? null : Number(priceText);

      if (price !== null && (!Number.isFinite(price) || price < 0)) {
        showMessage("Enter a valid price.", true);
        return;
      }

      const { error } = await client.from("cars").insert({
        user_id: user.id,
        title,
        description,
        price
      });

      if (error) throw error;

      form.reset();
      showMessage("Car added successfully!");
      await loadCars();
    } catch (error) {
      console.error("GARAGE: Could not add car:", error);
      showMessage("Could not add car: " + error.message, true);
    } finally {
      setBusy(false);
    }
  });

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
  });

  loadCars();
})();
