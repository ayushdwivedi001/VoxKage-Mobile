import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BACKEND_URL_KEY = 'voxkage_backend_url';
const TOKEN_KEY = 'voxkage_token';
const EMAIL_KEY = 'voxkage_email';
const FAVORITES_KEY = 'voxkage_favorite_models';
const SETTINGS_PROFILE_KEY = 'voxkage_settings_profile';
const OPENCODE_API_KEY_KEY = 'voxkage_opencode_api_key';

export const DEFAULT_BACKEND_URL = 'https://shinayush-voxkage-mobile-backend.hf.space';

export const storage = {
  async getBackendUrl(): Promise<string> {
    try {
      let url = '';
      if (Platform.OS === 'web') {
        url = localStorage.getItem(BACKEND_URL_KEY) || '';
      } else {
        url = await SecureStore.getItemAsync(BACKEND_URL_KEY) || '';
      }
      url = url.trim();
      if (url.startsWith('http://') && url.includes('.hf.space')) {
        url = url.replace('http://', 'https://');
      }
      return url || DEFAULT_BACKEND_URL;
    } catch {
      return DEFAULT_BACKEND_URL;
    }
  },

  async setBackendUrl(url: string): Promise<void> {
    try {
      let cleaned = url.trim().replace(/\/$/, '');
      if (cleaned.startsWith('http://') && cleaned.includes('.hf.space')) {
        cleaned = cleaned.replace('http://', 'https://');
      }
      if (Platform.OS === 'web') {
        localStorage.setItem(BACKEND_URL_KEY, cleaned);
      } else {
        await SecureStore.setItemAsync(BACKEND_URL_KEY, cleaned);
      }
    } catch (e) {
      console.error('Error saving backend URL', e);
    }
  },

  async getToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(TOKEN_KEY);
      } else {
        return await SecureStore.getItemAsync(TOKEN_KEY);
      }
    } catch {
      return null;
    }
  },

  async setToken(token: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      }
    } catch (e) {
      console.error('Error saving token', e);
    }
  },

  async getEmail(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(EMAIL_KEY);
      } else {
        return await SecureStore.getItemAsync(EMAIL_KEY);
      }
    } catch {
      return null;
    }
  },

  async setEmail(email: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(EMAIL_KEY, email);
      } else {
        await SecureStore.setItemAsync(EMAIL_KEY, email);
      }
    } catch (e) {
      console.error('Error saving email', e);
    }
  },

  async clearAuth(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(EMAIL_KEY);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        await SecureStore.deleteItemAsync(EMAIL_KEY);
      }
    } catch (e) {
      console.error('Error clearing auth storage', e);
    }
  },

  async getFavoriteModels(): Promise<string[]> {
    try {
      let data = '';
      if (Platform.OS === 'web') {
        data = localStorage.getItem(FAVORITES_KEY) || '[]';
      } else {
        data = await SecureStore.getItemAsync(FAVORITES_KEY) || '[]';
      }
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  async setFavoriteModels(favorites: string[]): Promise<void> {
    try {
      const data = JSON.stringify(favorites);
      if (Platform.OS === 'web') {
        localStorage.setItem(FAVORITES_KEY, data);
      } else {
        await SecureStore.setItemAsync(FAVORITES_KEY, data);
      }
    } catch (e) {
      console.error('Error saving favorite models', e);
    }
  },

  async getContacts(): Promise<any[]> {
    try {
      let data = '';
      if (Platform.OS === 'web') {
        data = localStorage.getItem('voxkage_contacts_db') || '[]';
      } else {
        data = await SecureStore.getItemAsync('voxkage_contacts_db') || '[]';
      }
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  async setContacts(contacts: any[]): Promise<void> {
    try {
      const data = JSON.stringify(contacts);
      if (Platform.OS === 'web') {
        localStorage.setItem('voxkage_contacts_db', data);
      } else {
        await SecureStore.setItemAsync('voxkage_contacts_db', data);
      }
    } catch (e) {
      console.error('Error saving sandbox contacts', e);
    }
  },

  async getCalendarEvents(): Promise<any[]> {
    try {
      let data = '';
      if (Platform.OS === 'web') {
        data = localStorage.getItem('voxkage_calendar_db') || '[]';
      } else {
        data = await SecureStore.getItemAsync('voxkage_calendar_db') || '[]';
      }
      return JSON.parse(data);
    } catch {
      return [];
    }
  },

  async setCalendarEvents(events: any[]): Promise<void> {
    try {
      const data = JSON.stringify(events);
      if (Platform.OS === 'web') {
        localStorage.setItem('voxkage_calendar_db', data);
      } else {
        await SecureStore.setItemAsync('voxkage_calendar_db', data);
      }
    } catch (e) {
      console.error('Error saving sandbox calendar events', e);
    }
  },

  async getBridgeMode(): Promise<'laptop' | 'mobile_local'> {
    try {
      let mode = '';
      if (Platform.OS === 'web') {
        mode = localStorage.getItem('voxkage_bridge_mode') || '';
      } else {
        mode = await SecureStore.getItemAsync('voxkage_bridge_mode') || '';
      }
      if (mode === 'laptop' || mode === 'mobile_local') {
        return mode;
      }
      return Platform.OS !== 'web' ? 'mobile_local' : 'laptop';
    } catch {
      return Platform.OS !== 'web' ? 'mobile_local' : 'laptop';
    }
  },

  async setBridgeMode(mode: 'laptop' | 'mobile_local'): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem('voxkage_bridge_mode', mode);
      } else {
        await SecureStore.setItemAsync('voxkage_bridge_mode', mode);
      }
    } catch (e) {
      console.error('Error saving bridge mode', e);
    }
  },

  async getMobileLocalIp(): Promise<string> {
    try {
      let ip = '';
      if (Platform.OS === 'web') {
        ip = localStorage.getItem('voxkage_mobile_local_ip') || '';
      } else {
        ip = await SecureStore.getItemAsync('voxkage_mobile_local_ip') || '';
      }
      return ip;
    } catch {
      return '';
    }
  },

  async setMobileLocalIp(ip: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem('voxkage_mobile_local_ip', ip.trim());
      } else {
        await SecureStore.setItemAsync('voxkage_mobile_local_ip', ip.trim());
      }
    } catch (e) {
      console.error('Error saving mobile local IP', e);
    }
  },

  async getSettingsProfile(): Promise<SettingsProfile | null> {
    try {
      let data = '';
      if (Platform.OS === 'web') {
        data = localStorage.getItem(SETTINGS_PROFILE_KEY) || '';
      } else {
        data = await SecureStore.getItemAsync(SETTINGS_PROFILE_KEY) || '';
      }
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  async setSettingsProfile(profile: SettingsProfile): Promise<void> {
    try {
      const data = JSON.stringify(profile);
      if (Platform.OS === 'web') {
        localStorage.setItem(SETTINGS_PROFILE_KEY, data);
      } else {
        await SecureStore.setItemAsync(SETTINGS_PROFILE_KEY, data);
      }
    } catch (e) {
      console.error('Error saving settings profile', e);
    }
  },

  async getOpenCodeApiKey(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(OPENCODE_API_KEY_KEY);
      } else {
        return await SecureStore.getItemAsync(OPENCODE_API_KEY_KEY);
      }
    } catch {
      return null;
    }
  },

  async setOpenCodeApiKey(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(OPENCODE_API_KEY_KEY, key);
      } else {
        await SecureStore.setItemAsync(OPENCODE_API_KEY_KEY, key);
      }
    } catch (e) {
      console.error('Error saving OpenCode API key', e);
    }
  }
};

export interface SettingsProfile {
  honorific: 'Sir' | 'Mam' | 'Boss' | 'Comrade' | 'Commander' | 'Agent' | 'Custom' | 'None';
  custom_honorific?: string;
  user_name?: string;
  personality_tone: 'Polite' | 'Casual' | 'Stern' | 'Judgy' | 'Companion';
  custom_profile_data?: string;
}


