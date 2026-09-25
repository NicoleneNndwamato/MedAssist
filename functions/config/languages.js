// The languages we're demoing for the hackathon.
//
// IMPORTANT: only add a language here once it has BOTH an Azure
// Speech-to-Text locale AND an Azure neural Text-to-Speech voice -
// otherwise we can understand the patient but can never talk back to them.
// (Zulu, Xhosa and Sesotho all have Azure STT support, but as of writing
// only Zulu and Afrikaans also have TTS voices - that's why Xhosa/Sesotho
// aren't in this list yet, per the plan to add them later.)
const SUPPORTED_LANGUAGES = {
  "en-ZA": {
    label: "English",
    sttLocale: "en-ZA",
    translatorCode: "en",
    ttsVoice: "en-ZA-LeahNeural"
  },
  "zu-ZA": {
    label: "isiZulu",
    sttLocale: "zu-ZA",
    translatorCode: "zu",
    ttsVoice: "zu-ZA-ThandoNeural"
  },
  "af-ZA": {
    label: "Afrikaans",
    sttLocale: "af-ZA",
    translatorCode: "af",
    ttsVoice: "af-ZA-AdriNeural"
  }
};

const CANDIDATE_LANGUAGES = Object.keys(SUPPORTED_LANGUAGES);

module.exports = { SUPPORTED_LANGUAGES, CANDIDATE_LANGUAGES };
