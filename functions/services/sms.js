const fetch = require("node-fetch");

function isE164(number) {
  return /^\+\d{8,15}$/.test(String(number || "").trim());
}

async function sendSms({ to, body }) {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  const from = process.env.VONAGE_FROM || "MedAssist";

  if (!apiKey || !apiSecret) {
    throw new Error("VONAGE_API_KEY and VONAGE_API_SECRET are missing in functions/.env");
  }
  if (!isE164(to)) {
    throw new Error(`Cannot text "${to}": it is not a full number like +27821234567`);
  }

  const isPlain = /^[\x20-\x7E\n]*$/.test(body);

  const response = await fetch("https://rest.nexmo.com/sms/json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      api_key: apiKey,
      api_secret: apiSecret,
      from,
      to: to.replace("+", ""),
      text: body,
      type: isPlain ? "text" : "unicode"
    }).toString()
  });

  const data = await response.json();
  const first = data.messages && data.messages[0];
  if (!response.ok || !first || first.status !== "0") {
    const reason = first ? `${first.status}: ${first["error-text"]}` : JSON.stringify(data);
    throw new Error(`Vonage SMS error (${reason})`);
  }
  console.log(`sendSms: accepted by Vonage, id ${first["message-id"]}`);
  return data;
}

module.exports = { sendSms, isE164 };