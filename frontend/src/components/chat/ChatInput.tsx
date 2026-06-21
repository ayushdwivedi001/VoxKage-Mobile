import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

const renderHighlightedText = (text: string) => {
  if (!text) return null;
  
  if (text.startsWith('/')) {
    const spaceIdx = text.indexOf(' ');
    const cmd = spaceIdx !== -1 ? text.substring(0, spaceIdx) : text;
    const rest = spaceIdx !== -1 ? text.substring(spaceIdx) : '';
    
    const isKnownCmd = ['/btw', '/drill', '/compact'].includes(cmd.toLowerCase()) ||
                        ['/btw', '/drill', '/compact'].some(c => c.startsWith(cmd.toLowerCase()));
                        
    if (isKnownCmd) {
      return (
        <Text style={{ color: '#f8fafc' }}>
          <Text
            style={{
              color: '#60a5fa',
              fontWeight: 'bold',
              textShadowColor: 'rgba(96, 165, 250, 0.4)',
              textShadowRadius: 6,
            }}
          >
            {cmd}
          </Text>
          {rest}
        </Text>
      );
    }
  }
  return <Text style={{ color: '#f8fafc' }}>{text}</Text>;
};

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
  handleStopGeneration: () => void;
  contextPercent: number;
  // Staged Attachment Props
  stagedAttachment: { uri: string; name: string; type: 'image' | 'document'; size: number; base64?: string; mimeType?: string } | null;
  setStagedAttachment: (attachment: any) => void;
  showMediaPopover: boolean;
  setShowMediaPopover: (show: boolean) => void;
  handleCameraPress: () => void;
  handlePhotosPress: () => void;
  handleFilesPress: () => void;
  onKeyPress?: (e: any) => void;
  showBtwOverlay?: boolean;
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
  handleStopGeneration,
  contextPercent,
  stagedAttachment,
  setStagedAttachment,
  showMediaPopover,
  setShowMediaPopover,
  handleCameraPress,
  handlePhotosPress,
  handleFilesPress,
  onKeyPress,
  showBtwOverlay,
}) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const [inputHeight, setInputHeight] = React.useState(Platform.OS === 'web' ? 40 : 36);
  const isBtwActive = !!(showBtwOverlay || (inputText && inputText.trim().startsWith('/btw')));

  const prevTextLength = React.useRef(inputText.length);

  React.useEffect(() => {
    if (!inputText) {
      setInputHeight(Platform.OS === 'web' ? 40 : 36);
    } else if (inputText.length < prevTextLength.current) {
      // If characters were deleted/cleared, temporarily force min height so onContentSizeChange can shrink it correctly
      setInputHeight(Platform.OS === 'web' ? 40 : 36);
    }
    prevTextLength.current = inputText.length;
  }, [inputText]);
  React.useEffect(() => {
    if (showTooltip) {
      const t = setTimeout(() => setShowTooltip(false), 2500);
      return () => clearTimeout(t);
    }
  }, [showTooltip]);

  return (
    <View style={styles.inputAreaContainer}>
      {showMediaPopover && (
        <TouchableOpacity
          activeOpacity={1}
          style={styles.dropdownBackdrop}
          onPress={() => setShowMediaPopover(false)}
        />
      )}
      {showMediaPopover && (
        <View style={styles.mediaPopover}>
          <TouchableOpacity
            style={styles.mediaPopoverItem}
            onPress={() => {
              setShowMediaPopover(false);
              handleCameraPress();
            }}
          >
            <Ionicons name="camera-outline" size={16} color="#60a5fa" />
            <Text style={styles.mediaPopoverText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mediaPopoverItem}
            onPress={() => {
              setShowMediaPopover(false);
              handlePhotosPress();
            }}
          >
            <Ionicons name="image-outline" size={16} color="#60a5fa" />
            <Text style={styles.mediaPopoverText}>Photos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mediaPopoverItem}
            onPress={() => {
              setShowMediaPopover(false);
              handleFilesPress();
            }}
          >
            <Ionicons name="document-text-outline" size={16} color="#60a5fa" />
            <Text style={styles.mediaPopoverText}>Files</Text>
          </TouchableOpacity>
        </View>
      )}

      {showVariantDropdown && (
        <TouchableOpacity
          activeOpacity={1}
          style={styles.dropdownBackdrop}
          onPress={() => setShowVariantDropdown(false)}
        />
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

        <View style={{ position: 'relative', zIndex: showVariantDropdown ? 1000 : 1 }}>
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
              {VARIANTS[activeVariantIndex]}
            </Text>
            <Ionicons name="chevron-down" size={10} color="#94a3b8" />
          </TouchableOpacity>

          {showVariantDropdown && (
            <View style={styles.variantDropdown}>
              {VARIANTS.map((v, i) => {
                return (
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
                );
              })}
            </View>
          )}
        </View>

        <View style={{ position: 'relative' }}>
          <TouchableOpacity
            style={[
              styles.capsule,
              {
                borderColor:
                  contextPercent <= 50
                    ? '#10b981'
                    : contextPercent < 80
                    ? '#f59e0b'
                    : '#ef4444',
              },
            ]}
            onPress={() => setShowTooltip(!showTooltip)}
          >
            <Ionicons
              name="analytics-outline"
              size={12}
              color={
                contextPercent <= 50
                  ? '#10b981'
                  : contextPercent < 80
                  ? '#f59e0b'
                  : '#ef4444'
              }
            />
            <Text
              style={[
                styles.capsuleText,
                {
                  color:
                    contextPercent <= 50
                      ? '#10b981'
                      : contextPercent < 80
                      ? '#f59e0b'
                      : '#ef4444',
                },
              ]}
            >
              {contextPercent}%
            </Text>
          </TouchableOpacity>
          {showTooltip && (
            <View style={styles.tooltipPopover}>
              <Text style={styles.tooltipPopoverText}>Context Window</Text>
            </View>
          )}
        </View>
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

      {/* Staged Attachment Preview Card */}
      {stagedAttachment && (
        <View style={styles.stagedCard}>
          <View style={styles.stagedThumbnail}>
            {stagedAttachment.type === 'image' ? (
              <Ionicons name="image-outline" size={20} color="#60a5fa" />
            ) : (
              <Ionicons name="document-text-outline" size={20} color="#3b82f6" />
            )}
          </View>
          <View style={styles.stagedInfo}>
            <Text style={styles.stagedName} numberOfLines={1}>
              {stagedAttachment.name}
            </Text>
            <Text style={styles.stagedSize}>
              {(stagedAttachment.size / (1024 * 1024)).toFixed(2)} MB
            </Text>
          </View>
          <TouchableOpacity
            style={styles.stagedCloseBtn}
            onPress={() => setStagedAttachment(null)}
          >
            <Ionicons name="close" size={14} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputPill}>
        <TouchableOpacity
          onPress={() => setShowMediaPopover(!showMediaPopover)}
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
          style={[
            styles.inputField,
            { height: Math.max(Platform.OS === 'web' ? 40 : 36, Math.min(150, inputHeight)) }
          ]}
          placeholder="Ask VoxKage.. , / for command actions"
          placeholderTextColor="#475569"
          value={inputText}
          onChangeText={(text) => {
            setInputText(text);
            if (!text) {
              setInputHeight(Platform.OS === 'web' ? 40 : 36);
            }
          }}
          multiline={true}
          onKeyPress={onKeyPress}
          onContentSizeChange={(e) => {
            const h = e.nativeEvent.contentSize.height;
            if (h > 0) {
              setInputHeight(h);
            }
          }}
        />

        <TouchableOpacity onPress={handleVoicePress} style={styles.inputVoiceBtn}>
          <Ionicons
            name={isVoiceActive ? 'mic' : 'mic-outline'}
            size={20}
            color={isVoiceActive ? '#ef4444' : '#94a3b8'}
          />
        </TouchableOpacity>

        {loading && !isBtwActive ? (
          <TouchableOpacity
            onPress={handleStopGeneration}
            style={styles.inputSendBtn}
          >
            <View style={[styles.sendCircle, { backgroundColor: '#ef4444' }]}>
              <Ionicons
                name="square"
                size={12}
                color="#ffffff"
              />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSendMessage}
            style={styles.inputSendBtn}
            disabled={!inputText.trim() && !stagedAttachment}
          >
            <View style={[styles.sendCircle, (inputText.trim() || stagedAttachment) && styles.sendCircleActive]}>
              <Ionicons
                name="arrow-up"
                size={16}
                color={inputText.trim() || stagedAttachment ? '#ffffff' : '#475569'}
              />
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
