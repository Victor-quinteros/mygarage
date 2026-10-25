
(() => {
  "use strict";

  const SUPABASE_URL = "https://ovooslmyfavrtlxazykq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_XHfXBMkf6eng2p3gTLqC6g_A8aZB6dF";

 const client = window.garageSupabase;

  const form = document.getElementById("carForm");
  const list = document.getElementById("carList");
  const message = document.getElementById("carMessage");

  if (!form || !list || !message) return;

  const makeInput = document.getElementById("carMake");
  const modelInput = document.getElementById("carModel");
  const yearInput = document.getElementById("carYear");
  const descriptionInput = document.getElementById("carDescription");
  const modsInput = document.getElementById("carMods");
  const submitButton = form.querySelector('button[type="submit"]');

  function addTextElement(parent, tag, text) {
    const element = document.createElement(tag);
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  async function getUser() {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async function loadCars() {
    list.replaceChildren();

    try {
      const { data, error } = await client
        .from("cars")
        .select("id, user_id, make, model, year, description, modifications, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        addTextElement(list, "p", "No cars have been added yet.");
        return;
      }

      const { data: userData } = await client.auth.getUser();
      const currentUser = userData?.user;

      data.forEach((car) => {
        const card = document.createElement("article");
        card.className = "car-card";

        const title = `${car.year ? car.year + " " : ""}${car.make} ${car.model}`;
        addTextElement(card, "h3", title);

        if (car.description) {
          addTextElement(card, "p", car.description);
        }

        if (car.modifications) {
          addTextElement(card, "p", "Modifications: " + car.modifications);
        }

        if (currentUser && currentUser.id === car.user_id) {
          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "primary";
          deleteButton.textContent = "Delete car";

          deleteButton.addEventListener("click", async () => {
            if (!confirm("Delete this car from your garage?")) return;

            deleteButton.disabled = true;

            const { error: deleteError } = await client
              .from("cars")
              .delete()
              .eq("id", car.id)
              .eq("user_id", currentUser.id);

            if (deleteError) {
              message.textContent = "Could not delete car: " + deleteError.message;
              deleteButton.disabled = false;
              return;
            }

            message.textContent = "Car deleted.";
            await loadCars();
          });

          card.appendChild(deleteButton);
        }

        list.appendChild(card);
      });
    } catch (error) {
      console.error("Loading cars failed:", error);
      list.replaceChildren();
      addTextElement(list, "p", "Could not load cars: " + error.message);
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    submitButton.disabled = true;
    message.textContent = "Saving your car...";

    try {
      const user = await getUser();

      if (!user) {
        throw new Error("Please log in before adding a car.");
      }

      const make = makeInput.value.trim();
      const model = modelInput.value.trim();
      const yearText = yearInput.value.trim();
      const year = yearText ? Number(yearText) : null;

      if (!make || !model) {
        throw new Error("Please enter the car's make and model.");
      }

      if (year !== null && (!Number.isInteger(year) || year < 1886 || year > 2100)) {
        throw new Error("Please enter a valid year between 1886 and 2100.");
      }

      const { error } = await client.from("cars").insert({
        user_id: user.id,
        make,
        model,
        year,
        description: descriptionInput.value.trim(),
        modifications: modsInput.value.trim()
      });

      if (error) throw error;

      form.reset();
      message.textContent = "Car saved successfully!";
      await loadCars();
    } catch (error) {
      console.error("Saving car failed:", error);
      message.textContent = "Could not save car: " + error.message;
    } finally {
      submitButton.disabled = false;
    }
  });

  async function initialize() {
    try {
      const user = await getUser();

      if (!user) {
        message.textContent = "Log in to add cars to your garage.";
        submitButton.disabled = true;
      }

      await loadCars();
    } catch (error) {
      message.textContent = "Could not check login: " + error.message;
      list.replaceChildren();
    }
  }

  initialize();
})();
