import {
  supabase,
  normalizePhoneNumber,
  formatISTDateTime,
} from "./supabase-client.js";
import {
  clearStoredMember,
  getStoredMember,
  hideToast,
  setButtonLoading,
  setStoredMember,
  showToast,
} from "./ui-utils.js";

let memberApplicantId = null;
let memberProfile = null;
let memberQuizComplete = false;
let liveEventRecords = [];
let eventApplicationsByEventId = new Map();
let featuredEventRecord = null;
let pendingApplicant = null;
let pendingAuthMode = "signup";
let matchChannel = null;
let matchCountdownInterval = null;

function matchCacheKey(applicantId) {
  return `cirql_match_${applicantId}`;
}

function cacheMatchReveal(applicantId, match) {
  const existing = readCachedMatchReveal(applicantId);
  const incomingTime = Date.parse(match.created_at || "");
  const existingTime = Date.parse(existing?.created_at || "");
  if (
    Number.isFinite(incomingTime) &&
    Number.isFinite(existingTime) &&
    incomingTime < existingTime
  ) {
    return false;
  }

  try {
    sessionStorage.setItem(
      matchCacheKey(applicantId),
      JSON.stringify(match),
    );
  } catch (error) {
    console.warn("Match reveal could not be cached.", error);
  }
  return true;
}

function readCachedMatchReveal(applicantId) {
  try {
    const cached = sessionStorage.getItem(matchCacheKey(applicantId));
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.warn("Cached match reveal could not be read.", error);
    return null;
  }
}

function setTextNode(node, value) {
  if (!node) return;
  const svgNode = node.querySelector("svg");
  node.textContent = "";
  if (svgNode) {
    node.appendChild(svgNode.cloneNode(true));
  }
  node.appendChild(document.createTextNode(value));
}

function renderMatchReveal(match) {
  const label = document.getElementById("match-reveal-label");
  const score = document.getElementById("match-reveal-pct");
  const name = document.getElementById("match-reveal-name");
  const subtitle = document.getElementById("match-reveal-sub");
  const status = document.getElementById("match-reveal-status");
  const time = document.getElementById("match-reveal-time");
  window.clearInterval(matchCountdownInterval);
  const revealAt = new Date(match.reveal_at);

  if (Number.isNaN(revealAt.getTime())) return;

  const renderCountdown = () => {
    const remainingMinutes = Math.max(
      0,
      Math.ceil((revealAt.getTime() - Date.now()) / 60000),
    );

    if (remainingMinutes === 0) {
      window.clearInterval(matchCountdownInterval);
      if (label) label.textContent = "Your match is here";
      if (score) score.textContent = `${match.compatibility_score}%`;
      if (name) name.textContent = match.matched_name || "Your match";
      if (subtitle) subtitle.textContent = "Your CIRQL match";
      if (status) status.textContent = "Match revealed";
      if (time) time.textContent = "Just now";
      return;
    }

    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;
    const countdown = `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;

    if (label) label.textContent = "Reveal countdown";
    if (score) score.textContent = "—";
    if (name) name.textContent = "Your match is waiting";
    if (subtitle) subtitle.textContent = `Reveals in ${countdown}`;
    if (status) status.textContent = "Match reveal";
    if (time) time.textContent = `In ${countdown}`;
  };

  if (revealAt.getTime() <= Date.now()) {
    if (label) label.textContent = "Your match is here";
    if (score) score.textContent = `${match.compatibility_score}%`;
    if (name) name.textContent = match.matched_name || "Your match";
    if (subtitle) subtitle.textContent = "Your CIRQL match";
    if (status) status.textContent = "Match revealed";
    if (time) time.textContent = "Just now";
    return;
  }

  renderCountdown();
  matchCountdownInterval = window.setInterval(renderCountdown, 1000);
}

async function loadMatchReveal() {
  const applicantId = readMemberValue("applicant_id").trim();
  if (
    !applicantId ||
    readMemberValue("applicant_verified") !== "true"
  ) {
    return;
  }

  const cachedMatch = readCachedMatchReveal(applicantId);
  if (cachedMatch) renderMatchReveal(cachedMatch);

  try {
    if (!matchChannel) {
      matchChannel = supabase
        .channel(`match-reveal-${applicantId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "matches",
            filter: `applicant_id=eq.${applicantId}`,
          },
          (payload) => {
            const match = payload.new;
            if (!match || String(match.applicant_id) !== applicantId) {
              return;
            }
            if (cacheMatchReveal(applicantId, match)) {
              renderMatchReveal(match);
            }
          },
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            showToast("Live match updates are unavailable right now.");
          }
        });
    }

    const { data, error } = await supabase
      .from("matches")
      .select(
        "matched_name, compatibility_score, reveal_at, applicant_id, created_at",
      )
      .eq("applicant_id", applicantId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (data && data[0]) {
      if (cacheMatchReveal(applicantId, data[0])) {
        renderMatchReveal(data[0]);
      }
    }
  } catch (error) {
    console.error("Failed to load match reveal:", error);
    showToast("Your match could not be refreshed. Check your connection.");
  }
}

