import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Clipboard,
  ToastAndroid,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface MarkdownRendererProps {
  text: string;
}

// ─── Interactive Table Component ────────────────────────────────────────────

interface TableData {
  headers: string[];
  rows: string[][];
}

function parseMarkdownTable(raw: string): TableData | null {
  const lines = raw.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return null;

  const isSeparator = (line: string) => /^\|?[\s\-:]+(\|[\s\-:]+)+\|?$/.test(line.trim());

  const sepIdx = lines.findIndex(isSeparator);
  if (sepIdx < 1) return null;

  const parseRow = (line: string): string[] =>
    line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());

  const headers = parseRow(lines[sepIdx - 1]);
  const rows = lines.slice(sepIdx + 1).map(parseRow);

  return { headers, rows };
}

function InteractiveTable({ data }: { data: TableData }) {
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const handleCellLongPress = (val: string) => {
    Clipboard.setString(val);
    setCopiedCell(val);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Copied', ToastAndroid.SHORT);
    }
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      setSortAsc((a) => !a);
    } else {
      setSortCol(colIdx);
      setSortAsc(true);
    }
  };

  const sortedRows = React.useMemo(() => {
    if (sortCol === null) return data.rows;
    return [...data.rows].sort((a, b) => {
      const aVal = a[sortCol] ?? '';
      const bVal = b[sortCol] ?? '';
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      const cmp = (!isNaN(aNum) && !isNaN(bNum))
        ? aNum - bNum
        : aVal.localeCompare(bVal);
      return sortAsc ? cmp : -cmp;
    });
  }, [data.rows, sortCol, sortAsc]);

  return (
    <View style={tableStyles.wrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View>
          {/* Header row */}
          <View style={tableStyles.headerRow}>
            {data.headers.map((h, i) => (
              <TouchableOpacity
                key={`th-${i}`}
                style={tableStyles.headerCell}
                onPress={() => handleSort(i)}
                activeOpacity={0.75}
              >
                <Text style={tableStyles.headerText}>{h}</Text>
                {sortCol === i && (
                  <Ionicons
                    name={sortAsc ? 'chevron-up' : 'chevron-down'}
                    size={11}
                    color="#60a5fa"
                    style={{ marginLeft: 4 }}
                  />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Data rows */}
          {sortedRows.map((row, rowIdx) => (
            <View
              key={`tr-${rowIdx}`}
              style={[
                tableStyles.dataRow,
                rowIdx % 2 === 0 ? tableStyles.rowEven : tableStyles.rowOdd,
              ]}
            >
              {data.headers.map((_, colIdx) => {
                const val = row[colIdx] ?? '';
                const isHighlighted = copiedCell === val && val !== '';
                return (
                  <Pressable
                    key={`td-${rowIdx}-${colIdx}`}
                    style={[tableStyles.dataCell, isHighlighted && tableStyles.cellHighlighted]}
                    onLongPress={() => handleCellLongPress(val)}
                  >
                    <Text style={tableStyles.dataText}>{val}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={tableStyles.hint}>Tap header to sort · Long press cell to copy</Text>
    </View>
  );
}

const tableStyles = StyleSheet.create({
  wrapper: {
    marginVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
  },
  headerCell: {
    minWidth: 100,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#0f172a',
  },
  headerText: {
    color: '#e2e8f0',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dataRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  rowEven: {
    backgroundColor: '#0b0f19',
  },
  rowOdd: {
    backgroundColor: '#0f172a',
  },
  dataCell: {
    minWidth: 100,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
  },
  cellHighlighted: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  dataText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  hint: {
    fontSize: 10,
    color: '#475569',
    textAlign: 'right',
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#0b0f19',
  },
});

// ─── Main Renderer ───────────────────────────────────────────────────────────

export function MarkdownRenderer({ text }: MarkdownRendererProps) {
  if (!text) return null;

  const handleCopyCode = (code: string) => {
    Clipboard.setString(code);
    if (Platform.OS === 'android') {
      ToastAndroid.show('Code copied to clipboard', ToastAndroid.SHORT);
    } else {
      Alert.alert('Copied', 'Code copied to clipboard');
    }
  };

  // Split by code blocks first
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let keyCount = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const textBefore = text.substring(lastIndex, match.index);
    const language = match[1] || 'code';
    const code = match[2];

    if (textBefore.trim()) {
      elements.push(
        <View key={`text-${keyCount++}`} style={styles.textContainer}>
          {renderTextSegment(textBefore, keyCount)}
        </View>
      );
    }

    elements.push(
      <View key={`code-${keyCount++}`} style={styles.codeBlockContainer}>
        <View style={styles.codeBlockHeader}>
          <Text style={styles.codeLanguage}>{language.toUpperCase()}</Text>
          <TouchableOpacity onPress={() => handleCopyCode(code)} style={styles.copyButton}>
            <Ionicons name="copy-outline" size={14} color="#8e8e93" />
            <Text style={styles.copyText}>Copy</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.horizontalScroll}>
          <Text style={styles.codeContainer}>
            {highlightVSCode(code.trim(), language.toLowerCase())}
          </Text>
        </ScrollView>
      </View>
    );

    lastIndex = codeBlockRegex.lastIndex;
    keyCount++;
  }

  const textAfter = text.substring(lastIndex);
  if (textAfter.trim()) {
    elements.push(
      <View key={`text-end-${keyCount++}`} style={styles.textContainer}>
        {renderTextSegment(textAfter, keyCount)}
      </View>
    );
  }

  return <View style={styles.container}>{elements}</View>;
}

/**
 * Renders a text segment, detecting markdown tables and splitting around them.
 */
function renderTextSegment(rawText: string, baseKey: number): React.ReactNode[] {
  // Detect markdown table blocks (multi-line sequences with | chars)
  // A table is: header row | separator row (with ---) | data rows
  const tableBlockRegex = /(\|[^\n]*\n\|[\s\-:|]+\n(?:\|[^\n]*\n?)+)/g;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m;
  let k = baseKey * 100;

  while ((m = tableBlockRegex.exec(rawText)) !== null) {
    const before = rawText.substring(lastIdx, m.index);
    if (before) {
      parts.push(
        <React.Fragment key={`tf-${k++}`}>
          {renderTextWithInlineFormatting(before)}
        </React.Fragment>
      );
    }
    const tableData = parseMarkdownTable(m[0]);
    if (tableData) {
      parts.push(<InteractiveTable key={`tbl-${k++}`} data={tableData} />);
    } else {
      parts.push(
        <React.Fragment key={`traw-${k++}`}>
          {renderTextWithInlineFormatting(m[0])}
        </React.Fragment>
      );
    }
    lastIdx = tableBlockRegex.lastIndex;
  }

  const remaining = rawText.substring(lastIdx);
  if (remaining) {
    parts.push(
      <React.Fragment key={`tr-${k++}`}>
        {renderTextWithInlineFormatting(remaining)}
      </React.Fragment>
    );
  }
  return parts;
}

// VS Code style syntax highlighter
function highlightVSCode(code: string, language: string) {
  const tokenRegex = /(\/\/.*|#.*|\/\*[\s\S]*?\*\/)|(\".*?\"|'.*?'|`[\s\S]*?`)|(\b(?:const|let|var|function|return|class|import|export|from|def|if|else|while|for|in|try|except|as|print|self|public|private|static|void|int|float|string|bool)\b)|(\b\d+\b)|(<[^>]+>)|(\b\w+(?=\s*\())/g;

  let matchH;
  let lastIndex = 0;
  let key = 0;
  const elements: React.ReactNode[] = [];

  tokenRegex.lastIndex = 0;

  while ((matchH = tokenRegex.exec(code)) !== null) {
    const textBefore = code.substring(lastIndex, matchH.index);
    if (textBefore) {
      elements.push(
        <Text key={`text-${key++}`} style={styles.codeTextDefault}>
          {textBefore}
        </Text>
      );
    }

    const comment = matchH[1];
    const str = matchH[2];
    const keyword = matchH[3];
    const num = matchH[4];
    const tag = matchH[5];
    const func = matchH[6];

    if (comment) {
      elements.push(<Text key={`comment-${key++}`} style={styles.codeComment}>{comment}</Text>);
    } else if (str) {
      elements.push(<Text key={`str-${key++}`} style={styles.codeString}>{str}</Text>);
    } else if (keyword) {
      elements.push(<Text key={`keyword-${key++}`} style={styles.codeKeyword}>{keyword}</Text>);
    } else if (num) {
      elements.push(<Text key={`num-${key++}`} style={styles.codeNumber}>{num}</Text>);
    } else if (tag) {
      elements.push(<Text key={`tag-${key++}`} style={styles.codeTag}>{tag}</Text>);
    } else if (func) {
      elements.push(<Text key={`func-${key++}`} style={styles.codeFunction}>{func}</Text>);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  const textAfter = code.substring(lastIndex);
  if (textAfter) {
    elements.push(
      <Text key={`text-${key++}`} style={styles.codeTextDefault}>
        {textAfter}
      </Text>
    );
  }

  return elements;
}

function renderTextWithInlineFormatting(rawText: string) {
  const lines = rawText.split('\n');

  return lines.map((line, lineIndex) => {
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

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const cleanText = line.substring(2);
      return (
        <View key={`bullet-${lineIndex}`} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{renderInlineSpans(cleanText)}</Text>
        </View>
      );
    }

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
    backgroundColor: '#2d2d2d',
    color: '#ce9178',
    paddingHorizontal: 5,
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
    color: '#2563eb',
    fontSize: 16,
    marginRight: 8,
    lineHeight: 20,
  },
  bulletNum: {
    color: '#2563eb',
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
    backgroundColor: '#1e1e1e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d2d2d',
    marginVertical: 12,
    overflow: 'hidden',
  },
  codeBlockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#252526',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d2d',
  },
  codeLanguage: {
    color: '#858585',
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
    color: '#858585',
    fontSize: 11,
    fontWeight: '500',
  },
  horizontalScroll: {
    padding: 16,
  },
  codeContainer: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13.5,
    lineHeight: 19,
    color: '#d4d4d4',
  },
  codeTextDefault: {
    color: '#d4d4d4',
  },
  codeComment: {
    color: '#6a9955',
    fontStyle: 'italic',
  },
  codeString: {
    color: '#ce9178',
  },
  codeKeyword: {
    color: '#c586c0',
    fontWeight: '600',
  },
  codeNumber: {
    color: '#b5cea8',
  },
  codeTag: {
    color: '#569cd6',
    fontWeight: '600',
  },
  codeFunction: {
    color: '#dcdcaa',
  },
});
