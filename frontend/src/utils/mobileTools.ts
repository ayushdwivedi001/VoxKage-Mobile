import { Platform, Alert } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { storage } from '@/utils/storage';

// Detect if running in Expo Go client
const isExpoGo = Constants?.executionEnvironment === ExecutionEnvironment.StoreClient;

// Dedicated Static Require Helpers to prevent Metro build/compilation errors
const getContacts = () => {
  try {
    return require('expo-contacts/legacy');
  } catch {
    try {
      return require('expo-contacts');
    } catch {
      return null;
    }
  }
};
const getCalendar = () => {
  try {
    return require('expo-calendar/legacy');
  } catch {
    try {
      return require('expo-calendar');
    } catch {
      return null;
    }
  }
};
const getNotifications = () => {
  if (isExpoGo) {
    // Avoid importing expo-notifications in Expo Go to prevent SDK 53+ crash
    return null;
  }
  try { return require('expo-notifications'); } catch { return null; }
};
const getFileSystem = () => {
  try { return require('expo-file-system'); } catch { return null; }
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
const getLocation = () => {
  try { return require('expo-location'); } catch { return null; }
};
const getBattery = () => {
  try { return require('expo-battery'); } catch { return null; }
};
const getNetwork = () => {
  try { return require('expo-network'); } catch { return null; }
};
const getDevice = () => {
  try { return require('expo-device'); } catch { return null; }
};
const getHaptics = () => {
  try { return require('expo-haptics'); } catch { return null; }
};
const getIntentLauncher = () => {
  try { return require('expo-intent-launcher'); } catch { return null; }
};
const getSharing = () => {
  try { return require('expo-sharing'); } catch { return null; }
};
const getPrint = () => {
  try { return require('expo-print'); } catch { return null; }
};
const getSMS = () => {
  try { return require('expo-sms'); } catch { return null; }
};
const getKeepAwake = () => {
  try { return require('expo-keep-awake'); } catch { return null; }
};
const getSpeech = () => {
  try { return require('expo-speech'); } catch { return null; }
};

// Configure notification behavior at load time if notifications module is available
try {
  const Notifications = getNotifications();
  if (Notifications && Notifications.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
} catch (e) {
  console.log('[MobileTools] Failed to set notification handler at top level:', e);
}

let bestVoiceId: string | undefined = undefined;

export const selectBestVoice = async (Speech: any): Promise<string | undefined> => {
  if (bestVoiceId) return bestVoiceId;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    if (!voices || voices.length === 0) return undefined;

    // Filter for English voices
    const enVoices = voices.filter((v: any) => 
      v.language && (v.language.toLowerCase().startsWith('en') || v.language.toLowerCase().includes('en'))
    );

    if (enVoices.length === 0) return undefined;

    // Scoring system to pick the best voice (prefer enhanced US English male voices)
    let bestVoice = enVoices[0];
    let maxScore = -1;

    for (const voice of enVoices) {
      let score = 0;
      const nameLower = (voice.name || '').toLowerCase();
      const idLower = (voice.identifier || '').toLowerCase();

      // Quality scoring
      if (voice.quality === 'enhanced' || voice.quality === 1) {
        score += 100;
      }

      // Accent scoring (prefer en-US for natural accent)
      if (voice.language.toLowerCase().includes('us') || voice.language.toLowerCase().includes('en-us')) {
        score += 50;
      }

      // Gender preference (JARVIS-like professional male voice preferred over robotic female)
      if (nameLower.includes('male') || nameLower.includes('guy') || nameLower.includes('jarvis') || idLower.includes('male') || idLower.includes('guy') || idLower.includes('jarvis')) {
        score += 30;
      }

      // Engine brand (Google TTS is generally higher quality than basic system offline)
      if (nameLower.includes('google') || nameLower.includes('com.google')) {
        score += 20;
      }

      if (score > maxScore) {
        maxScore = score;
        bestVoice = voice;
      }
    }

    bestVoiceId = bestVoice.identifier;
    console.log('[TTS] Selected best English voice:', bestVoice.name, '(', bestVoice.language, ')');
    return bestVoiceId;
  } catch (e) {
    console.log('[TTS] Error choosing best voice:', e);
    return undefined;
  }
};

export const cleanTextForSpeech = (text: string): string => {
  if (!text) return '';
  
  let cleaned = text;
  
  // 1. Remove code blocks entirely (instead of saying "[code block omitted]")
  cleaned = cleaned.replace(/```[\s\S]*?```/g, ' ');
  
  // 2. Remove inline code snippets (e.g. `const x = 5`)
  cleaned = cleaned.replace(/`[^`]+`/g, ' ');
  
  // 3. Keep only the text of markdown links: [Link Text](http://...) -> Link Text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  // 4. Remove custom markup tags (e.g., <LinkCard />, <ButtonRow />)
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');
  
  // 5. Remove standard URLs and deep links (e.g., https://google.com, tg://resolve, vnd.youtube://)
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, ' ');
  cleaned = cleaned.replace(/[a-zA-Z0-9_-]+:\/\/\S+/gi, ' ');
  
  // 6. Remove standard emojis and pictographs
  cleaned = cleaned.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDC00-\uDFFF]/g, '');
  
  // 7. Remove raw formatting symbols and technical punctuation (keeping sentence-level punctuation like . , ? !)
  cleaned = cleaned.replace(/[*#_~`\\|{}[\]()\-+]/g, ' ');
  
  // 8. Remove any remaining isolated URI characters like :// or isolated colons/slashes
  cleaned = cleaned.replace(/:\/+/g, ' ');
  
  // 9. Normalize spacing
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
};