function formatEventDate(value) {
  return formatISTDateTime(value) || "Date TBA";
}

function renderFooterEventCTA() {
  const button = document.getElementById("footer-event-cta");
  if (!featuredEventRecord) {
    button.hidden = true;
    return;
  }

  button.hidden = false;
  button.textContent = `Join ${featuredEventRecord.title || "CIRQL"} →`;
}

function renderEventCard(card, eventItem, isFeatured) {
  if (!card || !eventItem) return;

  card.dataset.eventId = String(eventItem.id ?? "");

  const titleNode = card.querySelector(".event-title");
  const metaRows = card.querySelectorAll(".event-meta-row");
  const spotsLabel = card.querySelector(".spots-label");
  const fill = card.querySelector(".spots-fill");
  const tag = card.querySelector(".event-tag");
  const applyButton = card.querySelector(
    ".btn-apply-outline, .btn-apply",
  );

  const title = eventItem.title || "Untitled event";
  const subtitle = eventItem.subtitle || "";
  const location = eventItem.location || "Location TBA";
  const availableSpots = Math.max(
    0,
    Number(eventItem.spots_left) || 0,
  );
  const spotsText =
    availableSpots === 0
      ? "Spots Full"
      : availableSpots <= 5
        ? `Only ${availableSpots} ${availableSpots === 1 ? "spot" : "spots"} left`
        : `${availableSpots} spots left`;
  const eventDate = eventItem.event_date || null;

  if (titleNode) {
    titleNode.innerHTML = subtitle
      ? `${title} — <em class="serif u-inline-33d20f4f78">${subtitle}</em>`
      : title;
  }

  if (tag) {
    tag.className = `event-tag ${isFeatured ? "tag-live-dark" : "tag-soon"}`;
    tag.innerHTML = isFeatured
      ? '<span class="tag-dot"></span> Applications open'
      : "Coming soon";
  }

  if (metaRows[0]) {
    const dateText = formatEventDate(eventDate);
    setTextNode(metaRows[0], dateText);
  }

  if (metaRows[1]) {
    setTextNode(metaRows[1], location);
  }

  if (metaRows[2]) {
    const capacityText = isFeatured
      ? `Ages 21–26 · ${spotsText} · Curated 50/50 split`
      : `Ages 21–26 · ${spotsText} · ${eventItem.featured ? "Featured" : "Community"}`;
    setTextNode(metaRows[2], capacityText);
  }

  if (spotsLabel) {
    spotsLabel.textContent = spotsText;
    spotsLabel.classList.toggle(
      "is-urgent",
      availableSpots > 0 && availableSpots <= 5,
    );
    spotsLabel.classList.toggle("is-full", availableSpots === 0);
  }

  if (fill) {
    const fillPercent = Math.max(
      0,
      Math.min(100, (availableSpots / 60) * 100),
    );
    fill.dataset.progress = String(Math.round(fillPercent));
    fill.classList.toggle("is-empty", availableSpots === 0);
  }

  if (applyButton) {
    applyButton.type = "button";
    applyButton.dataset.eventId = String(eventItem.id ?? "");
    applyButton.disabled = availableSpots <= 0;
    applyButton.textContent =
      availableSpots <= 0 ? "Spots Full" : "Request Spot →";
  }

  renderMemberEventState(card, eventItem);
}

