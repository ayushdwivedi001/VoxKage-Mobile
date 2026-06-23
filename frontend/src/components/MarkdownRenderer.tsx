import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Clipboard, ToastAndroid, Platform, Alert, Linking, ActivityIndicator, Animated, Modal, Dimensions } from 'react-native';
import { Image } from 'expo-image';

// --- Dedicated Static Require Helpers to prevent Metro build/compilation errors ---
const getFileSystem = () => {
  try { return require('expo-file-system/legacy'); } catch {
    try { return require('expo-file-system'); } catch { return null; }
  }
};
const getMediaLibrary = () => {
  try {
    const { requireNativeModule } = require('expo-modules-core');
    if (requireNativeModule('ExpoMediaLibraryNext')) {
      return require('expo-media-library');
    }
    return null;
  } catch {
    return null;
  }
};
const getSharing = () => {
  try { return require('expo-sharing'); } catch { return null; }
};

const exportImage = async (uri: string) => {
  try {
    const FileSystem = getFileSystem();
    if (!FileSystem) {
      Clipboard.setString(uri);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Image link copied to clipboard', ToastAndroid.SHORT);
      } else {
        Alert.alert('Success', 'Image link copied to clipboard.');
      }
      return;
    }

    let fileUri = '';
    if (uri.startsWith('data:image/')) {
      const match = uri.match(/^data:image\/(\w+);base64,/);
      const ext = match ? match[1] : 'png';
      const filename = `voxkage_${Date.now()}.${ext}`;
      const base64Data = uri.replace(/^data:image\/\w+;base64,/, '');
      fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else {
      let filename = `voxkage_${Date.now()}.png`;
      try {
        const urlObj = new URL(uri);
        const pathname = urlObj.pathname;
        const parts = pathname.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.includes('.')) {
          const cleanName = lastPart.split('?')[0].split('#')[0];
          if (cleanName && cleanName.length > 3) {
            filename = cleanName;
          }
        }
      } catch {}
      fileUri = `${FileSystem.cacheDirectory}${filename}`;
      const { uri: localUri } = await FileSystem.downloadAsync(uri, fileUri, {
        headers: {
          'User-Agent': 'VoxKageMobile/1.0 (https://voxkage.vercel.app/; ayushdwivedi2049@gmail.com)'
        }
      });
      fileUri = localUri;
    }

    const Sharing = getSharing();
    if (Sharing && (await Sharing.isAvailableAsync())) {
      if (Platform.OS === 'android') {
        ToastAndroid.show('Opening sharing options', ToastAndroid.SHORT);
      }
      await Sharing.shareAsync(fileUri, {
        dialogTitle: 'Export Image',
        UTI: 'public.png',
      });
    } else {
      // Ultimate fallback: copy link
      Clipboard.setString(uri);
      if (Platform.OS === 'android') {
        ToastAndroid.show('Could not export image. Link copied to clipboard', ToastAndroid.SHORT);
      } else {
        Alert.alert('Success', 'Could not export image. Link copied to clipboard.');
      }
    }
  } catch (err: any) {
    console.error('Failed to export image:', err);
    Alert.alert('Error', `Failed to export image. Error: ${err.message}`);
  }
};


import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { WebView } from 'react-native-webview';
import Svg, { Rect, Line, Circle, Path, Text as SvgText } from 'react-native-svg';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';

// --- Lightweight FadeInView Helper Component ---
function FadeInView({ children, style }: { children: React.ReactNode; style?: any }) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[{ opacity: fadeAnim }, style]}>
      {children}
    </Animated.View>
  );
}

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

// --- Dynamic Gifted Chart Component (100% Client-side, Interactive) ---
const { width: screenWidth } = Dimensions.get('window');

interface ChartComponentProps {
  type: string;
  title?: string;
  dataString?: string;
  seriesString?: string;
  labelsString?: string;
  color?: string;
  isZoomed?: boolean;
  onPressZoom?: () => void;
}

