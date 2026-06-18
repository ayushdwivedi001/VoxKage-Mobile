import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LogoV } from './LogoV';
import { styles } from './styles';

export interface ChatSession {
  id: string;
  name: string;
  created_at: string;
}

interface SidebarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sidebarAnim: Animated.Value;
  createNewSession: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  selectSession: (id: string) => void;
  editingSessionId: string | null;
  setEditingSessionId: (id: string | null) => void;
  editingSessionName: string;
  setEditingSessionName: (name: string) => void;
  handleRenameSession: (id: string, name: string) => void;
  deleteSession: (id: string) => void;
  showSidebarSettings: boolean;
  setShowSidebarSettings: (show: boolean) => void;
  handleLogout: () => void;
  email: string | null;
  onPlaygroundPress: () => void;
}

export const SidebarDrawer: React.FC<SidebarDrawerProps> = ({
  isOpen,
  onClose,
  sidebarAnim,
  createNewSession,
  sessions,
  currentSessionId,
  selectSession,
  editingSessionId,
  setEditingSessionId,
  editingSessionName,
  setEditingSessionName,
  handleRenameSession,
  deleteSession,
  showSidebarSettings,
  setShowSidebarSettings,
  handleLogout,
  email,
  onPlaygroundPress,
}) => {
  return (
    <>
      {isOpen && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
          style={styles.drawerBackdrop}
        />
      )}
      <Animated.View style={[styles.sidebarDrawer, { left: sidebarAnim }]}>
        <View style={styles.sidebarHeader}>
          <LogoV size={24} />
          <Text style={styles.sidebarTitle}>VoxKage</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close-outline" size={22} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={createNewSession} style={styles.newChatBtn}>
          <Ionicons name="chatbox-ellipses-outline" size={16} color="#ffffff" />
          <Text style={styles.newChatBtnText}>New Chat Thread</Text>
        </TouchableOpacity>

        {/* Dedicated Sandbox Playground Button in Sidebar */}
        <TouchableOpacity
          onPress={onPlaygroundPress}
          style={styles.sidebarPlaygroundBtn}
        >
          <Ionicons name="code-slash-outline" size={16} color="#2563eb" />
          <Text style={styles.sidebarPlaygroundText}>Playground</Text>
        </TouchableOpacity>

        <Text style={styles.historyLabel}>History</Text>
        <ScrollView style={styles.sessionsList} showsVerticalScrollIndicator={false}>
          {sessions.map((s) => (
            <View
              key={s.id}
              style={[
                styles.sessionItemContainer,
                s.id === currentSessionId && styles.sessionItemActive,
              ]}
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={s.id === currentSessionId ? '#2563eb' : '#4b5563'}
              />
              
              {editingSessionId === s.id ? (
                <TextInput
                  style={styles.sessionRenameInput}
                  value={editingSessionName}
                  onChangeText={setEditingSessionName}
                  autoFocus={true}
                  onSubmitEditing={() => handleRenameSession(s.id, editingSessionName)}
                  onBlur={() => handleRenameSession(s.id, editingSessionName)}
                  returnKeyType="done"
                />
              ) : (
                <TouchableOpacity
                  onPress={() => selectSession(s.id)}
                  style={styles.sessionTextWrapper}
                >
                  <Text
                    style={[
                      styles.sessionText,
                      s.id === currentSessionId && styles.sessionTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                </TouchableOpacity>
              )}

              {editingSessionId !== s.id && (
                <View style={styles.sessionActionRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingSessionId(s.id);
                      setEditingSessionName(s.name);
                    }}
                    style={styles.sessionActionBtn}
                  >
                    <Ionicons name="create-outline" size={14} color="#9ca3af" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deleteSession(s.id)}
                    style={styles.sessionActionBtn}
                  >
                    <Ionicons name="trash-outline" size={13} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Settings Popover inside Sidebar Drawer */}
        {showSidebarSettings && (
          <View style={styles.sidebarSettingsPopover}>
            <View style={styles.sidebarSettingsHeader}>
              <Text style={styles.sidebarSettingsTitle}>Settings</Text>
              <TouchableOpacity onPress={() => setShowSidebarSettings(false)}>
                <Ionicons name="close" size={16} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                setShowSidebarSettings(false);
                onClose();
                handleLogout();
              }}
              style={styles.sidebarSettingsItem}
            >
              <Ionicons name="log-out-outline" size={16} color="#ef4444" />
              <Text style={styles.sidebarSettingsItemText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.sidebarFooter}>
          <View style={styles.userSection}>
            <Ionicons name="person-circle-outline" size={32} color="#3b82f6" />
            <View style={styles.userInfo}>
              <Text style={styles.userHonorific}>Sir</Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {email || 'sir@voxkage.ai'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowSidebarSettings(!showSidebarSettings)}
              style={styles.settingsIconBtn}
            >
              <Ionicons name="settings-outline" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </>
  );
};
