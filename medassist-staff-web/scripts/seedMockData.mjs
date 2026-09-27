import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, getDocs, doc, setDoc, deleteDoc, Timestamp
} from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDQWyNKFfscqQq1NRYCKkpZwEvLlf5ea-E',
  authDomain: 'medassist-397be.firebaseapp.com',
  projectId: 'medassist-397be',
  storageBucket: 'medassist-397be.firebasestorage.app',
  messagingSenderId: '39614620161',
  appId: '1:39614620161:web:62afbb4db55c65aefe9600'
});
const db = getFirestore(app);

// WARNING: this is a prototype reset script. It deletes the collections listed below.
async function deleteCollection(name) {
  const snap = await getDocs(collection(db, name));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  console.log(`Cleared ${name}: ${snap.size} document(s)`);
}
async function deleteIncomingForFacilities() {
  const facilities = await getDocs(collection(db, 'facilities'));
  for (const facility of facilities.docs) {
    const incoming = await getDocs(collection(db, 'facilities', facility.id, 'incoming'));
    await Promise.all(incoming.docs.map(d => deleteDoc(d.ref)));
  }
}

console.log('Resetting old mock data...');
await deleteIncomingForFacilities();
for (const name of ['reminders', 'reviews', 'appointments', 'patientHistory', 'patients', 'doctors', 'staff', 'facilities']) {
  await deleteCollection(name);
}

const facilities = [
  ['charlotte-maxeke-demo','Charlotte Maxeke Demo Hospital','Johannesburg','011-555-0101'],
  ['soweto-central-demo','Soweto Central Demo Hospital','Soweto','011-555-0102'],
  ['pretoria-community-demo','Pretoria Community Demo Hospital','Pretoria','012-555-0103'],
  ['tshwane-district-demo','Tshwane District Demo Hospital','Pretoria','012-555-0104'],
  ['durban-bay-demo','Durban Bay Demo Hospital','Durban','031-555-0105'],
  ['umhlanga-community-demo','Umhlanga Community Demo Hospital','Durban','031-555-0106'],
  ['cape-peninsula-demo','Cape Peninsula Demo Hospital','Cape Town','021-555-0107'],
  ['khayelitsha-community-demo','Khayelitsha Community Demo Hospital','Cape Town','021-555-0108'],
  ['gqeberha-central-demo','Gqeberha Central Demo Hospital','Gqeberha','041-555-0109'],
  ['polokwane-community-demo','Polokwane Community Demo Hospital','Polokwane','015-555-0110']
].map(([id,name,location,phone])=>({id,name,location,phone,type:'Hospital',active:true}));

const doctorNames=['Dr Naledi Mokoena','Dr Thabo Dlamini','Dr Aisha Patel','Dr Sipho Ndlovu','Dr Lerato Molefe','Dr Daniel Jacobs','Dr Zanele Khumalo','Dr Michael van Wyk','Dr Nandi Mthembu','Dr Kabelo Seema'];
const doctors=doctorNames.map((name,i)=>({id:`doctor-${String(i+1).padStart(2,'0')}`,name,email:`${name.replace(/^Dr /,'').toLowerCase().replaceAll(' ','.')}@medassist.demo`,role:i<4?'Emergency Doctor':'Doctor',facilityId:facilities[i].id,staffNumber:`MED-D-${1101+i}`,active:true}));

const extraStaffNames=['Nomsa Nkosi','Peter Maseko','Fatima Daniels','Bongani Cele','Chantel Adams'];
const emergencyNames=['Lindiwe Mabuza','Sibusiso Zulu','Kayla Petersen','Neo Ramokgopa','Ayanda Mkhize'];
const emtNames=['Mpho Radebe','Jason Williams','Nokuthula Sithole','Ruan Botha','Themba Mhlongo'];
const staff=[
  ...doctors.map(d=>({...d,source:'doctor'})),
  ...extraStaffNames.map((name,i)=>({id:`staff-${i+1}`,name,email:`${name.toLowerCase().replaceAll(' ','.')}@medassist.demo`,role:i<3?'Nurse':'Hospital Administrator',facilityId:facilities[i].id,staffNumber:`MED-S-${2101+i}`,active:true})),
  ...emergencyNames.map((name,i)=>({id:`operator-${i+1}`,name,email:`${name.toLowerCase().replaceAll(' ','.')}@medassist.demo`,role:'Emergency Operator',facilityId:facilities[i].id,staffNumber:`MED-O-${3101+i}`,active:true})),
  ...emtNames.map((name,i)=>({id:`emt-${i+1}`,name,email:`${name.toLowerCase().replaceAll(' ','.')}@medassist.demo`,role:'Paramedic / EMT',facilityId:facilities[(i+5)%10].id,staffNumber:`MED-E-${4101+i}`,active:true}))
];