function renderMemberEventState(card, eventItem) {
  const applyButton = card.querySelector(
    ".btn-apply-outline, .btn-apply",
  );
  if (!applyButton) return;
  const existingBadge = card.querySelector(".event-status-badge");
  const application = eventApplicationsByEventId.get(
    String(eventItem.id),
  );

  if (application) {
    applyButton.hidden = true;
    const labels = {
      requested: "⏳ Application Under Review",
      approved: "✓ Spot Confirmed — You're In",
      waitlisted: "🔒 Waitlisted",
      rejected: "Application Closed",
    };
    const badge = existingBadge || document.createElement("span");
    badge.className = "event-status-badge";
    badge.dataset.status = application.status;
    badge.textContent =
      labels[application.status] || "Application Submitted";
    if (!existingBadge)
      applyButton.insertAdjacentElement("afterend", badge);
    return;
  }

  if (existingBadge) existingBadge.remove();
  applyButton.hidden = false;
  const spotsLeft = Math.max(
    0,
    Number(eventItem.spots_left) || 0,
  );
  applyButton.disabled = spotsLeft <= 0;
  applyButton.textContent =
    spotsLeft <= 0 ? "Spots Full" : "Request Spot →";
}

function readMemberValue(key) {
  const member = getStoredMember();
  return {
    applicant_id: member.id,
    applicant_phone: member.phone,
    applicant_verified: String(member.verified),
  }[key] || "";
}

function writeMemberSession(applicant, verified) {
  setStoredMember(applicant, verified);
}

function clearMemberSession() {
  const applicantId = readMemberValue("applicant_id");
  if (applicantId) {
    try {
      sessionStorage.removeItem(matchCacheKey(applicantId));
    } catch (error) {
      console.warn("Cached match reveal could not be cleared.", error);
    }
  }
  clearStoredMember();
  try {
    localStorage.removeItem("quiz_completed");
    sessionStorage.removeItem("quiz_completed");
  } catch (error) {
    console.warn("Quiz completion state could not be cleared.", error);
  }
  memberApplicantId = null;
  memberProfile = null;
  memberQuizComplete = false;
  eventApplicationsByEventId = new Map();
}

function renderMemberStatusBar() {
  const bar = document.getElementById("member-status-bar");
  const signInButton = document.getElementById("nav-sign-in");
  const applyButton = document.getElementById("nav-apply-btn");
  if (!memberApplicantId) {
    bar.hidden = true;
    signInButton.hidden = false;
    applyButton.textContent = "Join CIRQL";
    return;
  }

  const firstName = memberProfile?.first_name || "Member";
  document.getElementById("member-welcome").textContent =
    `Welcome back, ${firstName}`;
  const quizStatus = document.getElementById("member-quiz-status");
  if (memberQuizComplete) {
    quizStatus.className = "member-quiz-complete";
    quizStatus.textContent = "✓ Vibe Profile Complete";
  } else {
    quizStatus.className = "";
    quizStatus.innerHTML = `<a class="member-quiz-link" href="cirql-mcq.html?applicant_id=${encodeURIComponent(memberApplicantId)}">Complete your Vibe Quiz →</a>`;
  }
  document.getElementById("member-applications-count").textContent =
    `My Applications · ${eventApplicationsByEventId.size}`;
  bar.hidden = false;
  signInButton.hidden = true;
  applyButton.textContent = "Find an Event";
}

