(function () {
  "use strict";

  const DEFAULT_TIMEOUT = 15000;

  function getErrorMessage(response, data, fallbackMessage) {
    if (response.status === 429) {
      return "Too many requests were submitted in a short period. Please wait a moment and try again.";
    }

    if (data && Array.isArray(data.errors)) {
      const messages = data.errors
        .map(function (error) {
          return error && (error.message || error.error);
        })
        .filter(Boolean);

      if (messages.length) {
        return messages.join(" ");
      }
    }

    if (data && typeof data.error === "string") {
      return data.error;
    }

    return fallbackMessage || "Please try again.";
  }

  async function readJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  function enhanceForm(form) {
    const submitButton = form.querySelector('[type="submit"]');
    const status = form.querySelector("[data-form-status]");
    const successTemplate = form.querySelector("[data-form-success]");

    if (!submitButton || !status || !successTemplate) {
      return;
    }

    const defaultButtonLabel = submitButton.textContent;
    const fallbackErrorMessage = form.dataset.formErrorMessage;
    let submitting = false;

    function renderState(state, message) {
      form.classList.toggle("is-submitting", state === "submitting");
      form.setAttribute("data-form-state", state);
      status.classList.toggle("form-status--error", state === "error");
      status.setAttribute("role", state === "error" ? "alert" : "status");
      status.setAttribute("aria-live", state === "error" ? "assertive" : "polite");

      if (state === "submitting") {
        form.setAttribute("aria-busy", "true");
        submitButton.disabled = true;
        submitButton.textContent = "Sending…";
        status.textContent = "Sending your request…";
        return;
      }

      form.removeAttribute("aria-busy");
      submitButton.disabled = false;
      submitButton.textContent = defaultButtonLabel;

      if (state === "error") {
        status.replaceChildren();

        const title = document.createElement("strong");
        title.className = "form-status__title";
        title.textContent = "We couldn’t send your request.";

        const detail = document.createElement("span");
        detail.textContent = message;
        status.append(title, detail);
        return;
      }

      status.textContent = "";
    }

    function renderSuccess() {
      form.removeAttribute("aria-busy");
      form.removeAttribute("aria-describedby");
      form.setAttribute("data-form-state", "success");
      form.reset();
      form.replaceChildren(successTemplate.content.cloneNode(true));

      const focusTarget = form.querySelector("[data-form-success-focus]");
      if (focusTarget) {
        focusTarget.focus();
      }
    }

    form.setAttribute("data-form-state", "idle");

    form.addEventListener("submit", async function (event) {
      if (!form.checkValidity()) {
        return;
      }

      event.preventDefault();

      if (submitting) {
        return;
      }

      submitting = true;
      renderState("submitting");

      const controller = new AbortController();
      const timeout = window.setTimeout(function () {
        controller.abort();
      }, DEFAULT_TIMEOUT);

      try {
        const response = await fetch(form.action, {
          method: form.method || "POST",
          body: new FormData(form),
          headers: {
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        const data = await readJson(response);

        if (!response.ok) {
          throw new Error(getErrorMessage(response, data, fallbackErrorMessage));
        }

        renderSuccess();
      } catch (error) {
        const message =
          error.name === "AbortError"
            ? "The request took too long to complete. Your information is still here, so please try again."
            : error.message || getErrorMessage({}, null, fallbackErrorMessage);
        renderState("error", message);
      } finally {
        window.clearTimeout(timeout);
        submitting = false;
      }
    });
  }

  document.querySelectorAll("[data-async-form]").forEach(enhanceForm);
})();
