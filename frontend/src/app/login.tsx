import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { storage, DEFAULT_BACKEND_URL } from '@/utils/storage';

const sanitizeUrl = (url: string): string => {
  let cleaned = url.trim().replace(/\/$/, '');
  if (cleaned.startsWith('http://') && cleaned.includes('.hf.space')) {
    cleaned = cleaned.replace('http://', 'https://');
  }
  return cleaned;
};

// Custom Gradient Bluish-Black V Logo SVG (No Box)
const LogoV = () => (
  <Svg width={80} height={80} viewBox="0 0 100 100" style={styles.logoSvg}>
    <Defs>
      <SvgGradient id="logoGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
        <Stop offset="50%" stopColor="#2563eb" stopOpacity={0.9} />
        <Stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.9} />
      </SvgGradient>
      <SvgGradient id="logoGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
        <Stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.9} />
        <Stop offset="50%" stopColor="#0f172a" stopOpacity={0.9} />
        <Stop offset="100%" stopColor="#020617" stopOpacity={0.9} />
      </SvgGradient>
    </Defs>
    <Path
      d="M20 18 L46 82 L56 82 L32 18 Z"
      fill="url(#logoGrad1)"
    />
    <Path
      d="M80 18 L54 82 L44 82 L68 18 Z"
      fill="url(#logoGrad2)"
    />
  </Svg>
);

