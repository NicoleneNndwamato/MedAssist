import React, { useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

import ConversationScreen from "./src/screens/ConversationScreen";
import PriorityResultScreen from "./src/screens/PriorityResultScreen";
import BookingScreen from "./src/screens/BookingScreen";
import ConfirmationScreen from "./src/screens/ConfirmationScreen";

import { PRIORITY_LABELS, PRIORITY_WEIGHTS } from "./src/data/priority";
import { getFacilities, createAppointment, notifyFacility } from "./src/data/firestoreRepository";

export default function App() {
  const [phase, setPhase] = useState("conversation");
  const [triageResult, setTriageResult] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");

  async function handleTriageComplete(result) {
    setTriageResult(result);
    setPhase("result");
    const loadedFacilities = await getFacilities();
    setFacilities(loadedFacilities);
  }

  function handlePatientInfoChanged(name, phone) {
    setPatientName(name);
    setPatientPhone(phone);
  }

  async function handleConfirmBooking() {
    const priorityName = triageResult.priority;
    const appointment = {
      patientName,
      patientPhone,
      facilityId: selectedFacility.id,
      facilityName: selectedFacility.name,
      priority: priorityName,
      priorityWeight: PRIORITY_WEIGHTS[priorityName] || PRIORITY_WEIGHTS.STANDARD,
      symptomsSummary: triageResult.symptomsSummary || "",
      transcriptLog: triageResult.transcriptLog || [],
      status: priorityName === "IMMEDIATE" ? "URGENT_NOTIFIED" : "PENDING",
      consentGiven: true
    };

    const appointmentId = await createAppointment(appointment);

    if (priorityName === "IMMEDIATE" || priorityName === "VERY_URGENT") {
      await notifyFacility(selectedFacility.id, appointmentId);
    }

    setPhase("confirmation");
  }

  function handleReset() {
    setPhase("conversation");
    setTriageResult(null);
    setFacilities([]);
    setSelectedFacility(null);
    setPatientName("");
    setPatientPhone("");
  }

  let screen = null;

  if (phase === "conversation") {
    screen = <ConversationScreen onTriageComplete={handleTriageComplete} />;
  } else if (phase === "result" && triageResult) {
    screen = (
      <PriorityResultScreen
        priority={{ name: triageResult.priority, label: PRIORITY_LABELS[triageResult.priority] }}
        guidance={triageResult.guidance}
        onContinue={() => setPhase("booking")}
      />
    );
  } else if (phase === "booking") {
    screen = (
      <BookingScreen
        facilities={facilities}
        selectedFacility={selectedFacility}
        onSelectFacility={setSelectedFacility}
        patientName={patientName}
        patientPhone={patientPhone}
        onPatientInfoChanged={handlePatientInfoChanged}
        onConfirm={handleConfirmBooking}
      />
    );
  } else if (phase === "confirmation") {
    screen = <ConfirmationScreen facilityName={selectedFacility?.name || ""} onDone={handleReset} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      {screen}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" }
});
