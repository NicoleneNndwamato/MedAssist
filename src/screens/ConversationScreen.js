import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
//import * as Speech from "expo-speech";
import { File } from "expo-file-system";
import { AudioModule, RecordingPresets, useAudioRecorder, useAudioRecorderState, setAudioModeAsync } from "expo-audio";
import { sendVoiceTurn } from "../services/geminiService";

const GREETING = "Hello, you are talking to MedAssist. How can I help you today?";

export default function ConversationScreen({ onTriageComplete }) {
  const [conversationHistory, setConversationHistory] = useState([]);
  const [log, setLog] = useState([{ role: "assistant", content: GREETING }]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setLog((prev) => [
          ...prev,
          { role: "assistant", content: "I need microphone access to talk with you. Please enable it in your phone's settings." }
        ]);
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
  }, []);

  useEffect(() => {
    if (hasGreeted) return;
    setHasGreeted(true);
    speak(GREETING, () => {
      setConversationHistory([{ role: "assistant", content: GREETING }]);
    });
  }, [hasGreeted]);

  function speak(text, onDone) {
    setIsSpeaking(true);
    Speech.speak(text, {
      language: "en-ZA",
      onDone: () => {
        setIsSpeaking(false);
        if (onDone) onDone();
      },
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false)
    });
  }

  async function startRecording() {
    if (isSpeaking || isProcessing) return;
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  }

  async function stopRecording() {
    if (!recorderState.isRecording) return;
    await audioRecorder.stop();
    const uri = audioRecorder.uri;
    if (!uri) return;

    setIsProcessing(true);
    try {
      const file = new File(uri);
      const audioBase64 = await file.base64();

      // expo-audio's HIGH_QUALITY preset records AAC audio in an m4a container on Android.
      // If Gemini rejects this mime type in testing, try "audio/mp4" instead - see the README
      // troubleshooting section.
      const mimeType = "audio/m4a";

      const result = await sendVoiceTurn(audioBase64, mimeType, conversationHistory);

      if (result.transcript) {
        setLog((prev) => [...prev, { role: "user", content: result.transcript }]);
      }
      setLog((prev) => [...prev, { role: "assistant", content: result.spokenReply }]);

      const updatedHistory = [
        ...conversationHistory,
        ...(result.transcript ? [{ role: "user", content: result.transcript }] : []),
        { role: "assistant", content: result.spokenReply }
      ];
      setConversationHistory(updatedHistory);

      setIsProcessing(false);
      speak(result.spokenReply, () => {
        if (result.triageComplete) {
          onTriageComplete({
            priority: result.priority,
            guidance: result.guidance,
            symptomsSummary: result.symptomsSummary,
            transcriptLog: updatedHistory
          });
        }
      });
    } catch (err) {
      console.error("Voice turn failed:", err);
      setIsProcessing(false);
      speak("Sorry, something went wrong. Please try again.");
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.log} contentContainerStyle={{ paddingBottom: 16 }}>
        {log.map((entry, index) => (
          <View
            key={index}
            style={[styles.bubble, entry.role === "assistant" ? styles.bubbleAssistant : styles.bubbleUser]}
          >
            <Text style={styles.bubbleText}>{entry.content}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.controls}>
        {isProcessing ? (
          <ActivityIndicator size="large" color="#1d4ed8" />
        ) : (
          <TouchableOpacity
            style={[
              styles.micButton,
              recorderState.isRecording && styles.micButtonActive,
              (isSpeaking || isProcessing) && styles.micButtonDisabled
            ]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            disabled={isSpeaking || isProcessing}
          >
            <Text style={styles.micButtonText}>
              {recorderState.isRecording ? "Listening..." : isSpeaking ? "Speaking..." : "Hold to talk"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  log: { flex: 1, marginBottom: 16 },
  bubble: {
    maxWidth: "85%",
    padding: 12,
    borderRadius: 12,
    marginVertical: 4
  },
  bubbleAssistant: { backgroundColor: "#eef2ff", alignSelf: "flex-start" },
  bubbleUser: { backgroundColor: "#1d4ed8", alignSelf: "flex-end" },
  bubbleText: { fontSize: 15, color: "#111" },
  controls: { alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  micButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "#1d4ed8",
    alignItems: "center",
    justifyContent: "center"
  },
  micButtonActive: { backgroundColor: "#dc2626" },
  micButtonDisabled: { backgroundColor: "#a5b4fc" },
  micButtonText: { color: "#fff", fontSize: 16, fontWeight: "600", textAlign: "center", paddingHorizontal: 12 }
});
