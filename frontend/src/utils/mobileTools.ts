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
  try { return require('expo-media-library'); } catch { return null; }
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
          Speech.speak(args.text, {
            language: args.language || 'en',
            pitch: args.pitch || 1.0,
            rate: args.rate || 1.0,
          });
          return { status: 'success' };
        } catch (e) {
          console.log('[MobileTools] Speech synthesis failed, Sir.', e);
        }
      }
      return { status: 'mock_success', text: args.text };
    }

    default:
      throw new Error(`Tool '${name}' is not supported or not implemented, Sir.`);
  }
};
