# MedAssist Staff Web
This folder is a separate React/Vite website for authorised healthcare staff. It does NOT add login/registration to the patient calling/mobile flow.

## Run
```bash
cd medassist-staff-web
npm install
npm run seed:mock
npm run dev
```
Open the localhost URL printed by Vite.

## Sign-in and routing
This is prototype-only UI authentication (email is looked up in the `staff` Firestore
collection; the password isn't checked). The dashboard you land on is chosen
automatically from your `staff` document's `role` — there's no manual role switcher:

- **Emergency Operator** → the emergency queue (`EmergencyOperatorPage`), IMMEDIATE-priority
  cases only, with restricted fields (no transcript, no medication history).
- **Paramedic / EMT** → the handoff queue (`ParamedicPage`), IMMEDIATE-priority cases with
  full clinical detail and the emergency-handoff status stepper, but no priority/appointment
  controls.
- **Doctor / Emergency Doctor / Nurse / Hospital Administrator** → the full hospital portal
  (`HospitalShell`): a sidebar with Dashboard, Patients, Appointments, Reminders and Settings,
  plus a Log out button. Administrators see every facility's queue; other hospital roles see
  their own facility's queue.

Demo accounts (any password works): `naledi.mokoena@medassist.demo` (Doctor),
`nomsa.nkosi@medassist.demo` (Nurse), `lindiwe.mabuza@medassist.demo` (Emergency Operator),
`mpho.radebe@medassist.demo` (Paramedic/EMT). Quick-fill buttons for these are on the login
screen.

## Data model
The website reads the same Firebase/Firestore project as the MedAssist app. `npm run seed:mock`
resets and repopulates:
- `facilities` (10 demo hospitals)
- `doctors` and `staff` (10 doctors + 5 nurses/admins + 5 emergency operators + 5 paramedics/EMTs)
- `patients` and `patientHistory` (visit history per patient)
- `appointments` (the AI-triaged cases staff review) and `facilities/{id}/incoming`
- `reviews` (one review record per case)
- `reminders` is created on first use from the Reminders tab (not seeded)

## Structure
- `src/services/firestoreService.js` — all Firestore reads/writes
- `src/components/` — `Sidebar`, `PriorityBadge`, `CaseDetailPanel`, `TranscriptPlayer`, `Toast`
- `src/pages/` — `LoginPage`, `HospitalShell` (+ its five tabs), `EmergencyOperatorPage`, `ParamedicPage`
