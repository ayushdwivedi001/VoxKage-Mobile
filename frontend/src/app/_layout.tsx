import { Stack } from 'expo-router';
import { StyleSheet, View, Platform, StatusBar, Animated, Image, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';

// Hold native splash screen immediately when module is parsed
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [appReady, setAppReady] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1.0)).current;

  useEffect(() => {
    if (Platform.OS === 'android') {
      const NavSys = NavigationBar as any;
      if (typeof NavSys?.setPositionAsync === 'function') {
        NavSys.setPositionAsync('absolute').catch(() => {});
      }
      if (typeof NavSys?.setBackgroundColorAsync === 'function') {
        NavSys.setBackgroundColorAsync('#00000000').catch(() => {});
      }
      if (typeof NavSys?.setButtonStyleAsync === 'function') {
        NavSys.setButtonStyleAsync('light').catch(() => {});
      }
    }

    // Smooth loading delay for premium feeling
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0.0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setAppReady(true);
        // Hide the native splash screen underneath
        SplashScreen.hideAsync().catch(() => {});
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  // Web rendering logic
  if (Platform.OS === 'web') {
    return (
      <SafeAreaProvider>
        <View style={styles.webContainer}>
          <StatusBar barStyle="light-content" />
          <View style={styles.phoneFrame}>
            <View style={[styles.statusBarMock, { pointerEvents: 'none' as any }]}>
              <View style={styles.notchMock} />
            </View>
            <View style={styles.screenContent}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="login" />
              </Stack>
            </View>
            <View style={[styles.homeIndicatorMock, { pointerEvents: 'none' as any }]} />

            {/* Custom Splash Overlay for web preview */}
            {!appReady && (
              <Animated.View style={[StyleSheet.absoluteFill, styles.splashOverlay, { opacity: fadeAnim }]}>
                <Image
                  source={require('../../assets/images/android-icon-foreground.png')}
                  style={styles.splashLogo}
                />
                <Text style={styles.splashText}>VoxKage</Text>
              </Animated.View>
            )}
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  // Native mobile: edge-to-edge rendering with transparent status/nav bars
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" translucent={true} backgroundColor="transparent" />
      <View style={{ flex: 1, backgroundColor: '#000000' }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
        </Stack>

        {/* Custom Splash Overlay for native build */}
        {!appReady && (
          <Animated.View style={[StyleSheet.absoluteFill, styles.splashOverlay, { opacity: fadeAnim }]} pointerEvents="none">
            <Image
              source={require('../../assets/images/android-icon-foreground.png')}
              style={styles.splashLogo}
            />
            <Text style={styles.splashText}>VoxKage</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  webContainer: {
    flex: 1,
    backgroundColor: '#07080a', // extremely dark slate
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh' as any,
    padding: 20,
  },
  phoneFrame: {
    width: 390,
    height: 844,
    borderRadius: 44,
    borderWidth: 12,
    borderColor: '#1f2023', // dark titanium
    backgroundColor: '#000000',
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      web: {
        boxShadow: '0px 24px 32px rgba(0, 0, 0, 0.6)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.6,
        shadowRadius: 32,
      },
    }),
  },
  statusBarMock: {
    height: 36,
    width: '100%',
    backgroundColor: 'transparent',
    position: 'absolute',
    top: 0,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notchMock: {
    width: 110,
    height: 20,
    backgroundColor: '#1f2023',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    top: 0,
  },
  screenContent: {
    flex: 1,
    paddingTop: 0,
  },
  homeIndicatorMock: {
    width: 140,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 3,
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    zIndex: 100,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  splashLogo: {
    width: 230,
    height: 230,
    resizeMode: 'contain',
  },
  splashText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '300',
    fontFamily: Platform.select({
      android: 'sans-serif-light',
      ios: 'System',
      default: 'normal',
    }),
    letterSpacing: 6,
    textTransform: 'uppercase',
    opacity: 0.9,
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 60 : 40,
    alignSelf: 'center',
  },
});
