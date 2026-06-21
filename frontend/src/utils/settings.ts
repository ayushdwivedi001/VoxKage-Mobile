import { storage, SettingsProfile } from './storage';

let currentProfile: SettingsProfile = {
  honorific: 'Sir',
  personality_tone: 'Polite',
  custom_profile_data: '',
};

// Listeners list to notify components of changes
const listeners = new Set<() => void>();

export const settingsManager = {
  async initialize(): Promise<SettingsProfile> {
    const stored = await storage.getSettingsProfile();
    if (stored) {
      currentProfile = stored;
    }
    return currentProfile;
  },

  getProfile(): SettingsProfile {
    return currentProfile;
  },

  async updateProfile(profile: SettingsProfile): Promise<void> {
    currentProfile = profile;
    await storage.setSettingsProfile(profile);
    // Notify all listeners
    listeners.forEach((l) => l());
  },

  getHonorific(): string {
    const h = currentProfile.honorific;
    if (h === 'None') {
      return currentProfile.user_name || 'User';
    }
    if (h === 'Custom' && currentProfile.custom_honorific) {
      return currentProfile.custom_honorific;
    }
    return h || 'Sir';
  },

  replaceSir(text: string): string {
    if (!text) return text;
    const honorific = this.getHonorific();
    
    // Replace whole word "Sir" and "sir"
    // Using RegExp with boundaries \b to avoid replacing words like "siren", "desire", etc.
    const sirPattern = /\bSir\b/g;
    const sirLowerPattern = /\bsir\b/g;
    
    return text
      .replace(sirPattern, honorific)
      .replace(sirLowerPattern, honorific.toLowerCase());
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const replaceSir = (text: string): string => {
  return settingsManager.replaceSir(text);
};
