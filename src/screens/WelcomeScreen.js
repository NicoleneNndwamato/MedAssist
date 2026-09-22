import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function WelcomeScreen({ onStart }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome</Text>
      <Text style={styles.body}>
        I'll ask a few questions to understand what's going on and help book the
        right appointment. I don't diagnose conditions, I only help figure out
        how urgent things are and connect you to care.
      </Text>
      <TouchableOpacity style={styles.button} onPress={onStart}>
        <Text style={styles.buttonText}>Start</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 16 },
  body: { fontSize: 16, lineHeight: 22, marginBottom: 32 },
  button: {
    backgroundColor: "#1d4ed8",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center"
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" }
});
