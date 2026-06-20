import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

interface ThinkingLogsModalProps {
  visible: boolean;
  onClose: () => void;
  thinkingLogs: string[];
}

export const ThinkingLogsModal: React.FC<ThinkingLogsModalProps> = ({
  visible,
  onClose,
  thinkingLogs,
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
      <View style={styles.thinkingLogsDrawer}>
        <View style={styles.thinkingLogsHeader}>
          <Text style={styles.thinkingLogsTitle}>VOXKAGE THINKING PROCESS</Text>
          <TouchableOpacity onPress={onClose} style={styles.thinkingLogsClose}>
            <Ionicons name="close" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={thinkingLogs}
          keyExtractor={(_, idx) => `log-${idx}`}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const parts = item.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
            const time = parts ? parts[1] : '';
            const content = parts ? parts[2] : item;
            return (
              <View style={styles.thinkingLogLine}>
                <Text style={styles.thinkingLogTime}>{time}</Text>
                <Text style={styles.thinkingLogText}>{content}</Text>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
};