function ChartComponent({
  type,
  title = 'Performance Metrics',
  dataString = '',
  seriesString = '',
  labelsString = '',
  color = '#3b82f6',
  isZoomed = false,
  onPressZoom,
}: ChartComponentProps) {
  const values = dataString ? dataString.split(',').map(n => parseFloat(n.trim()) || 0) : [];
  const labels = labelsString ? labelsString.split(',').map(l => l.trim()) : [];
  
  const seriesList = seriesString ? seriesString.split('|').map(s => {
    const colonIdx = s.indexOf(':');
    if (colonIdx === -1) return { name: 'Series', values: s.split(',').map(n => parseFloat(n.trim()) || 0) };
    return {
      name: s.substring(0, colonIdx).trim(),
      values: s.substring(colonIdx + 1).split(',').map(n => parseFloat(n.trim()) || 0)
    };
  }) : [];

  const hasData = values.length > 0 || seriesList.length > 0;
  if (!hasData) return null;

  let strokeColor = color;
  let isStockUp = true;
  
  if (type === 'stock' && values.length >= 2) {
    isStockUp = values[values.length - 1] >= values[0];
    strokeColor = isStockUp ? '#10b981' : '#ef4444';
  }

  const chartData = values.map((val, idx) => ({
    value: val,
    label: labels[idx] || '',
    labelTextStyle: { color: '#64748b', fontSize: 9 },
  }));

  const seriesData1 = seriesList[0] ? seriesList[0].values.map((val, idx) => ({
    value: val,
    label: labels[idx] || '',
  })) : [];
  const seriesData2 = seriesList[1] ? seriesList[1].values.map((val, idx) => ({
    value: val,
    label: labels[idx] || '',
  })) : [];
  
  const dataPointsCount = Math.max(
    values.length,
    seriesList[0]?.values?.length || 0,
    seriesList[1]?.values?.length || 0
  );
  const minSpacing = isZoomed ? 75 : 60;
  const computedWidth = dataPointsCount > 0 
    ? Math.max(isZoomed ? screenWidth - 64 : screenWidth - 96, dataPointsCount * minSpacing + 24)
    : (isZoomed ? screenWidth - 64 : screenWidth - 96);
  
  const chartWidth = computedWidth;
  const chartHeight = isZoomed ? 300 : 140;

  const commonChartProps = {
    width: chartWidth,
    height: chartHeight,
    noOfSections: 4,
    yAxisTextStyle: { color: '#64748b', fontSize: 9 },
    xAxisLabelTextStyle: { color: '#64748b', fontSize: 9 },
    xAxisThickness: 1,
    xAxisColor: 'rgba(255,255,255,0.1)',
    yAxisThickness: 1,
    yAxisColor: 'rgba(255,255,255,0.1)',
    rulesColor: 'rgba(255,255,255,0.05)',
    rulesType: 'dashed',
    animateOnDataChange: true,
    animationDuration: 800,
    textColor1: '#f8fafc',
  };

  const renderGiftedChart = () => {
    if (type === 'pie') {
      const pieColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
      const pieData = chartData.map((d, idx) => ({
        value: d.value,
        text: d.label || `${d.value}`,
        color: pieColors[idx % pieColors.length],
      }));
      return (
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <PieChart
            data={pieData}
            donut
            showText
            textColor="#ffffff"
            textSize={10}
            radius={isZoomed ? 100 : 60}
            innerRadius={isZoomed ? 60 : 35}
            innerCircleColor="#090d16"
          />
        </View>
      );
    }

    if (type === 'bar') {
      return (
        <BarChart
          {...commonChartProps}
          data={chartData}
          frontColor={color}
          roundedTop
          roundedBottom
        />
      );
    }

    if (seriesList.length >= 2) {
      return (
        <LineChart
          {...commonChartProps}
          data={seriesData1}
          data2={seriesData2}
          color1="#3b82f6"
          color2="#10b981"
          thickness={2.5}
          dataPointsColor1="#3b82f6"
          dataPointsColor2="#10b981"
        />
      );
    } else {
      const isArea = type === 'stock' || type === 'area';
      return (
        <LineChart
          {...commonChartProps}
          data={chartData}
          color={strokeColor}
          thickness={2.5}
          dataPointsColor={strokeColor}
          areaChart={isArea}
          startFillColor={isArea ? `rgba(${isStockUp ? '16,185,129' : '239,68,68'}, 0.25)` : undefined}
          endFillColor="rgba(0,0,0,0)"
          pointerConfig={{
            pointerStripColor: 'rgba(255, 255, 255, 0.2)',
            pointerStripWidth: 1.5,
            pointerColor: strokeColor,
            radius: 5,
            pointerLabelComponent: (items: any) => {
              if (!items || items.length === 0) return null;
              return (
                <View style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor: '#1e293b',
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: '#334155',
                  position: 'absolute',
                  top: -40,
                  left: -30,
                  zIndex: 999
                }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                    {items[0].value}
                  </Text>
                </View>
              );
            }
          }}
        />
      );
    }
  };

  return (
    <View style={[styles.chartCard, isZoomed && { backgroundColor: 'transparent', borderWidth: 0, padding: 0, marginVertical: 0 }]}>
      {!isZoomed && <Text style={styles.chartTitle}>{title}</Text>}
      <ScrollView 
        horizontal={true} 
        showsHorizontalScrollIndicator={type !== 'pie'}
        contentContainerStyle={{ flexGrow: 1, justifyContent: type === 'pie' ? 'center' : 'flex-start' }}
      >
        <View style={{ paddingRight: type === 'pie' ? 0 : 16, marginVertical: 10 }}>
          {renderGiftedChart()}
        </View>
      </ScrollView>
      
      {!isZoomed && onPressZoom && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12 }}>
          <TouchableOpacity 
            onPress={onPressZoom} 
            style={styles.imageCardActionBtn}
          >
            <Ionicons name="expand-outline" size={13} color="#94a3b8" />
            <Text style={styles.imageCardActionText}>Zoom Chart</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// --- Robust Image With Loading Indicator & Error Fallback Component ---
