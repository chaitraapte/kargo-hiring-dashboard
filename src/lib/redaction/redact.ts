export interface ExtractedContact {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface RedactionResult {
  redacted: string;
  contact: ExtractedContact;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(\+?\d{1,3}[-.\s]?)?(\d{10}|\d{5}[-.\s]\d{5}|\(\d{3}\)[-.\s]?\d{3}[-.\s]?\d{4})/g;
const URL_RE = /(https?:\/\/[^\s)]+|(?:www\.)[^\s)]+|linkedin\.com\/[^\s)]+|github\.com\/[^\s)]+)/gi;
const DOB_RE = /(date of birth|dob)\s*[:\-]?\s*[^\n,;]{1,40}/gi;
const GENDER_RE = /\b(gender|sex)\s*[:\-]?\s*(male|female|m|f|non-binary)\b/gi;
const ADDRESS_LINE_RE = /^[^\n]{0,80}\b(street|road|rd\.|lane|nagar|colony|sector|apartment|flat no)\b[^\n]{0,80}$/gim;

const PLACEHOLDER_EMAIL_DOMAINS = [
  "coursera.org",
  "udemy.com",
  "example.com",
  "noreply",
  "no-reply",
  "mailinator",
];

const INSTITUTION_KEYWORDS_RE =
  /\b([A-Z][A-Za-z.&'-]*\s+)*\b(University|College|Institute|Polytechnic|IIT|IIM|NIT|School of [A-Za-z ]+)\b([ ,][A-Z][A-Za-z.&'-]*)*/g;

function normalize(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function pickCanonicalEmail(emails: string[]): string | null {
  if (emails.length === 0) return null;
  const real = emails.filter(
    (e) => !PLACEHOLDER_EMAIL_DOMAINS.some((d) => e.toLowerCase().includes(d))
  );
  return (real[0] ?? emails[0]) ?? null;
}

/**
 * Many resume templates echo the candidate's name twice near the header,
 * once stylized (ALL CAPS) and once in plain Title Case, e.g.
 * "ISHAAN ROY\tIshaan Roy". pdf-parse frequently extracts text out of visual
 * order (multi-column layouts, sidebars), so "first non-empty line" is not a
 * reliable name guess on its own — this echoed pattern is a much stronger
 * signal when present.
 */
function findEchoedName(text: string): string | null {
  const re = /\b([A-Z][A-Z'.-]+(?:\s+[A-Z][A-Z'.-]+){0,3})\s+((?:[A-Z][a-z'.-]+\s*){1,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const allCaps = normalize(m[1]);
    const titleCase = normalize(m[2]);
    if (
      allCaps.length > 3 &&
      titleCase.length > 3 &&
      allCaps.toLowerCase() === titleCase.toLowerCase()
    ) {
      return titleCase;
    }
  }
  return null;
}

function firstLineGuess(text: string): string | null {
  let firstLine = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return null;

  // Many templates put the name and contact details on one line, e.g.
  // "Kabir Mehta squad_2@pg27.mesaschool.co". Strip everything from the
  // first email/phone-shaped token onward before judging whether what
  // remains looks like a name — otherwise every such resume falls back to
  // the same generic default and different candidates collide on it.
  const cutMatch = firstLine.match(/[a-zA-Z0-9._%+-]+@|\+?\d[\d\s().-]{7,}/);
  if (cutMatch && cutMatch.index !== undefined) {
    firstLine = firstLine.slice(0, cutMatch.index).trim();
  }
  if (!firstLine) return null;

  // Reject what's left if it's still clearly not a name (too long, stray digits/@/url).
  if (firstLine.length > 60 || /[@\d]/.test(firstLine)) return null;
  return firstLine;
}

export function extractContact(text: string): ExtractedContact {
  const emails = [...text.matchAll(EMAIL_RE)].map((m) => m[0]);
  const email = pickCanonicalEmail(emails);

  const phoneMatch = [...text.matchAll(PHONE_RE)].find((m) => m[0].replace(/\D/g, "").length >= 10);
  const phone = phoneMatch ? phoneMatch[0].trim() : null;

  const echoed = findEchoedName(text);
  const guess = firstLineGuess(text);
  const name = echoed ?? guess ?? "Unknown Candidate";

  return { name, email, phone };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactCv(rawText: string): RedactionResult {
  let text = rawText;
  const contact = extractContact(rawText);

  // 1. Structural patterns first: redacting a name before this would fracture
  //    an email like "asha.verma@..." (the name is a substring of it) into an
  //    orphaned fragment instead of one clean [REDACTED-EMAIL].
  text = text.replace(EMAIL_RE, "[REDACTED-EMAIL]");
  text = text.replace(PHONE_RE, "[REDACTED-PHONE]");
  text = text.replace(URL_RE, "[REDACTED-URL]");
  text = text.replace(ADDRESS_LINE_RE, "[REDACTED-ADDRESS]");
  text = text.replace(DOB_RE, "[REDACTED-DOB]");
  text = text.replace(GENDER_RE, "[REDACTED-GENDER]");

  // 2. Name tokens: collect every name-shaped candidate string (naive
  //    first-line guess AND both forms of an echoed header, if present) and
  //    redact all of them. Over-redacting a wrong guess is harmless; under-
  //    redacting the real name is a PII leak.
  const nameCandidates = new Set<string>();
  const echoedAllCapsMatch = rawText.match(
    /\b([A-Z][A-Z'.-]+(?:\s+[A-Z][A-Z'.-]+){0,3})\s+((?:[A-Z][a-z'.-]+\s*){1,4})/
  );
  if (echoedAllCapsMatch) {
    nameCandidates.add(normalize(echoedAllCapsMatch[1]));
    nameCandidates.add(normalize(echoedAllCapsMatch[2]));
  }
  const guess = firstLineGuess(rawText);
  if (guess) nameCandidates.add(guess);
  if (contact.name !== "Unknown Candidate") nameCandidates.add(contact.name);

  for (const candidate of nameCandidates) {
    const parts = candidate.split(/\s+/).filter((p) => p.length > 1);
    for (const part of parts) {
      const re = new RegExp(`\\b${escapeRegExp(part)}\\b`, "gi");
      text = text.replace(re, "[REDACTED-NAME]");
    }
    if (candidate.length > 1) {
      const re = new RegExp(escapeRegExp(candidate), "gi");
      text = text.replace(re, "[REDACTED-NAME]");
    }
  }

  // 3. Institution names: blank globally, not only inside a detected
  //    "Education" section window, since extraction order can scramble a
  //    section's contents relative to its own heading.
  text = text.replace(INSTITUTION_KEYWORDS_RE, "[REDACTED-INSTITUTION]");

  return { redacted: text, contact };
}
