// A tiny, hand-rolled builder for the voice markup Twilio calls "TwiML" and
// SignalWire calls "LaML" - they're the same tags (<Play>, <Record>, <Say>,
// <Hangup>), which is exactly why SignalWire can be a drop-in swap for
// Twilio here. Writing the XML ourselves means we're not locked to either
// vendor's SDK or a guessed package version - just plain strings.

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function playTags(urls) {
  return urls.map((url) => `<Play>${escapeXml(url)}</Play>`).join("");
}

// Plays one or more audio URLs, then records until `timeoutSeconds` of
// silence (or maxLengthSeconds, whichever comes first) - this silence
// timeout IS the "detect when they're done talking" behaviour, built into
// the platform, no custom audio processing needed.
function playAndRecord(urls, { actionUrl, timeoutSeconds, maxLengthSeconds }) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>${playTags(urls)}` +
    `<Record action="${escapeXml(actionUrl)}" method="POST" timeout="${timeoutSeconds}" ` +
    `maxLength="${maxLengthSeconds}" playBeep="false" trim="trim-silence"/></Response>`
  );
}

function playAndHangup(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${playTags(urls)}<Hangup/></Response>`;
}

function sayAndHangup(text) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(text)}</Say><Hangup/></Response>`;
}

function sayAndRecord(text, { actionUrl, timeoutSeconds, maxLengthSeconds }) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(text)}</Say>` +
    `<Record action="${escapeXml(actionUrl)}" method="POST" timeout="${timeoutSeconds}" ` +
    `maxLength="${maxLengthSeconds}" playBeep="false" trim="trim-silence"/></Response>`
  );
}

module.exports = { playAndRecord, playAndHangup, sayAndHangup, sayAndRecord };