function renderMemberEventCards() {
  document
    .querySelectorAll(".event-card[data-event-id]")
    .forEach((card) => {
      const eventItem = liveEventRecords.find(
        (item) => String(item.id) === card.dataset.eventId,
      );
      if (eventItem) renderMemberEventState(card, eventItem);
    });
}

async function requestEventApplication(eventId) {
  const id = readMemberValue("applicant_id");
  const verified = readMemberValue("applicant_verified") === "true";
  if (!id || !verified) {
    openApplyModal();
    return;
  }

  const key = String(eventId);
  if (eventApplicationsByEventId.has(key)) return;
  const button = document.querySelector(
    `.event-card[data-event-id="${CSS.escape(key)}"] .btn-apply-outline, .event-card[data-event-id="${CSS.escape(key)}"] .btn-apply`,
  );
  if (button) {
    setButtonLoading(button, true, "Requesting...");
  }

  try {
    const { data, error } = await supabase
      .from("event_applications")
      .insert({
        event_id: eventId,
        applicant_id: id,
        status: "requested",
      })
      .select("event_id, status")
      .single();
    if (error) throw error;
    eventApplicationsByEventId.set(
      key,
      data || { event_id: eventId, status: "requested" },
    );
    renderMemberEventCards();
    renderMemberStatusBar();
  } catch (error) {
    console.error("Event application failed:", error);
    showToast("Your event request could not be sent. Please try again.");
  } finally {
    setButtonLoading(button, false);
  }
}

async function loadMemberDashboard() {
  const applicantId = readMemberValue("applicant_id");
  const applicantPhone = readMemberValue("applicant_phone");
  const verified = readMemberValue("applicant_verified") === "true";
  if (!applicantId || !verified) {
    memberApplicantId = null;
    memberProfile = null;
    memberQuizComplete = false;
    eventApplicationsByEventId = new Map();
    renderMemberStatusBar();
    renderMemberEventCards();
    return;
  }

  memberApplicantId = applicantId;
  try {
    const [profileResult, quizResult, applicationsResult] =
      await Promise.all([
        supabase
          .from("applicants")
          .select("id, first_name, last_name, phone, email, intent")
          .eq("id", applicantId)
          .maybeSingle(),
        supabase
          .from("quiz_responses")
          .select("applicant_id")
          .eq("applicant_id", applicantId)
          .limit(1),
        supabase
          .from("event_applications")
          .select("event_id, status")
          .eq("applicant_id", applicantId),
      ]);

    if (profileResult.error) throw profileResult.error;
    if (quizResult.error) throw quizResult.error;
    if (applicationsResult.error) throw applicationsResult.error;

    memberProfile = profileResult.data || memberProfile || {};
    if (!memberProfile.phone) memberProfile.phone = applicantPhone;
    memberQuizComplete = (quizResult.data || []).length > 0;
    eventApplicationsByEventId = new Map(
      (applicationsResult.data || []).map((application) => [
        String(application.event_id),
        application,
      ]),
    );
    renderMemberStatusBar();
    renderMemberEventCards();
  } catch (error) {
    console.error("Member status could not be loaded:", error);
    showToast("Member details could not be loaded. Check your connection.");
    renderMemberStatusBar();
  }
}

