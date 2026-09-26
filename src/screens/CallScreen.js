import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { File, Paths } from "expo-file-system";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  createAudioPlayer
} from "expo-audio";
import { startCall, submitLanguageSample, answerQuestion, completeIntake } from "../services/callService";
// The number this hackathon build always "dials" - a real USSD/telephony
// integration would get this from the network instead of a hardcoded value.
const DEMO_PHONE_NUMBER = "1234567890";

// Custom recording options aimed at producing plain 16kHz mono WAV/PCM,
// which is what Azure Speech's REST endpoint expects (content-type
// "audio/wav; codecs=audio/pcm; samplerate=16000"). This is the trickiest
// cross-platform bit of this screen - if Azure rejects the audio in
// testing, check the actual container/codec the device produced and adjust
// AZURE_CONTENT_TYPE below and/or these options to match.
const RECORDING_OPTIONS = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 128000,
  android: { outputFormat: "default", audioEncoder: "default" },
  ios: {
    outputFormat: "lpcm",
    audioQuality: "high",
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false
  }
};
const AZURE_CONTENT_TYPE = "audio/wav; codecs=audio/pcm; samplerate=16000";

// Plays one clip (from a base64 mp3 string OR a bundled require() asset)
// and resolves once it's finished - lets us play things in sequence
// (e.g. three greetings back-to-back) with plain async/await.
async function playAndWait(source) {
  return new Promise((resolve, reject) => {
    let player = null;
    let subscription = null;
    let finished = false;

    const cleanup = () => {
      try {
        subscription?.remove();
      } catch (err) {
        console.warn("Could not remove playback listener:", err);
      }

      try {
        player?.release();
      } catch (err) {
        console.warn("Could not release audio player:", err);
      }
    };

    try {
      player = createAudioPlayer(source);

      subscription = player.addListener(
        "playbackStatusUpdate",
        (status) => {
          if (status.didJustFinish && !finished) {
            finished = true;
            cleanup();
            resolve();
          }
        }
      );

      player.play();
    } catch (err) {
      if (!finished) {
        finished = true;
        cleanup();
        reject(err);
      }
    }
  });
}

async function playBase64Mp3(base64) {
  if (!base64) {
    throw new Error("No TTS audio was returned by MedAssist.");
  }

  const file = new File(
    Paths.cache,
    `medassist-tts-${Date.now()}.mp3`
  );

  try {
    // Convert the base64 returned by Azure into actual MP3 bytes.
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    file.write(bytes);

    console.log(
      "MedAssist TTS file created:",
      file.uri,
      "bytes:",
      bytes.length
    );

    await playAndWait({ uri: file.uri });
  } catch (err) {
    console.error("MedAssist TTS playback failed:", err);
    throw err;
  } finally {
    try {
      if (file.exists) {
        file.delete();
      }
    } catch (cleanupError) {
      console.warn(
        "Could not delete temporary TTS file:",
        cleanupError
      );
    }
  }
}

