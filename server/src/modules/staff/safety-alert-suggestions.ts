type AlertSeverity = "INFORMATIONAL" | "HIGH" | "EMERGENCY";

export type SafetyAlertSuggestion = {
  code: string;
  severity: AlertSeverity;
  title: string;
  reason: string;
  matchedPhrases: string[];
};

const rules: Array<{ code: string; severity: AlertSeverity; title: string; reason: string; phrases: string[] }> = [
  { code: "BLEEDING", severity: "EMERGENCY", title: "রক্তপাতের কথা বলা হয়েছে", reason: "Patient-এর কথায় রক্তপাতের উল্লেখ পাওয়া গেছে। স্বাস্থ্যকর্মী দ্রুত যাচাই করুন।", phrases: ["রক্তপাত", "রক্ত যাচ্ছে", "অনেক রক্ত", "bleeding", "heavy bleeding"] },
  { code: "CONVULSION_OR_UNCONSCIOUS", severity: "EMERGENCY", title: "খিঁচুনি বা অজ্ঞান হওয়ার উল্লেখ", reason: "Patient-এর কথায় খিঁচুনি বা অজ্ঞান হওয়ার উল্লেখ পাওয়া গেছে। দ্রুত স্বাস্থ্যকর্মী যাচাই প্রয়োজন।", phrases: ["খিঁচুনি", "অজ্ঞান", "seizure", "unconscious"] },
  { code: "BREATHING_OR_CHEST", severity: "EMERGENCY", title: "শ্বাসকষ্ট বা বুকের ব্যথার উল্লেখ", reason: "Patient-এর কথায় শ্বাসকষ্ট বা বুকের ব্যথার উল্লেখ পাওয়া গেছে। দ্রুত যাচাই প্রয়োজন।", phrases: ["শ্বাসকষ্ট", "শ্বাস নিতে কষ্ট", "বুকে ব্যথা", "difficulty breathing", "chest pain"] },
  { code: "SEVERE_HEADACHE_OR_VISION", severity: "HIGH", title: "তীব্র মাথাব্যথা বা দৃষ্টির সমস্যার উল্লেখ", reason: "Patient-এর কথায় তীব্র মাথাব্যথা বা চোখে ঝাপসা দেখার উল্লেখ পাওয়া গেছে।", phrases: ["তীব্র মাথাব্যথা", "প্রচণ্ড মাথাব্যথা", "চোখে ঝাপসা", "দৃষ্টি ঝাপসা", "severe headache", "blurred vision"] },
  { code: "SEVERE_ABDOMINAL_PAIN", severity: "HIGH", title: "তীব্র পেটব্যথার উল্লেখ", reason: "Patient-এর কথায় তীব্র বা প্রচণ্ড পেটব্যথার উল্লেখ পাওয়া গেছে।", phrases: ["তীব্র পেট ব্যথা", "প্রচণ্ড পেট ব্যথা", "তীব্র পেটব্যথা", "severe abdominal pain"] },
  { code: "FEVER", severity: "HIGH", title: "জ্বরের উল্লেখ", reason: "Patient-এর কথায় জ্বরের উল্লেখ পাওয়া গেছে। তাপমাত্রা ও অন্যান্য লক্ষণ যাচাই করুন।", phrases: ["জ্বর", "fever", "high temperature"] },
  { code: "REDUCED_FETAL_MOVEMENT", severity: "HIGH", title: "শিশুর নড়াচড়া কমে যাওয়ার উল্লেখ", reason: "Patient-এর কথায় গর্ভের শিশুর নড়াচড়া কমে যাওয়া বা না থাকার উল্লেখ পাওয়া গেছে।", phrases: ["বাচ্চা নড়াচড়া করছে না", "বাচ্চা নড়ছে না", "শিশু নড়ছে না", "নড়াচড়া কম", "reduced fetal movement"] },
];

function isNegated(text: string, index: number) {
  const before = text.slice(Math.max(0, index - 16), index);
  return /(নেই|নাই|না|নয়|নয়|নাহ| নেই$|no|not|without)\s*$/i.test(before);
}

export function suggestSafetyAlerts(transcript: string, aiSummary: unknown): SafetyAlertSuggestion[] {
  const summaryText = aiSummary && typeof aiSummary === "object" ? JSON.stringify(aiSummary) : String(aiSummary || "");
  const source = `${transcript}\n${summaryText}`.toLowerCase();
  return rules.flatMap(rule => {
    const matchedPhrases = rule.phrases.filter(phrase => {
      const index = source.indexOf(phrase.toLowerCase());
      return index >= 0 && !isNegated(source, index);
    });
    return matchedPhrases.length ? [{ code: rule.code, severity: rule.severity, title: rule.title, reason: rule.reason, matchedPhrases }] : [];
  });
}
