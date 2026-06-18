import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

interface ChatInputProps {
  inputText: string;
  setInputText: (text: string) => void;
  handleSendMessage: () => void;
  handleFileUpload: () => void;
  handleVoicePress: () => void;
  isVoiceActive: boolean;
  uploadingFile: boolean;
  loading: boolean;
  activeModel: string;
  formatModelName: (model: string) => string;
  VARIANTS: string[];
  activeVariantIndex: number;
  setActiveVariantIndex: (index: number) => void;
  showVariantDropdown: boolean;
  setShowVariantDropdown: (show: boolean) => void;
  setShowModelModal: (show: boolean) => void;
  activeEditingProjectId: string | null;
  projects: any[];
  setActiveEditingProjectId: (id: string | null) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputText,
  setInputText,
  handleSendMessage,
  handleFileUpload,
  handleVoicePress,
  isVoiceActive,
  uploadingFile,
  loading,
  activeModel,
  formatModelName,
  VARIANTS,
  activeVariantIndex,
  setActiveVariantIndex,
  showVariantDropdown,
  setShowVariantDropdown,
  setShowModelModal,
  activeEditingProjectId,
  projects,
  setActiveEditingProjectId,
}) => {
  return (
    <View style={styles.inputAreaContainer}>
      {showVariantDropdown && (
        <TouchableOpacity
          activeOpacity={1}
          style={styles.dropdownBackdrop}
          onPress={() => setShowVariantDropdown(false)}
        />
      )}
      {showVariantDropdown && (
        <View style={styles.variantDropdown}>
          {VARIANTS.map((v, i) => (
            <TouchableOpacity
              key={v}
              style={[
                styles.variantDropdownItem,
                activeVariantIndex === i && styles.variantDropdownItemActive,
              ]}
              onPress={() => {
                setActiveVariantIndex(i);
                setShowVariantDropdown(false);
              }}
            >
              <Text
                style={[
                  styles.variantDropdownText,
                  activeVariantIndex === i && styles.variantDropdownTextActive,
                ]}
              >
                {v}
              </Text>
              {activeVariantIndex === i && (
                <Ionicons name="checkmark" size={12} color="#60a5fa" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Model & Variant Toggles (Capsules) — Placed above the input to avoid safe area overlap */}
      <View style={styles.capsulesContainer}>
        <TouchableOpacity
          style={styles.capsule}
          onPress={() => setShowModelModal(true)}
        >
          <Ionicons
            name="sparkles-outline"
            size={12}
            color="#60a5fa"
          />
          <Text style={styles.capsuleText}>
            {formatModelName(activeModel)}
          </Text>
          <Ionicons name="chevron-down" size={10} color="#94a3b8" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.capsule}
          onPress={() => setShowVariantDropdown(!showVariantDropdown)}
        >
          <Ionicons
            name="options-outline"
            size={12}
            color="#60a5fa"
          />
          <Text style={styles.capsuleText}>
            Variant: {VARIANTS[activeVariantIndex]}
          </Text>
          <Ionicons name="chevron-down" size={10} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Refining HUD Bar */}
      {activeEditingProjectId && (
        <View style={styles.refiningHudBar}>
          <View style={styles.refiningHudLeft}>
            <Ionicons name="color-wand-outline" size={14} color="#60a5fa" />
            <Text style={styles.refiningHudText} numberOfLines={1}>
              Refining: {projects.find((p) => p.id === activeEditingProjectId)?.name || 'Untitled App'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.refiningHudCloseBtn}
            onPress={() => setActiveEditingProjectId(null)}
          >
            <Ionicons name="close-circle" size={16} color="#ef4444" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputPill}>
        <TouchableOpacity
          onPress={handleFileUpload}
          style={styles.inputAddBtn}
          disabled={uploadingFile}
        >
          {uploadingFile ? (
            <ActivityIndicator size="small" color="#3b82f6" />
          ) : (
            <Ionicons name="add-outline" size={24} color="#94a3b8" />
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.inputField}
          placeholder="Message VoxKage..."
          placeholderTextColor="#475569"
          value={inputText}
          onChangeText={setInputText}
          multiline={true}
        />

        <TouchableOpacity onPress={handleVoicePress} style={styles.inputVoiceBtn}>
          <Ionicons
            name={isVoiceActive ? 'mic' : 'mic-outline'}
            size={20}
            color={isVoiceActive ? '#ef4444' : '#94a3b8'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSendMessage}
          style={styles.inputSendBtn}
          disabled={loading}
        >
          <View style={[styles.sendCircle, inputText.trim() && styles.sendCircleActive]}>
            <Ionicons
              name="arrow-up"
              size={16}
              color={inputText.trim() ? '#ffffff' : '#475569'}
            />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};
