import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function ConfirmationScreen({ facilityName, onDone }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Booking confirmed</Text>
      <Text style={styles.body}>
        {facilityName} has been notified and your appointment has been recorded.
      </Text>
      <TouchableOpacity style={styles.button} onPress={onDone}>
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 12 },
  body: { fontSize: 16, textAlign: "center", marginBottom: 32 },
  button: {
    backgroundColor: "#1d4ed8",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" }
});
