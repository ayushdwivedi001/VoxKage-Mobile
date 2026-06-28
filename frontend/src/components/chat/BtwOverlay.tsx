import React from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

interface BtwOverlayProps {
  visible: boolean;
  onClose: () => void;
  messages: { role: string; content: string }[];
  loading: boolean;
}

export const BtwOverlay: React.FC<BtwOverlayProps> = ({
  visible,
  onClose,
  messages,
  loading,
}) => {
  if (!visible) return null;

  return (
    <>
      <TouchableOpacity
        activeOpacity={1}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          zIndex: 150,
        }}
        onPress={onClose}
      />
      <View style={[styles.btwBottomSheet, { zIndex: 151 }]}>
        <View style={styles.btwBottomSheetHeader}>
          <Text style={styles.btwBottomSheetTitle}>BY THE WAY — SIDE DOUBT</Text>
          <TouchableOpacity onPress={onClose} style={styles.btwBottomSheetClose}>
            <Ionicons name="close" size={14} color="#94a3b8" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={messages}
          keyExtractor={(_, idx) => `btw-${idx}`}
          style={styles.btwBottomSheetContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View
                style={{
                  marginVertical: 8,
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: '800',
                    color: isUser ? '#f59e0b' : '#3b82f6',
                    letterSpacing: 1.0,
                    marginBottom: 4,
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  {isUser ? 'YOU' : 'VOXKAGE'}
                </Text>
                <View
                  style={{
                    backgroundColor: isUser ? 'rgba(59, 130, 246, 0.12)' : 'rgba(30, 41, 59, 0.45)',
                    borderColor: isUser ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 255, 255, 0.06)',
                    borderWidth: 1,
                    borderRadius: 16,
                    borderTopRightRadius: isUser ? 2 : 16,
                    borderTopLeftRadius: isUser ? 16 : 2,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    ...Platform.select({
                      web: {
                        boxShadow: isUser
                          ? '0 2px 8px rgba(59, 130, 246, 0.15)'
                          : '0 2px 8px rgba(0, 0, 0, 0.2)',
                      } as any,
                      default: {},
                    }),
                  }}
                >
                  <Text style={styles.btwMessageText}>{item.content}</Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            loading ? (
              <ActivityIndicator size="small" color="#3b82f6" style={{ marginVertical: 8 }} />
            ) : null
          }
        />
      </View>
    </>
  );
};
