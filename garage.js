
/* =========================================================
   1. GARAGE SETUP
   Connects the garage form and car list to Supabase.
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

  let currentUser = null;
  let isSaving = false;
  let authListener = null;

  function addTextElement(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function showMessage(text, isError = false) {
    if (!message) return;

    message.textContent = text;
    message.classList.toggle("error", isError);
    message.setAttribute("role", isError ? "alert" : "status");
  }

  function setFormEnabled(enabled) {
    if (!form) return;

    form.querySelectorAll("input, textarea, select, button").forEach((element) => {
      element.disabled = !enabled;
    });
  }

  function friendlyError(error) {
    const text = error?.message || "An unexpected error occurred.";

    if (/row-level security|permission denied|not allowed/i.test(text)) {
      return "Supabase denied this action. Check the cars table's permissions and RLS policies.";
    }

    if (/network|fetch failed|failed to fetch/i.test(text)) {
      return "Could not connect to Supabase. Check your internet connection and Supabase project.";
    }

    return text;
  }

  if (!form || !list || !message) {
    console.error(
      "GARAGE: Required elements carForm, carList, or carMessage were not found."
    );
    return;
  }

  if (!client?.auth || !client?.from) {
    showMessage("Supabase did not load. Check supabase-client.js and script order.", true);
    console.error("GARAGE: window.garageSupabase is unavailable.");
    return;
  }

  if (!makeInput || !modelInput || !yearInput || !descriptionInput || !modsInput) {
    showMessage("The garage form is missing one or more required fields.", true);
    console.error("GARAGE: Check the carMake, carModel, carYear, carDescription and carMods IDs.");
    return;
  }

  /* =========================================================
     2. AUTHENTICATION
     Gets the signed-in user without exposing private keys.
  ========================================================= */

  async function getUser() {
    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    return data.session?.user ?? null;
  }

  function updateFormAccess() {
    const loggedIn = Boolean(currentUser);

    setFormEnabled(loggedIn);

    if (!loggedIn) {
      showMessage("Sign in to add a car. Public cars may still be visible below.");
    } else {
      showMessage("You can add a car to your garage.");
    }
  }

  /* =========================================================
     3. LOAD CARS
     Public visibility depends on your Supabase SELECT policy.
  ========================================================= */

  async function loadCars() {
    list.replaceChildren();
    addTextElement(list, "p", "Loading cars...");

    try {
      const { data, error } = await client
        .from("cars")
        .select("id, user_id, make, model, year, description, modifications, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      list.replaceChildren();

      if (!data || data.length === 0) {
        addTextElement(list, "p", "No cars have been added yet.");
        return;
      }

      // Refresh the session before deciding which delete buttons to show.
      currentUser = await getUser();

      data.forEach((car) => {
        const card = document.createElement("article");
        card.className = "car-card";

        const title = [
          car.year ? String(car.year) : "",
          car.make || "Unknown make",
          car.model || "Unknown model"
        ].filter(Boolean).join(" ");

        addTextElement(card, "h3", title);

        if (car.description) {
          addTextElement(card, "p", car.description);
        }

        if (car.modifications) {
          addTextElement(card, "p", "Modifications: " + car.modifications);
        }

        if (car.created_at) {
          const date = new Date(car.created_at);

          if (!Number.isNaN(date.getTime())) {
            addTextElement(
              card,
              "p",
              "Added " + date.toLocaleDateString()
            ).className = "muted";
          }
        }

        // Only show the delete button for the current user's own car.
        if (currentUser && currentUser.id === car.user_id) {
          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "primary";
          deleteButton.textContent = "Delete car";

          deleteButton.addEventListener("click", async () => {
            if (!confirm("Delete this car from your garage?")) return;

            deleteButton.disabled = true;
            showMessage("Deleting car...");

            try {
              const user = await getUser();

              if (!user || user.id !== car.user_id) {
                throw new Error("Please sign in with the account that owns this car.");
              }

              const { data: deletedRows, error: deleteError } = await client
                .from("cars")
                .delete()
                .eq("id", car.id)
                .eq("user_id", user.id)
                .select("id");

              if (deleteError) throw deleteError;

              if (!deletedRows || deletedRows.length === 0) {
                throw new Error(
                  "No car was deleted. Check your Supabase DELETE policy for the cars table."
                );
              }

              showMessage("Car deleted successfully.");
              await loadCars();
            } catch (error) {
              console.error("GARAGE: Delete failed:", error);
              showMessage("Could not delete car: " + friendlyError(error), true);
              deleteButton.disabled = false;
            }
          });

          card.appendChild(deleteButton);
        }

        list.appendChild(card);
      });
    } catch (error) {
      console.error("GARAGE: Loading cars failed:", error);
      list.replaceChildren();
      addTextElement(list, "p", "Could not load cars: " + friendlyError(error));
      showMessage("Could not load cars. Check your Supabase connection and table permissions.", true);
    }
  }

  /* =========================================================
     4. ADD A CAR
     Saves only the signed-in user's own record.
  ========================================================= */

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSaving) return;

    isSaving = true;

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
    }

    try {
      const user = await getUser();

      if (!user) {
        currentUser = null;
        updateFormAccess();
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
        (!Number.isInteger(year) || year < 1886 || year > new Date().getFullYear() + 1)
      ) {
        throw new Error("Enter a valid car year.");
      }

      showMessage("Saving your car...");

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

      form.reset();
      currentUser = user;
      showMessage("Car saved successfully!");
      await loadCars();
      showMessage("Car saved successfully!");
    } catch (error) {
      console.error("GARAGE: Saving car failed:", error);
      showMessage("Could not save car: " + friendlyError(error), true);
    } finally {
      isSaving = false;

      if (submitButton) {
        submitButton.textContent = "Add car";
      }

      updateFormAccess();
    }
  });

  /* =========================================================
     5. AUTH CHANGES AND STARTUP
     Refreshes the garage when a user signs in or out.
  ========================================================= */

  async function initialize() {
    try {
      currentUser = await getUser();
      updateFormAccess();
      await loadCars();
      updateFormAccess();
    } catch (error) {
      console.error("GARAGE: Initialization failed:", error);
      showMessage("Garage setup failed: " + friendlyError(error), true);
    }
  }

  const { data: authData } = client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;

    // Defer Supabase queries until after the auth callback completes.
    Promise.resolve().then(async () => {
      updateFormAccess();
      await loadCars();
    });
  });

  authListener = authData?.subscription ?? null;

  window.addEventListener("beforeunload", () => {
    authListener?.unsubscribe();
  });

  initialize();
})();
