import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

export default function RegisterIdentityScreen({ onComplete, onBack }) {
  const [name,setName]=useState(""); const [idNumber,setIdNumber]=useState(""); const [phone,setPhone]=useState("");
  const canContinue=name.trim()&&idNumber.trim()&&phone.trim();
  return <View style={styles.container}>
    <Text style={styles.title}>Register your identity</Text>
    <Text style={styles.body}>For this prototype, this screen simulates identity registration. Do not enter real sensitive information while testing.</Text>
    <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName}/>
    <TextInput style={styles.input} placeholder="ID / passport number (mock only)" value={idNumber} onChangeText={setIdNumber}/>
    <TextInput style={styles.input} placeholder="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad"/>
    <TouchableOpacity style={[styles.primary,!canContinue&&styles.disabled]} disabled={!canContinue} onPress={()=>onComplete({name,phone})}><Text style={styles.primaryText}>Register identity</Text></TouchableOpacity>
    <TouchableOpacity onPress={onBack}><Text style={styles.link}>Back to login</Text></TouchableOpacity>
  </View>
}
const styles=StyleSheet.create({container:{flex:1,justifyContent:"center",padding:24},title:{fontSize:28,fontWeight:"800",marginBottom:10},body:{fontSize:15,lineHeight:21,color:"#4b5563",marginBottom:24},input:{borderWidth:1,borderColor:"#d1d5db",borderRadius:10,padding:14,marginBottom:12,fontSize:16},primary:{backgroundColor:"#1d4ed8",padding:15,borderRadius:10,alignItems:"center"},disabled:{opacity:.45},primaryText:{color:"#fff",fontWeight:"700"},link:{textAlign:"center",color:"#1d4ed8",fontWeight:"700",marginTop:20}});