async function loadEvents() {
  const eventsGrid = document.querySelector(".events-grid");
  if (eventsGrid) {
    eventsGrid.classList.add("is-loading");
    eventsGrid.setAttribute("aria-busy", "true");
  }
  const cards = document.querySelectorAll(".event-card");
  cards.forEach((card) => {
    const titleNode = card.querySelector(".event-title");
    const spotsLabel = card.querySelector(".spots-label");
    const fill = card.querySelector(".spots-fill");
    const tag = card.querySelector(".event-tag");

    if (titleNode) {
      titleNode.innerHTML = "Loading...";
    }
    if (spotsLabel) {
      spotsLabel.textContent = "Loading...";
    }
    if (fill) {
      fill.classList.add("is-empty");
    }
    if (tag) {
      tag.innerHTML = "Loading...";
    }
  });

  try {
    const { data, error } = await supabase
      .from("events")
      .select(
        "id, title, subtitle, event_date, location, spots_left, featured",
      )
      .order("featured", { ascending: false })
      .order("event_date", { ascending: true });

    if (error) {
      throw error;
    }

    const records = Array.isArray(data) ? data : [];
    liveEventRecords = records;
    const cardsArray = Array.from(cards);
    const featuredRecord =
      records.find((record) => record.featured) || records[0] || null;
    featuredEventRecord = featuredRecord;
    renderFooterEventCTA();
    const secondaryRecords = records
      .filter((record) => record !== featuredRecord)
      .slice(0, cardsArray.length - 1);

    if (featuredRecord) {
      renderEventCard(cardsArray[0], featuredRecord, true);
    }

    secondaryRecords.forEach((record, index) => {
      const cardIndex = index + 1;
      if (cardsArray[cardIndex]) {
        renderEventCard(cardsArray[cardIndex], record, false);
      }
    });

    cardsArray.forEach((card, index) => {
      if (index === 0) return;
      const eventIndex = index - 1;
      if (eventIndex >= secondaryRecords.length) {
        const titleNode = card.querySelector(".event-title");
        const spotsLabel = card.querySelector(".spots-label");
        const tag = card.querySelector(".event-tag");
        const metaRows = card.querySelectorAll(".event-meta-row");

        if (titleNode) {
          titleNode.innerHTML = "More details soon";
        }
        if (spotsLabel) {
          spotsLabel.textContent = "Waitlist";
        }
        if (tag) {
          tag.innerHTML = "Coming soon";
        }
        if (metaRows[0]) setTextNode(metaRows[0], "Date TBA");
        if (metaRows[1]) setTextNode(metaRows[1], "Location TBA");
        if (metaRows[2])
          setTextNode(metaRows[2], "Ages 21–26 · Waitlist open");
      }
    });

    if (!records.length) {
      const noDataTitle = cardsArray[0]?.querySelector(".event-title");
      if (noDataTitle) {
        noDataTitle.innerHTML = "No events yet";
      }
      cardsArray.forEach((card, index) => {
        if (index === 0) return;
        const titleNode = card.querySelector(".event-title");
        if (titleNode) titleNode.innerHTML = "Check back soon";
      });
    }
  } catch (error) {
    console.error("Failed to load events:", error);
    showToast("Events could not be loaded. Check your connection.");
    featuredEventRecord = null;
    renderFooterEventCTA();
    const cardsArray = Array.from(
      document.querySelectorAll(".event-card"),
    );
    cardsArray.forEach((card, index) => {
      const titleNode = card.querySelector(".event-title");
      const spotsLabel = card.querySelector(".spots-label");
      const tag = card.querySelector(".event-tag");

      if (titleNode) {
        titleNode.innerHTML =
          index === 0
            ? "Event schedule unavailable"
            : "More details soon";
      }
      if (spotsLabel) {
        spotsLabel.textContent = "Check back soon";
      }
      if (tag) {
        tag.innerHTML =
          index === 0
            ? '<span class="tag-dot"></span> Try again later'
            : "Coming soon";
      }
    });
  } finally {
    if (eventsGrid) {
      eventsGrid.classList.remove("is-loading");
      eventsGrid.setAttribute("aria-busy", "false");
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadEvents();
  loadMatchReveal();
  await loadMemberDashboard();
});

// Smooth reveal on scroll
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.1 },
);

document
  .querySelectorAll(
    ".step-card, .event-card, .price-card, .safety-step, .safety-stat-card, .exp-feature",
  )
  .forEach((el) => {
    el.classList.add("scroll-reveal");
    observer.observe(el);
  });

