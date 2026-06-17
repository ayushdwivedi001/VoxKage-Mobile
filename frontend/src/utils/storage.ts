import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const BACKEND_URL_KEY = 'voxkage_backend_url';
const TOKEN_KEY = 'voxkage_token';
const EMAIL_KEY = 'voxkage_email';

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
      return url || DEFAULT_BACKEND_URL;
    } catch (e) {
      return DEFAULT_BACKEND_URL;
    }
  },

  async setBackendUrl(url: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(BACKEND_URL_KEY, url);
      } else {
        await SecureStore.setItemAsync(BACKEND_URL_KEY, url);
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
    } catch (e) {
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
    } catch (e) {
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
  }
};
