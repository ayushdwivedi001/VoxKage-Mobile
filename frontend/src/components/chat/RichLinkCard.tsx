import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Linking,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface LinkPreviewData {
  url: string;
  title: string;
  description: string;
  favicon_url: string;
  domain: string;
}

interface RichLinkCarouselProps {
  urls: string[];
  backendUrl: string;
  token: string | null;
}

// Extract all URLs from text
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/g;
  const raw = text.match(urlRegex) || [];
  // Deduplicate preserving order
  const seen = new Set<string>();
  return raw.filter((u) => {
    // Remove trailing punctuation that's likely not part of the URL
    const clean = u.replace(/[.,;:!?)]+$/, '');
    if (seen.has(clean)) return false;
    seen.add(clean);
    return true;
  }).map((u) => u.replace(/[.,;:!?)]+$/, ''));
}

// Individual card
function LinkCard({
  url,
  backendUrl,
  token,
}: {
  url: string;
  backendUrl: string;
  token: string | null;
}) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const fetch_meta = async () => {
      try {
        const encodedUrl = encodeURIComponent(url);
        const resp = await fetch(`${backendUrl}/link-preview?url=${encodedUrl}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) throw new Error('Non-OK');
        const json: LinkPreviewData = await resp.json();
        if (!cancelled) {
          setData(json);
          setLoading(false);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }).start();
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }).start();
        }
      }
    };
    fetch_meta();
    return () => { cancelled = true; };
  }, [url, backendUrl, token]);

  const handleOpen = () => {
    Linking.openURL(url).catch(() => {});
  };

  if (loading) {
    return (
      <View style={cardStyles.card}>
        <View style={cardStyles.loadingBar} />
        <View style={cardStyles.loadingLine} />
        <View style={[cardStyles.loadingLine, { width: '60%' }]} />
      </View>
    );
  }

  const displayData = error
    ? { title: new URL(url).hostname, description: '', favicon_url: '', domain: new URL(url).hostname, url }
    : data!;

  return (
    <Animated.View style={[cardStyles.card, { opacity: fadeAnim }]}>
      <TouchableOpacity onPress={handleOpen} activeOpacity={0.8}>
        {/* Top domain row */}
        <View style={cardStyles.domainRow}>
          {displayData.favicon_url ? (
            <Image
              source={{ uri: displayData.favicon_url }}
              style={cardStyles.favicon}
              onError={() => {}}
            />
          ) : (
            <Ionicons name="globe-outline" size={14} color="#60a5fa" />
          )}
          <Text style={cardStyles.domainText} numberOfLines={1}>
            {displayData.domain}
          </Text>
          <Ionicons name="open-outline" size={12} color="#475569" style={{ marginLeft: 'auto' }} />
        </View>

        {/* Divider */}
        <View style={cardStyles.divider} />

        {/* Title */}
        <Text style={cardStyles.titleText} numberOfLines={2}>
          {displayData.title}
        </Text>

        {/* Description */}
        {displayData.description ? (
          <Text style={cardStyles.descText} numberOfLines={2}>
            {displayData.description}
          </Text>
        ) : null}
      </TouchableOpacity>
    </Animated.View>
  );
}

// Swipeable carousel of cards
export function RichLinkCarousel({ urls, backendUrl, token }: RichLinkCarouselProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  if (!urls.length) return null;

  const handleScroll = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / CARD_WIDTH);
    setActiveIdx(idx);
  };

  return (
    <View style={carouselStyles.wrapper}>
      {/* Header */}
      <View style={carouselStyles.header}>
        <Ionicons name="link" size={12} color="#3b82f6" />
        <Text style={carouselStyles.headerText}>
          {urls.length === 1 ? 'Source Link' : `${urls.length} Sources`}
        </Text>
        {urls.length > 1 && (
          <Text style={carouselStyles.slideHint}>swipe →</Text>
        )}
      </View>

      {/* Cards */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH + CARD_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ gap: CARD_GAP, paddingRight: 16 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {urls.map((url, i) => (
          <LinkCard
            key={`lc-${i}-${url.slice(-20)}`}
            url={url}
            backendUrl={backendUrl}
            token={token}
          />
        ))}
      </ScrollView>

      {/* Dots */}
      {urls.length > 1 && (
        <View style={carouselStyles.dotsRow}>
          {urls.map((_, i) => (
            <View
              key={`dot-${i}`}
              style={[carouselStyles.dot, i === activeIdx && carouselStyles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const CARD_WIDTH = 240;
const CARD_GAP = 10;

const cardStyles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  favicon: {
    width: 16,
    height: 16,
    borderRadius: 3,
  },
  domainText: {
    fontSize: 11,
    color: '#60a5fa',
    fontWeight: '600',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#1e293b',
    marginBottom: 8,
  },
  titleText: {
    fontSize: 13,
    color: '#e2e8f0',
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 4,
  },
  descText: {
    fontSize: 11.5,
    color: '#64748b',
    lineHeight: 16,
  },
  loadingBar: {
    height: 12,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    marginBottom: 10,
    width: '40%',
  },
  loadingLine: {
    height: 10,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    marginBottom: 6,
    width: '85%',
  },
});

const carouselStyles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  headerText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  slideHint: {
    fontSize: 10,
    color: '#334155',
    marginLeft: 6,
    fontStyle: 'italic',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
    marginTop: 8,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1e293b',
  },
  dotActive: {
    backgroundColor: '#3b82f6',
    width: 12,
  },
});
