import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
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
  favorites: string[];
  onToggleFavorite: (model: string) => void;
}

export const formatModelName = (modelId: string) => {
  if (modelId === 'deepseek-v4-flash-free') return 'DeepSeek Flash (Free)';
  if (modelId === 'gemini-2.5-flash') return 'Gemini 2.5 Flash';
  if (modelId === 'claude-3.5-sonnet') return 'Claude 3.5 Sonnet';
  return modelId
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const ModelSelectionModal: React.FC<ModelSelectionModalProps> = ({
  visible,
  onClose,
  models,
  activeModel,
  setActiveModel,
  VARIANTS,
  activeVariantIndex,
  setActiveVariantIndex,
  favorites,
  onToggleFavorite,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  if (!visible) return null;

  // Filter models based on query
  const filteredModels = models.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return m.toLowerCase().includes(q) || formatModelName(m).toLowerCase().includes(q);
  });

  // Separate filtered list into starred and others
  const starredList = filteredModels.filter((m) => favorites.includes(m));
  const otherList = filteredModels.filter((m) => !favorites.includes(m));

  const renderModelItem = (modelId: string) => {
    const isFav = favorites.includes(modelId);
    const isActive = activeModel === modelId;

    return (
      <TouchableOpacity
        key={modelId}
        style={[
          styles.inlineModelItem,
          isActive && styles.inlineModelItemActive,
        ]}
        onPress={() => {
          setActiveModel(modelId);
          onClose();
        }}
      >
        <View style={styles.inlineModelItemDetails}>
          <Text
            style={[
              styles.inlineModelName,
              isActive && styles.inlineModelNameActive,
            ]}
          >
            {formatModelName(modelId)}
          </Text>
          <Text style={styles.inlineModelId}>{modelId}</Text>
        </View>

        <TouchableOpacity
          onPress={() => onToggleFavorite(modelId)}
          style={styles.modelFavBtn}
        >
          <Ionicons
            name={isFav ? 'star' : 'star-outline'}
            size={18}
            color={isFav ? '#eab308' : '#475569'}
          />
        </TouchableOpacity>

        {isActive && (
          <Ionicons name="checkmark-circle" size={18} color="#3b82f6" />
        )}
      </TouchableOpacity>
    );
  };

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

        {/* Search Bar */}
        <View style={styles.modelSearchContainer}>
          <Ionicons name="search-outline" size={16} color="#475569" />
          <TextInput
            style={styles.modelSearchInput}
            placeholder="Search models, Sir..."
            placeholderTextColor="#475569"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Variant Section */}
        <Text style={styles.inlineModalSectionLabel}>Reasoning Depth</Text>
        <View style={styles.variantChipRow}>
          {VARIANTS.map((v, idx) => {
            const isActive = activeVariantIndex === idx;
            return (
              <TouchableOpacity
                key={v}
                style={[
                  styles.inlineVariantChip,
                  isActive && styles.inlineVariantChipActive,
                ]}
                onPress={() => setActiveVariantIndex(idx)}
              >
                <Text
                  style={[
                    styles.inlineVariantChipText,
                    isActive && styles.inlineVariantChipTextActive,
                  ]}
                >
                  {v}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Models List */}
        <ScrollView
          style={styles.inlineModalList}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Starred Section */}
          {starredList.length > 0 && (
            <View style={styles.favSectionContainer}>
              <View style={styles.favSectionHeader}>
                <Ionicons name="star" size={11} color="#eab308" />
                <Text style={styles.favSectionTitle}>Starred Models</Text>
              </View>
              {starredList.map(renderModelItem)}
            </View>
          )}

          {/* Available Models Section */}
          {otherList.length > 0 && (
            <View>
              <Text style={styles.inlineModalSectionLabel}>Available Models</Text>
              {otherList.map(renderModelItem)}
            </View>
          )}

          {filteredModels.length === 0 && (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Ionicons name="cube-outline" size={32} color="#475569" style={{ marginBottom: 8 }} />
              <Text style={{ color: '#475569', fontSize: 13 }}>No models match your search, Sir.</Text>
            </View>
          )}
        </ScrollView>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};
