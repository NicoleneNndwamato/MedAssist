const fetch = require("node-fetch");
const { SUPPORTED_LANGUAGES } = require("../config/languages");

// There are only ~12 fixed questions, so caching their translations means
// we barely touch the Translator free-tier quota. Cloud Functions instances
// get reused between invocations, so this cache often survives across
// calls in practice - though it's per-instance, not shared, which is fine
// for a hackathon demo.
const cache = new Map();

// Translates one of OUR question strings (always authored in English) into
// the patient's language, so we can speak it back to them.
async function translateText({ text, toLanguageCode, translatorKey, translatorRegion, translatorEndpoint }) {
  const target = SUPPORTED_LANGUAGES[toLanguageCode];
  if (!target || target.translatorCode === "en") {
    return text; // already English, or an unknown code - just pass it through
  }

  const cacheKey = `en->${toLanguageCode}::${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const response = await fetch(
    `${translatorEndpoint}/translate?api-version=3.0&from=en&to=${target.translatorCode}`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": translatorKey,
        "Ocp-Apim-Subscription-Region": translatorRegion,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([{ text }])
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure Translator error: ${errText}`);
  }

  const data = await response.json();
  const translated = data?.[0]?.translations?.[0]?.text || text;
  cache.set(cacheKey, translated);
  return translated;
}

// Translates what the PATIENT said back into English, so hospital staff
// reading the history later don't need to speak the patient's language.
async function translateToEnglish({ text, fromLanguageCode, translatorKey, translatorRegion, translatorEndpoint }) {
  const source = SUPPORTED_LANGUAGES[fromLanguageCode];
  if (!source || source.translatorCode === "en" || !text) {
    return text;
  }

  const response = await fetch(
    `${translatorEndpoint}/translate?api-version=3.0&from=${source.translatorCode}&to=en`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": translatorKey,
        "Ocp-Apim-Subscription-Region": translatorRegion,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([{ text }])
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure Translator error: ${errText}`);
  }

  const data = await response.json();
  return data?.[0]?.translations?.[0]?.text || text;
}

module.exports = { translateText, translateToEnglish };