// Modal input styling fix (focus state)
document
  .querySelectorAll("#apply-modal input, #apply-modal select")
  .forEach((el) => {
    el.addEventListener("focus", () => el.classList.add("is-focused"));
    el.addEventListener("blur", () => el.classList.remove("is-focused"));
  });

function setAuthMode(mode) {
  const signup = mode === "signup";
  const login = mode === "login";
  const switcher = document.getElementById("auth-mode-switch");
  const signupForm = document.getElementById("applicant-form");
  const loginForm = document.getElementById("member-login-container");
  const otpContainer = document.getElementById("otp-container");
  const title = document.getElementById("modal-title");
  const subtitle = document.getElementById("modal-subtitle");

  if (mode !== "otp") pendingAuthMode = mode;
  switcher.classList.toggle("is-hidden", mode === "otp");
  signupForm.hidden = !signup;
  loginForm.hidden = !login;
  otpContainer.hidden = mode !== "otp";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle(
      "is-active",
      button.dataset.authMode === mode,
    );
  });

  if (signup) {
    title.textContent = "Join CIRQL";
    subtitle.textContent =
      "Create your member profile to access the CIRQL experience.";
  } else if (login) {
    title.textContent = "Member Login";
    subtitle.textContent =
      "Enter the phone number on your member profile.";
  } else {
    title.textContent = "Verify Phone";
    subtitle.textContent = "Enter the 6-digit demo OTP code to continue.";
  }

  if (
    document.getElementById("apply-modal").classList.contains("is-open")
  ) {
    focusAuthInput(mode);
  }
}

function focusAuthInput(mode) {
  const input = document.getElementById(
    mode === "otp"
      ? "otp-input"
      : mode === "login"
        ? "member-login-identifier"
        : "first-name",
  );
  window.requestAnimationFrame(() => {
    if (
      document.getElementById("apply-modal").classList.contains("is-open")
    ) {
      input?.focus();
    }
  });
}

function showOtpStep(applicant, mode) {
  pendingApplicant = applicant;
  pendingAuthMode = mode;
  writeMemberSession(applicant, false);
  setAuthMode("otp");
  document.getElementById("otp-input").value = "";
}

function clearModalValidation() {
  const feedback = document.getElementById("member-login-feedback");
  if (feedback) feedback.textContent = "";
  document
    .querySelectorAll("#apply-modal [aria-invalid='true']")
    .forEach((input) => {
      input.removeAttribute("aria-invalid");
      input.setCustomValidity("");
    });
}

function resetModal() {
  const applyBtn = document.getElementById("apply-submit-btn");
  const otpBtn = document.getElementById("otp-submit-btn");
  const otpInput = document.getElementById("otp-input");
  const loginIdentifier = document.getElementById(
    "member-login-identifier",
  );

  setAuthMode("signup");
  pendingApplicant = null;
  clearModalValidation();

  if (applyBtn) {
    applyBtn.textContent = "Create Member Profile →";
    applyBtn.classList.remove("is-success");
  }
  if (otpBtn) {
    otpBtn.textContent = "Submit OTP →";
    otpBtn.classList.remove("is-success");
  }
  if (otpInput) {
    otpInput.value = "";
  }
  if (loginIdentifier) loginIdentifier.value = "";
}

function closeApplyModal() {
  document.getElementById("apply-modal").classList.remove("is-open");
  resetModal();
  hideToast();
}

function openApplyModal(mode = "signup") {
  resetModal();
  setAuthMode(mode);
  document.getElementById("apply-modal").classList.add("is-open");
  focusAuthInput(mode);
}

const applyModal = document.getElementById("apply-modal");
applyModal.addEventListener("click", (event) => {
  if (event.target === applyModal) closeApplyModal();
});
document
  .getElementById("nav-sign-in")
  .addEventListener("click", () => openApplyModal("login"));
