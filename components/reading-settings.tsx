import React, { useState } from "react";
import { View, StyleSheet, TouchableOpacity, Modal, Text } from "react-native";
import { Feather } from "@expo/vector-icons";

import { P } from "@/components/ui/typography";
import { Switch } from "@/components/ui/switch";

interface ReadingSettingsProps {
  enableAudio: boolean;
  enableHighlighting: boolean;
  enableDarkMode: boolean;
  onUpdateSetting: (
    settingName: 'enable_audio' | 'enable_highlighting' | 'enable_dark_mode',
    value: boolean
  ) => void;
}

export default function ReadingSettings({
  enableAudio,
  enableHighlighting,
  enableDarkMode,
  onUpdateSetting
}: ReadingSettingsProps) {
  const [showModal, setShowModal] = useState(false);
  
  return (
    <>
      <TouchableOpacity 
        style={styles.settingsButton}
        onPress={() => setShowModal(true)}
      >
        <Feather name="settings" size={20} color="#fff" />
      </TouchableOpacity>
      
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <P className="text-lg font-semibold">Reading Settings</P>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowModal(false)}
              >
                <Feather name="x" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.settingRow}>
              <P>Enable Audio</P>
              <Switch 
                checked={enableAudio}
                onCheckedChange={(isChecked) => onUpdateSetting('enable_audio', isChecked)}
              />
            </View>
            
            <View style={styles.settingRow}>
              <P>Text Highlighting</P>
              <Switch 
                checked={enableHighlighting}
                onCheckedChange={(isChecked) => onUpdateSetting('enable_highlighting', isChecked)}
              />
            </View>
            
            <View style={styles.settingRow}>
              <P>Dark Mode</P>
              <Switch 
                checked={enableDarkMode}
                onCheckedChange={(isChecked) => onUpdateSetting('enable_dark_mode', isChecked)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  settingsButton: {
    padding: 10,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#121212",
    borderRadius: 12,
    width: "100%",
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  closeButton: {
    padding: 4,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
}); 