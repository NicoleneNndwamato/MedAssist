import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function TriageScreen({ question, onAnswer }) {
  return (
    <View style={styles.container}>
      <Text style={styles.question}>{question.text}</Text>
      {question.options.map((option) => (
        <TouchableOpacity
          key={option.text}
          style={styles.button}
          onPress={() => onAnswer(option)}
        >
          <Text style={styles.buttonText}>{option.text}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24 },
  question: { fontSize: 22, fontWeight: "600", marginBottom: 24 },
  button: {
    backgroundColor: "#1d4ed8",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginVertical: 6
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" }
});