document.getElementById("nav-apply-btn").addEventListener("click", () => {
  if (!memberApplicantId) {
    openApplyModal();
    return;
  }
  document.getElementById("events").scrollIntoView({ behavior: "smooth" });
});
document
  .getElementById("hero-join-btn")
  .addEventListener("click", () => openApplyModal());
document.getElementById("hero-how-btn").addEventListener("click", () => {
  document.getElementById("how").scrollIntoView({ behavior: "smooth" });
});
document
  .getElementById("modal-close-btn")
  .addEventListener("click", closeApplyModal);
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    applyModal.classList.contains("is-open")
  ) {
    closeApplyModal();
  }
});

document
  .querySelector(".events-grid")
  .addEventListener("click", (event) => {
    const button = event.target.closest(".btn-apply-outline, .btn-apply");
    if (!button || button.disabled) return;
    event.preventDefault();
    const eventId =
      button.dataset.eventId ||
      button.closest(".event-card")?.dataset.eventId;
    if (eventId) {
      requestEventApplication(eventId);
    } else {
      openApplyModal();
    }
  });

document
  .getElementById("footer-event-cta")
  .addEventListener("click", () => {
    if (!featuredEventRecord) return;
    const applicantId = readMemberValue("applicant_id");
    const verified = readMemberValue("applicant_verified") === "true";
    if (!applicantId || !verified) {
      openApplyModal();
      return;
    }

    const eventId = String(featuredEventRecord.id);
    if (eventApplicationsByEventId.has(eventId)) {
      document
        .querySelector(
          `.event-card[data-event-id="${CSS.escape(eventId)}"]`,
        )
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    requestEventApplication(featuredEventRecord.id);
  });

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-coming-soon]");
  if (!link) return;
  event.preventDefault();
  showToast("Coming soon for public launch");
});

document.getElementById("member-logout").addEventListener("click", () => {
  clearMemberSession();
  window.location.reload();
});

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    pendingApplicant = null;
    setAuthMode(button.dataset.authMode);
  });
});

document
  .getElementById("member-login-container")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("member-login-identifier");
    const phone = normalizePhoneNumber(input.value);
    const loginFeedback = document.getElementById(
      "member-login-feedback",
    );
    if (!phone) {
      loginFeedback.textContent = "Enter your member phone number.";
      return;
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      loginFeedback.textContent =
        "Enter a valid 10-digit mobile number.";
      return;
    }

    const submitButton = document.getElementById("member-login-continue");
    setButtonLoading(submitButton, true, "Looking up member...");
    loginFeedback.textContent = "";
    try {
      const { data, error } = await supabase
        .from("applicants")
        .select("id, first_name, last_name, phone, email, status")
        .eq("phone", phone)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        loginFeedback.textContent =
          "No member account found. Choose New Member Sign Up to join.";
        return;
      }

      data.phone = data.phone || phone;
      showOtpStep(data, "login");
    } catch (error) {
      loginFeedback.textContent = `Member lookup failed: ${error.message || error}`;
      showToast("Member lookup failed. Check your connection and retry.");
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

// Apply button submit feedback and transition to OTP
const applyBtn = document.getElementById("apply-submit-btn");
const applicantForm = document.getElementById("applicant-form");

if (applicantForm) {
  applicantForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!applyBtn) return;

    const firstName = document.getElementById("first-name")?.value.trim();
    const lastName = document.getElementById("last-name")?.value.trim();
    const email = document.getElementById("email")?.value.trim();
    const phone = normalizePhoneNumber(
      document.getElementById("phone")?.value,
    );
    const age = document.getElementById("age")?.value.trim();
    const intent = document.getElementById("intent")?.value.trim();

    if (!firstName || !lastName || !email || !phone || !age || !intent) {
      showToast("Please complete all fields before submitting.");
      return;
    }

    const ageValue = Number(age);

    if (
      !/^\d+$/.test(age) ||
      !Number.isInteger(ageValue) ||
      ageValue < 18 ||
      ageValue > 99
    ) {
      showToast("Please enter a whole-number age between 18 and 99.");
      return;
    }

    if (!/^[0-9]{10}$/.test(phone)) {
      showToast("Please enter a valid 10-digit mobile number.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("Please enter a valid email address.");
      return;
    }

    setButtonLoading(applyBtn, true, "Creating profile...");
    applyBtn.classList.add("is-busy");

    try {
      const { data, error } = await supabase
        .from("applicants")
        .insert([
          {
            first_name: firstName,
            last_name: lastName,
            email: email,
            phone,
            age: ageValue,
            intent: intent,
          },
        ])
        .select();

      if (error) {
        throw error;
      }

      const applicant = data && data[0];
      if (!applicant?.id) {
        throw new Error("Applicant record was not returned by Supabase.");
      }
      applicant.phone = phone;
      showOtpStep(applicant, "signup");

      setButtonLoading(applyBtn, false);
      applyBtn.textContent = "✓ Profile created!";
      applyBtn.classList.add("is-success");
      applyBtn.classList.remove("is-busy");
    } catch (error) {
      console.error("Member profile creation failed:", error);
      setButtonLoading(applyBtn, false);
      applyBtn.classList.remove("is-success");
      applyBtn.classList.remove("is-busy");
      showToast(
        "Profile creation failed. Please check your connection and retry.",
      );
    }
  });
}