const patientSeed=[
 ['Thandiwe Maseko',67,'isiZulu','Soweto','Hypertension','Amlodipine 5 mg','Blood pressure control'],
 ['Pieter van der Merwe',54,'Afrikaans','Pretoria','Type 2 diabetes','Metformin 500 mg','Blood glucose control'],
 ['Lerato Khumalo',31,'English','Johannesburg','Asthma','Salbutamol inhaler','Asthma symptom relief'],
 ['Siyabonga Ndlovu',45,'isiZulu','Durban','High cholesterol','Atorvastatin 20 mg','Cholesterol control'],
 ['Anele Mbeki',28,'isiXhosa','Cape Town','No major history reported','None reported','N/A'],
 ['Fatima Ismail',63,'English','Cape Town','Hypertension; arthritis','Losartan 50 mg','Blood pressure control'],
 ['Kagiso Molefe',39,'Setswana','Pretoria','Migraine history','Paracetamol as needed','Headache relief'],
 ['Zanele Dube',72,'isiZulu','Durban','Hypertension; previous dehydration admission','Hydrochlorothiazide 25 mg','Blood pressure control'],
 ['Michael Jacobs',58,'English','Gqeberha','Chronic lower-back pain','Ibuprofen as needed','Pain relief'],
 ['Nompumelelo Sithole',24,'isiZulu','Polokwane','Eczema','Topical emollient','Skin symptom control']
];
const patients=patientSeed.map((p,i)=>({id:`patient-${String(i+1).padStart(2,'0')}`,name:p[0],age:p[1],language:p[2],location:p[3],medicalHistory:p[4],medications:p[5],medicationReason:p[6],phone:`+27 71 555 ${String(1200+i).slice(-4)}`,emergencyContact:`+27 82 555 ${String(2200+i).slice(-4)}`}));

const historyTemplates=[
 [['2026-08-12','Routine','Mild headache','ROUTINE','Worker confirmed.'],['2026-03-02','Follow-up','Hypertension follow-up appointment attended',null,'Attendance recorded.'],['2025-11-18','Routine','Blood pressure review','STANDARD','Medication continued.']],
 [['2026-07-21','Follow-up','Diabetes review and glucose check','STANDARD','Worker confirmed.'],['2026-01-14','Routine','Medication refill consultation','NON_URGENT','Completed.'],['2025-10-05','Routine','Diet and diabetes counselling',null,'Attended.']],
 [['2026-09-03','Urgent','Wheezing after exercise','URGENT','Worker confirmed.'],['2026-05-10','Routine','Asthma inhaler review','STANDARD','Worker confirmed.'],['2025-12-02','Routine','Mild cough','NON_URGENT','Resolved.']],
 [['2026-06-16','Routine','Cholesterol follow-up','STANDARD','Worker confirmed.'],['2026-02-11','Routine','Medication review','NON_URGENT','Attended.'],['2025-09-23','Routine','Annual wellness check',null,'Completed.']],
 [['2026-08-30','Routine','Minor ankle sprain','STANDARD','Worker confirmed.'],['2026-04-04','Routine','Seasonal allergy symptoms','NON_URGENT','Self-care guidance given.'],['2025-12-15','Routine','General check-up',null,'Completed.']],
 [['2026-09-01','Routine','Arthritis pain review','STANDARD','Worker confirmed.'],['2026-05-19','Follow-up','Hypertension monitoring','STANDARD','Worker confirmed.'],['2026-01-08','Routine','Prescription review',null,'Attended.']],
 [['2026-08-08','Urgent','Migraine with nausea','URGENT','Worker confirmed.'],['2026-03-17','Routine','Recurring headache review','STANDARD','Worker confirmed.'],['2025-11-09','Routine','General check-up',null,'Completed.']],
 [['2026-07-27','Urgent','Vomiting and dehydration','VERY_URGENT','Worker confirmed.'],['2026-02-26','Follow-up','Blood pressure follow-up','STANDARD','Attended.'],['2025-10-12','Routine','Medication review',null,'Completed.']],
 [['2026-08-19','Routine','Lower-back pain flare','STANDARD','Worker confirmed.'],['2026-04-22','Follow-up','Physiotherapy follow-up',null,'Attended.'],['2025-12-20','Routine','Pain medication review','NON_URGENT','Completed.']],
 [['2026-09-05','Routine','Eczema flare on arms','NON_URGENT','Worker confirmed.'],['2026-05-01','Routine','Skin treatment follow-up','NON_URGENT','Improving.'],['2025-11-30','Routine','General check-up',null,'Completed.']]
];
const patientHistory=[];
historyTemplates.forEach((entries,i)=>entries.forEach((h,j)=>patientHistory.push({id:`${patients[i].id}-history-${j+1}`,patientId:patients[i].id,date:h[0],visitType:h[1],summary:h[2],aiPriority:h[3],outcome:h[4]})));

