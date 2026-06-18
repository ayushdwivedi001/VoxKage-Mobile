import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

interface ModelSelectionModalProps {
  visible: boolean;
  onClose: () => void;
  models: string[];
  activeModel: string;
  setActiveModel: (model: string) => void;
  VARIANTS: string[];
  activeVariantIndex: number;
  setActiveVariantIndex: (index: number) => void;
  formatModelName: (model: string) => string;
}

export const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({
  visible,
  onClose,
  models,
  activeModel,
  setActiveModel,
  VARIANTS,
  activeVariantIndex,
  setActiveVariantIndex,
  formatModelName,
}) => {
  if (!visible) return null;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onClose}
      style={styles.inlineModalBackdrop}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={styles.inlineModalContent}
      >
        {/* Header */}
        <View style={styles.inlineModalHeader}>
          <View style={styles.inlineModalTitleRow}>
            <Ionicons name="hardware-chip-outline" size={18} color="#3b82f6" />
            <Text style={styles.inlineModalTitle}>Select Model</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.inlineModalCloseBtn}>
            <Ionicons name="close" size={20} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Variant Section */}
        <Text style={styles.inlineModalSectionLabel}>Reasoning Depth</Text>
        <View style={styles.variantChipRow}>
          {VARIANTS.map((v, i) => (
            <TouchableOpacity
              key={v}
              style={[
                styles.inlineVariantChip,
                activeVariantIndex === i && styles.inlineVariantChipActive,
              ]}
              onPress={() => setActiveVariantIndex(i)}
            >
              <Text
                style={[
                  styles.inlineVariantChipText,
                  activeVariantIndex === i && styles.inlineVariantChipTextActive,
                ]}
              >
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Models List */}
        <Text style={styles.inlineModalSectionLabel}>Available Models</Text>
        <ScrollView
          style={styles.inlineModalList}
          contentContainerStyle={{ gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {models.map((model) => (
            <TouchableOpacity
              key={model}
              style={[
                styles.inlineModelItem,
                activeModel === model && styles.inlineModelItemActive,
              ]}
              onPress={() => {
                setActiveModel(model);
                onClose();
              }}
            >
              <View style={styles.inlineModelItemDetails}>
                <Text
                  style={[
                    styles.inlineModelName,
                    activeModel === model && styles.inlineModelNameActive,
                  ]}
                >
                  {formatModelName(model)}
                </Text>
                <Text style={styles.inlineModelId}>{model}</Text>
              </View>
              {activeModel === model && (
                <Ionicons name="checkmark-circle" size={18} color="#3b82f6" />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};
