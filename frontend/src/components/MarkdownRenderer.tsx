import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Clipboard, ToastAndroid, Platform, Alert, Image, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import Svg, { Rect, Line, Circle, Path, Text as SvgText } from 'react-native-svg';

// --- Helper to parse HTML-style tags attributes ---
function parseAttributes(rawAttrs: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    const key = match[1];
    const val = match[2] !== undefined ? match[2] : match[3];
    attrs[key] = val;
  }
  return attrs;
}

// --- Structured Link Preview Card Component ---
function LinkCardComponent({ title, url, desc }: { title: string; url: string; desc: string }) {
  const handlePress = async () => {
    try {
      if (url) {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (e) {
      console.error(e);
      Linking.openURL(url);
    }
  };

  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = url;
  }

  return (
    <TouchableOpacity onPress={handlePress} style={styles.linkCard}>
      <View style={styles.linkCardHeader}>
        <Ionicons name="link-outline" size={14} color="#3b82f6" style={{ marginRight: 5 }} />
        <Text style={styles.linkCardHost} numberOfLines={1}>{host}</Text>
      </View>
      <Text style={styles.linkCardTitle} numberOfLines={1}>{title || 'Explore Link'}</Text>
      {desc ? <Text style={styles.linkCardDesc} numberOfLines={2}>{desc}</Text> : null}
      <View style={styles.linkCardFooter}>
        <Text style={styles.linkCardButtonText}>Open Link</Text>
        <Ionicons name="arrow-forward" size={12} color="#3b82f6" style={{ marginLeft: 4 }} />
      </View>
    </TouchableOpacity>
  );
}

// --- Leaflet Dark-Themed Map Component ---
function MapComponent({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const openExternalMap = () => {
    const url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(label)}@${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(${encodeURIComponent(label)})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });
    Linking.openURL(url);
  };

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>
          html, body, #map { margin:0; padding:0; width:100%; height:100%; background: #030712; }
          .leaflet-tile-container {
            filter: invert(100%) hue-rotate(180deg) brightness(90%) contrast(90%) !important;
          }
          .leaflet-control-zoom, .leaflet-control-attribution {
            display: none !important;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <script>
          const map = L.map('map').setView([${lat}, ${lng}], 15);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
          L.marker([${lat}, ${lng}]).addTo(map)
            .bindPopup('<b>${label.replace(/'/g, "\\'")}</b>')
            .openPopup();
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.mapCard}>
      <View style={styles.mapCardHeader}>
        <View style={styles.mapCardHeaderLeft}>
          <Ionicons name="map-outline" size={16} color="#3b82f6" style={{ marginRight: 6 }} />
          <Text style={styles.mapCardTitle} numberOfLines={1}>{label}</Text>
        </View>
        <Text style={styles.mapCardCoords}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
      </View>
      <View style={styles.mapContainer}>
        {Platform.OS === 'web' ? (
          <iframe
            srcDoc={html}
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        ) : (
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            style={styles.webViewMap}
            scrollEnabled={false}
          />
        )}
      </View>
      <TouchableOpacity onPress={openExternalMap} style={styles.mapCardButton}>
        <Text style={styles.mapCardButtonText}>Open in Device Maps</Text>
        <Ionicons name="navigate-outline" size={14} color="#3b82f6" style={{ marginLeft: 4 }} />
      </TouchableOpacity>
    </View>
  );
}

