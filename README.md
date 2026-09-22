# MedAssist — React Native (Expo) + Voice — $0 setup

Everything here runs on free tiers with no credit card attached anywhere.
No Firebase billing plan, no Cloud Functions, no paid API.

It greets you out loud first ("Hello, you are talking to MedAssist. How can
I help you today?"), you hold the mic button and talk back in whatever
language you're comfortable in, it replies out loud, and keeps the
conversation going until it has enough to classify how urgent things are.
Then it moves into booking.

## Why this version has no backend

Originally this needed a server to hide a paid API key. That constraint is
gone because Google's Gemini API has a genuine free tier: no credit card,
no time limit, sign in with just a Google account. And Gemini can listen to
audio directly, so there's no separate speech-to-text step either — one API
call does both. That means the phone app can talk to Gemini directly, no
backend required.

The one honest tradeoff: the API key lives inside the app now instead of
hidden on a server. That's normally something to avoid, but since this is a
true free-tier key with no billing attached, the worst case if it leaked is
someone else eating into your daily free quota — not a bill. Acceptable for
a project with no budget. If this ever becomes something with real users,
the move is to put this same Gemini call behind a small backend (Firebase
Cloud Functions still works for that, on the free Spark plan, since Gemini
counts as a Google API and Spark-plan functions are allowed to call Google's
own APIs — it's non-Google external calls, like Anthropic's, that Spark
blocks).

## Step 1 — Get a free Gemini API key

1. Go to https://aistudio.google.com/apikey
2. Sign in with a Google account (no card, no payment info anywhere in this
   flow).
3. Click **Create API key**.
4. Copy the key.

## Step 2 — Paste it into the project

Open `src/services/geminiService.js` and replace:

```js
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY";
```

with your real key.

## Step 3 — Run the app

```
npm install
npm start
```

Scan the QR code in **Expo Go**. The first time, Android will ask for
microphone permission — allow it.

## How to use it

1. Open the app. It speaks the greeting automatically.
2. Press and hold the blue circle, talk, release. It shows "Listening..."
   while held and "Speaking..." while it replies.
3. Answer naturally — you don't need to wait for a specific question, e.g.
   "my chest has been hurting since this morning and it's getting worse"
   works fine as an opening line.
4. Any red-flag symptom (unresponsive, severe breathing difficulty, chest
   pain, uncontrolled bleeding) ends the conversation immediately and
   classifies as Immediate priority.
5. Once enough is known, it shows the priority result, then moves to
   booking: name, phone number, choice of facility.
6. On confirm, it writes to Firestore's `appointments` collection,
   including the full conversation transcript under `transcriptLog` so
   hospital staff can read exactly what was said, not just a category.

## Firestore stays free too

Firestore on Firebase's free **Spark** plan is enough for this project —
generous daily read/write quotas, no card needed. You already set this part
up earlier; nothing changes here. Just make sure you've seeded a
`facilities` collection (see earlier setup notes) so the booking screen has
something to show.

## Free tier limits to know about

Gemini's free tier (as of the model used here, `gemini-2.5-flash`) allows
roughly 1,500 requests a day and 15 requests a minute. For a student
project or demo, you will not come close to this. If you ever do hit a
limit, the API returns an error and you just wait a minute — no charge, no
warning email, nothing to worry about.

## Troubleshooting

- **"Permission to access microphone was denied"** — Settings → Apps →
  Expo Go → Permissions → allow Microphone.
- **Gemini API error mentioning the audio format** — `ConversationScreen.js`
  currently sends the recording as `audio/m4a`. If Gemini rejects that mime
  type, open `src/screens/ConversationScreen.js` and change the line
  `const mimeType = "audio/m4a";` to `"audio/mp4"` and try again — Android's
  actual container format can vary slightly and Gemini is picky about the
  exact label.
- **It replies but ignores what you said / seems confused** — check that
  your Gemini API key is correctly pasted with no extra spaces in
  `src/services/geminiService.js`.
- **429 / rate limit error** — you've hit the free tier's per-minute or
  per-day cap. Wait a bit and try again; this is expected behavior on a
  free key, not a bug.

## What's still not built

- Nearest-facility sorting using device GPS instead of showing all
  facilities.
- The hospital-facing web dashboard reading `appointments` and
  `facilities/{id}/incoming`, sorted by `priorityWeight`.
- Proper Firestore security rules — if your database is still in test mode,
  it's open to anyone. Lock this down before real patient data touches it.
- A real consent screen — `consentGiven: true` is currently hardcoded on
  every booking, which isn't real consent.
