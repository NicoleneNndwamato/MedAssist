import React from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from "react-native";

export default function BookingScreen({
  facilities,
  selectedFacility,
  onSelectFacility,
  patientName,
  patientPhone,
  onPatientInfoChanged,
  onConfirm
}) {
  const canConfirm = selectedFacility && patientName.trim() && patientPhone.trim();

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your details</Text>
      <TextInput
        style={styles.input}
        placeholder="Full name"
        value={patientName}
        onChangeText={(text) => onPatientInfoChanged(text, patientPhone)}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone number"
        keyboardType="phone-pad"
        value={patientPhone}
        onChangeText={(text) => onPatientInfoChanged(patientName, text)}
      />

      <Text style={[styles.heading, { marginTop: 16 }]}>Choose a facility</Text>
      <FlatList
        data={facilities}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        renderItem={({ item }) => {
          const isSelected = selectedFacility?.id === item.id;
          return (
            <TouchableOpacity
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => onSelectFacility(item)}
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text>{item.type}</Text>
              <Text>{item.address}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={[styles.button, !canConfirm && styles.buttonDisabled]}
        onPress={onConfirm}
        disabled={!canConfirm}
      >
        <Text style={styles.buttonText}>Confirm booking</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  heading: { fontSize: 20, fontWeight: "700", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    fontSize: 16
  },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    marginVertical: 4
  },
  cardSelected: { borderColor: "#1d4ed8", backgroundColor: "#eef2ff" },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  button: {
    backgroundColor: "#1d4ed8",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 16
  },
  buttonDisabled: { backgroundColor: "#a5b4fc" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" }
});
