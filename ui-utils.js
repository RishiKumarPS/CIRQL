import { normalizePhoneNumber } from "./supabase-client.js";

const memberStorageKeys = [
  "applicant_id",
  "applicant_phone",
  "applicant_verified",
];
const toastTimers = new WeakMap();
const buttonStates = new WeakMap();

export function showToast(message, type = "info") {
  const toast = document.getElementById("app-toast");
  if (!toast) return;

  clearToastTimers(toast);
  const toastType = ["error", "info", "success"].includes(type)
    ? type
    : "info";
  toast.dataset.type = toastType;
  toast.setAttribute("role", toastType === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", toastType === "error" ? "assertive" : "polite");
  toast.textContent = String(message);
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("is-visible"));

  const hideTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    const removeTimer = window.setTimeout(() => {
      toast.hidden = true;
      toastTimers.delete(toast);
    }, 220);
    toastTimers.set(toast, { hideTimer: null, removeTimer });
  }, 4200);
  toastTimers.set(toast, { hideTimer, removeTimer: null });
}

export function hideToast() {
  const toast = document.getElementById("app-toast");
  if (!toast) return;
  clearToastTimers(toast);
  toast.classList.remove("is-visible");
  toast.hidden = true;
}

export function getStoredMember() {
  const values = Object.fromEntries(
    memberStorageKeys.map((key) => [key, ""]),
  );
  try {
    for (const key of memberStorageKeys) {
      const value =
        sessionStorage.getItem(key) || localStorage.getItem(key) || "";
      values[key] = value;
      if (value) {
        sessionStorage.setItem(key, value);
        localStorage.setItem(key, value);
      }
    }
  } catch (error) {
    console.warn("Member storage is unavailable.", error);
  }

  return {
    id: values.applicant_id,
    phone: values.applicant_phone,
    verified: values.applicant_verified === "true",
  };
}

export function setStoredMember(applicant, verified) {
  const values = {
    applicant_id: String(applicant?.id ?? applicant?.applicant_id ?? ""),
    applicant_phone: normalizePhoneNumber(
      applicant?.phone ?? applicant?.applicant_phone ?? "",
    ),
    applicant_verified: String(Boolean(verified)),
  };
  try {
    for (const [key, value] of Object.entries(values)) {
      localStorage.setItem(key, value);
      sessionStorage.setItem(key, value);
    }
  } catch (error) {
    console.warn("Member session could not be persisted.", error);
  }
}

export function clearStoredMember() {
  try {
    for (const key of memberStorageKeys) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch (error) {
    console.warn("Member session could not be cleared.", error);
  }
}

export function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;
  if (!(button instanceof HTMLButtonElement)) {
    throw new TypeError("Loading state can only be set on a button element.");
  }

  if (isLoading) {
    if (!buttonStates.has(button)) {
      buttonStates.set(button, {
        text: button.textContent,
        disabled: button.disabled,
        ariaBusy: button.getAttribute("aria-busy"),
      });
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (loadingText !== undefined) button.textContent = loadingText;
    return;
  }

  const previous = buttonStates.get(button);
  if (!previous) return;
  button.textContent = previous.text;
  button.disabled = previous.disabled;
  if (previous.ariaBusy === null) {
    button.removeAttribute("aria-busy");
  } else {
    button.setAttribute("aria-busy", previous.ariaBusy);
  }
  buttonStates.delete(button);
}

function clearToastTimers(toast) {
  const timers = toastTimers.get(toast);
  if (!timers) return;
  window.clearTimeout(timers.hideTimer);
  window.clearTimeout(timers.removeTimer);
  toastTimers.delete(toast);
}
