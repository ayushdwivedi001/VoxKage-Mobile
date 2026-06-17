import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Clipboard, ToastAndroid, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface MarkdownRendererProps {
  text: string;
}

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  if (!text) return null;

  // Split content by code blocks: ```[language] ... ```
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const elements = [];
  let lastIndex = 0;
  let match;

  const handleCopyCode = (code: string) => {
    Clipboard.setString(code);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Code copied to clipboard', ToastAndroid.SHORT);
    } else {
      Alert.alert('Copied', 'Code copied to clipboard');
    }
  };

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const textBefore = text.substring(lastIndex, match.index);
    const language = match[1] || 'code';
    const code = match[2];

    // Render plain text before code block
    if (textBefore.trim()) {
      elements.push(
        <View key={`text-${match.index}`} style={styles.textContainer}>
          {renderTextWithInlineFormatting(textBefore)}
        </View>
      );
    }

    // Render code block
    elements.push(
      <View key={`code-${match.index}`} style={styles.codeBlockContainer}>
        <View style={styles.codeBlockHeader}>
          <Text style={styles.codeLanguage}>{language.toUpperCase()}</Text>
          <TouchableOpacity onPress={() => handleCopyCode(code)} style={styles.copyButton}>
            <Ionicons name="copy-outline" size={14} color="#94a3b8" />
            <Text style={styles.copyText}>Copy</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.horizontalScroll}>
          <Text style={styles.codeText}>{code.trim()}</Text>
        </ScrollView>
      </View>
    );

    lastIndex = codeBlockRegex.lastIndex;
  }

  // Render remaining text after last code block
  const textAfter = text.substring(lastIndex);
  if (textAfter.trim()) {
    elements.push(
      <View key={`text-end`} style={styles.textContainer}>
        {renderTextWithInlineFormatting(textAfter)}
      </View>
    );
  }

  return <View style={styles.container}>{elements}</View>;
}

function renderTextWithInlineFormatting(rawText: string) {
  // Split rawText into lines
  const lines = rawText.split('\n');

  return lines.map((line, lineIndex) => {
    // Check if line is a header: #, ##, ###
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const cleanText = line.replace(/^#+\s*/, '');
      const headerStyle =
        level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
      return (
        <Text key={`h-${lineIndex}`} style={[styles.header, headerStyle]}>
          {renderInlineSpans(cleanText)}
        </Text>
      );
    }

    // Check if line is a bullet point: - or *
    if (line.startsWith('- ') || line.startsWith('* ')) {
      const cleanText = line.substring(2);
      return (
        <View key={`bullet-${lineIndex}`} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{renderInlineSpans(cleanText)}</Text>
        </View>
      );
    }

    // Check if line is a numbered list: 1.
    const numListMatch = line.match(/^(\d+)\.\s(.*)/);
    if (numListMatch) {
      const num = numListMatch[1];
      const cleanText = numListMatch[2];
      return (
        <View key={`num-${lineIndex}`} style={styles.bulletRow}>
          <Text style={styles.bulletNum}>{num}.</Text>
          <Text style={styles.bulletText}>{renderInlineSpans(cleanText)}</Text>
        </View>
      );
    }

    // Regular line, render spans
    if (line.trim() === '') {
      return <View key={`empty-${lineIndex}`} style={styles.emptyLine} />;
    }

    return (
      <Text key={`line-${lineIndex}`} style={styles.bodyText}>
        {renderInlineSpans(line)}
      </Text>
    );
  });
}

function renderInlineSpans(text: string) {
  // Regex to detect **bold**, *italic*, and `inline code`
  const inlineRegex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
  const parts = text.split(inlineRegex);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={`b-${index}`} style={styles.boldText}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <Text key={`i-${index}`} style={styles.italicText}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <Text key={`ic-${index}`} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  textContainer: {
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 15,
    color: '#e2e8f0',
    lineHeight: 22,
    marginBottom: 6,
  },
  boldText: {
    fontWeight: '700',
    color: '#ffffff',
  },
  italicText: {
    fontStyle: 'italic',
    color: '#cbd5e1',
  },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#f472b6',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 13,
  },
  header: {
    color: '#ffffff',
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  h1: {
    fontSize: 22,
    lineHeight: 28,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 4,
  },
  h2: {
    fontSize: 19,
    lineHeight: 24,
  },
  h3: {
    fontSize: 17,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingLeft: 8,
  },
  bulletDot: {
    color: '#60a5fa',
    fontSize: 16,
    marginRight: 8,
    lineHeight: 20,
  },
  bulletNum: {
    color: '#60a5fa',
    fontWeight: '600',
    fontSize: 14,
    marginRight: 8,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    color: '#e2e8f0',
    lineHeight: 22,
  },
  emptyLine: {
    height: 8,
  },
  codeBlockContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 12,
    overflow: 'hidden',
  },
  codeBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  codeLanguage: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
  },
  horizontalScroll: {
    padding: 16,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#38bdf8',
    fontSize: 13,
    lineHeight: 18,
  },
});