export default function CallScreen({ onIntakeComplete }) {
  const [phase, setPhase] = useState("idle"); // idle | connecting | detect-language | question | saving | done | error
  const [statusText, setStatusText] = useState("");
  const [transcriptLog, setTranscriptLog] = useState([]);
  const [errorText, setErrorText] = useState("");

  const holdMusicPlayerRef = useRef(null);
  const languageRef = useRef(null);
  const answeredIdsRef = useRef([]);
  const answersRef = useRef({});
  const profileRef = useRef(null);

  const audioRecorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(audioRecorder);

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setErrorText("Microphone access is needed to talk to MedAssist. Please enable it in your phone's settings.");
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
    return () => stopHoldMusic();
  }, []);

  function startHoldMusic() {
    // eslint-disable-next-line global-require
    const player = createAudioPlayer(require("../../assets/hold-music.mp3"));
    player.loop = true;
    player.play();
    holdMusicPlayerRef.current = player;
  }

 function stopHoldMusic() {
  if (holdMusicPlayerRef.current) {
    try {
      holdMusicPlayerRef.current.release();
    } catch (err) {
      console.warn("Could not release hold music:", err);
    }

    holdMusicPlayerRef.current = null;
  }
}

  function logLine(role, text) {
    setTranscriptLog((prev) => [...prev, { role, text }]);
  }

  async function recordOneAnswer() {
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  }

  async function stopAndGetBase64() {
    await audioRecorder.stop();
    const uri = audioRecorder.uri;
    if (!uri) return null;
    const file = new File(uri);
    return file.base64();
  }

  // ---- Call flow -----------------------------------------------------

  async function handleDial() {
    setErrorText("");
    setPhase("connecting");
    setStatusText("Dialing MedAssist...");
    startHoldMusic();

    try {
      const result = await startCall(DEMO_PHONE_NUMBER);
      stopHoldMusic();

      if (result.isNewPatient) {
        setStatusText("New caller - listening for your language...");
        setPhase("detect-language");
        // Play the "please tell us your name" prompt in every candidate
        // language, one after another, then start listening.
        for (const prompt of result.prompts) {
          logLine("assistant", `(${prompt.language}) ${prompt.text}`);
          // eslint-disable-next-line no-await-in-loop
          await playBase64Mp3(prompt.audioBase64);
        }
        await recordOneAnswer();
      } else {
        languageRef.current = result.language;
        profileRef.current = result.profile;
        logLine("assistant", result.greeting.text);
        await playBase64Mp3(result.greeting.audioBase64);

        if (result.question) {
          logLine("assistant", result.question.text);
          await playBase64Mp3(result.question.audioBase64);
          setPhase("question");
          setStatusText(result.question.text);
          answeredIdsRef.current = [];
          audioRecorder._currentQuestionId = result.question.id;
          await recordOneAnswer();
        } else {
          finishCall();
        }
      }
    } catch (err) {
      console.error("startCall failed:", err);
      stopHoldMusic();
      setErrorText("Something went wrong connecting to MedAssist. Please try again.");
      setPhase("error");
    }
  }

  // Stops recording for the "detect my language" step and sends it up.
  async function handleStopDetectLanguage() {
    setPhase("connecting");
    setStatusText("Working out your language...");
    try {
      const audioBase64 = await stopAndGetBase64();
      const result = await submitLanguageSample(DEMO_PHONE_NUMBER, audioBase64, AZURE_CONTENT_TYPE);
      languageRef.current = result.detectedLanguage;
      answeredIdsRef.current = ["name"];
      answersRef.current.rawAnswers = [{ questionId: "name", local: result.heard.local, english: result.heard.english }];
      logLine("user", `${result.heard.local}  (heard as: ${result.heard.english})`);

      if (result.question) {
        logLine("assistant", result.question.text);
        await playBase64Mp3(result.question.audioBase64);
        audioRecorder._currentQuestionId = result.question.id;
        setPhase("question");
        setStatusText(result.question.text);
        await recordOneAnswer();
      } else {
        finishCall();
      }
    } catch (err) {
      console.error("submitLanguageSample failed:", err);
      setErrorText("We couldn't understand that. Please try calling again.");
      setPhase("error");
    }
  }

  // Stops recording for a normal scripted question and sends it up.
  async function handleStopQuestion() {
    const questionId = audioRecorder._currentQuestionId;
    setPhase("connecting");
    setStatusText("Sending your answer...");
    try {
      const audioBase64 = await stopAndGetBase64();
      const result = await answerQuestion({
        phoneNumber: DEMO_PHONE_NUMBER,
        questionId,
        audioBase64,
        mimeType: AZURE_CONTENT_TYPE,
        language: languageRef.current,
        answeredIds: answeredIdsRef.current
      });

      answeredIdsRef.current = [...answeredIdsRef.current, questionId];
      answersRef.current[questionId] = result.heard.english;
      answersRef.current.rawAnswers = [
        ...(answersRef.current.rawAnswers || []),
        { questionId, local: result.heard.local, english: result.heard.english }
      ];
      logLine("user", `${result.heard.local}  (heard as: ${result.heard.english})`);

      if (result.question) {
        logLine("assistant", result.question.text);
        await playBase64Mp3(result.question.audioBase64);
        audioRecorder._currentQuestionId = result.question.id;
        setPhase("question");
        setStatusText(result.question.text);
        await recordOneAnswer();
      } else {
        finishCall();
      }
    } catch (err) {
      console.error("answerQuestion failed:", err);
      setErrorText("Something went wrong sending your answer. Please try again.");
      setPhase("error");
    }
  }

  async function finishCall() {
    setPhase("saving");
    setStatusText("Saving your information...");
    try {
      await completeIntake({
        phoneNumber: DEMO_PHONE_NUMBER,
        language: languageRef.current,
        answers: {
          location: answersRef.current.location,
          symptoms: answersRef.current.symptoms,
          symptomDuration: answersRef.current.symptomDuration,
          lastVisit: answersRef.current.lastVisit,
          medicalHistory: answersRef.current.medicalHistory,
          medications: answersRef.current.medications,
          needsAmbulance: answersRef.current.ambulance,
          emergencyContactNumber: answersRef.current.emergencyContact,
          rawAnswers: answersRef.current.rawAnswers || []
        }
      });
      setPhase("done");
      setStatusText("Thank you - your information has been recorded.");
    } catch (err) {
      console.error("completeIntake failed:", err);
      setErrorText("We collected your answers but couldn't save them. Please try again.");
      setPhase("error");
    }
  }

  function handleContinue() {
    onIntakeComplete({
      phoneNumber: DEMO_PHONE_NUMBER,
      language: languageRef.current,
      answers: answersRef.current,
      profile: profileRef.current
    });
  }

  // ---- UI --------------------------------------------------------------

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>MedAssist</Text>
      <Text style={styles.phoneNumber}>{DEMO_PHONE_NUMBER}</Text>

      {phase === "idle" && (
        <TouchableOpacity style={styles.callButton} onPress={handleDial}>
          <Text style={styles.callButtonText}>📞 Call MedAssist</Text>
        </TouchableOpacity>
      )}

      {(phase === "connecting" || phase === "detect-language" || phase === "saving") && (
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color="#1d4ed8" />
          <Text style={styles.statusText}>{statusText}</Text>
          {phase === "detect-language" && recorderState.isRecording && (
            <TouchableOpacity style={styles.stopButton} onPress={handleStopDetectLanguage}>
              <Text style={styles.stopButtonText}>Done talking</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {phase === "question" && (
        <View style={styles.centerBlock}>
          <Text style={styles.statusText}>{statusText}</Text>
          <TouchableOpacity style={styles.stopButton} onPress={handleStopQuestion}>
            <Text style={styles.stopButtonText}>{recorderState.isRecording ? "Done talking" : "Recording..."}</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "done" && (
        <View style={styles.centerBlock}>
          <Text style={styles.statusText}>{statusText}</Text>
          <TouchableOpacity style={styles.callButton} onPress={handleContinue}>
            <Text style={styles.callButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "error" && (
        <View style={styles.centerBlock}>
          <Text style={styles.errorText}>{errorText}</Text>
          <TouchableOpacity style={styles.callButton} onPress={() => setPhase("idle")}>
            <Text style={styles.callButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.log} contentContainerStyle={{ paddingBottom: 16 }}>
        {transcriptLog.map((entry, index) => (
          <Text key={index} style={entry.role === "assistant" ? styles.logAssistant : styles.logUser}>
            {entry.role === "assistant" ? "MedAssist: " : "You: "}
            {entry.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 24, fontWeight: "700", textAlign: "center", marginTop: 12 },
  phoneNumber: { fontSize: 16, color: "#666", textAlign: "center", marginBottom: 24 },
  callButton: {
    backgroundColor: "#16a34a",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginVertical: 12
  },
  callButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  centerBlock: { alignItems: "center", justifyContent: "center", marginVertical: 16 },
  statusText: { fontSize: 16, textAlign: "center", marginVertical: 12, paddingHorizontal: 8 },
  stopButton: {
    backgroundColor: "#dc2626",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 8
  },
  stopButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  errorText: { color: "#dc2626", textAlign: "center", marginBottom: 12 },
  log: { flex: 1, marginTop: 16 },
  logAssistant: { color: "#1d4ed8", marginVertical: 4 },
  logUser: { color: "#111", marginVertical: 4, marginLeft: 12 }
});
