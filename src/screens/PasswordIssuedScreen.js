import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
export default function PasswordIssuedScreen({ onContinue }){
  return <View style={styles.container}><Text style={styles.title}>Registration complete</Text><Text style={styles.body}>Your prototype password is:</Text><Text style={styles.password}>MED-2026</Text><Text style={styles.note}>Demo only — production passwords must be created and stored with Firebase Authentication, never in Firestore as plain text.</Text><TouchableOpacity style={styles.button} onPress={onContinue}><Text style={styles.buttonText}>Continue to login</Text></TouchableOpacity></View>
}
const styles=StyleSheet.create({container:{flex:1,justifyContent:"center",alignItems:"center",padding:24},title:{fontSize:28,fontWeight:"800",marginBottom:18},body:{fontSize:16},password:{fontSize:28,fontWeight:"800",letterSpacing:2,marginVertical:18,color:"#1d4ed8"},note:{textAlign:"center",color:"#4b5563",lineHeight:20,marginBottom:28},button:{backgroundColor:"#1d4ed8",paddingVertical:14,paddingHorizontal:28,borderRadius:10},buttonText:{color:"#fff",fontWeight:"700"}});