// OTP submit feedback
const otpBtn = document.getElementById("otp-submit-btn");
const otpInput = document.getElementById("otp-input");
if (otpBtn) {
  otpBtn.addEventListener("click", async () => {
    const code = otpInput ? otpInput.value.trim() : "";

    if (!/^\d{6}$/.test(code)) {
      if (otpInput) {
        otpInput.focus();
      }
      window.alert("Please enter the 6-digit code.");
      return;
    }

    try {
      const applicant = pendingApplicant;
      const applicantId = String(
        applicant?.id || readMemberValue("applicant_id"),
      );
      if (!applicantId || applicantId === "undefined") {
        throw new Error("Applicant session could not be restored.");
      }

      const protectedStatuses = ["approved", "waitlisted", "rejected"];
      if (!protectedStatuses.includes(applicant?.status)) {
        const { error } = await supabase
          .from("applicants")
          .update({ status: "verified" })
          .eq("id", applicantId);

        if (error) {
          console.error("Applicant verification update failed:", error);
          showToast("Your profile status could not be updated yet.");
        }
      }

      const verifiedApplicant = {
        ...(applicant || {}),
        id: applicantId,
        phone: applicant?.phone || readMemberValue("applicant_phone"),
      };
      writeMemberSession(verifiedApplicant, true);
      memberApplicantId = applicantId;
      memberProfile = verifiedApplicant;

      otpBtn.textContent =
        pendingAuthMode === "signup"
          ? "✓ Phone Verified! Taking you to the vibe check..."
          : "✓ Phone Verified! Welcome back.";
      otpBtn.classList.add("is-success");
      otpBtn.disabled = true;

      if (otpInput) {
        otpInput.value = code;
      }

      if (pendingAuthMode === "login") {
        closeApplyModal();
        await loadMemberDashboard();
        return;
      }

      setTimeout(() => {
        const quizUrl = new URL("cirql-mcq.html", window.location.href);
        if (applicantId) {
          quizUrl.searchParams.set("applicant_id", applicantId);
        }
        window.location.href = quizUrl.toString();
      }, 1200);
    } catch (error) {
      console.error("OTP verification failed:", error);
      otpBtn.textContent = "Submit OTP →";
      otpBtn.classList.remove("is-success");
      otpBtn.disabled = false;
      showToast("Verification failed. Please try again.");
    }
  });
}
