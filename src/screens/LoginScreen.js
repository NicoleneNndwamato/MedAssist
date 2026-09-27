import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

export default function LoginScreen({ onLogin, onRegister }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const canContinue = identifier.trim() && password.trim();

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>MedAssist</Text>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.body}>Sign in to continue to your MedAssist intake.</Text>
      <TextInput style={styles.input} placeholder="Phone number or ID" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={[styles.primary, !canContinue && styles.disabled]} disabled={!canContinue} onPress={() => onLogin({identifier})}>
        <Text style={styles.primaryText}>Log in</Text>
      </TouchableOpacity>
      <Text style={styles.prompt}>Haven't registered your identity yet?</Text>
      <TouchableOpacity onPress={onRegister}><Text style={styles.link}>Register and get a password</Text></TouchableOpacity>
      <Text style={styles.disclaimer}>Prototype only. MedAssist does not diagnose conditions or replace emergency services.</Text>
    </View>
  );
}
const styles=StyleSheet.create({container:{flex:1,justifyContent:"center",padding:24,backgroundColor:"#fff"},brand:{fontSize:18,fontWeight:"800",color:"#1d4ed8",marginBottom:28},title:{fontSize:30,fontWeight:"800",marginBottom:8},body:{fontSize:16,color:"#4b5563",marginBottom:24},input:{borderWidth:1,borderColor:"#d1d5db",borderRadius:10,padding:14,marginBottom:12,fontSize:16},primary:{backgroundColor:"#1d4ed8",padding:15,borderRadius:10,alignItems:"center",marginTop:4},disabled:{opacity:.45},primaryText:{color:"#fff",fontWeight:"700",fontSize:16},prompt:{textAlign:"center",marginTop:24,color:"#4b5563"},link:{textAlign:"center",color:"#1d4ed8",fontWeight:"700",marginTop:8},disclaimer:{fontSize:12,color:"#6b7280",marginTop:36,textAlign:"center",lineHeight:17}});
