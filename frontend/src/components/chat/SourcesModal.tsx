import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal, Image, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

interface SourceItem {
  title: string;
  url: string;
  domain: string;
}

interface SourcesModalProps {
  visible: boolean;
  onClose: () => void;
  sources: SourceItem[];
}

export const SourcesModal: React.FC<SourcesModalProps> = ({
  visible,
  onClose,
  sources,
}) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
        }}
        onPress={onClose}
      />
      <View style={styles.sourcesBottomSheet}>
        <View style={styles.sourcesBottomSheetHeader}>
          <View style={styles.sourcesBottomSheetTitleRow}>
            <Ionicons name="globe-outline" size={16} color="#60a5fa" />
            <Text style={styles.sourcesBottomSheetTitle}>Consulted Sources</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.sourcesBottomSheetClose}>
            <Ionicons name="close" size={14} color="#94a3b8" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={sources}
          keyExtractor={(item, idx) => `source-${idx}`}
          showsVerticalScrollIndicator={false}
          style={styles.sourcesList}
          renderItem={({ item }) => {
            const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${item.domain}`;
            return (
              <TouchableOpacity
                style={styles.sourceListItem}
                onPress={() => {
                  if (item.url) {
                    Linking.openURL(item.url).catch(() => {
                      Alert.alert('Error, Sir', 'Could not open this URL.');
                    });
                  }
                }}
                activeOpacity={0.7}
              >
                <Image source={{ uri: faviconUrl }} style={styles.sourceListItemFavicon} />
                <View style={styles.sourceListItemContent}>
                  <Text style={styles.sourceListItemTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.sourceListItemDomain} numberOfLines={1}>
                    {item.domain}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color="#64748b" />
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
};
