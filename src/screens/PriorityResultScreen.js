import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function PriorityResultScreen({ priority, guidance, onContinue }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Priority level: {priority.label}</Text>
      <Text style={styles.body}>{guidance}</Text>
      <TouchableOpacity style={styles.button} onPress={onContinue}>
        <Text style={styles.buttonText}>
          {priority.name === "IMMEDIATE" ? "Continue to notify facility" : "Continue to booking"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 16 },
  body: { fontSize: 16, lineHeight: 22, marginBottom: 32 },
  button: {
    backgroundColor: "#1d4ed8",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center"
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" }
});
