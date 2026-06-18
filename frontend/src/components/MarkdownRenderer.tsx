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

    // Render code block with VS Code syntax highlighting
    elements.push(
      <View key={`code-${match.index}`} style={styles.codeBlockContainer}>
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

// VS Code style syntax highlighter
function highlightVSCode(code: string, language: string) {
  // Pattern groups:
  // 1. Comments: //... or #... or /*...*/
  // 2. Strings: "..." or '...' or `...`
  // 3. Keywords
  // 4. Numbers
  // 5. HTML tags
  // 6. Function calls: word followed by paren
  const tokenRegex = /(\/\/.*|#.*|\/\*[\s\S]*?\*\/)|(".*?"|'.*?'|`[\s\S]*?`)|(\b(?:const|let|var|function|return|class|import|export|from|def|if|else|while|for|in|try|except|as|print|self|public|private|static|void|int|float|string|bool)\b)|(\b\d+\b)|(<[^>]+>)|(\b\w+(?=\s*\())/g;

  let match;
  let lastIndex = 0;
  let key = 0;
  const elements = [];

  tokenRegex.lastIndex = 0;

  while ((match = tokenRegex.exec(code)) !== null) {
    const textBefore = code.substring(lastIndex, match.index);
    if (textBefore) {
      elements.push(
        <Text key={`text-${key++}`} style={styles.codeTextDefault}>
          {textBefore}
        </Text>
      );
    }

    const comment = match[1];
    const str = match[2];
    const keyword = match[3];
    const num = match[4];
    const tag = match[5];
    const func = match[6];

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

function renderTable(tableLines: string[], keyBase: number) {
  // 1. Detect if it's a valid table by checking divider format on the second line
  const dividerLine = tableLines[1] || '';
  const isDivider = /^[|:\s-]+$/.test(dividerLine);
  if (!isDivider) {
    // Fallback if not a real table
    return (
      <View key={`table-fallback-${keyBase}`} style={styles.tableFallbackContainer}>
        {tableLines.map((line, idx) => (
          <Text key={`line-tbl-fail-${idx}`} style={styles.bodyText}>
            {renderInlineSpans(line)}
          </Text>
        ))}
      </View>
    );
  }

  // Parse Alignments
  const alignments: ('left' | 'center' | 'right')[] = [];
  const divParts = dividerLine.split('|');
  if (divParts[0] === '') divParts.shift();
  if (divParts[divParts.length - 1] === '') divParts.pop();
  divParts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
      alignments.push('center');
    } else if (trimmed.endsWith(':')) {
      alignments.push('right');
    } else {
      alignments.push('left');
    }
  });

  // Parse Headers
  const headerParts = tableLines[0].split('|');
  if (headerParts[0] === '') headerParts.shift();
  if (headerParts[headerParts.length - 1] === '') headerParts.pop();
  const headers = headerParts.map(h => h.trim());

  // Parse Rows
  const rows: string[][] = [];
  for (let j = 2; j < tableLines.length; j++) {
    const rowParts = tableLines[j].split('|');
    if (rowParts[0] === '') rowParts.shift();
    if (rowParts[rowParts.length - 1] === '') rowParts.pop();
    rows.push(rowParts.map(r => r.trim()));
  }

  const getCellWidth = (index: number) => {
    return index === 0 ? 150 : 85;
  };

  const getAlignStyle = (index: number) => {
    const align = alignments[index] || 'left';
    return {
      textAlign: align,
      alignSelf: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
    } as const;
  };

  return (
    <View key={`table-${keyBase}`} style={styles.tableWrapper}>
      <ScrollView horizontal={true} showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
        <View style={styles.tableContainer}>
          {/* Header Row */}
          <View style={styles.tableHeaderRow}>
            {headers.map((header, idx) => (
              <View key={`th-${idx}`} style={[styles.tableHeaderCell, { width: getCellWidth(idx) }]}>
                <Text style={[styles.tableHeaderText, getAlignStyle(idx)]}>
                  {header}
                </Text>
              </View>
            ))}
          </View>
          
          {/* Data Rows */}
          {rows.map((row, rowIdx) => (
            <View 
              key={`tr-${rowIdx}`} 
              style={[
                styles.tableRow, 
                rowIdx % 2 === 1 ? styles.tableRowOdd : styles.tableRowEven
              ]}
            >
              {headers.map((_, colIdx) => {
                const cellValue = row[colIdx] || '';
                return (
                  <View key={`td-${rowIdx}-${colIdx}`} style={[styles.tableCell, { width: getCellWidth(colIdx) }]}>
                    <Text style={[styles.tableCellText, getAlignStyle(colIdx)]}>
                      {renderInlineSpans(cellValue)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function renderTextWithInlineFormatting(rawText: string) {
  const lines = rawText.split('\n');
  const renderedElements = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if it's a table row (starts with | and has pipes)
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      
      if (tableLines.length >= 2) {
        renderedElements.push(renderTable(tableLines, i));
      } else {
        tableLines.forEach((tblLine, idx) => {
          renderedElements.push(
            <Text key={`line-tbl-fail-${i}-${idx}`} style={styles.bodyText}>
              {renderInlineSpans(tblLine)}
            </Text>
          );
        });
      }
      continue;
    }
    
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const cleanText = line.replace(/^#+\s*/, '');
      const headerStyle =
        level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3;
      renderedElements.push(
        <Text key={`h-${i}`} style={[styles.header, headerStyle]}>
          {renderInlineSpans(cleanText)}
        </Text>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const cleanText = line.substring(2);
      renderedElements.push(
        <View key={`bullet-${i}`} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{renderInlineSpans(cleanText)}</Text>
        </View>
      );
    } else {
      const numListMatch = line.match(/^(\d+)\.\s(.*)/);
      if (numListMatch) {
        const num = numListMatch[1];
        const cleanText = numListMatch[2];
        renderedElements.push(
          <View key={`num-${i}`} style={styles.bulletRow}>
            <Text style={styles.bulletNum}>{num}.</Text>
            <Text style={styles.bulletText}>{renderInlineSpans(cleanText)}</Text>
          </View>
        );
      } else if (line.trim() === '') {
        renderedElements.push(<View key={`empty-${i}`} style={styles.emptyLine} />);
      } else {
        renderedElements.push(
          <Text key={`line-${i}`} style={styles.bodyText}>
            {renderInlineSpans(line)}
          </Text>
        );
      }
    }
    
    i++;
  }
  
  return renderedElements;
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
    backgroundColor: '#1e1e1e', // VS Code editor background
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
    backgroundColor: '#252526', // VS Code title bar
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
    color: '#d4d4d4', // VS Code standard text
  },
  codeComment: {
    color: '#6a9955', // VS Code green
    fontStyle: 'italic',
  },
  codeString: {
    color: '#ce9178', // VS Code brown-orange string
  },
  codeKeyword: {
    color: '#c586c0', // VS Code purple keyword
    fontWeight: '600',
  },
  codeNumber: {
    color: '#b5cea8', // VS Code light green number
  },
  codeTag: {
    color: '#569cd6', // VS Code blue XML/HTML tag
    fontWeight: '600',
  },
  codeFunction: {
    color: '#dcdcaa', // VS Code yellow function name
  },
  tableWrapper: {
    marginVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0c1222',
    overflow: 'hidden',
  },
  tableScroll: {
    width: '100%',
  },
  tableContainer: {
    flexDirection: 'column',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    alignItems: 'center',
  },
  tableHeaderCell: {
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  tableHeaderText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30, 41, 59, 0.5)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  tableRowEven: {
    backgroundColor: '#0c1222',
  },
  tableRowOdd: {
    backgroundColor: '#0f172a',
  },
  tableCell: {
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  tableCellText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18,
  },
  tableFallbackContainer: {
    marginVertical: 6,
    paddingHorizontal: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#ef4444',
  },
});