// --- Micro-Interactive Action Buttons Component ---
function ButtonRowComponent({ buttonsString }: { buttonsString: string }) {
  const parts = buttonsString.split('|');
  const buttonsList = parts.map(part => {
    const colonIdx = part.indexOf(':');
    if (colonIdx === -1) return { label: part.trim(), action: '' };
    return {
      label: part.substring(0, colonIdx).trim(),
      action: part.substring(colonIdx + 1).trim()
    };
  }).filter(b => b.label);

  const handleButtonPress = async (action: string) => {
    if (!action) return;
    if (action.startsWith('http://') || action.startsWith('https://')) {
      try {
        await WebBrowser.openBrowserAsync(action);
      } catch {
        Linking.openURL(action);
      }
    } else {
      Linking.openURL(action);
    }
  };

  const getIconForLabel = (label: string) => {
    const lower = label.toLowerCase();
    if (lower.includes('call') || lower.includes('phone') || lower.includes('contact')) return 'call-outline';
    if (lower.includes('direction') || lower.includes('navigate') || lower.includes('map') || lower.includes('route')) return 'navigate-outline';
    if (lower.includes('book') || lower.includes('reserve')) return 'calendar-outline';
    if (lower.includes('explore') || lower.includes('website') || lower.includes('visit')) return 'globe-outline';
    return 'open-outline';
  };

  return (
    <View style={styles.buttonRowContainer}>
      {buttonsList.map((btn, idx) => (
        <TouchableOpacity
          key={`btn-${idx}`}
          onPress={() => handleButtonPress(btn.action)}
          style={[styles.rowButton, idx === 0 && styles.rowButtonPrimary]}
        >
          <Ionicons
            name={getIconForLabel(btn.label)}
            size={13}
            color={idx === 0 ? '#ffffff' : '#3b82f6'}
            style={{ marginRight: 5 }}
          />
          <Text style={[styles.rowButtonText, idx === 0 && styles.rowButtonTextPrimary]}>
            {btn.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// --- Dynamic SVG Graph & Chart Component ---
function ChartComponent({ type, dataString, labelsString }: { type: string; dataString: string; labelsString: string }) {
  const data = dataString.split(',').map(n => parseFloat(n.trim()) || 0);
  const labels = labelsString.split(',').map(l => l.trim());

  if (data.length === 0) return null;

  const chartHeight = 150;
  const chartWidth = 280;
  const paddingLeft = 35;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 25;

  const maxVal = Math.max(...data, 10);
  const minVal = Math.min(...data, 0);
  const valRange = maxVal - minVal || 1;

  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const getX = (index: number) => {
    if (data.length <= 1) return paddingLeft + plotWidth / 2;
    return paddingLeft + (index / (data.length - 1)) * plotWidth;
  };

  const getY = (value: number) => {
    return paddingTop + plotHeight - ((value - minVal) / valRange) * plotHeight;
  };

  const renderLineChart = () => {
    let path = '';
    data.forEach((val, idx) => {
      const x = getX(idx);
      const y = getY(val);
      if (idx === 0) {
        path += `M ${x} ${y}`;
      } else {
        path += ` L ${x} ${y}`;
      }
    });

    let areaPath = '';
    if (data.length > 0) {
      areaPath = `${path} L ${getX(data.length - 1)} ${getY(minVal)} L ${getX(0)} ${getY(minVal)} Z`;
    }

    return (
      <React.Fragment>
        {areaPath ? <Path d={areaPath} fill="rgba(37, 99, 235, 0.08)" /> : null}
        {path ? <Path d={path} fill="none" stroke="#3b82f6" strokeWidth={2} /> : null}
        {data.map((val, idx) => (
          <Circle
            key={`dot-${idx}`}
            cx={getX(idx)}
            cy={getY(val)}
            r={3.5}
            fill="#090d16"
            stroke="#3b82f6"
            strokeWidth={1.5}
          />
        ))}
      </React.Fragment>
    );
  };

  const renderBarChart = () => {
    const barWidth = Math.max(5, (plotWidth / data.length) * 0.6);
    return data.map((val, idx) => {
      const x = getX(idx) - barWidth / 2;
      const y = getY(val);
      const height = getY(minVal) - y;
      return (
        <Rect
          key={`bar-${idx}`}
          x={x}
          y={y}
          width={barWidth}
          height={Math.max(1, height)}
          fill="#3b82f6"
          rx={2}
        />
      );
    });
  };

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>{type.toUpperCase()} Performance Metrics</Text>
      <View style={styles.chartSvgContainer}>
        <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <Line x1={paddingLeft} y1={paddingTop} x2={chartWidth - paddingRight} y2={paddingTop} stroke="#1e293b" strokeDasharray="3,3" />
          <Line x1={paddingLeft} y1={paddingTop + plotHeight/2} x2={chartWidth - paddingRight} y2={paddingTop + plotHeight/2} stroke="#1e293b" strokeDasharray="3,3" />
          <Line x1={paddingLeft} y1={paddingTop + plotHeight} x2={chartWidth - paddingRight} y2={paddingTop + plotHeight} stroke="#1e293b" />

          <SvgText x={paddingLeft - 8} y={paddingTop + 4} fill="#64748b" fontSize={9} textAnchor="end">{maxVal.toFixed(0)}</SvgText>
          <SvgText x={paddingLeft - 8} y={paddingTop + plotHeight/2 + 4} fill="#64748b" fontSize={9} textAnchor="end">{((maxVal + minVal)/2).toFixed(0)}</SvgText>
          <SvgText x={paddingLeft - 8} y={paddingTop + plotHeight + 4} fill="#64748b" fontSize={9} textAnchor="end">{minVal.toFixed(0)}</SvgText>

          {type.toLowerCase() === 'bar' ? renderBarChart() : renderLineChart()}

          {labels.map((lbl, idx) => (
            <SvgText
              key={`lbl-${idx}`}
              x={getX(idx)}
              y={chartHeight - 8}
              fill="#64748b"
              fontSize={8.5}
              textAnchor="middle"
            >
              {lbl}
            </SvgText>
          ))}
        </Svg>
      </View>
    </View>
  );
}

// --- Image & Gallery Swipable Carousel Component ---
function CarouselComponent({ imagesString }: { imagesString: string }) {
  const imageUrls = imagesString.split(',').map(url => url.trim()).filter(url => url);
  const [activeIndex, setActiveIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(280);

  if (imageUrls.length === 0) return null;

  return (
    <View
      style={styles.carouselContainer}
      onLayout={(e) => {
        const { width } = e.nativeEvent.layout;
        if (width > 0) setContainerWidth(width);
      }}
    >
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          const slide = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
          if (slide !== activeIndex) {
            setActiveIndex(slide);
          }
        }}
        scrollEventThrottle={200}
        style={styles.carouselScroll}
      >
        {imageUrls.map((url, idx) => (
          <View key={`img-slide-${idx}`} style={{ width: containerWidth, height: 180 }}>
            <Image
              source={{ uri: url }}
              style={styles.carouselImage}
              resizeMode="cover"
            />
          </View>
        ))}
      </ScrollView>
      {imageUrls.length > 1 ? (
        <View style={styles.carouselDots}>
          {imageUrls.map((_, idx) => (
            <View
              key={`dot-${idx}`}
              style={[
                styles.carouselDot,
                idx === activeIndex && styles.carouselDotActive
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// --- Weather Premium Light-Theme Card ---
interface WeatherComponentProps {
  temp: string;
  condition: string;
  humidity: string;
  wind: string;
  uv: string;
  city: string;
}

function WeatherComponent({ temp, condition, humidity, wind, uv, city }: WeatherComponentProps) {
  const getIconForCondition = (cond: string) => {
    const lower = cond.toLowerCase();
    if (lower.includes('sun') || lower.includes('clear') || lower.includes('hot')) return 'sunny';
    if (lower.includes('rain') || lower.includes('drizzle') || lower.includes('shower')) return 'rainy';
    if (lower.includes('cloud') || lower.includes('overcast') || lower.includes('fog')) return 'cloudy';
    if (lower.includes('snow') || lower.includes('sleet') || lower.includes('ice')) return 'snow';
    if (lower.includes('thunder') || lower.includes('storm')) return 'thunderstorm';
    return 'partly-sunny';
  };

  const getIconColor = (cond: string) => {
    const lower = cond.toLowerCase();
    if (lower.includes('sun') || lower.includes('clear')) return '#eab308'; // Amber 500
    if (lower.includes('rain') || lower.includes('shower') || lower.includes('drizzle')) return '#3b82f6'; // Blue 500
    if (lower.includes('thunder')) return '#a855f7'; // Purple 500
    return '#64748b'; // Slate 500
  };

  return (
    <View style={styles.weatherCard}>
      <View style={styles.weatherHeader}>
        <View>
          <Text style={styles.weatherCity}>{city}</Text>
          <Text style={styles.weatherDate}>Current Weather</Text>
        </View>
        <Ionicons name={getIconForCondition(condition)} size={32} color={getIconColor(condition)} />
      </View>

      <View style={styles.weatherTempRow}>
        <Text style={styles.weatherTemp}>{temp}°C</Text>
        <Text style={styles.weatherCondition}>{condition}</Text>
      </View>

      <View style={styles.weatherGrid}>
        <View style={styles.weatherGridItem}>
          <Ionicons name="water-outline" size={14} color="#3b82f6" />
          <Text style={styles.weatherGridLabel}>Humidity</Text>
          <Text style={styles.weatherGridValue}>{humidity}%</Text>
        </View>
        <View style={styles.weatherGridItem}>
          <Ionicons name="swap-horizontal-outline" size={14} color="#10b981" />
          <Text style={styles.weatherGridLabel}>Wind</Text>
          <Text style={styles.weatherGridValue}>{wind} km/h</Text>
        </View>
        <View style={styles.weatherGridItem}>
          <Ionicons name="sunny-outline" size={14} color="#f59e0b" />
          <Text style={styles.weatherGridLabel}>UV Index</Text>
          <Text style={styles.weatherGridValue}>{uv}</Text>
        </View>
      </View>
    </View>
  );
}

// --- TaskList Premium Log-Timeline Component ---
interface TaskListComponentProps {
  itemsString: string;
}

function TaskListComponent({ itemsString }: TaskListComponentProps) {
  const parts = itemsString.split('|');
  const taskItems = parts.map(part => {
    const bits = part.split(':');
    return {
      title: bits[0] || 'Task/Action',
      status: bits[1] || 'pending', // success, pending, failed
      source: bits[2] || 'laptop',   // git-branch, sync, laptop, globe
      time: bits[3] || 'now',
    };
  });

  const getStatusIcon = (status: string) => {
    if (status === 'success') {
      return <Ionicons name="checkmark-circle" size={18} color="#10b981" />;
    }
    if (status === 'failed') {
      return <Ionicons name="close-circle" size={18} color="#ef4444" />;
    }
    return <ActivityIndicator size="small" color="#3b82f6" style={{ width: 18, height: 18 }} />;
  };

  const getSourceIcon = (source: string) => {
    const lower = source.toLowerCase();
    if (lower.includes('branch') || lower.includes('git')) return 'git-branch-outline';
    if (lower.includes('sync') || lower.includes('load')) return 'sync-outline';
    if (lower.includes('globe') || lower.includes('web') || lower.includes('network')) return 'globe-outline';
    return 'laptop-outline';
  };

  return (
    <View style={styles.taskCardContainer}>
      {taskItems.map((task, idx) => (
        <View key={`task-${idx}`} style={styles.taskItemCard}>
          <View style={styles.taskItemLeft}>
            <View style={styles.taskItemStatusContainer}>
              {getStatusIcon(task.status)}
            </View>
            <View style={styles.taskItemContent}>
              <Text style={styles.taskItemTitle} numberOfLines={1}>{task.title}</Text>
              <View style={styles.taskItemMeta}>
                <Ionicons name={getSourceIcon(task.source)} size={11} color="#64748b" style={{ marginRight: 4 }} />
                <Text style={styles.taskItemSource}>{task.source}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.taskItemTime}>{task.time}</Text>
        </View>
      ))}
    </View>
  );
}

// --- Tag-Based Custom Component Parser ---
function parseCustomComponents(text: string, keyPrefix: string) {
  const componentTagRegex = /<(LinkCard|Map|ButtonRow|Chart|Carousel|Weather|TaskList)\b([^>]*?)\/>/g;
  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = componentTagRegex.exec(text)) !== null) {
    const textBefore = text.substring(lastIndex, match.index);
    const tagName = match[1];
    const rawAttrs = match[2];

    if (textBefore.trim()) {
      elements.push(
        <View key={`text-${keyPrefix}-${match.index}`} style={styles.textContainer}>
          {renderTextWithInlineFormatting(textBefore)}
        </View>
      );
    }

    const attrs = parseAttributes(rawAttrs);

    if (tagName === 'LinkCard') {
      elements.push(
        <LinkCardComponent
          key={`component-${keyPrefix}-${match.index}`}
          title={attrs.title || ''}
          url={attrs.url || ''}
          desc={attrs.desc || attrs.description || ''}
        />
      );
    } else if (tagName === 'Map') {
      elements.push(
        <MapComponent
          key={`component-${keyPrefix}-${match.index}`}
          lat={parseFloat(attrs.lat || '0')}
          lng={parseFloat(attrs.lng || '0')}
          label={attrs.label || 'Location'}
        />
      );
    } else if (tagName === 'ButtonRow') {
      elements.push(
        <ButtonRowComponent
          key={`component-${keyPrefix}-${match.index}`}
          buttonsString={attrs.buttons || ''}
        />
      );
    } else if (tagName === 'Chart') {
      elements.push(
        <ChartComponent
          key={`component-${keyPrefix}-${match.index}`}
          type={attrs.type || 'line'}
          dataString={attrs.data || ''}
          labelsString={attrs.labels || ''}
        />
      );
    } else if (tagName === 'Carousel') {
      elements.push(
        <CarouselComponent
          key={`component-${keyPrefix}-${match.index}`}
          imagesString={attrs.images || ''}
        />
      );
    } else if (tagName === 'Weather') {
      elements.push(
        <WeatherComponent
          key={`component-${keyPrefix}-${match.index}`}
          temp={attrs.temp || ''}
          condition={attrs.condition || ''}
          humidity={attrs.humidity || ''}
          wind={attrs.wind || ''}
          uv={attrs.uv || ''}
          city={attrs.city || 'Location'}
        />
      );
    } else if (tagName === 'TaskList') {
      elements.push(
        <TaskListComponent
          key={`component-${keyPrefix}-${match.index}`}
          itemsString={attrs.items || ''}
        />
      );
    }

    lastIndex = componentTagRegex.lastIndex;
  }

  const textAfter = text.substring(lastIndex);
  if (textAfter.trim()) {
    elements.push(
      <View key={`text-${keyPrefix}-end`} style={styles.textContainer}>
        {renderTextWithInlineFormatting(textAfter)}
      </View>
    );
  }

  return elements;
}

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

    // Render plain text and dynamic components before code block
    if (textBefore.trim()) {
      elements.push(...parseCustomComponents(textBefore, `before-${match.index}`));
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
    elements.push(...parseCustomComponents(textAfter, 'end'));
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

  // Link Card styles
  linkCard: {
    backgroundColor: '#090d16',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginVertical: 8,
  },
  linkCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  linkCardHost: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500',
  },
  linkCardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  linkCardDesc: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  linkCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkCardButtonText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },

  // Map Card styles
  mapCard: {
    backgroundColor: '#090d16',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    overflow: 'hidden',
    marginVertical: 8,
  },
  mapCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#020409',
  },
  mapCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  mapCardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  mapCardCoords: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  mapContainer: {
    height: 180,
    width: '100%',
    backgroundColor: '#030712',
  },
  webViewMap: {
    flex: 1,
    backgroundColor: '#030712',
  },
  mapCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#020409',
  },
  mapCardButtonText: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
  },

  // Button Row styles
  buttonRowContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  rowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    backgroundColor: 'transparent',
  },
  rowButtonPrimary: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  rowButtonText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
  },
  rowButtonTextPrimary: {
    color: '#ffffff',
  },

  // Chart Card styles
  chartCard: {
    backgroundColor: '#090d16',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginVertical: 8,
  },
  chartTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  chartSvgContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Carousel styles
  carouselContainer: {
    width: '100%',
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#020409',
    overflow: 'hidden',
  },
  carouselScroll: {
    width: '100%',
    height: 180,
  },
  carouselImage: {
    width: '100%',
    height: '100%',
  },
  carouselDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#020409',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#334155',
    marginHorizontal: 3,
  },
  carouselDotActive: {
    backgroundColor: '#3b82f6',
    width: 12,
  },

  // Premium Light-Theme Weather Card styles
  weatherCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  weatherHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weatherCity: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  weatherDate: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  weatherTempRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  weatherTemp: {
    fontSize: 34,
    fontWeight: '800',
    color: '#0f172a',
    marginRight: 10,
  },
  weatherCondition: {
    fontSize: 15,
    fontWeight: '500',
    color: '#475569',
  },
  weatherGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 12,
  },
  weatherGridItem: {
    alignItems: 'center',
    flex: 1,
  },
  weatherGridLabel: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  weatherGridValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },

  // Premium Light-Theme TaskList/Log Card styles
  taskCardContainer: {
    marginVertical: 8,
    gap: 8,
  },
  taskItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  taskItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskItemStatusContainer: {
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskItemContent: {
    flex: 1,
  },
  taskItemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  taskItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  taskItemSource: {
    fontSize: 11,
    color: '#64748b',
  },
  taskItemTime: {
    fontSize: 11,
    color: '#94a3b8',
    marginLeft: 10,
  },
});

