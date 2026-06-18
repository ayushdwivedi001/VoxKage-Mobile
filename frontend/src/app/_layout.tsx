import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Platform } from 'react-native';

export default function RootLayout() {
  // If previewing in Web, wrap in a gorgeous centered phone frame to look like a mobile app
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <StatusBar style="light" />
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
        </View>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
      </Stack>
    </>
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
});
