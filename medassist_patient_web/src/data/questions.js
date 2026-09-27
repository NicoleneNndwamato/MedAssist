// The same fixed intake script the voice agent (CallScreen / conversationService)
// asks, just typed here instead of spoken. Keys must stay identical across
// languages so answers map onto the same Firestore fields regardless of which
// language the patient is chatting in.
//
// NOTE: the isiZulu and Afrikaans lines are a first-pass translation for the
// hackathon demo, not reviewed by a fluent/native speaker. Please have someone
// fluent check these before relying on them with real patients — a mistranslated
// medical question is worse than an English-only one.

export const SUPPORTED_LANGUAGES = ['English', 'isiZulu', 'Afrikaans'];

export const QUESTIONS_BY_LANGUAGE = {
  English: [
    { key: 'name', text: "Hi, I'm MedAssist. What's your full name?" },
    { key: 'age', text: 'Thanks. How old are you?' },
    { key: 'location', text: 'Where are you currently located? (suburb or address)' },
    { key: 'symptoms', text: 'What symptoms are you experiencing today?' },
    { key: 'duration', text: 'How long have you been feeling this way?' },
    { key: 'lastVisit', text: 'When was the last time you visited a hospital or clinic?' },
    { key: 'pastHistory', text: 'Have you had any illnesses, diseases, or surgery in the past? If so, please describe them.' },
    { key: 'medication', text: 'Are you currently taking any medication? If so, what kind and what is it for?' },
    { key: 'ambulance', text: 'Do you need an ambulance right now? (yes/no)' },
    { key: 'emergencyContact', text: "Lastly, can you give us an emergency contact number we can call if you're not available?" },
  ],
  isiZulu: [
    { key: 'name', text: 'Sawubona, ngingu-MedAssist. Ngubani igama lakho eliphelele?' },
    { key: 'age', text: 'Ngiyabonga. Uneminyaka emingaki?' },
    { key: 'location', text: 'Ukuphi manje? (indawo noma ikheli)' },
    { key: 'symptoms', text: 'Yiziphi izimpawu ozibonayo namhlanje?' },
    { key: 'duration', text: 'Sekunini uzizwa kanjena?' },
    { key: 'lastVisit', text: 'Ubuvakashele nini isibhedlela noma umtholampilo okokugcina?' },
    { key: 'pastHistory', text: 'Wake waba nezifo noma ukuhlinzwa esikhathini esidlule? Uma kunjalo, sicela uchaze.' },
    { key: 'medication', text: 'Ingabe uphuza imithi njengamanje? Uma kunjalo, imuphi uhlobo futhi kungani?' },
    { key: 'ambulance', text: 'Ingabe udinga i-ambulense manje? (yebo/cha)' },
    { key: 'emergencyContact', text: 'Okokugcina, ungasinika inombolo yoxhumana yesimo esiphuthumayo uma ungatholakali?' },
  ],
  Afrikaans: [
    { key: 'name', text: "Hallo, ek is MedAssist. Wat is jou volle naam?" },
    { key: 'age', text: 'Dankie. Hoe oud is jy?' },
    { key: 'location', text: "Waar is jy tans? (voorstad of adres)" },
    { key: 'symptoms', text: 'Watter simptome ervaar jy vandag?' },
    { key: 'duration', text: 'Hoe lank voel jy al so?' },
    { key: 'lastVisit', text: "Wanneer was die laaste keer wat jy 'n hospitaal of kliniek besoek het?" },
    { key: 'pastHistory', text: 'Het jy in die verlede enige siektes of operasies gehad? Beskryf asseblief.' },
    { key: 'medication', text: 'Neem jy tans enige medikasie? Indien wel, watter soort en waarvoor?' },
    { key: 'ambulance', text: "Het jy nou dadelik 'n ambulans nodig? (ja/nee)" },
    { key: 'emergencyContact', text: 'Laastens, kan jy vir ons \'n noodkontaknommer gee wat ons kan bel as jy nie beskikbaar is nie?' },
  ],
};

