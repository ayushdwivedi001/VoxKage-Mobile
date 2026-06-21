import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { storage, SettingsProfile } from '@/utils/storage';
import { settingsManager } from '@/utils/settings';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  email: string | null;
  onLogout: () => void;
  models: string[];
  activeModel: string;
  setActiveModel: (model: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  email,
  onLogout,
  models,
  activeModel,
  setActiveModel,
}) => {
  const insets = useSafeAreaInsets();
  
  // Section expand/collapse state
  const [expandedSection, setExpandedSection] = useState<'app' | 'personalization' | 'maintenance' | null>(null);

  // Profile data
  const [profile, setProfile] = useState<SettingsProfile>({
    honorific: 'Sir',
    personality_tone: 'Polite',
    custom_profile_data: '',
  });

  // OpenCode API Key State
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [opencodeKey, setOpencodeKey] = useState('');
  const [enteredKey, setEnteredKey] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Load settings on mount/visible
  useEffect(() => {
    if (visible) {
      loadProfileAndKey();
    }
  }, [visible]);

  const loadProfileAndKey = async () => {
    const prof = await settingsManager.initialize();
    setProfile({ ...prof });
    
    const key = await storage.getOpenCodeApiKey();
    setOpencodeKey(key || '');
    setEnteredKey(key || '');
    setIsEditingKey(!key); // If no key, show input field by default
  };

  const toggleSection = (section: 'app' | 'personalization' | 'maintenance') => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Masked key display helper
  const getMaskedKey = (key: string) => {
    if (!key) return 'Not configured';
    if (key.length <= 12) return '••••••••••••';
    const firstPart = key.slice(0, 9); // e.g. opencode-
    const lastPart = key.slice(-4);
    return `${firstPart}••••••${lastPart}`;
  };

  // Verify and Save API Key
  const handleVerifyAndSaveKey = async () => {
    if (!enteredKey.trim()) {
      Alert.alert('Error', 'Please enter an API key.');
      return;
    }
    setIsVerifying(true);
    try {
      // Validate key directly against OpenCode models endpoint
      const response = await fetch('https://opencode.ai/zen/v1/models', {
        headers: { Authorization: `Bearer ${enteredKey.trim()}` },
      });
      
      if (response.ok) {
        await storage.setOpenCodeApiKey(enteredKey.trim());
        setOpencodeKey(enteredKey.trim());
        setIsEditingKey(false);
        
        // Also notify backend if user is logged in
        const storedUrl = await storage.getBackendUrl();
        const storedToken = await storage.getToken();
        if (storedToken && !storedToken.startsWith('mock-') && storedUrl) {
          try {
            // Option to sync the API key securely to backend if needed, 
            // but normally backend environment has it. We still notify local success.
          } catch (e) {
            console.error('Failed to sync to backend', e);
          }
        }
        Alert.alert('Success', 'OpenCode API Key verified and saved successfully.');
      } else {
        Alert.alert('Verification Failed', 'The OpenCode API Key is invalid.');
      }
    } catch (e: any) {
      Alert.alert('Connection Error', `Unable to verify API Key: ${e.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  // Save Settings Profile
  const handleSaveProfileField = async (updated: Partial<SettingsProfile>) => {
    const nextProfile = { ...profile, ...updated };
    setProfile(nextProfile);
    await settingsManager.updateProfile(nextProfile);

    // Sync to Supabase in the background if online
    const storedUrl = await storage.getBackendUrl();
    const storedToken = await storage.getToken();
    if (storedToken && !storedToken.startsWith('mock-') && storedUrl) {
      try {
        await fetch(`${storedUrl.trim().replace(/\/$/, '')}/user/settings-profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${storedToken}`,
          },
          body: JSON.stringify({ settings_profile: nextProfile }),
        });
      } catch (e) {
        console.error('Failed to sync settings profile to cloud', e);
      }
    }
  };

  // Maintenance Actions
  const handleClearAllSessions = () => {
    const executeClear = async () => {
      const storedUrl = await storage.getBackendUrl();
      const storedToken = await storage.getToken();
      if (storedToken && storedUrl) {
        try {
          if (!storedToken.startsWith('mock-')) {
            await fetch(`${storedUrl.trim().replace(/\/$/, '')}/sessions`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${storedToken}` },
            });
          }
          Alert.alert('Success', 'All chat sessions deleted successfully.');
        } catch (e: any) {
          Alert.alert('Error', `Failed to delete sessions: ${e.message}`);
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = window.confirm('Are you absolutely sure you want to delete all chat threads, Sir? This cannot be undone.');
      if (ok) executeClear();
    } else {
      Alert.alert(
        'Clear Chat History',
        'Are you absolutely sure you want to delete all chat threads, Sir? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete All', style: 'destructive', onPress: executeClear },
        ]
      );
    }
  };

  const handleClearPlayground = () => {
    const executeClear = async () => {
      const storedUrl = await storage.getBackendUrl();
      const storedToken = await storage.getToken();
      if (storedToken && storedUrl) {
        try {
          if (!storedToken.startsWith('mock-')) {
            await fetch(`${storedUrl.trim().replace(/\/$/, '')}/projects`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${storedToken}` },
            });
          }
          Alert.alert('Success', 'All sandbox mini apps deleted successfully.');
        } catch (e: any) {
          Alert.alert('Error', `Failed to delete mini apps: ${e.message}`);
        }
      }
    };

    if (Platform.OS === 'web') {
      const ok = window.confirm('Are you absolutely sure you want to wipe all sandbox mini apps, Sir? This cannot be undone.');
      if (ok) executeClear();
    } else {
      Alert.alert(
        'Wipe Sandbox Playground',
        'Are you absolutely sure you want to wipe all sandbox mini apps, Sir? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Wipe Sandbox', style: 'destructive', onPress: executeClear },
        ]
      );
    }
  };

  // Formatting display name from email
  const getDisplayName = () => {
    if (profile.user_name) return profile.user_name;
    if (email) {
      const prefix = email.split('@')[0];
      return prefix.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
    return 'Sir';
  };

  const honorifics: SettingsProfile['honorific'][] = [
    'Sir', 'Mam', 'Boss', 'Comrade', 'Commander', 'Agent', 'Custom', 'None'
  ];

  const personalityTones: { label: string; value: SettingsProfile['personality_tone'] }[] = [
    { label: 'Polite (Jarvis)', value: 'Polite' },
    { label: 'Casual & Friendly', value: 'Casual' },
    { label: 'Stern & Direct', value: 'Stern' },
    { label: 'Judgy & Sarcastic', value: 'Judgy' },
    { label: 'Companion / Partner', value: 'Companion' }
  ];

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContainer, { paddingTop: insets.top || 16, paddingBottom: insets.bottom || 16 }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>VoxKage Settings</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close-outline" size={24} color="#a3a3a3" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            
            {/* Top User Profile Card */}
            <View style={styles.profileCard}>
              <View style={styles.profileRow}>
                <View style={styles.avatarContainer}>
                  <Svg width={54} height={54} viewBox="0 0 54 54">
                    <Defs>
                      <LinearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <Stop offset="0%" stopColor="#2563eb" />
                        <Stop offset="100%" stopColor="#1d4ed8" />
                      </LinearGradient>
                    </Defs>
                    <Circle cx="27" cy="27" r="25" fill="none" stroke="url(#avatarGrad)" strokeWidth="3" />
                  </Svg>
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                      {getDisplayName().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{getDisplayName()}</Text>
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {email || 'sir@voxkage.ai'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  onClose();
                  onLogout();
                }}
                style={styles.signOutBtn}
              >
                <Ionicons name="log-out-outline" size={16} color="#f87171" style={styles.signOutIcon} />
                <Text style={styles.signOutText}>Sign Out</Text>
              </TouchableOpacity>
            </View>

            {/* EXPANDABLE CATEGORY GROUPINGS */}

            {/* 1. App & AI Configuration */}
            <View style={styles.categoryCard}>
              <TouchableOpacity
                onPress={() => toggleSection('app')}
                style={styles.categoryHeader}
              >
                <View style={styles.categoryTitleRow}>
                  <Ionicons name="settings-outline" size={18} color="#3b82f6" style={styles.categoryIcon} />
                  <Text style={styles.categoryTitle}>App & AI Configuration</Text>
                </View>
                <Ionicons
                  name={expandedSection === 'app' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#737373"
                />
              </TouchableOpacity>

              {expandedSection === 'app' && (
                <View style={styles.categoryContent}>
                  
                  {/* OpenCode API Key Editor */}
                  <Text style={styles.fieldLabel}>OpenCode API Key</Text>
                  {isEditingKey ? (
                    <View style={styles.apiKeyEditRow}>
                      <TextInput
                        style={styles.textInput}
                        placeholder="opencode-..."
                        placeholderTextColor="#52525b"
                        value={enteredKey}
                        onChangeText={setEnteredKey}
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        onPress={handleVerifyAndSaveKey}
                        style={styles.verifyBtn}
                        disabled={isVerifying}
                      >
                        {isVerifying ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.verifyBtnText}>Verify & Save</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.apiKeyDisplayRow}>
                      <Text style={styles.apiKeyMaskedText}>
                        {getMaskedKey(opencodeKey)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setIsEditingKey(true)}
                        style={styles.editKeyBtn}
                      >
                        <Text style={styles.editKeyBtnText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Default AI Model Selector */}
                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Default AI Model</Text>
                  <View style={styles.modelGrid}>
                    {models.map((m) => {
                      const isSelected = activeModel === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[styles.modelSelectCard, isSelected && styles.modelSelectCardActive]}
                          onPress={() => setActiveModel(m)}
                        >
                          <Text style={[styles.modelSelectText, isSelected && styles.modelSelectTextActive]} numberOfLines={1}>
                            {m.replace('-free', '').replace('deepseek-', 'DS ').replace('claude-', 'Claude ')}
                          </Text>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={14} color="#3b82f6" style={styles.checkIcon} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                </View>
              )}
            </View>

            {/* 2. Personalization */}
            <View style={styles.categoryCard}>
              <TouchableOpacity
                onPress={() => toggleSection('personalization')}
                style={styles.categoryHeader}
              >
                <View style={styles.categoryTitleRow}>
                  <Ionicons name="person-outline" size={18} color="#10b981" style={styles.categoryIcon} />
                  <Text style={styles.categoryTitle}>Personalization & Tone</Text>
                </View>
                <Ionicons
                  name={expandedSection === 'personalization' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#737373"
                />
              </TouchableOpacity>

              {expandedSection === 'personalization' && (
                <View style={styles.categoryContent}>
                  
                  {/* Honorific Selector */}
                  <Text style={styles.fieldLabel}>Honorific Selector</Text>
                  <View style={styles.honorificGrid}>
                    {honorifics.map((h) => {
                      const isSelected = profile.honorific === h;
                      return (
                        <TouchableOpacity
                          key={h}
                          style={[styles.honorificBtn, isSelected && styles.honorificBtnActive]}
                          onPress={() => handleSaveProfileField({ honorific: h })}
                        >
                          <Text style={[styles.honorificBtnText, isSelected && styles.honorificBtnTextActive]}>
                            {h}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Inline text inputs for Custom or None */}
                  {profile.honorific === 'Custom' && (
                    <View style={styles.inlineInputContainer}>
                      <Text style={styles.inlineInputLabel}>Custom Honorific</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. Bro, Sensei, Captain"
                        placeholderTextColor="#52525b"
                        value={profile.custom_honorific || ''}
                        onChangeText={(val) => handleSaveProfileField({ custom_honorific: val })}
                      />
                    </View>
                  )}

                  {profile.honorific === 'None' && (
                    <View style={styles.inlineInputContainer}>
                      <Text style={styles.inlineInputLabel}>Display Name</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Enter your name"
                        placeholderTextColor="#52525b"
                        value={profile.user_name || ''}
                        onChangeText={(val) => handleSaveProfileField({ user_name: val })}
                      />
                    </View>
                  )}

                  {/* Personality Profile */}
                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Personality Profile</Text>
                  <View style={styles.toneList}>
                    {personalityTones.map((t) => {
                      const isSelected = profile.personality_tone === t.value;
                      return (
                        <TouchableOpacity
                          key={t.value}
                          style={[styles.toneItem, isSelected && styles.toneItemActive]}
                          onPress={() => handleSaveProfileField({ personality_tone: t.value })}
                        >
                          <Text style={[styles.toneText, isSelected && styles.toneTextActive]}>
                            {t.label}
                          </Text>
                          {isSelected && (
                            <Ionicons name="radio-button-on" size={16} color="#10b981" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Custom User Profile Data */}
                  <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Memory (Custom Profile Data)</Text>
                  <TextInput
                    style={styles.multilineInput}
                    placeholder="Append notes about what VoxKage should remember, in natural language..."
                    placeholderTextColor="#52525b"
                    multiline
                    numberOfLines={4}
                    value={profile.custom_profile_data || ''}
                    onChangeText={(val) => handleSaveProfileField({ custom_profile_data: val })}
                  />

                </View>
              )}
            </View>

            {/* 3. System Maintenance */}
            <View style={styles.categoryCard}>
              <TouchableOpacity
                onPress={() => toggleSection('maintenance')}
                style={styles.categoryHeader}
              >
                <View style={styles.categoryTitleRow}>
                  <Ionicons name="construct-outline" size={18} color="#f59e0b" style={styles.categoryIcon} />
                  <Text style={styles.categoryTitle}>System Maintenance</Text>
                </View>
                <Ionicons
                  name={expandedSection === 'maintenance' ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color="#737373"
                />
              </TouchableOpacity>

              {expandedSection === 'maintenance' && (
                <View style={styles.categoryContent}>
                  
                  {/* Clear All Sessions */}
                  <TouchableOpacity
                    onPress={handleClearAllSessions}
                    style={styles.actionBtn}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ef4444" style={styles.actionBtnIcon} />
                    <Text style={styles.actionBtnText}>Clear All Sessions</Text>
                  </TouchableOpacity>

                  {/* Clear Playground Mini Apps */}
                  <TouchableOpacity
                    onPress={handleClearPlayground}
                    style={[styles.actionBtn, { marginTop: 12 }]}
                  >
                    <Ionicons name="code-slash-outline" size={16} color="#ef4444" style={styles.actionBtnIcon} />
                    <Text style={styles.actionBtnText}>Clear Playground Mini Apps</Text>
                  </TouchableOpacity>

                </View>
              )}
            </View>

          </ScrollView>

          {/* Footer Info */}
          <Text style={styles.footerVersion}>
            VoxKage Mobile • Premium Edition • v1.0.6
          </Text>

        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0c0c0e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: screenHeight * 0.85,
    borderWidth: 1,
    borderColor: '#1f1f23',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#17171a',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  closeBtn: {
    padding: 4,
  },
  scrollContent: {
    flex: 1,
  },
  profileCard: {
    backgroundColor: '#111115',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e1e24',
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    width: 54,
    height: 54,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPlaceholder: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#3b82f6',
    fontSize: 18,
    fontWeight: '700',
  },
  profileInfo: {
    marginLeft: 14,
    flex: 1,
  },
  profileName: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  profileEmail: {
    color: '#737373',
    fontSize: 12,
    marginTop: 2,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1f1616',
    borderWidth: 1,
    borderColor: '#3b1818',
    borderRadius: 10,
    paddingVertical: 8,
    marginTop: 14,
  },
  signOutIcon: {
    marginRight: 6,
  },
  signOutText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
  },
  categoryCard: {
    backgroundColor: '#111115',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e1e24',
    marginBottom: 12,
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  categoryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    marginRight: 10,
  },
  categoryTitle: {
    color: '#f5f5f5',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#17171a',
    paddingTop: 14,
  },
  fieldLabel: {
    color: '#a3a3a3',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  apiKeyEditRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#070709',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    color: '#ffffff',
    paddingHorizontal: 12,
    height: 40,
    fontSize: 13,
  },
  verifyBtn: {
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 10,
    height: 40,
  },
  verifyBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  apiKeyDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#070709',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  apiKeyMaskedText: {
    color: '#737373',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  editKeyBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#1f1f23',
    borderWidth: 1,
    borderColor: '#27272a',
  },
  editKeyBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  modelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modelSelectCard: {
    backgroundColor: '#1f1f23',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: (screenWidth - 72) / 2, // 2 items per row with gaps
  },
  modelSelectCardActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e293b',
  },
  modelSelectText: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    marginRight: 4,
  },
  modelSelectTextActive: {
    color: '#ffffff',
  },
  checkIcon: {
    marginLeft: 'auto',
  },
  honorificGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  honorificBtn: {
    backgroundColor: '#1f1f23',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  honorificBtnActive: {
    backgroundColor: '#1e293b',
    borderColor: '#3b82f6',
  },
  honorificBtnText: {
    color: '#737373',
    fontSize: 12,
    fontWeight: '500',
  },
  honorificBtnTextActive: {
    color: '#ffffff',
  },
  inlineInputContainer: {
    marginTop: 10,
  },
  inlineInputLabel: {
    color: '#737373',
    fontSize: 11,
    marginBottom: 4,
  },
  toneList: {
    gap: 8,
  },
  toneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1f1f23',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    padding: 12,
  },
  toneItemActive: {
    backgroundColor: '#064e3b',
    borderColor: '#10b981',
  },
  toneText: {
    color: '#737373',
    fontSize: 13,
    fontWeight: '500',
  },
  toneTextActive: {
    color: '#ffffff',
  },
  multilineInput: {
    backgroundColor: '#070709',
    borderWidth: 1,
    borderColor: '#27272a',
    borderRadius: 10,
    color: '#ffffff',
    padding: 12,
    fontSize: 13,
    textAlignVertical: 'top',
    height: 90,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#261212',
    borderWidth: 1,
    borderColor: '#451a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionBtnIcon: {
    marginRight: 10,
  },
  actionBtnText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
  },
  footerVersion: {
    textAlign: 'center',
    color: '#404043',
    fontSize: 10,
    marginTop: 24,
    marginBottom: 16,
  },
});
