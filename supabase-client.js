const SUPABASE_URL = "https://wwpvszvnrsemoqjrcqpq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_suEQwEixEa1mOPjmDnck1Q_o4WGKVCz";

if (!window.supabase?.createClient) {
  throw new Error("Supabase client library did not load.");
}

export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
);

export function normalizePhoneNumber(value) {
  let phone = String(value ?? "")
    .trim()
    .replace(/[\s-]/g, "");

  if (phone.startsWith("+91")) {
    phone = phone.slice(3);
  } else if (phone.startsWith("0")) {
    phone = phone.slice(1);
  }

  return phone.replace(/\D/g, "");
}

export function formatISTDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const dateText = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
  const timeText = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);

  return `${dateText} · ${timeText}`;
}
