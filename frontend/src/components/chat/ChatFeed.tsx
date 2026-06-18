import React from 'react';
import { FlatList, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { LogoV } from './LogoV';
import { styles } from './styles';

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
}) => {
  const data = [
    ...messages,
    ...(streamingText
      ? [
          {
            id: 'streaming',
            role: 'assistant',
            content: streamingText,
          } as ChatMessage,
        ]
      : []),
    ...(loading
      ? [
          {
            id: 'thinking',
            role: 'assistant',
            content: thinkingStatus || 'VoxKage is processing, Sir...',
          } as ChatMessage,
        ]
      : []),
  ];

  return (
    <FlatList
      ref={flatListRef}
      data={data}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.chatListContent}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => {
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
                    {item.content.includes("WebView Rendering Error") ? "Playground Console" : "Laptop execution output"}
                  </Text>
                </View>
                <Text style={styles.laptopLogText}>{item.content}</Text>
              </View>
            </View>
          );
        } else {
          if (item.id === 'thinking') {
            return (
              <View style={styles.assistantBubbleWrapper}>
                <View style={styles.assistantAvatar}>
                  <LogoV size={18} />
                </View>
                <View style={[styles.assistantBubble, styles.thinkingBubble]}>
                  <View style={styles.thinkingHeader}>
                    <ActivityIndicator size="small" color="#60a5fa" style={styles.thinkingSpinner} />
                    <Text style={styles.thinkingTitle}>VoxKage is thinking...</Text>
                  </View>
                </View>
              </View>
            );
          }

          const hasProject = !!messageProjectIds[item.id];
          const hasBlocks = hasCodeBlocks(item.content);

          return (
            <View style={styles.assistantBubbleWrapper}>
              <View style={styles.assistantAvatar}>
                <LogoV size={18} />
              </View>
              <View style={[styles.assistantBubble, (hasBlocks || hasProject) && { minWidth: 160 }]}>
                <MarkdownRenderer text={item.content} />
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
            </View>
          );
        }
      }}
    />
  );
};