export const UI_STRINGS = {
  English: {
    chatTitle: 'Type your check-in', chatSub: "Answer MedAssist's questions below — this is the same intake as the voice call, just typed.",
    placeholder: 'Type your answer…', send: 'Send', done: 'Check-in complete', typing: 'MedAssist is typing…',
    summaryTitle: 'Appointment booked', summaryThanks: (name) => `Thank you, ${name || 'there'}. Your check-in is complete and your appointment is confirmed.`,
    emergencyPill: 'Emergency — a healthcare worker will contact you urgently', standardPill: 'Standard — sent for healthcare worker review',
    askFacility: 'Which hospital or clinic would you like to be seen at?',
    askDate: 'What day works for you?', askTime: 'And what time?',
    todayBtn: 'Today', tomorrowBtn: 'Tomorrow', pickDateLabel: 'Or pick another date',
    confirmDateBtn: 'Confirm date', bookingLine: (doctor, facility, date, time) => `Booked with ${doctor} at ${facility} on ${date} at ${time}.`,
    booking: 'Booking your appointment…',
  },
  isiZulu: {
    chatTitle: 'Bhala ukubhalisa kwakho', chatSub: 'Phendula imibuzo ka-MedAssist ngezansi — lokhu kufana nokushaya ucingo, kodwa ubhala.',
    placeholder: 'Bhala impendulo yakho…', send: 'Thumela', done: 'Kuqediwe', typing: 'U-MedAssist uyabhala…',
    summaryTitle: 'Isikhathi sokubonana sibekiwe', summaryThanks: (name) => `Ngiyabonga, ${name || 'wena'}. Ukubhalisa kwakho kuqediwe futhi isikhathi sakho sibekiwe.`,
    emergencyPill: 'Isimo esiphuthumayo — usebenzi lwezempilo luzokuxhumana nawe ngokushesha', standardPill: 'Okujwayelekile — kuthunyelwe ukuze kubuyekezwe usebenzi lwezempilo',
    askFacility: 'Ufuna ukubonwa yisiphi isibhedlela noma umtholampilo?',
    askDate: 'Yiluphi usuku olukulungele?', askTime: 'Yisiphi isikhathi?',
    todayBtn: 'Namhlanje', tomorrowBtn: 'Kusasa', pickDateLabel: 'Noma khetha olunye usuku',
    confirmDateBtn: 'Qinisekisa usuku', bookingLine: (doctor, facility, date, time) => `Ubekelwe u-${doctor} e-${facility} ngo-${date} ngo-${time}.`,
    booking: 'Sibeka isikhathi sakho…',
  },
  Afrikaans: {
    chatTitle: 'Tik jou inskrywing', chatSub: "Beantwoord MedAssist se vrae hieronder — dieselfde as die oproep, maar getik.",
    placeholder: 'Tik jou antwoord…', send: 'Stuur', done: 'Klaar', typing: 'MedAssist tik tans…',
    summaryTitle: 'Afspraak bespreek', summaryThanks: (name) => `Dankie, ${name || 'daar'}. Jou inskrywing is klaar en jou afspraak is bevestig.`,
    emergencyPill: "Noodgeval — 'n gesondheidswerker sal jou dringend kontak", standardPill: 'Standaard — gestuur vir gesondheidswerker-hersiening',
    askFacility: 'By watter hospitaal of kliniek wil jy gesien word?',
    askDate: 'Watter dag pas jou?', askTime: 'En hoe laat?',
    todayBtn: 'Vandag', tomorrowBtn: 'Môre', pickDateLabel: "Of kies 'n ander datum",
    confirmDateBtn: 'Bevestig datum', bookingLine: (doctor, facility, date, time) => `Bespreek by ${doctor} by ${facility} op ${date} om ${time}.`,
    booking: 'Besig om jou afspraak te bespreek…',
  },
};