export const executeMobileTool = async (name: string, args: any): Promise<any> => {
  console.log(`[MobileTool] Executing: ${name}`, args);

  switch (name) {
    // 1. Contacts
    case 'mobile_get_contacts': {
      const Contacts = getContacts();
      if (Contacts) {
        try {
          const { status } = await Contacts.requestPermissionsAsync();
          if (status === 'granted') {
            const { data } = await Contacts.getContactsAsync({
              fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
              name: args.query || undefined,
              pageSize: args.limit || 50,
            });
            return data;
          }
        } catch (e) {
          console.log('[MobileTools] Native Contacts failed, falling back to sandbox, Sir.', e);
        }
      }
      
      // Sandbox fallback database
      const list = await storage.getContacts();
      if (args.query) {
        const queryLower = args.query.toLowerCase();
        return list.filter((c: any) => 
          (c.firstName && c.firstName.toLowerCase().includes(queryLower)) ||
          (c.lastName && c.lastName.toLowerCase().includes(queryLower))
        );
      }
      return list.slice(0, args.limit || 50);
    }

    case 'mobile_create_contact': {
      const Contacts = getContacts();
      let createdNatively = false;
      let contactId = 'sandbox-' + Date.now();

      const newContact = {
        firstName: args.firstName,
        lastName: args.lastName || '',
        phoneNumbers: args.phone ? [{ label: 'mobile', number: args.phone }] : [],
        emails: args.email ? [{ label: 'work', email: args.email }] : [],
      };

      if (Contacts) {
        try {
          const { status } = await Contacts.requestPermissionsAsync();
          if (status === 'granted') {
            const nativeContact = {
              firstName: args.firstName,
              lastName: args.lastName || '',
              phoneNumbers: args.phone ? [{ label: 'mobile', number: args.phone }] : [],
              emails: args.email ? [{ label: 'work', email: args.email }] : [],
            };
            contactId = await Contacts.addContactAsync(nativeContact);
            createdNatively = true;
          }
        } catch (e) {
          console.log('[MobileTools] Native Create Contact failed, falling back to sandbox, Sir.', e);
        }
      }

      // Always save to sandbox database to guarantee local retrieval
      const list = await storage.getContacts();
      const contactRecord = {
        id: contactId,
        ...newContact,
      };
      list.push(contactRecord);
      await storage.setContacts(list);

      return { status: 'success', contactId, createdNatively };
    }

    // 2. Calendar
    case 'mobile_get_calendar_events': {
      const Calendar = getCalendar();
      if (Calendar) {
        try {
          const { status } = await Calendar.requestCalendarPermissionsAsync();
          if (status === 'granted') {
            const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            const calendarIds = calendars.map((cal: any) => cal.id);
            const startDate = args.startDate ? new Date(args.startDate) : new Date();
            const endDate = args.endDate ? new Date(args.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            
            const events = await Calendar.getEventsAsync(calendarIds, startDate, endDate);
            return events.map((ev: any) => ({
              id: ev.id,
              title: ev.title,
              startDate: ev.startDate,
              endDate: ev.endDate,
              location: ev.location,
              notes: ev.notes,
            }));
          }
        } catch (e) {
          console.log('[MobileTools] Native Calendar failed, falling back to sandbox, Sir.', e);
        }
      }
      
      // Sandbox fallback database
      const events = await storage.getCalendarEvents();
      const filterStart = args.startDate ? new Date(args.startDate).getTime() : 0;
      const filterEnd = args.endDate ? new Date(args.endDate).getTime() : Date.now() + 30 * 24 * 60 * 60 * 1000;
      return events.filter((e: any) => {
        const est = new Date(e.startDate).getTime();
        return est >= filterStart && est <= filterEnd;
      });
    }

    case 'mobile_create_calendar_event': {
      const Calendar = getCalendar();
      let createdNatively = false;
      let eventId = 'sandbox-' + Date.now();

      const newEvent = {
        title: args.title,
        startDate: args.startDate,
        endDate: args.endDate,
        location: args.location || '',
        notes: args.notes || '',
      };

      if (Calendar) {
        try {
          const { status } = await Calendar.requestCalendarPermissionsAsync();
          if (status === 'granted') {
            const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
            const targetCal = calendars.find((cal: any) => cal.allowsModifications) || calendars[0];
            if (targetCal) {
              const eventDetails = {
                title: args.title,
                startDate: new Date(args.startDate),
                endDate: new Date(args.endDate),
                location: args.location || '',
                notes: args.notes || '',
                timeZone: 'UTC',
              };
              eventId = await Calendar.createEventAsync(targetCal.id, eventDetails);
              createdNatively = true;
            }
          }
        } catch (e) {
          console.log('[MobileTools] Native Create Calendar Event failed, falling back to sandbox, Sir.', e);
        }
      }

      // Always save to sandbox database to guarantee local retrieval
      const list = await storage.getCalendarEvents();
      const eventRecord = {
        id: eventId,
        ...newEvent,
      };
      list.push(eventRecord);
      await storage.setCalendarEvents(list);

      return { status: 'success', eventId, createdNatively };
    }

    // 3. Notifications
    case 'mobile_show_notification': {
      const Notifications = getNotifications();
      if (Notifications) {
        try {
          const { status } = await Notifications.requestPermissionsAsync();
          if (status === 'granted') {
            const trigger = args.delaySeconds ? { type: 'timeInterval', seconds: args.delaySeconds } : null;
            const id = await Notifications.scheduleNotificationAsync({
              content: {
                title: args.title,
                body: args.body,
                sound: true,
              },
              trigger,
            });
            return { status: 'success', notificationId: id, method: 'native' };
          }
        } catch (e) {
          console.log('[MobileTools] Native Notifications failed, falling back, Sir.', e);
        }
      }
      
      // Sandbox/Alert Fallback: Trigger Alert banner directly
      const delay = args.delaySeconds ? args.delaySeconds * 1000 : 0;
      if (delay > 0) {
        setTimeout(() => {
          Alert.alert(args.title, args.body);
        }, delay);
      } else {
        Alert.alert(args.title, args.body);
      }
      return { status: 'success', notificationId: 'sandbox-' + Date.now(), method: 'alert' };
    }

    // 4. File System
    case 'mobile_write_file': {
      const FileSystem = getFileSystem();
      if (!FileSystem) {
        throw new Error('FileSystem is not available in this environment, Sir.');
      }
      const docDir = FileSystem.documentDirectory;
      if (!docDir) {
        throw new Error('documentDirectory is not available on this platform, Sir.');
      }
      const dir = docDir + (args.directory ? args.directory.replace(/^\/+/, '') : '');
      const path = `${dir}/${args.filename}`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      await FileSystem.writeAsStringAsync(path, args.content, { encoding: FileSystem.EncodingType.UTF8 });
      return { status: 'success', path };
    }

    case 'mobile_read_file': {
      const FileSystem = getFileSystem();
      if (!FileSystem) {
        throw new Error('FileSystem is not available in this environment, Sir.');
      }
      const docDir = FileSystem.documentDirectory;
      if (!docDir) {
        throw new Error('documentDirectory is not available on this platform, Sir.');
      }
      const path = `${docDir}/${args.filename}`;
      const content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
      return { content };
    }

    // 5. Media Library
    case 'mobile_get_media_library': {
      const MediaLibrary = getMediaLibrary();
      if (MediaLibrary) {
        try {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === 'granted') {
            const assets = await MediaLibrary.getAssetsAsync({
              first: args.limit || 10,
              sortBy: ['creationTime'] as any,
              mediaType: ['photo'] as any,
            });
            return assets.assets.map((asset: any) => ({
              id: asset.id,
              filename: asset.filename,
              uri: asset.uri,
              width: asset.width,
              height: asset.height,
              creationTime: asset.creationTime,
            }));
          }
        } catch (e) {
          console.log('[MobileTools] Native MediaLibrary failed, falling back to sandbox mock, Sir.', e);
        }
      }
      // Sandbox fallback: Return mock assets
      return [
        {
          id: 'mock-1',
          filename: 'camera_mock_shot.jpg',
          uri: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=300&q=80',
          width: 300,
          height: 300,
          creationTime: Date.now(),
        }
      ];
    }

    // 6. Location
    case 'mobile_get_location': {
      const Location = getLocation();
      if (Location) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const location = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy ? Location.Accuracy.Balanced : 3,
            });
            return {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy,
              timestamp: location.timestamp,
            };
          }
        } catch (e) {
          console.log('[MobileTools] Native Location failed, falling back to sandbox default, Sir.', e);
        }
      }
      // Sandbox default location (Delhi, India)
      return {
        latitude: 28.6139,
        longitude: 77.2090,
        accuracy: 100,
        timestamp: Date.now(),
        isMock: true,
      };
    }

    // 7. Battery, Network, Device Stats
    case 'mobile_get_device_stats': {
      const Battery = getBattery();
      const Network = getNetwork();
      const Device = getDevice();

      let batteryLevel = 0.99;
      let batteryState = 'Charging';
      let isConnected = true;
      let networkType = 'WIFI';
      let isInternetReachable = true;

      if (Battery) {
        try {
          batteryLevel = await Battery.getBatteryLevelAsync();
          const state = await Battery.getBatteryStateAsync();
          const batteryStatesMap: Record<any, string> = {
            [Battery.BatteryState.UNKNOWN || 0]: 'Unknown',
            [Battery.BatteryState.UNPLUGGED || 1]: 'Unplugged',
            [Battery.BatteryState.CHARGING || 2]: 'Charging',
            [Battery.BatteryState.FULL || 3]: 'Full',
          };
          batteryState = batteryStatesMap[state] || 'Charging';
        } catch (e) {
          console.log('[MobileTools] Battery state API failed, Sir.', e);
        }
      }

      if (Network) {
        try {
          const networkState = await Network.getNetworkStateAsync();
          isConnected = networkState.isConnected ?? true;
          networkType = networkState.type ?? 'WIFI';
          isInternetReachable = networkState.isInternetReachable ?? true;
        } catch (e) {
          console.log('[MobileTools] Network state API failed, Sir.', e);
        }
      }

      return {
        battery: {
          level: Math.round(batteryLevel * 100),
          state: batteryState,
        },
        network: {
          connected: isConnected,
          type: networkType,
          isInternetReachable,
        },
        device: {
          brand: Device?.brand || 'Smartphone Device',
          modelName: Device?.modelName || 'Expo Sandbox Client',
          osName: Device?.osName || (Platform.OS === 'ios' ? 'iOS' : 'Android'),
          osVersion: Device?.osVersion || '16.0',
          deviceName: Device?.deviceName || 'Ayush Phone',
          isDevice: Device?.isDevice ?? true,
        },
      };
    }

    // 8. Haptics
    case 'mobile_trigger_haptic': {
      const Haptics = getHaptics();
      if (Haptics) {
        try {
          const style = args.style || 'medium';
          if (style === 'light' && Haptics.ImpactFeedbackStyle) {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } else if (style === 'heavy' && Haptics.ImpactFeedbackStyle) {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          } else if (style === 'success' && Haptics.NotificationFeedbackType) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } else if (style === 'warning' && Haptics.NotificationFeedbackType) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } else if (style === 'error' && Haptics.NotificationFeedbackType) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          } else if (Haptics.ImpactFeedbackStyle) {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }
        } catch (e) {
          console.log('[MobileTools] Haptics trigger failed, Sir.', e);
        }
      }
      return { status: 'success' };
    }

    // 9. Intent Launcher
    case 'mobile_launch_intent': {
      if (Platform.OS === 'android') {
        const IntentLauncher = getIntentLauncher();
        if (IntentLauncher) {
          try {
            const actionMap: Record<string, string> = {
              settings: 'android.settings.SETTINGS',
              wifi: 'android.settings.WIFI_SETTINGS',
              location: 'android.settings.LOCATION_SOURCE_SETTINGS',
            };
            const action = actionMap[args.action] || args.action;
            await IntentLauncher.startActivityAsync(action, {
              data: args.data,
            });
            return { status: 'success' };
          } catch (e) {
            console.log('[MobileTools] Native Intent Launcher failed, Sir.', e);
          }
        }
      }
      throw new Error('Intent launching is only supported natively on Android, Sir.');
    }

    case 'mobile_open_url': {
      const url = args.url;
      if (!url) throw new Error('No URL provided, Sir.');
      const Linking = require('react-native').Linking;
      try {
        const supported = await Linking.canOpenURL(url);
        if (supported) {
          await Linking.openURL(url);
          return { status: 'success' };
        } else {
          // Force try opening it anyway as some deep links might fail canOpenURL checks without configuration
          await Linking.openURL(url);
          return { status: 'forced_success' };
        }
      } catch (e) {
        console.log('[MobileTools] Failed to open URL:', url, e);
        // Direct fallback attempt
        await Linking.openURL(url);
        return { status: 'fallback_success' };
      }
    }

    // 10. Sharing
    case 'mobile_share_file': {
      const Sharing = getSharing();
      if (Sharing) {
        try {
          const isAvailable = await Sharing.isAvailableAsync();
          if (isAvailable) {
            await Sharing.shareAsync(args.uri, {
              dialogTitle: args.title || 'Share File',
              mimeType: args.mimeType,
            });
            return { status: 'success' };
          }
        } catch (e) {
          console.log('[MobileTools] Sharing failed, Sir.', e);
        }
      }
      throw new Error('Sharing is not available on this platform/client, Sir.');
    }

    // 11. Print PDF
    case 'mobile_print_pdf': {
      const Print = getPrint();
      if (Print) {
        try {
          const { uri } = await Print.printToFileAsync({ html: args.html });
          if (args.printDirectly) {
            await Print.printAsync({ uri });
          }
          return { status: 'success', pdfUri: uri };
        } catch (e) {
          console.log('[MobileTools] Print failed, Sir.', e);
        }
      }
      throw new Error('PDF Printing module is not available in this client, Sir.');
    }

    // 12. SMS
    case 'mobile_send_sms': {
      const SMS = getSMS();
      if (SMS) {
        try {
          const isAvailable = await SMS.isAvailableAsync();
          if (isAvailable) {
            const { result } = await SMS.sendSMSAsync(args.recipients, args.message);
            return { status: result };
          }
        } catch (e) {
          console.log('[MobileTools] SMS failed, Sir.', e);
        }
      }
      throw new Error('SMS service is not available on this device, Sir.');
    }

    // 13. Screen Keep Awake
    case 'mobile_set_screen_keep_awake': {
      const KeepAwake = getKeepAwake();
      if (KeepAwake) {
        try {
          if (args.enable) {
            if (KeepAwake.activateKeepAwake) {
              KeepAwake.activateKeepAwake();
            } else if (KeepAwake.activateKeepAwakeAsync) {
              await KeepAwake.activateKeepAwakeAsync();
            }
          } else {
            if (KeepAwake.deactivateKeepAwake) {
              KeepAwake.deactivateKeepAwake();
            } else if (KeepAwake.deactivateKeepAwakeAsync) {
              await KeepAwake.deactivateKeepAwakeAsync();
            }
          }
        } catch (e) {
          console.log('[MobileTools] KeepAwake failed, Sir.', e);
        }
      }
      return { status: 'success', keepAwake: args.enable };
    }

    // 14. Text-To-Speech (expo-speech)
    case 'mobile_speak_text': {
      const Speech = getSpeech();
      if (Speech) {
        try {
          await Speech.stop();
          const cleanedText = cleanTextForSpeech(args.text);
          const voiceId = await selectBestVoice(Speech);
          Speech.speak(cleanedText, {
            language: args.language || 'en',
            voice: voiceId,
            pitch: args.pitch || 1.0,
            rate: args.rate || 0.95, // 0.95 for premium natural pacing
          });
          return { status: 'success' };
        } catch (e) {
          console.log('[MobileTools] Speech synthesis failed, Sir.', e);
        }
      }
      return { status: 'mock_success', text: args.text };
    }

    // 15. Web Search, Fetch and Image Search Proxy Routing
    case 'web_search':
    case 'web_search_deep': {
      const query = args.query || '';
      try {
        const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        const html = await response.text();
        const results: any[] = [];
        const resultBlockRegex = /<div class="result results_links results_links_deep web-result[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
        let match;
        while ((match = resultBlockRegex.exec(html)) !== null) {
          const block = match[1];
          const urlMatch = block.match(/<a class="result__url" href="([^"]+)"/);
          const titleMatch = block.match(/<a class="result__snippet" href="[^"]+">([\s\S]*?)<\/a>/);
          const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
          
          if (urlMatch) {
            let url = urlMatch[1];
            if (url.includes('uddg=')) {
              const uddgPart = url.split('uddg=')[1]?.split('&')[0];
              if (uddgPart) {
                url = decodeURIComponent(uddgPart);
              }
            }
            if (url.startsWith('//')) {
              url = 'https:' + url;
            }
            const cleanText = (str: string) => str.replace(/<[^>]*>/g, '').trim();
            const title = titleMatch ? cleanText(titleMatch[1]) : 'Search Result';
            const snippet = snippetMatch ? cleanText(snippetMatch[1]) : '';
            results.push({ title, url, snippet });
          }
        }
        const limit = args.limit || 8;
        return results.slice(0, limit);
      } catch (err: any) {
        return [{ error: `Mobile web search failed: ${err.message}` }];
      }
    }

    case 'web_fetch': {
      const url = args.url || '';
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        const html = await response.text();
        let content = html;
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
          content = bodyMatch[1];
        }
        content = content.replace(/<(script|style|nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, '');
        content = content.replace(/<[^>]*>/g, ' ');
        content = content.replace(/\s+/g, ' ').trim();
        if (content.length > 30000) {
          content = content.slice(0, 30000) + "\n\n...[Content truncated due to size limits]...";
        }
        return {
          url,
          status: response.status,
          content
        };
      } catch (err: any) {
        return { url, error: `Mobile fetch failed: ${err.message}` };
      }
    }

    case 'web_search_parallel': {
      const queries: string[] = args.queries || [];
      const tasks = queries.map(q => executeMobileTool('web_search', { query: q }));
      return Promise.all(tasks);
    }

    case 'web_fetch_parallel': {
      const urls: string[] = args.urls || [];
      const tasks = urls.map(u => executeMobileTool('web_fetch', { url: u }));
      return Promise.all(tasks);
    }

    case 'fetch_images_for_query': {
      const query = args.query || '';
      const limit = args.limit || 5;
      try {
        const response = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const data = await response.json();
        const searchResults = data?.query?.search || [];
        const urls: string[] = [];
        
        if (searchResults.length > 0) {
          const titles = searchResults.slice(0, limit).map((s: any) => s.title);
          for (const title of titles) {
            const imgRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(title)}&piprop=original&format=json`);
            const imgData = await imgRes.json();
            const pages = imgData?.query?.pages || {};
            for (const key in pages) {
              const src = pages[key]?.original?.source;
              if (src) urls.push(src);
            }
          }
        }
        
        // Bing Fallback
        if (urls.length < limit) {
          const bingRes = await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
          });
          const html = await bingRes.text();
          const matches = [...html.matchAll(/&quot;murl&quot;:&quot;(http[^&]+)&quot;/g)];
          for (const match of matches) {
            const murl = match[1];
            if (murl && !urls.includes(murl)) {
              urls.push(murl);
              if (urls.length >= limit) break;
            }
          }
        }
        
        if (urls.length === 0) {
          return "Error: No authentic images found, Sir.";
        }
        return urls.slice(0, limit).join(',');
      } catch (err: any) {
        return `Error fetching images: ${err.message}`;
      }
    }

    default:
      throw new Error(`Tool '${name}' is not supported or not implemented, Sir.`);
  }
};
