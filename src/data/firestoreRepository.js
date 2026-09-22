import {
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

export async function getFacilities() {
  const snapshot = await getDocs(collection(db, "facilities"));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createAppointment(appointment) {
  const docRef = await addDoc(collection(db, "appointments"), {
    ...appointment,
    createdAt: serverTimestamp()
  });
  return docRef.id;
}

export async function notifyFacility(facilityId, appointmentId) {
  await setDoc(
    doc(db, "facilities", facilityId, "incoming", appointmentId),
    {
      appointmentId,
      notifiedAt: serverTimestamp()
    }
  );
}