interface ImageWithLoaderProps {
  uri: string;
  alt: string;
  style: any;
  resizeMode?: 'cover' | 'contain' | 'stretch';
  // Explicit pixel dimensions for React Native native compatibility
  // (percentage heights collapse to 0 on native without an explicit parent height)
  width?: number;
  height?: number;
  onPress?: () => void;
  onError?: () => void;
}

const getImageSource = (uri: string) => {
  if (!uri) return undefined;
  if (uri.startsWith('data:image/') || uri.startsWith('file://')) {
    return { uri };
  }
  return {
    uri,
    headers: {
      'User-Agent': 'VoxKageMobile/1.0 (https://voxkage.vercel.app/; ayushdwivedi2049@gmail.com)'
    }
  };
};

function ImageWithLoader({ uri, alt, style, resizeMode = 'cover', width, height, onPress, onError: onErrorProp }: ImageWithLoaderProps) {
  const isBase64 = uri && uri.startsWith('data:image/');
  const [loading, setLoading] = useState(!isBase64);
  const [error, setError] = useState(false);
  const [resolvedUri, setResolvedUri] = useState(uri);
  // Guard: onLoadStart must only set loading=true ONCE per mount to prevent
  // the glitchy "constantly loading" spinner caused by re-renders resetting the flag.
  const hasStartedLoadingRef = useRef(false);
  const hasFinishedLoadingRef = useRef(false);

  useEffect(() => {
    // Reset loading guards when URI changes (new image source)
    hasStartedLoadingRef.current = false;
    hasFinishedLoadingRef.current = false;
    setLoading(!isBase64);
    setError(false);
  }, [uri]);

  useEffect(() => {
    let active = true;
    const resolveUri = async () => {
      if (uri && !uri.startsWith('http://') && !uri.startsWith('https://') && !uri.startsWith('data:')) {
        try {
          const { storage } = require('@/utils/storage');
          const baseUrl = await storage.getBackendUrl();
          if (active) {
            const cleanBase = baseUrl.trim().replace(/\/$/, '');
            const cleanPath = uri.startsWith('/') ? uri : `/${uri}`;
            setResolvedUri(`${cleanBase}${cleanPath}`);
          }
        } catch (e) {
          console.log('[ImageWithLoader] Error getting backend url:', e);
          if (active) setResolvedUri(uri);
        }
      } else {
        if (active) setResolvedUri(uri);
      }
    };
    resolveUri();
    return () => { active = false; };
  }, [uri]);

  // Build the wrapper dimensions: prefer explicit pixel sizes (critical for RN native)
  // because percentage-based height (e.g. '100%') collapses to 0 without an explicit parent height.
  const wrapperStyle: any[] = [styles.imageWrapper];
  if (width !== undefined) wrapperStyle.push({ width });
  if (height !== undefined) wrapperStyle.push({ height });
  // Only apply the incoming `style` if it is not percentage-based
  if (style && typeof style === 'object' && !Array.isArray(style) && style.height !== '100%' && style.width !== '100%') {
    wrapperStyle.push(style);
  }

  // The actual image fills the wrapper via flex — no absolute positioning needed on native
  const imgStyle: any = { flex: 1, width: '100%' };
  if (width !== undefined) imgStyle.width = width;
  if (height !== undefined) imgStyle.height = height;

  const ContainerComponent = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? { onPress, activeOpacity: 0.8 } : {};

  return (
    <ContainerComponent style={wrapperStyle} {...containerProps}>
      {!error ? (
        <Image
          source={getImageSource(resolvedUri)}
          style={imgStyle}
          contentFit={resizeMode === 'stretch' ? 'fill' : resizeMode}
          onLoadStart={isBase64 ? undefined : () => {
            // Only set loading=true on the FIRST load start, never on re-renders
            if (!hasStartedLoadingRef.current && !hasFinishedLoadingRef.current) {
              hasStartedLoadingRef.current = true;
              setLoading(true);
            }
          }}
          onLoadEnd={isBase64 ? undefined : () => {
            if (!hasFinishedLoadingRef.current) {
              hasFinishedLoadingRef.current = true;
              setLoading(false);
            }
          }}
          onError={(e: any) => {
            const errMsg = e.error || (e.nativeEvent && e.nativeEvent.error) || 'Unknown load error';
            console.error('[ImageWithLoader] Native Image load failed for URI:', resolvedUri, errMsg);
            setError(true);
            setLoading(false);
            if (onErrorProp) onErrorProp();
          }}
        />
      ) : (
        <View style={styles.imageErrorContainer}>
          <Ionicons name="image-outline" size={28} color="#ef4444" style={{ marginBottom: 4 }} />
          <Text style={styles.imageErrorText} numberOfLines={1}>Failed to load visual component, Sir.</Text>
          {isBase64 ? (
            <Text style={styles.imageErrorSubtext}>Corrupted base64 chart data.</Text>
          ) : (
            <Text style={styles.imageErrorSubtext} numberOfLines={1}>{alt || uri}</Text>
          )}
        </View>
      )}

      {loading && !error && (
        <View style={styles.imageLoadingContainer}>
          <ActivityIndicator size="small" color="#3b82f6" />
        </View>
      )}
    </ContainerComponent>
  );
}

