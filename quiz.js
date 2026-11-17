import { supabase } from "./supabase-client.js";
import {
  getStoredMember,
  setButtonLoading,
  setStoredMember,
  showToast,
} from "./ui-utils.js";

function writeApplicantStorage(key, value) {
  try {
    sessionStorage.setItem(key, value);
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Applicant storage could not be synchronized.", error);
  }
}

function resolveApplicantId() {
  try {
    const member = getStoredMember();
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("applicant_id");
    if (fromQuery) {
      setStoredMember(
        { id: fromQuery, phone: member.phone },
        member.verified,
      );
      return fromQuery;
    }
    if (member.id) return member.id;
  } catch (error) {
    console.warn(
      "Applicant session could not be resolved; continuing in demo mode.",
      error,
    );
  }

  console.warn(
    "No applicant_id found in sessionStorage or URL. Quiz will continue in demo mode.",
  );
  return null;
}

const TOTAL = 10;
const answers = {};
const applicantId = resolveApplicantId();
const draftKey = `cirql_quiz_draft_${applicantId || "demo"}`;
let isSubmitting = false;
let hasSubmitted = false;

function saveQuizDraft() {
  try {
    localStorage.setItem(draftKey, JSON.stringify(answers));
  } catch (error) {
    console.warn("Quiz answers could not be saved locally.", error);
    showToast("Your answers could not be saved on this device.");
  }
}

function restoreQuizDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey) || "{}");
    for (let question = 1; question <= TOTAL; question += 1) {
      const value = draft[String(question)];
      if (!["a", "b", "c", "d"].includes(value)) continue;
      answers[String(question)] = value;
      const option = document.querySelector(
        `.options[data-q="${question}"] .option-card[data-val="${value}"]`,
      );
      option?.classList.add("selected");
    }
  } catch (error) {
    console.warn("Saved quiz answers could not be restored.", error);
    showToast("Saved answers could not be restored.");
  }
}

function updateProgress() {
  const count = Object.keys(answers).length;
  const pct = Math.round((count / TOTAL) * 100);
  document.getElementById("progressBar").dataset.progress = String(count);
  document.getElementById("pct").textContent = pct + "%";
  document.getElementById("submitBtn").disabled =
    count < TOTAL || isSubmitting || hasSubmitted;
}

document.querySelectorAll(".options").forEach((group) => {
  group.querySelectorAll(".option-card").forEach((card) => {
    card.addEventListener("click", () => {
      if (isSubmitting || hasSubmitted) return;
      group
        .querySelectorAll(".option-card")
        .forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      answers[group.dataset.q] = card.dataset.val;
      saveQuizDraft();
      updateProgress();
    });
  });
});

restoreQuizDraft();
updateProgress();

document
  .getElementById("submitBtn")
  .addEventListener("click", async () => {
    if (isSubmitting || hasSubmitted) return;
    const submitBtn = document.getElementById("submitBtn");
    isSubmitting = true;
    setButtonLoading(submitBtn, true, "Submitting...");

    try {
      const cleanAnswers = {};
      for (let question = 1; question <= TOTAL; question += 1) {
        const answer = String(answers[String(question)] || "")
          .trim()
          .toLowerCase();
        if (!["a", "b", "c", "d"].includes(answer)) {
          throw new Error("Please answer all questions before submitting.");
        }
        cleanAnswers[String(question)] = answer;
      }

      const { error } = await supabase.from("quiz_responses").insert([
        {
          applicant_id: applicantId ? String(applicantId).trim() : null,
          answers: cleanAnswers,
        },
      ]);
      if (error) throw error;

      try {
        localStorage.removeItem(draftKey);
      } catch (error) {
        console.warn("Submitted quiz draft could not be removed.", error);
        showToast(
          "Submitted successfully, but the saved draft remains on this device.",
        );
      }
      writeApplicantStorage("quiz_completed", "true");
      hasSubmitted = true;
      document.getElementById("resultOverlay").classList.add("show");
      window.scrollTo({ top: 0 });
    } catch (error) {
      console.error("Quiz submission failed:", error);
      showToast(
        "Your profile could not be submitted. Check your connection and retry.",
      );
    } finally {
      isSubmitting = false;
      setButtonLoading(submitBtn, false);
      updateProgress();
    }
  });

function restart() {
  document.getElementById("resultOverlay").classList.remove("show");
  document
    .querySelectorAll(".option-card")
    .forEach((c) => c.classList.remove("selected"));
  Object.keys(answers).forEach((k) => delete answers[k]);
  try {
    localStorage.removeItem(draftKey);
  } catch (error) {
    console.warn("Quiz draft could not be cleared.", error);
  }
  hasSubmitted = false;
  updateProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.getElementById("restartQuiz").addEventListener("click", () => {
  window.location.href = "index.html";
});
