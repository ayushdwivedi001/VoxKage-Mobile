import React from 'react';
import { FlatList, View, Text, TouchableOpacity, ActivityIndicator, Clipboard, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { LogoV } from './LogoV';
import { styles } from './styles';
import { selectBestVoice, cleanTextForSpeech } from '@/utils/mobileTools';
import { ToolWorkflowPath, WorkflowNode } from './ToolWorkflowPath';

let Speech: any = null;
try {
  Speech = require('expo-speech');
} catch (e) {
  console.log('[ChatFeed] Speech module not available, Sir.');
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'laptop';
  content: string;
  timestamp?: number;
}

interface ChatFeedProps {
  flatListRef: React.RefObject<FlatList | null>;
  messages: ChatMessage[];
  streamingText: string;
  loading: boolean;
  thinkingStatus: string | null;
  handleOpenCodeInPlayground: (content: string, messageId: string) => void;
  messageProjectIds: Record<string, string>;
  onDrillAnswer?: (answer: string) => void;
  onRetry?: (message: ChatMessage, index: number) => void;
  workflowNodes?: WorkflowNode[];
  thinkingLogs?: string[];
  onOpenThinkingDrawer?: () => void;
  confirmationToolName?: string | null;
  confirmationToolLabel?: string | null;
  onSendConfirmationResponse?: (confirm: boolean, alwaysAllow: boolean) => void;
}

const hasCodeBlocks = (text: string) => {
  return /```html\n|```css\n|```javascript\n|```js\n/i.test(text);
};

export const ChatFeed: React.FC<ChatFeedProps> = ({
  flatListRef,
  messages,
  streamingText,
  loading,
  thinkingStatus,
  handleOpenCodeInPlayground,
  messageProjectIds,
  onDrillAnswer,
  onRetry,
  workflowNodes = [],
  thinkingLogs = [],
  onOpenThinkingDrawer,
  confirmationToolName,
  confirmationToolLabel,
  onSendConfirmationResponse,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [speakingId, setSpeakingId] = React.useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = React.useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const handleCopy = (text: string, id: string) => {
    Clipboard.setString(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSpeak = async (text: string, id: string) => {
    if (!Speech) return;
    try {
      if (speakingId === id) {
        await Speech.stop();
        setSpeakingId(null);
        return;
      }
      await Speech.stop();
      setSpeakingId(id);
      const cleaned = cleanTextForSpeech(text);
      const voiceId = await selectBestVoice(Speech);
      Speech.speak(cleaned, {
        language: 'en',
        voice: voiceId,
        pitch: 1.0,
        rate: 0.95,
        onDone: () => setSpeakingId(null),
        onError: () => setSpeakingId(null),
      });
    } catch (e) {
      console.log('[ChatFeed] TTS error:', e);
      setSpeakingId(null);
    }
  };

  const handleScroll = (event: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    const offsetY = contentOffset.y;
    const isNearBottom = contentSize.height - layoutMeasurement.height - offsetY < 40;
    const shouldShow = offsetY > 200 && !isNearBottom;

    if (shouldShow !== showScrollBottom) {
      setShowScrollBottom(shouldShow);
      Animated.timing(fadeAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleScrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const showActiveResponse = loading || !!streamingText;
  const data = [
    ...messages,
    ...(showActiveResponse
      ? [
          {
            id: 'active_response',
            role: 'assistant' as const,
            content: streamingText || '',
            isThinking: loading && !streamingText,
          },
        ]
      : []),
  ];

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      <FlatList
        ref={flatListRef}
        data={data}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={styles.chatListContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => {
          if (item.role === 'user') {
            return (
              <View style={styles.userBubbleWrapper}>
                <View style={styles.userBubble}>
                  <Text style={styles.userMessageText}>{item.content}</Text>
                </View>
              </View>
            );
          } else if (item.role === 'laptop') {
            return (
              <View style={styles.laptopLogWrapper}>
                <View style={styles.laptopLogBar} />
                <View style={styles.laptopLogCard}>
                  <View style={styles.laptopLogHeader}>
                    <Ionicons name="terminal-outline" size={13} color="#2563eb" />
                    <Text style={styles.laptopLogTitle}>
                      {item.content.includes("WebView Rendering Error") ? "Playground Console" : "System Link Output"}
                    </Text>
                  </View>
                  <Text style={styles.laptopLogText}>{item.content}</Text>
                </View>
              </View>
            );
          } else {
            const isActiveResponse = item.id === 'active_response';
            const isThinkingMsg = isActiveResponse && item.isThinking;
            const hasProject = !!messageProjectIds[item.id];
            const hasBlocks = hasCodeBlocks(item.content);

            const showThinkingHeader = isActiveResponse && (thinkingLogs.length > 0 || !!thinkingStatus);
            const showWorkflow = isActiveResponse && workflowNodes.length > 0;
            const showConfirmation = isActiveResponse && !!confirmationToolName;

            return (
              <View style={styles.assistantBubbleWrapper}>
                <View style={styles.assistantAvatar}>
                  <LogoV size={18} />
                </View>
                <View style={{ flex: 1 }}>
                  {/* Collapsible Thinking Accordion Header */}
                  {showThinkingHeader && (
                    <TouchableOpacity
                      style={styles.thinkingAccordionHeader}
                      onPress={onOpenThinkingDrawer}
                      activeOpacity={0.7}
                    >
                      <View style={styles.thinkingAccordionTitleRow}>
                        {isThinkingMsg ? (
                          <ActivityIndicator size="small" color="#60a5fa" style={{ marginRight: 6 }} />
                        ) : (
                          <Ionicons name="checkmark-circle" size={15} color="#10b981" style={{ marginRight: 6 }} />
                        )}
                        <Text style={styles.thinkingAccordionText} numberOfLines={1}>
                          {isThinkingMsg ? (thinkingStatus || 'VoxKage is processing, Sir...') : 'Thought process complete'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="#60a5fa" style={styles.thinkingAccordionChevron} />
                    </TouchableOpacity>
                  )}

                  {/* SVG Tool Workflow Path */}
                  {showWorkflow && (
                    <ToolWorkflowPath nodes={workflowNodes} />
                  )}

                  {/* Yes/No/Always Allow confirmation prompts */}
                  {showConfirmation && (
                    <View style={styles.actionConfirmCard}>
                      <View style={styles.actionConfirmTitleRow}>
                        <Ionicons name="shield-checkmark" size={15} color="#60a5fa" />
                        <Text style={styles.actionConfirmTitle}>Permission Request</Text>
                      </View>
                      <Text style={styles.actionConfirmPrompt}>
                        VoxKage is requesting permission to execute:{"\n"}
                        <Text style={{ fontWeight: 'bold', color: '#60a5fa' }}>{confirmationToolLabel || confirmationToolName}</Text>.
                      </Text>
                      <View style={styles.actionConfirmButtons}>
                        <TouchableOpacity
                          style={styles.actionConfirmBtnYes}
                          onPress={() => onSendConfirmationResponse?.(true, false)}
                        >
                          <Text style={styles.actionConfirmBtnText}>Allow Once</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionConfirmBtnNo}
                          onPress={() => onSendConfirmationResponse?.(false, false)}
                        >
                          <Text style={styles.actionConfirmBtnText}>Deny</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.actionConfirmBtnAlways}
                          onPress={() => onSendConfirmationResponse?.(true, true)}
                        >
                          <Text style={styles.actionConfirmBtnText}>Always Allow</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Main Bubble Content (Markdown Text) */}
                  {(!isThinkingMsg || !!item.content) && (
                    <View style={[styles.assistantBubble, (hasBlocks || hasProject) && { minWidth: 160 }]}>
                      <MarkdownRenderer text={item.content} onDrillAnswer={onDrillAnswer} />
                      {item.id === 'streaming' && (
                        <View style={styles.typingIndicatorContainer}>
                          <ActivityIndicator size="small" color="#2563eb" />
                        </View>
                      )}
                      {(hasBlocks || hasProject) && (
                        <TouchableOpacity
                          style={styles.openPlaygroundBubbleBtn}
                          onPress={() => handleOpenCodeInPlayground(item.content, item.id)}
                        >
                          <Ionicons name="play-circle-outline" size={14} color="#60a5fa" />
                          <Text style={styles.openPlaygroundBubbleBtnText}>Open in Playground</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  
                  {/* Actions Row */}
                  {item.id !== 'active_response' && item.id !== 'thinking' && (
                    <View style={styles.assistantActionsRow}>
                      <TouchableOpacity 
                        onPress={() => handleSpeak(item.content, item.id)} 
                        style={styles.assistantActionBtn}
                        activeOpacity={0.7}
                      >
                        <Ionicons 
                          name={speakingId === item.id ? "volume-mute-outline" : "volume-medium-outline"} 
                          size={13} 
                          color={speakingId === item.id ? "#ef4444" : "#94a3b8"} 
                        />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => handleCopy(item.content, item.id)} 
                        style={styles.assistantActionBtn}
                        activeOpacity={0.7}
                      >
                        <Ionicons 
                          name={copiedId === item.id ? "checkmark-sharp" : "copy-outline"} 
                          size={13} 
                          color={copiedId === item.id ? "#10b981" : "#94a3b8"} 
                        />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => onRetry?.(item, index)} 
                        style={styles.assistantActionBtn}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="reload-outline" size={13} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            );
          }
        }}
      />
      <Animated.View
        style={[
          styles.scrollBottomBtn,
          {
            opacity: fadeAnim,
            transform: [
              {
                translateY: fadeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [15, 0],
                }),
              },
            ],
          },
        ]}
        pointerEvents={showScrollBottom ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
          onPress={handleScrollToBottom}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-down" size={16} color="#ffffff" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};