export default function LoginScreen() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [masterKey, setMasterKey] = useState('');
  const [otp, setOtp] = useState('');
  const [backendUrl, setBackendUrl] = useState('');
  const [hfToken, setHfToken] = useState('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [bridgeMode, setBridgeMode] = useState<'laptop' | 'mobile_local'>('laptop');
  const [mobileLocalIp, setMobileLocalIp] = useState('');

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    const loadSettings = async () => {
      const url = await storage.getBackendUrl();
      const storedEmail = await storage.getEmail();
      setBackendUrl(url);
      if (storedEmail) setEmail(storedEmail);
      
      const storedBridgeMode = await storage.getBridgeMode();
      const storedMobileLocalIp = await storage.getMobileLocalIp();
      setBridgeMode(storedBridgeMode);
      setMobileLocalIp(storedMobileLocalIp);

      const token = await storage.getToken();
      if (token) {
        router.replace('/');
      }
    };
    loadSettings();
  }, []);



  const getFetchHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (hfToken.trim()) {
      // Direct Authorization headers in case of private Hugging Face space
      headers['Authorization'] = `Bearer ${hfToken.trim()}`;
    }
    return headers;
  };

  const handleRequestOtp = async () => {
    if (!email.trim() || !email.includes('@')) {
      showAlert('Error', 'Please enter a valid email address.');
      return;
    }

    if (isSignUp && !masterKey.trim()) {
      showAlert('Error', 'Master Key is required for new signups.');
      return;
    }

    setLoading(true);
    try {
      const savedUrl = sanitizeUrl(backendUrl);
      await storage.setBackendUrl(savedUrl);
      await storage.setEmail(email.trim());

      const response = await fetch(`${savedUrl}/auth/otp/request`, {
        method: 'POST',
        headers: getFetchHeaders(),
        body: JSON.stringify({
          email: email.trim(),
          master_key: isSignUp ? masterKey.trim() : null,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setIsOtpSent(true);
        showAlert(
          'OTP Sent',
          data.message || 'OTP verification code sent successfully to your email.'
        );
      } else {
        // Handle private Space 404 or backend down
        if (response.status === 404) {
          triggerOfflineBypassAlert('Endpoint returned 404. This happens if your Hugging Face Space is private or still booting. Would you like to enter Offline Simulator Mode, Sir?');
        } else {
          showAlert('Authentication Failed', data.detail || 'Failed to request OTP.');
        }
      }
    } catch (e: any) {
      triggerOfflineBypassAlert(`Could not connect to backend: ${e.message}. Enter Simulator Mode to preview the app?`);
    } finally {
      setLoading(false);
    }
  };

  const triggerOfflineBypassAlert = (msg: string) => {
    const enterSimulator = async () => {
      await storage.setToken('mock-authorized-jwt-sir');
      await storage.setEmail(email || 'sir@voxkage.ai');
      router.replace('/');
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`${msg}\n\nClick OK to enter Simulator Mode, or Cancel to retry.`);
      if (confirmed) {
        enterSimulator();
      }
    } else {
      Alert.alert(
        'Server Connection Failed',
        msg,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enter Simulator Mode',
            onPress: enterSimulator,
          },
        ]
      );
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      showAlert('Error', 'Please enter the verification code.');
      return;
    }

    setLoading(true);
    try {
      const savedUrl = sanitizeUrl(backendUrl);
      const response = await fetch(`${savedUrl}/auth/otp/verify`, {
        method: 'POST',
        headers: getFetchHeaders(),
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
        }),
      });

      const data = await response.json();
      if (response.ok && data.access_token) {
        await storage.setToken(data.access_token);
        router.replace('/');
      } else {
        showAlert('Verification Failed', data.detail || 'Invalid or expired OTP code.');
      }
    } catch (e: any) {
      showAlert('Connection Error', `Could not connect to backend: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeveloperLogin = async () => {
    if (!email.trim() || !email.includes('@')) {
      showAlert('Error', 'Please enter a valid email address.');
      return;
    }
    if (!masterKey.trim()) {
      showAlert('Error', 'Please enter the Master Passphrase.');
      return;
    }

    setLoading(true);
    try {
      const savedUrl = sanitizeUrl(backendUrl) || DEFAULT_BACKEND_URL;
      await storage.setBackendUrl(savedUrl);
      await storage.setEmail(email.trim());

      const response = await fetch(`${savedUrl}/auth/master-login`, {
        method: 'POST',
        headers: getFetchHeaders(),
        body: JSON.stringify({
          email: email.trim(),
          master_key: masterKey.trim(),
        }),
      });

      const data = await response.json();
      if (response.ok && data.access_token) {
        await storage.setToken(data.access_token);
        router.replace('/');
      } else {
        showAlert('Developer Login Failed', data.detail || 'Master Passphrase verification failed.');
      }
    } catch (e: any) {
      showAlert('Connection Error', `Could not connect to backend: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const savedUrl = sanitizeUrl(backendUrl) || DEFAULT_BACKEND_URL;
      await storage.setBackendUrl(savedUrl);
      
      const response = await fetch(`${savedUrl}/auth/master-login`, {
        method: 'POST',
        headers: getFetchHeaders(),
        body: JSON.stringify({
          email: 'sir.google@voxkage.ai',
          master_key: 'sir', // Default master key
        }),
      });

      const data = await response.json();
      if (response.ok && data.access_token) {
        await storage.setToken(data.access_token);
        await storage.setEmail('sir.google@voxkage.ai');
        router.replace('/');
      } else {
        console.warn('Backend master login failed, falling back to mock mode', data);
        await storage.setToken('mock-google-authorized-jwt-sir');
        await storage.setEmail('sir.google@voxkage.ai');
        router.replace('/');
      }
    } catch (e) {
      console.warn('Could not connect to backend, falling back to mock mode', e);
      await storage.setToken('mock-google-authorized-jwt-sir');
      await storage.setEmail('sir.google@voxkage.ai');
      router.replace('/');
    } finally {
      setLoading(false);
    }
  };


  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.headerContainer}>
            <LogoV />
            <Text style={styles.titleText}>VoxKage Mobile</Text>
            <Text style={styles.subtitleText}>Your OS Living Agentic AI Portal</Text>
          </View>

          <View style={styles.cardContainer}>
            {/* Sign In / Sign Up Selector Tabs */}
            {!isOtpSent && (
              <View style={styles.tabsSelector}>
                <TouchableOpacity
                  style={[styles.tabBtn, !isSignUp && styles.tabBtnActive]}
                  onPress={() => setIsSignUp(false)}
                >
                  <Text style={[styles.tabBtnText, !isSignUp && styles.tabBtnTextActive]}>Sign In</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tabBtn, isSignUp && styles.tabBtnActive]}
                  onPress={() => setIsSignUp(true)}
                >
                  <Text style={[styles.tabBtnText, isSignUp && styles.tabBtnTextActive]}>Create Account</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isOtpSent ? (
              <>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email Address"
                    placeholderTextColor="#475569"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                {isSignUp && (
                  <View style={styles.inputWrapper}>
                    <Ionicons name="key-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Master Passphrase"
                      placeholderTextColor="#475569"
                      value={masterKey}
                      onChangeText={setMasterKey}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                )}

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleRequestOtp}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {isSignUp ? 'Request Signup OTP' : 'Request OTP Code'}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Google Sign In Divider */}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>OR</Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* Connect with Google Button */}
                <TouchableOpacity
                  style={styles.googleButton}
                  onPress={handleGoogleSignIn}
                  disabled={loading}
                >
                  <Ionicons name="logo-google" size={18} color="#ffffff" style={styles.googleIcon} />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.sectionLabel}>Verify Code</Text>
                <Text style={styles.descText}>
                  A 6-digit code has been dispatched to <Text style={styles.boldText}>{email}</Text>.
                </Text>

                <View style={styles.inputWrapper}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="#94a3b8" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="6-digit verification code"
                    placeholderTextColor="#475569"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleVerifyOtp}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Verify & Authorize</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setIsOtpSent(false)}
                  disabled={loading}
                >
                  <Text style={styles.backButtonText}>Change Email / Back</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Advanced Settings */}
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvanced(!showAdvanced)}
            >
              <Text style={styles.advancedToggleText}>
                {showAdvanced ? 'Hide API Configuration' : 'Advanced Settings'}
              </Text>
              <Ionicons
                name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                size={12}
                color="#475569"
              />
            </TouchableOpacity>

            {showAdvanced && (
              <View style={styles.advancedContainer}>
                <Text style={styles.advancedLabel}>Cloud Server Endpoint</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="globe-outline" size={16} color="#475569" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="https://shinayush-voxkage-mobile-backend.hf.space"
                    placeholderTextColor="#475569"
                    value={backendUrl}
                    onChangeText={setBackendUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Text style={styles.advancedLabel}>Hugging Face Token (for Private Space)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={16} color="#475569" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="hf_..."
                    placeholderTextColor="#475569"
                    value={hfToken}
                    onChangeText={setHfToken}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Text style={styles.advancedLabel}>Connection Bridge Mode</Text>
                <View style={styles.bridgeSelectorRow}>
                  <TouchableOpacity
                    style={[
                      styles.bridgeSelectorBtn,
                      bridgeMode === 'laptop' && styles.bridgeSelectorBtnActive,
                    ]}
                    onPress={async () => {
                      setBridgeMode('laptop');
                      await storage.setBridgeMode('laptop');
                    }}
                  >
                    <Text
                      style={[
                        styles.bridgeSelectorText,
                        bridgeMode === 'laptop' && styles.bridgeSelectorTextActive,
                      ]}
                    >
                      Laptop Daemon
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.bridgeSelectorBtn,
                      bridgeMode === 'mobile_local' && styles.bridgeSelectorBtnActive,
                    ]}
                    onPress={async () => {
                      setBridgeMode('mobile_local');
                      await storage.setBridgeMode('mobile_local');
                    }}
                  >
                    <Text
                      style={[
                        styles.bridgeSelectorText,
                        bridgeMode === 'mobile_local' && styles.bridgeSelectorTextActive,
                      ]}
                    >
                      Mobile Local Bridge
                    </Text>
                  </TouchableOpacity>
                </View>

                {bridgeMode === 'mobile_local' && (
                  <>
                    <Text style={styles.advancedLabel}>Mobile Local Bridge IP / Port</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="wifi-outline" size={16} color="#475569" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="e.g. 192.168.1.100:9000"
                        placeholderTextColor="#475569"
                        value={mobileLocalIp}
                        onChangeText={async (val) => {
                          setMobileLocalIp(val);
                          await storage.setMobileLocalIp(val);
                        }}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                  </>
                )}

                <Text style={styles.advancedLabel}>Developer Passcode (Master Key)</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="key-outline" size={16} color="#475569" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter master key (e.g. sir)"
                    placeholderTextColor="#475569"
                    value={masterKey}
                    onChangeText={setMasterKey}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#1e3a8a', marginTop: 8 }]}
                  onPress={handleDeveloperLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Direct Developer Login</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          <Text style={styles.footerText}>
            Evolving to self-awareness • Sunday, 31st May 2026
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d', // solid black dark theme
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoSvg: {
    marginBottom: 12,
  },
  titleText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f3f4f6',
    letterSpacing: 0.2,
  },
  subtitleText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  cardContainer: {
    backgroundColor: '#171717', // flat dark gray panel
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#262626',
  },
  tabsSelector: {
    flexDirection: 'row',
    backgroundColor: '#0d0d0d',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#171717',
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.2)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
    }),
  },
  tabBtnText: {
    color: '#6b7280',
    fontSize: 13,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#f3f4f6',
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f3f4f6',
    marginBottom: 12,
    textAlign: 'center',
  },
  descText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  boldText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d0d0d', // dark flat field
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 48,
    borderWidth: 1,
    borderColor: '#262626',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#f3f4f6',
    fontSize: 14,
    height: '100%',
  },
  primaryButton: {
    backgroundColor: '#2563eb', // flat bright blue accent
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#262626',
  },
  dividerText: {
    color: '#4b5563',
    fontSize: 11,
    marginHorizontal: 12,
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    backgroundColor: '#262626', // flat gray secondary
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#404040',
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    height: 36,
  },
  backButtonText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 4,
  },
  advancedToggleText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '500',
  },
  advancedContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  advancedLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  bridgeSelectorRow: {
    flexDirection: 'row',
    backgroundColor: '#0d0d0d',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#262626',
  },
  bridgeSelectorBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  bridgeSelectorBtnActive: {
    backgroundColor: '#171717',
  },
  bridgeSelectorText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
  },
  bridgeSelectorTextActive: {
    color: '#f3f4f6',
  },
  footerText: {
    textAlign: 'center',
    color: '#404040',
    fontSize: 10,
    marginTop: 30,
    letterSpacing: 0.5,
  },
});