// --- Standalone Markdown Image Block Component ---
interface MarkdownImageProps {
  uri: string;
  alt: string;
  onPressImage?: (uri: string, alt?: string) => void;
}

function MarkdownImage({ uri, alt, onPressImage }: MarkdownImageProps) {
  const [resolvedUri, setResolvedUri] = useState(uri);
  
  useEffect(() => {
    let active = true;
    const resolveUri = async () => {
      if (uri && !uri.startsWith('http://') && !uri.startsWith('https://') && !uri.startsWith('data:')) {
        try {
          const { storage } = require('@/utils/storage');
          const baseUrl = await storage.getBackendUrl();
          if (active) {
            const cleanBase = baseUrl.trim().replace(/\/$/, '');
            const cleanPath = uri.startsWith('/') ? uri : `/${uri}`;
            setResolvedUri(`${cleanBase}${cleanPath}`);
          }
        } catch (e) {
          console.log('[MarkdownImage] Error getting backend url:', e);
        }
      }
    };
    resolveUri();
    return () => { active = false; };
  }, [uri]);

  return (
    <View style={styles.imageCard}>
      {alt ? <Text style={styles.imageCardTitle}>{alt}</Text> : null}
      <ImageWithLoader
        uri={uri}
        alt={alt}
        style={styles.markdownImage}
        height={200}
        resizeMode="contain"
        onPress={onPressImage ? () => onPressImage(uri, alt) : undefined}
      />
      <View style={styles.imageCardActionBar}>
        {onPressImage && (
          <TouchableOpacity 
            onPress={() => onPressImage(uri, alt)} 
            style={styles.imageCardActionBtn}
          >
            <Ionicons name="expand-outline" size={13} color="#94a3b8" />
            <Text style={styles.imageCardActionText}>Zoom Chart</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          onPress={() => exportImage(resolvedUri)} 
          style={[styles.imageCardActionBtn, styles.imageCardActionBtnPrimary]}
        >
          <Ionicons name="share-social-outline" size={13} color="#60a5fa" />
          <Text style={[styles.imageCardActionText, styles.imageCardActionTextPrimary]}>Export Image</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// --- Image & Gallery Swipable Carousel Component ---
function CarouselComponent({ imagesString, onPressImage }: { imagesString: string; onPressImage?: (uri: string, alt?: string) => void }) {
  // Validate and filter URLs before rendering — prevents broken slide errors
  const BLOCKED = ["data:image", ".svg", ".ogg", ".pdf", ".tiff", "bing.com/th", "encrypted-tbn", "gstatic.com"];
  const initialUrls = imagesString.split(',').map(url => url.trim()).filter(url => {
    if (!url || !url.startsWith('https://')) return false;
    const lower = url.toLowerCase();
    if (BLOCKED.some(b => lower.includes(b))) return false;
    return true;
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(() => Dimensions.get('window').width - 32);
  // Track valid (non-failed) URLs as state so the ScrollView only renders what works
  const [validUrls, setValidUrls] = useState<string[]>(initialUrls);
  // Track failures by URL string in a ref — never trigger re-renders for the same URL twice
  const failedUrlsRef = useRef<Set<string>>(new Set());

  // If there are no valid URLs, don't show the empty container at all!
  if (validUrls.length === 0) return null;

  const handleImageError = (url: string) => {
    if (failedUrlsRef.current.has(url)) return;
    failedUrlsRef.current.add(url);
    console.warn('[CarouselComponent] Image failed to load, removing from slide:', url);
    setValidUrls(prev => prev.filter(u => u !== url));
  };

  // If there's only 1 image, render a simple card to avoid horizontal ScrollView overhead and dot indicators
  if (validUrls.length === 1) {
    const singleUrl = validUrls[0];
    return (
      <View 
        style={styles.carouselContainer}
        onLayout={(e) => {
          const { width } = e.nativeEvent.layout;
          if (width > 0) setContainerWidth(width);
        }}
      >
        <View style={{ width: containerWidth, height: 180, overflow: 'hidden' }}>
          <ImageWithLoader
            uri={singleUrl}
            alt="Visual component"
            style={styles.carouselImage}
            width={containerWidth}
            height={180}
            resizeMode="cover"
            onPress={onPressImage ? () => onPressImage(singleUrl, "Visual component") : undefined}
            onError={() => handleImageError(singleUrl)}
          />
        </View>
      </View>
    );
  }

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
        snapToInterval={containerWidth}
        snapToAlignment="center"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={(e) => {
          const slide = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
          if (slide !== activeIndex) {
            setActiveIndex(slide);
          }
        }}
        scrollEventThrottle={16}
        style={[styles.carouselScroll, { height: 180 }]}
      >
        {validUrls.map((url, idx) => (
          <View key={`img-slide-${url}`} style={{ width: containerWidth, height: 180, overflow: 'hidden' }}>
            <ImageWithLoader
              uri={url}
              alt={`Slide ${idx + 1}`}
              style={styles.carouselImage}
              width={containerWidth}
              height={180}
              resizeMode="cover"
              onPress={onPressImage ? () => onPressImage(url, `Slide ${idx + 1}`) : undefined}
              onError={() => handleImageError(url)}
            />
          </View>
        ))}
      </ScrollView>
      {validUrls.length > 1 && (
        <View style={styles.carouselDots}>
          {validUrls.map((_, idx) => (
            <View
              key={`dot-${idx}`}
              style={[
                styles.carouselDot,
                idx === activeIndex && styles.carouselDotActive
              ]}
            />
          ))}
        </View>
      )}
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

// --- DrillQuestion Premium Scoping Questionnaire Component ---
interface DrillQuestionProps {
  id: string;
  question: string;
  optionsString: string;
  current: string;
  total: string;
  onDrillAnswer?: (answer: string) => void;
}

function DrillQuestionComponent({ id, question, optionsString, current, total, onDrillAnswer }: DrillQuestionProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const options = optionsString.split('|').map(opt => {
    const parts = opt.split(':');
    return {
      label: parts[0] || opt,
      value: parts[1] || opt
    };
  }).filter(o => o.label);

  const handleSelect = (val: string) => {
    setSelectedOption(val);
    if (onDrillAnswer) {
      onDrillAnswer(val);
    }
  };

  return (
    <View style={styles.weatherCard}>
      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Specification Drill ({current}/{total})
        </Text>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a', marginTop: 4 }}>
          {question}
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        {options.map((opt, idx) => {
          const isSelected = selectedOption === opt.value;
          return (
            <TouchableOpacity
              key={`opt-${idx}`}
              onPress={() => handleSelect(opt.value)}
              disabled={selectedOption !== null}
              style={[
                styles.drillOptionButton,
                isSelected && styles.drillOptionSelected
              ]}
            >
              <Text style={styles.drillOptionText}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// --- Tag-Based Custom Component Parser ---
function parseCustomComponents(
  text: string, 
  keyPrefix: string, 
  onDrillAnswer?: (answer: string) => void,
  onPressImage?: (uri: string, alt?: string) => void,
  onPressChart?: (chartProps: any) => void
) {
  const componentTagRegex = /<(LinkCard|Map|ButtonRow|Chart|Carousel|Weather|TaskList|DrillQuestion)\b([^>]*?)\/>/g;
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
          {renderTextWithInlineFormatting(textBefore, onPressImage, onPressChart)}
        </View>
      );
    }

    const attrs = parseAttributes(rawAttrs);

    if (tagName === 'LinkCard') {
      elements.push(
        <FadeInView key={`component-${keyPrefix}-${match.index}`}>
          <LinkCardComponent
            title={attrs.title || ''}
            url={attrs.url || ''}
            desc={attrs.desc || attrs.description || ''}
          />
        </FadeInView>
      );
    } else if (tagName === 'Map') {
      elements.push(
        <FadeInView key={`component-${keyPrefix}-${match.index}`}>
          <MapComponent
            lat={parseFloat(attrs.lat || '0')}
            lng={parseFloat(attrs.lng || '0')}
            label={attrs.label || 'Location'}
          />
        </FadeInView>
      );
    } else if (tagName === 'ButtonRow') {
      elements.push(
        <FadeInView key={`component-${keyPrefix}-${match.index}`}>
          <ButtonRowComponent
            buttonsString={attrs.buttons || ''}
          />
        </FadeInView>
      );
    } else if (tagName === 'Chart') {
      elements.push(
        <FadeInView key={`component-${keyPrefix}-${match.index}`}>
          <ChartComponent
            type={attrs.type || 'line'}
            title={attrs.title}
            dataString={attrs.data || ''}
            seriesString={attrs.series || ''}
            labelsString={attrs.labels || ''}
            color={attrs.color || '#3b82f6'}
            onPressZoom={onPressChart ? () => onPressChart({
              type: attrs.type || 'line',
              title: attrs.title,
              dataString: attrs.data || '',
              seriesString: attrs.series || '',
              labelsString: attrs.labels || '',
              color: attrs.color || '#3b82f6'
            }) : undefined}
          />
        </FadeInView>
      );
    } else if (tagName === 'Carousel') {
      elements.push(
        <FadeInView key={`component-${keyPrefix}-${match.index}`}>
          <CarouselComponent
            imagesString={attrs.images || ''}
            onPressImage={onPressImage}
          />
        </FadeInView>
      );
    } else if (tagName === 'Weather') {
      elements.push(
        <FadeInView key={`component-${keyPrefix}-${match.index}`}>
          <WeatherComponent
            temp={attrs.temp || ''}
            condition={attrs.condition || ''}
            humidity={attrs.humidity || ''}
            wind={attrs.wind || ''}
            uv={attrs.uv || ''}
            city={attrs.city || 'Location'}
          />
        </FadeInView>
      );
    } else if (tagName === 'TaskList') {
      elements.push(
        <FadeInView key={`component-${keyPrefix}-${match.index}`}>
          <TaskListComponent
            itemsString={attrs.items || ''}
          />
        </FadeInView>
      );
    } else if (tagName === 'DrillQuestion') {
      elements.push(
        <FadeInView key={`component-${keyPrefix}-${match.index}`}>
          <DrillQuestionComponent
            id={attrs.id || ''}
            question={attrs.question || ''}
            optionsString={attrs.options || ''}
            current={attrs.current || '1'}
            total={attrs.total || '1'}
            onDrillAnswer={onDrillAnswer}
          />
        </FadeInView>
      );
    }

    lastIndex = componentTagRegex.lastIndex;
  }

  const textAfter = text.substring(lastIndex);
  if (textAfter.trim()) {
    elements.push(
      <View key={`text-${keyPrefix}-end`} style={styles.textContainer}>
        {renderTextWithInlineFormatting(textAfter, onPressImage, onPressChart)}
      </View>
    );
  }

  return elements;
}


interface MarkdownRendererProps {
  text: string;
  onDrillAnswer?: (answer: string) => void;
}

export function MarkdownRenderer({ text, onDrillAnswer }: MarkdownRendererProps) {
  const [activeImage, setActiveImage] = useState<{ uri: string; alt?: string } | null>(null);
  const [activeChart, setActiveChart] = useState<any | null>(null);
  const [scaleAnim] = useState(() => new Animated.Value(0.9));
  const [opacityAnim] = useState(() => new Animated.Value(0));

  const handlePressImage = async (uri: string, alt?: string) => {
    let resolvedUri = uri;
    if (uri && !uri.startsWith('http://') && !uri.startsWith('https://') && !uri.startsWith('data:')) {
      try {
        const { storage } = require('@/utils/storage');
        const baseUrl = await storage.getBackendUrl();
        const cleanBase = baseUrl.trim().replace(/\/$/, '');
        const cleanPath = uri.startsWith('/') ? uri : `/${uri}`;
        resolvedUri = `${cleanBase}${cleanPath}`;
      } catch (e) {
        console.log('[handlePressImage] Error getting backend url:', e);
      }
    }
    setActiveImage({ uri: resolvedUri, alt });
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  };

  const handlePressChart = (chartProps: any) => {
    setActiveChart(chartProps);
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  };

  const handleCloseLightbox = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start(() => {
      setActiveImage(null);
      setActiveChart(null);
    });
  };

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
      elements.push(...parseCustomComponents(textBefore, `before-${match.index}`, onDrillAnswer, handlePressImage, handlePressChart));
    }

    // Render code block with VS Code syntax highlighting
    elements.push(
      <FadeInView key={`code-${match.index}`}>
        <View style={styles.codeBlockContainer}>
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
      </FadeInView>
    );

    lastIndex = codeBlockRegex.lastIndex;
  }

  // Render remaining text after last code block
  const textAfter = text.substring(lastIndex);
  if (textAfter.trim()) {
    elements.push(...parseCustomComponents(textAfter, 'end', onDrillAnswer, handlePressImage, handlePressChart));
  }

  return (
    <View style={styles.container}>
      {elements}
      <Modal
        visible={activeImage !== null || activeChart !== null}
        transparent={true}
        animationType="none"
        onRequestClose={handleCloseLightbox}
      >
        {(activeImage || activeChart) && (
          <Animated.View style={[styles.lightboxContainer, { opacity: opacityAnim }]}>
            <TouchableOpacity 
              activeOpacity={1} 
              onPress={handleCloseLightbox} 
              style={styles.lightboxBackdrop} 
            />
            
            <TouchableOpacity onPress={handleCloseLightbox} style={styles.lightboxCloseButton}>
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
 
            <Animated.View style={[styles.lightboxImageContainer, { transform: [{ scale: scaleAnim }] }]}>
              {activeImage ? (
                Platform.OS === 'ios' ? (
                  <ScrollView
                    maximumZoomScale={3}
                    minimumZoomScale={1}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
                  >
                    <Image
                      source={getImageSource(activeImage.uri)}
                      style={styles.lightboxImage}
                      contentFit="contain"
                    />
                  </ScrollView>
                ) : (
                  <Image
                    source={getImageSource(activeImage.uri)}
                    style={styles.lightboxImage}
                    contentFit="contain"
                  />
                )
              ) : (
                <View style={{ width: '100%', paddingHorizontal: 20 }}>
                  <ChartComponent
                    {...activeChart}
                    isZoomed={true}
                  />
                </View>
              )}
            </Animated.View>
 
            <View style={styles.lightboxBottomBar}>
              {activeImage?.alt ? (
                <Text style={styles.lightboxTitle} numberOfLines={2}>
                  {activeImage.alt}
                </Text>
              ) : activeChart?.title ? (
                <Text style={styles.lightboxTitle} numberOfLines={2}>
                  {activeChart.title}
                </Text>
              ) : null}
              
              <View style={styles.lightboxButtons}>
                {activeImage ? (
                  <TouchableOpacity 
                    onPress={() => exportImage(activeImage.uri)} 
                    style={[styles.lightboxButton, styles.lightboxButtonPrimary]}
                  >
                    <Ionicons name="share-social-outline" size={16} color="#ffffff" />
                    <Text style={[styles.lightboxButtonText, styles.lightboxButtonTextPrimary]}>
                      Export Image
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: '#64748b', fontSize: 12 }}>Interactive chart preview, Sir</Text>
                )}
                
                {activeImage && !activeImage.uri.startsWith('data:image/') && (
                  <>
                    <TouchableOpacity 
                      onPress={() => WebBrowser.openBrowserAsync(activeImage.uri)} 
                      style={styles.lightboxButton}
                    >
                      <Ionicons name="open-outline" size={16} color="#e2e8f0" />
                      <Text style={styles.lightboxButtonText}>
                        Source Link
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      onPress={() => Clipboard.setString(activeImage.uri)} 
                      style={styles.lightboxButton}
                    >
                      <Ionicons name="copy-outline" size={16} color="#e2e8f0" />
                      <Text style={styles.lightboxButtonText}>
                        Copy Link
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </Animated.View>
        )}
      </Modal>
    </View>
  );
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

  // Calculate dynamic column widths based on maximum text length
  const maxCharsPerCol = headers.map((header, colIdx) => {
    let maxLen = header.length;
    rows.forEach(row => {
      const cellText = row[colIdx] || '';
      if (cellText.length > maxLen) {
        maxLen = cellText.length;
      }
    });
    return maxLen;
  });

  const getCellWidth = (index: number) => {
    const chars = maxCharsPerCol[index] || 10;
    return Math.max(110, Math.min(320, chars * 8.5));
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

function renderTextWithInlineFormatting(
  rawText: string,
  onPressImage?: (uri: string, alt?: string) => void,
  onPressChart?: (chartProps: any) => void
) {
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
        renderedElements.push(
          <FadeInView key={`table-${i}`}>
            {renderTable(tableLines, i)}
          </FadeInView>
        );
      } else {
        tableLines.forEach((tblLine, idx) => {
          renderedElements.push(
            <FadeInView key={`line-tbl-fail-${i}-${idx}`}>
              <Text style={styles.bodyText}>
                {renderInlineSpans(tblLine)}
              </Text>
            </FadeInView>
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
        <FadeInView key={`h-${i}`}>
          <Text style={[styles.header, headerStyle]}>
            {renderInlineSpans(cleanText)}
          </Text>
        </FadeInView>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const cleanText = line.substring(2);
      renderedElements.push(
        <FadeInView key={`bullet-${i}`}>
          <View style={styles.bulletRow}>
            <Text style={styles.bulletDot}>•</Text>
            <Text style={styles.bulletText}>{renderInlineSpans(cleanText)}</Text>
          </View>
        </FadeInView>
      );
    } else {
      const numListMatch = line.match(/^(\d+)\.\s(.*)/);
      if (numListMatch) {
        const num = numListMatch[1];
        const cleanText = numListMatch[2];
        renderedElements.push(
          <FadeInView key={`num-${i}`}>
            <View style={styles.bulletRow}>
              <Text style={styles.bulletNum}>{num}.</Text>
              <Text style={styles.bulletText}>{renderInlineSpans(cleanText)}</Text>
            </View>
          </FadeInView>
        );
      } else if (line.trim() === '') {
        renderedElements.push(<View key={`empty-${i}`} style={styles.emptyLine} />);
      } else {
        // Detect incomplete image markdown streaming (data:image or http/https)
        const incompleteMatch = line.match(/(.*?)!\[([^\]]*?)\]\((data:image\/[^)]*|https?:\/\/[^)]*)$/);
        if (incompleteMatch) {
          const textBefore = incompleteMatch[1];
          const alt = incompleteMatch[2];
          
          if (textBefore.trim()) {
            renderedElements.push(
              <FadeInView key={`line-text-before-${i}`}>
                <Text style={styles.bodyText}>
                  {renderInlineSpans(textBefore)}
                </Text>
              </FadeInView>
            );
          }
          
          renderedElements.push(
            <FadeInView key={`img-stream-placeholder-${i}`}>
              <View style={styles.imagePlaceholderCard}>
                <ActivityIndicator size="small" color="#3b82f6" style={{ marginRight: 8 }} />
                <Text style={styles.imagePlaceholderText}>
                  Rendering visual content: {alt || 'Image'}...
                </Text>
              </View>
            </FadeInView>
          );
          
          i++;
          continue;
        }

        // Detect fully-closed image tags in standard text
        const hasImage = line.includes('![') && line.includes('](');
        if (hasImage) {
          const lineParts = line.split(/(!\[[^\]]*?\]\([^)]+?\))/g);
          let renderedAny = false;
          lineParts.forEach((part, partIdx) => {
            if (part === '') return;
            
            const imgMatch = part.match(/^!\[(.*?)\]\((.*?)\)$/);
            if (imgMatch) {
              const alt = imgMatch[1];
              const uri = imgMatch[2];
              renderedElements.push(
                <FadeInView key={`img-complete-${i}-${partIdx}`}>
                  <MarkdownImage
                    uri={uri}
                    alt={alt}
                    onPressImage={onPressImage}
                  />
                </FadeInView>
              );
              renderedAny = true;
            } else if (part.trim() !== '') {
              renderedElements.push(
                <FadeInView key={`line-part-${i}-${partIdx}`}>
                  <Text style={styles.bodyText}>
                    {renderInlineSpans(part)}
                  </Text>
                </FadeInView>
              );
              renderedAny = true;
            }
          });
          if (renderedAny) {
            i++;
            continue;
          }
        }

        renderedElements.push(
          <FadeInView key={`line-${i}`}>
            <Text style={styles.bodyText}>
              {renderInlineSpans(line)}
            </Text>
          </FadeInView>
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
    color: '#f1f5f9',
    lineHeight: 22,
    marginBottom: 6,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
  boldText: {
    fontWeight: '600',
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
    fontWeight: '500',
    marginTop: 12,
    marginBottom: 8,
  },
  h1: {
    fontSize: 22,
    lineHeight: 28,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 4,
    fontWeight: '400',
    letterSpacing: -0.4,
  },
  h2: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: -0.2,
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
    backgroundColor: '#0c0c0c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#171717',
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
    backgroundColor: '#0c0c0c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#171717',
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
    borderBottomColor: '#171717',
    backgroundColor: '#000000',
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
    borderTopColor: '#171717',
    backgroundColor: '#000000',
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
    backgroundColor: '#0c0c0c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#171717',
    padding: 14,
    marginVertical: 8,
    overflow: 'hidden',
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
    borderColor: '#171717',
    backgroundColor: '#0a0a0a',
    overflow: 'hidden',
    // Explicit minHeight so native renders the container even before onLayout fires
    minHeight: 180,
  },
  carouselScroll: {
    width: '100%',
    // Height set inline as 180 — do NOT use '100%' here, collapses on native
  },
  carouselImage: {
    // width/height set explicitly via props in ImageWithLoader — '100%' fails on native
    width: '100%',
    height: 180,
  },
  carouselDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#171717',
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
  drillOptionButton: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        transition: 'all 0.2s ease',
      } as any,
      default: {},
    }),
  },
  drillOptionSelected: {
    borderColor: '#3b82f6',
    borderWidth: 1.5,
    backgroundColor: '#eff6ff',
    ...Platform.select({
      web: {
        boxShadow: '0 0 8px rgba(59, 130, 246, 0.25)',
      } as any,
      default: {
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  drillOptionText: {
    color: '#0f172a',
    fontSize: 13.5,
    fontWeight: '600',
  },

  // Image and Lightbox styles
  imageCard: {
    backgroundColor: '#0c0c0c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#171717',
    padding: 12,
    marginVertical: 8,
    width: '100%',
  },
  imageCardTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  imageTouch: {
    width: '100%',
  },
  imageWrapper: {
    // Do NOT use position:'relative' — unsupported in RN StyleSheet; defaults to static on native.
    // Dimensions are set inline via width/height props per usage context.
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markdownImage: {
    width: '100%',
    height: 220,
  },
  imageCardActionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  imageCardActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  imageCardActionBtnPrimary: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  imageCardActionText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  imageCardActionTextPrimary: {
    color: '#60a5fa',
  },
  imageErrorContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0a0d14',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  imageErrorText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  imageErrorSubtext: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
    width: '90%',
  },
  imageLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#05070c',
  },
  imagePlaceholderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c0c0c',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#171717',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 8,
  },
  imagePlaceholderText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  lightboxContainer: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.98)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(3, 7, 18, 0.98)',
  },
  lightboxImageContainer: {
    width: '100%',
    height: '70%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  lightboxCloseButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  lightboxBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(9, 13, 24, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    alignItems: 'center',
  },
  lightboxTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  lightboxButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  lightboxButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  lightboxButtonPrimary: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  lightboxButtonText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  lightboxButtonTextPrimary: {
    color: '#ffffff',
  },
});

