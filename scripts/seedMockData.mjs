import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  writeBatch,
  Timestamp
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDQWyNKFfscqQq1NRYCKkpZwEvLlf5ea-E",
  authDomain: "medassist-397be.firebaseapp.com",
  projectId: "medassist-397be",
  storageBucket: "medassist-397be.firebasestorage.app",
  messagingSenderId: "39614620161",
  appId: "1:39614620161:web:62afbb4db55c65aefe9600"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const now = Timestamp.now();

const facilities = [
  ["fac-001", "Mamelodi Community Clinic", "Clinic", "Mamelodi East, Pretoria"],
  ["fac-002", "Tshwane District Hospital", "District Hospital", "Prinshof, Pretoria"],
  ["fac-003", "Kalafong Provincial Tertiary Hospital", "Hospital", "Atteridgeville, Pretoria"],
  ["fac-004", "Soshanguve Community Health Centre", "Community Health Centre", "Soshanguve, Pretoria"],
  ["fac-005", "Ga-Rankuwa Clinic", "Clinic", "Ga-Rankuwa, Pretoria"],
  ["fac-006", "Laudium Community Health Centre", "Community Health Centre", "Laudium, Pretoria"],
  ["fac-007", "Pretoria West Hospital", "Hospital", "Pretoria West, Pretoria"],
  ["fac-008", "Eersterust Clinic", "Clinic", "Eersterust, Pretoria"],
  ["fac-009", "Olievenhoutbosch Clinic", "Clinic", "Olievenhoutbosch, Centurion"],
  ["fac-010", "Centurion Community Clinic", "Clinic", "Centurion, Gauteng"]
].map(([id, name, type, address], i) => ({ id, name, type, address, phone: `012-555-${String(1100+i).padStart(4,"0")}`, active: true }));

const doctors = [
  ["doc-001","Dr Naledi Mokoena","General Practice","fac-001"],
  ["doc-002","Dr Thabo Nkosi","Emergency Medicine","fac-002"],
  ["doc-003","Dr Aisha Patel","Family Medicine","fac-003"],
  ["doc-004","Dr Sipho Dlamini","General Practice","fac-004"],
  ["doc-005","Dr Lerato Molefe","Internal Medicine","fac-005"],
  ["doc-006","Dr Pieter van Wyk","Family Medicine","fac-006"],
  ["doc-007","Dr Zanele Khumalo","Emergency Medicine","fac-007"],
  ["doc-008","Dr Kabelo Seema","General Practice","fac-008"],
  ["doc-009","Dr Fatima Ismail","Family Medicine","fac-009"],
  ["doc-010","Dr Tumelo Maseko","General Practice","fac-010"]
].map(([id,name,specialty,facilityId], i) => ({ id,name,specialty,facilityId,registrationNumber:`MP-MOCK-${1001+i}`,languages:["English", i%2 ? "Afrikaans" : "Sepedi"],active:true }));

const patients = Array.from({length:10}, (_,i) => ({
  id:`pat-${String(i+1).padStart(3,"0")}`,
  fullName:["Nomsa Mthembu","John Molefe","Maria Jacobs","Bongani Ndlovu","Elsie Mokoena","Tshepo Mabena","Lindiwe Khumalo","David Smith","Ayanda Zulu","Martha Seema"][i],
  phone:`071555${String(1200+i).padStart(4,"0")}`,
  age:[67,44,72,31,63,28,55,49,36,70][i],
  language:["isiZulu","Sepedi","Afrikaans","isiZulu","English","Setswana","isiXhosa","English","isiZulu","Sepedi"][i],
  location:["Mamelodi","Soshanguve","Pretoria West","Atteridgeville","Ga-Rankuwa","Centurion","Laudium","Eersterust","Olievenhoutbosch","Mamelodi"][i],
  medications:i%3===0?["Mock chronic medication"]:[],
  medicalHistory:i%4===0?["Mock hypertension history"]:[],
  identityStatus:"VERIFIED",
  createdAt:now
}));

const priorities = ["IMMEDIATE","VERY_URGENT","URGENT","STANDARD","NON_URGENT"];
const appointments = Array.from({length:10}, (_,i) => ({
  id:`appt-${String(i+1).padStart(3,"0")}`,
  patientId:patients[i].id,
  patientName:patients[i].fullName,
  patientPhone:patients[i].phone,
  facilityId:facilities[i].id,
  facilityName:facilities[i].name,
  doctorId:doctors[i].id,
  doctorName:doctors[i].name,
  priority:priorities[i%priorities.length],
  priorityWeight:{IMMEDIATE:5,VERY_URGENT:4,URGENT:3,STANDARD:2,NON_URGENT:1}[priorities[i%5]],
  aiPreliminaryPriority:priorities[i%5],
  humanConfirmedPriority:i%3===0?null:priorities[i%5],
  symptomsSummary:["Chest pressure reported","Severe abdominal pain","Moderate pain for 30 minutes","Headache since yesterday","Mild cough for two days"][i%5],
  transcriptLog:[{role:"user",content:"This is mock patient data for UI testing."},{role:"assistant",content:"Mock intake captured; no diagnosis made."}],
  status:["URGENT_NOTIFIED","AWAITING_REVIEW","REVIEWED","BOOKED","FOLLOW_UP_DUE"][i%5],
  consentGiven:true,
  transportRequested:i%4===0,
  notes:"MOCK DATA ONLY — not a real clinical record.",
  createdAt:Timestamp.fromMillis(Date.now()-(i*45*60*1000))
}));

const reviews = appointments.map((a,i) => ({
  id:`review-${String(i+1).padStart(3,"0")}`,
  appointmentId:a.id,
  doctorId:doctors[i].id,
  aiPriority:a.aiPreliminaryPriority,
  confirmedPriority:i%3===0?null:a.priority,
  patientStatus:["Waiting","In review","Seen"][i%3],
  notes:"Mock reviewer note for dashboard testing.",
  followUpRequired:i%4===0,
  reviewedAt:i%3===0?null:now
}));

async function writeCollection(name, rows) {
  const batch = writeBatch(db);
  rows.forEach(({id,...data}) => batch.set(doc(collection(db,name),id), data));
  await batch.commit();
  console.log(`Seeded ${rows.length} ${name}`);
}

async function main(){
  await writeCollection("facilities", facilities);
  await writeCollection("doctors", doctors);
  await writeCollection("patients", patients);
  await writeCollection("appointments", appointments);
  await writeCollection("reviews", reviews);

  for (const a of appointments.filter(x => ["IMMEDIATE","VERY_URGENT"].includes(x.priority))) {
    const batch = writeBatch(db);
    batch.set(doc(db,"facilities",a.facilityId,"incoming",a.id), {appointmentId:a.id, priority:a.priority, notifiedAt:now});
    await batch.commit();
  }
  console.log("Done. All records are synthetic mock data.");
}

main().catch((e)=>{ console.error(e); process.exit(1); });