const caseSeed=[
 ['Severe chest pressure and shortness of breath','IMMEDIATE',true],['Severe abdominal pain with vomiting','VERY_URGENT',false],['Wheezing and difficulty breathing','URGENT',false],['High fever and weakness since yesterday','URGENT',false],['Painful swollen ankle after a fall','STANDARD',false],['Heavy bleeding from a deep hand cut','IMMEDIATE',true],['Severe headache with nausea and light sensitivity','VERY_URGENT',false],['Repeated vomiting and unable to keep fluids down','VERY_URGENT',true],['Lower-back pain for two days','STANDARD',false],['Itchy skin rash on both arms','NON_URGENT',false]
];
const appointments=caseSeed.map((c,i)=>({id:`case-${String(i+1).padStart(2,'0')}`,patientId:patients[i].id,patientName:patients[i].name,patientAge:patients[i].age,patientLanguage:patients[i].language,patientPhone:patients[i].phone,facilityId:facilities[i].id,facilityName:facilities[i].name,doctorId:doctors[i].id,location:patients[i].location,symptomsSummary:c[0],medicalHistory:patients[i].medicalHistory,medications:patients[i].medications,medicationReason:patients[i].medicationReason,transcript:`MedAssist: Please describe what is happening today.\n${patients[i].name}: ${c[0]}.\nMedAssist: When did this start, and how severe does it feel?\n${patients[i].name}: It started recently and I am worried because it is affecting how I feel.\nMedAssist: Thank you. I have recorded your symptoms and will send this information for healthcare staff review.`,aiPriority:c[1],humanPriority:i<3?c[1]:null,status:i<3?'REVIEWED':'AWAITING_REVIEW',transportRequested:c[2],createdAt:Timestamp.fromDate(new Date(`2026-09-${String(26-i).padStart(2,'0')}T08:30:00+02:00`))}));
const reviews=appointments.map((a,i)=>({id:`review-${String(i+1).padStart(2,'0')}`,caseId:a.id,patientId:a.patientId,doctorId:doctors[i].id,reviewerName:doctors[i].name,aiPriority:a.aiPriority,humanPriority:i<3?a.aiPriority:null,notes:i<3?'Reviewed mock case; preliminary priority confirmed.':'Awaiting staff review.',createdAt:Timestamp.now()}));

for (const x of facilities) await setDoc(doc(db,'facilities',x.id),x);
for (const x of doctors) await setDoc(doc(db,'doctors',x.id),x);
for (const x of staff) await setDoc(doc(db,'staff',x.id),x);
for (const x of patients) await setDoc(doc(db,'patients',x.id),x);
for (const x of patientHistory) await setDoc(doc(db,'patientHistory',x.id),x);
for (const x of appointments) {
  await setDoc(doc(db,'appointments',x.id),x);
  await setDoc(doc(db,'facilities',x.facilityId,'incoming',x.id),{appointmentId:x.id,patientId:x.patientId,patientName:x.patientName,aiPriority:x.aiPriority,status:x.status,notifiedAt:Timestamp.now()});
}
for (const x of reviews) await setDoc(doc(db,'reviews',x.id),x);

console.log('\nMock database reset complete.');
console.log(`Facilities: ${facilities.length}`);
console.log(`Doctors: ${doctors.length}`);
console.log(`Staff: ${staff.length} (10 doctors, 5 additional staff, 5 emergency operators, 5 paramedics/EMTs)`);
console.log(`Patients: ${patients.length}`);
console.log(`Patient history entries: ${patientHistory.length}`);
console.log(`Appointments/cases: ${appointments.length}`);
console.log(`Reviews: ${reviews.length}`);
console.log('All names and clinical records above are synthetic demo data.');
process.exit(0);
