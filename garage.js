
/* =========================================================
   GARAGE — PERSONAL CAR GARAGE
   ---------------------------------------------------------
   Responsibilities:
   1. Load cars from Supabase.
   2. Add cars for the signed-in user.
   3. Delete only cars owned by the signed-in user.
   4. Refresh when authentication changes.
   5. Use the shared Supabase client.
========================================================= */

(() => {
  "use strict";

  const client = window.garageSupabase;

  const form = document.getElementById("carForm");
  const list = document.getElementById("carList");
  const message = document.getElementById("carMessage");

  const makeInput = document.getElementById("carMake");
  const modelInput = document.getElementById("carModel");
  const yearInput = document.getElementById("carYear");
  const descriptionInput = document.getElementById("carDescription");
  const modsInput = document.getElementById("carMods");

  const submitButton = form?.querySelector('button[type="submit"]');
  const originalButtonText = submitButton?.textContent || "Save car";

  let currentUser = null;
  let isSaving = false;
  let isDeleting = false;
  let loadVersion = 0;
  let authSubscription = null;
  let destroyed = false;

  function addTextElement(parent, tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text;

    if (className) {
      element.className = className;
    }

    parent.appendChild(element);
    return element;
  }

  function showMessage(text, isError = false) {
    if (!message) return;

    message.textContent = text;
    message.classList.toggle("error", isError);
    message.setAttribute("role", isError ? "alert" : "status");
  }

  function friendlyError(error) {
    const text = error?.message || "An unexpected error occurred.";

    if (/row-level security|permission denied|not allowed/i.test(text)) {
      return "Supabase denied this action. Check the cars table's RLS policies and permissions.";
    }

    if (/network|fetch failed|failed to fetch/i.test(text)) {
      return "Could not connect to Supabase. Check your internet connection.";
    }

    return text;
  }

  function setFormEnabled(enabled) {
    if (!form) return;

    form.querySelectorAll("input, textarea, select").forEach((element) => {
      element.disabled = !enabled || isSaving;
    });

    if (submitButton) {
      submitButton.disabled = !enabled || isSaving;
      submitButton.textContent = isSaving
        ? "Saving..."
        : originalButtonText;
    }
  }

  async function getUser() {
    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    return data.session?.user ?? null;
  }

  function updateFormAccess() {
    const loggedIn = Boolean(currentUser);
    setFormEnabled(loggedIn);

    if (!loggedIn && !isSaving) {
      showMessage("Sign in to add a car.");
    } else if (loggedIn && !isSaving) {
      showMessage("Add a car to your personal garage.");
    }
  }

  function makeCarTitle(car) {
    return [
      car.year ? String(car.year) : "",
      car.make || "Unknown make",
      car.model || "Unknown model"
    ].filter(Boolean).join(" ");
  }

  function renderCar(car) {
    const card = document.createElement("article");
    card.className = "car-card";

    addTextElement(card, "h3", makeCarTitle(car));

    if (car.description) {
      addTextElement(card, "p", car.description);
    }

    if (car.modifications) {
      addTextElement(
        card,
        "p",
        "Modifications: " + car.modifications
      );
    }

    if (car.created_at) {
      const date = new Date(car.created_at);

      if (!Number.isNaN(date.getTime())) {
        addTextElement(
          card,
          "p",
          "Added " + date.toLocaleDateString(),
          "muted"
        );
      }
    }

    if (currentUser && currentUser.id === car.user_id) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "primary";
      deleteButton.textContent = "Delete car";

      deleteButton.addEventListener("click", async () => {
        if (isDeleting) return;

        if (!window.confirm("Delete this car from your garage?")) {
          return;
        }

        isDeleting = true;
        deleteButton.disabled = true;
        showMessage("Deleting car...");

        try {
          const user = await getUser();

          if (!user || user.id !== car.user_id) {
            throw new Error(
              "Sign in with the account that owns this car."
            );
          }

          const { data, error } = await client
            .from("cars")
            .delete()
            .eq("id", car.id)
            .eq("user_id", user.id)
            .select("id");

          if (error) throw error;

          if (!data || data.length === 0) {
            throw new Error(
              "No car was deleted. Check your Supabase DELETE policy."
            );
          }

          showMessage("Car deleted successfully.");
          await loadCars({ preserveMessage: true });
        } catch (error) {
          console.error("GARAGE: Delete failed:", error);
          showMessage(
            "Could not delete car: " + friendlyError(error),
            true
          );
        } finally {
          isDeleting = false;
        }
      });

      card.appendChild(deleteButton);
    }

    return card;
  }

  async function loadCars(options = {}) {
    if (destroyed || !list) return;

    const version = ++loadVersion;

    list.replaceChildren();
    addTextElement(list, "p", "Loading cars...");

    try {
      const { data, error } = await client
        .from("cars")
        .select(
          "id, user_id, make, model, year, description, modifications, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Ignore results from an older request.
      if (destroyed || version !== loadVersion) return;

      list.replaceChildren();

      if (!data || data.length === 0) {
        addTextElement(list, "p", "No cars have been added yet.");
        return;
      }

      data.forEach((car) => {
        list.appendChild(renderCar(car));
      });
    } catch (error) {
      if (destroyed || version !== loadVersion) return;

      console.error("GARAGE: Loading cars failed:", error);
      list.replaceChildren();

      addTextElement(
        list,
        "p",
        "Could not load cars: " + friendlyError(error)
      );

      if (!options.preserveMessage) {
        showMessage(
          "Could not load cars. Check your Supabase connection and table permissions.",
          true
        );
      }
    }
  }

  if (!form || !list || !message) {
    console.error(
      "GARAGE: Required elements carForm, carList or carMessage are missing."
    );
    return;
  }

  if (
    !makeInput ||
    !modelInput ||
    !yearInput ||
    !descriptionInput ||
    !modsInput
  ) {
    showMessage("The car form is missing required fields.", true);
    console.error("GARAGE: Check the car form element IDs in index.html.");
    return;
  }

  if (!client?.auth || !client?.from) {
    showMessage(
      "Supabase did not load. Check supabase-client.js and script order.",
      true
    );
    console.error("GARAGE: Shared Supabase client is unavailable.");
    return;
  }

  /* =========================================================
     ADD A CAR
  ========================================================= */

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSaving) return;

    isSaving = true;
    setFormEnabled(false);
    showMessage("Saving your car...");

    try {
      const user = await getUser();

      if (!user) {
        currentUser = null;
        throw new Error("Please sign in before adding a car.");
      }

      const make = makeInput.value.trim();
      const model = modelInput.value.trim();
      const yearText = yearInput.value.trim();
      const year = yearText ? Number(yearText) : null;
      const description = descriptionInput.value.trim();
      const modifications = modsInput.value.trim();

      if (!make || !model) {
        throw new Error("Please enter the car's make and model.");
      }

      if (
        year !== null &&
        (
          !Number.isInteger(year) ||
          year < 1886 ||
          year > new Date().getFullYear() + 1
        )
      ) {
        throw new Error("Enter a valid car year.");
      }

      const { data, error } = await client
        .from("cars")
        .insert({
          user_id: user.id,
          make,
          model,
          year,
          description: description || null,
          modifications: modifications || null
        })
        .select("id")
        .single();

      if (error) throw error;

      if (!data?.id) {
        throw new Error("Supabase did not confirm that the car was saved.");
      }

      currentUser = user;
      form.reset();

      // Refresh the list, then restore the success message.
      await loadCars({ preserveMessage: true });
      showMessage("Car saved successfully!");
    } catch (error) {
      console.error("GARAGE: Saving car failed:", error);
      showMessage(
        "Could not save car: " + friendlyError(error),
        true
      );
    } finally {
      isSaving = false;
      updateFormAccess();
    }
  });

  /* =========================================================
     AUTHENTICATION AND STARTUP
  ========================================================= */

  async function initialize() {
    try {
      currentUser = await getUser();

      if (destroyed) return;

      updateFormAccess();
      await loadCars();
    } catch (error) {
      console.error("GARAGE: Initialization failed:", error);
      showMessage(
        "Garage setup failed: " + friendlyError(error),
        true
      );
    }
  }

  // Listen for sign-in and sign-out events.
  const { data, error } = client.auth.onAuthStateChange(
    (_event, session) => {
      currentUser = session?.user ?? null;

      // Defer UI and database work until the auth callback returns.
      Promise.resolve().then(async () => {
        if (destroyed) return;

        updateFormAccess();
        await loadCars();
      });
    }
  );

  if (error) {
    console.error("GARAGE: Could not register auth listener:", error);
  }

  authSubscription = data?.subscription ?? null;

  window.addEventListener("pagehide", () => {
    destroyed = true;
    loadVersion++;
    authSubscription?.unsubscribe();
  }, { once: true });

  initialize();
})();
