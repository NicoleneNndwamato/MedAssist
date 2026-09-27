# MedAssist Patient Web
A typed alternative to the MedAssist voice call, for patients who'd rather not talk. Separate
website from `medassist-staff-web` — same Firebase project, different app.

## Run
```bash
cd medassist-patient-web
npm install
npm run dev
```
Open the localhost URL printed by Vite. You'll need Google sign-in enabled as a provider on the
`medassist-397be` Firebase project (Authentication → Sign-in method → Google) for `Continue with
Google` to work, and `localhost` added under Authentication → Settings → Authorized domains.

## How it works
- **Sign-in**: real Firebase Authentication with Google (`signInWithPopup`). First-time sign-in
  asks age, optional phone, and **preferred language** (English / isiZulu / Afrikaans), then writes
  a `patients/{uid}` document. Returning users skip straight to the app.
- **Chat Check-in** (`ChatPage.jsx`): asks the same fixed intake script the voice agent uses —
  name, age, location, symptoms, duration, last hospital/clinic visit, past illness/surgery,
  medication, ambulance need, emergency contact — but typed, in the patient's stored language
  (`src/data/questions.js`). On completion it writes straight into the **same `appointments`
  collection the staff dashboard reads**, so a typed web check-in shows up in the hospital queue
  exactly like a voice-call case would.
- **My History**: read-only — pulls the patient's own past check-ins from `appointments` where
  `authUid == <their uid>`. No edit controls anywhere.
- **Notifications**: placeholder demo data for now — there's no reminder backend yet, so this
  isn't wired to anything real. Swap in a real query once appointment-reminder jobs exist.
- **Settings**: change preferred language and reminder toggles. This is the only place a patient
  can edit anything about their own record; their check-in history stays locked.

## Translation caveat
The isiZulu and Afrikaans lines in `src/data/questions.js` are a first-pass translation for the
demo, not reviewed by a fluent/native speaker. Have someone fluent check them before this is used
with real patients — a mistranslated medical question is worse than an English-only one.

## Structure
- `src/services/firestoreService.js` — auth (Google sign-in/out) + all Firestore reads/writes
- `src/data/questions.js` — the intake script and UI strings in all three languages
- `src/pages/` — `LoginPage` (sign-in + one-time registration), `PatientShell` (sidebar shell),
  `ChatPage`, `HistoryPage`, `NotificationsPage`, `SettingsPage`
