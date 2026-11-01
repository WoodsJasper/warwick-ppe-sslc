/** Browser-only email submission. Feedback is never written to this repository. */
export const TOPICS = Object.freeze([
  "Teaching & learning",
  "Assessment & feedback",
  "Timetabling",
  "Resources & facilities",
  "Student experience",
  "An idea or suggestion",
  "Something else",
]);

export const YEARS = Object.freeze([
  "Year 1",
  "Year 2",
  "Year 3",
  "Year 4 / intercalated",
  "Postgraduate",
  "Prefer not to say",
]);

const ENDPOINT = "https://formsubmit.co/ajax/u5691717%40live.warwick.ac.uk";
const UNCERTAIN = "We couldn’t confirm your submission. Your details are still here. Retrying may send the same message again.";

function textField(fields, key, label, maximum, minimum = 0) {
  const value = fields[key] ?? "";
  if (typeof value !== "string") throw new Error(`Please check ${label}.`);
  const normalized = value.trim();
  if (normalized.length < minimum) throw new Error(`Please add at least ${minimum} characters for ${label}.`);
  if (normalized.length > maximum) throw new Error(`Please keep ${label} to ${maximum.toLocaleString("en-GB")} characters or fewer.`);
  return normalized;
}

/** Validate before making any request and return only the accepted fields. */
export function validateFeedback(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new Error("Please check your feedback and try again.");
  }
  if (!TOPICS.includes(fields.topic)) throw new Error("Please choose a topic.");
  if (!YEARS.includes(fields.year)) throw new Error("Please choose your year, or ‘Prefer not to say’.");
  const feedback = {
    topic: fields.topic,
    year: fields.year,
    title: textField(fields, "title", "the title", 120, 5),
    details: textField(fields, "details", "the details", 5000, 20),
    outcome: textField(fields, "outcome", "your suggested change", 2000),
    name: textField(fields, "name", "your name", 100),
    email: textField(fields, "email", "your email address", 254),
    consent: fields.consent,
    website: textField(fields, "website", "the form", 200),
  };
  if (feedback.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(feedback.email)) {
    throw new Error("Please enter a valid email address, or leave it blank.");
  }
  if (feedback.consent !== true) throw new Error("Please confirm that you’re happy to share this feedback with the reps.");
  if (feedback.website) throw new Error("Your submission could not be accepted. Please refresh and try again.");
  return feedback;
}

/** Keep this value in memory when retrying the same feedback. It is not an idempotency key. */
export function generateReference() {
  const random = crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
  return `PPE-${new Date().getUTCFullYear()}-${random}`;
}

/** Resolve only after FormSubmit explicitly accepts the request; this does not verify inbox delivery. */
export async function submitFeedback(fields, reference, { fetchImpl = globalThis.fetch } = {}) {
  const feedback = validateFeedback(fields);
  if (typeof reference !== "string" || !/^PPE-\d{4}-[A-Z0-9]{6,32}$/.test(reference)) {
    throw new Error("Please refresh the page to create a new feedback reference.");
  }
  const payload = {
    _subject: `[PPE SSLC ${reference}] ${feedback.title.replace(/[\r\n]+/g, " ")}`,
    _template: "table",
    _honey: "",
    reference,
    topic: feedback.topic,
    year: feedback.year,
    title: feedback.title,
    message: feedback.details,
    suggested_change: feedback.outcome || "No suggestion provided.",
    name: feedback.name || "PPE student (name not provided)",
    ...(feedback.email ? { email: feedback.email, _replyto: feedback.email } : {}),
    consent: "Agreed to FormSubmit processing this feedback to email the PPE student representatives, who may discuss relevant course issues with staff.",
    consent_at: new Date().toISOString(),
    handling_note: "Handle privately. Remove identifying details before raising a general issue with staff.",
  };
  let response;
  let result;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });
    result = await response.json();
  } catch {
    throw new Error(UNCERTAIN);
  }
  const message = typeof result?.message === "string" ? result.message : "";
  if (/needs? activat|awaiting activat|activat(e|ion).*(form|email|inbox)|confirm.*email/i.test(message)) {
    throw new Error("The reps’ inbox is awaiting activation. Your feedback has not been confirmed. Please try again after the inbox is connected.");
  }
  if (!response.ok || (result?.success !== true && result?.success !== "true")) {
    throw new Error("The email service did not confirm your feedback. Your details are still here; please try again later.");
  }
  return { reference };
}
