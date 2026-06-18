import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

interface DeleteConfirmModalProps {
  sessionToDelete: { id: string; name: string } | null;
  onCancel: () => void;
  onConfirm: (id: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  sessionToDelete,
  onCancel,
  onConfirm,
}) => {
  if (!sessionToDelete) return null;

  return (
    <View style={styles.confirmModalBackdrop}>
      <View style={styles.confirmModalContent}>
        <Ionicons name="trash-outline" size={32} color="#ef4444" style={styles.confirmIcon} />
        <Text style={styles.confirmTitle}>Delete Chat Thread</Text>
        <Text style={styles.confirmMessage}>
          Are you sure you want to permanently delete &quot;{sessionToDelete.name}&quot;, Sir?
        </Text>
        <View style={styles.confirmButtonsRow}>
          <TouchableOpacity
            style={styles.confirmCancelBtn}
            onPress={onCancel}
          >
            <Text style={styles.confirmCancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmDeleteBtn}
            onPress={() => onConfirm(sessionToDelete.id)}
          >
            <Text style={styles.confirmDeleteBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
