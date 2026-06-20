import { storage } from './storage';
import Constants from 'expo-constants';

const BACKGROUND_FETCH_TASK = 'BACKGROUND_FETCH_HEARTBEAT';

let BackgroundFetch: any = null;
let TaskManager: any = null;

try {
  BackgroundFetch = require('expo-background-fetch');
} catch (e) {
  console.log('[Background Worker] expo-background-fetch is not available, Sir. Using sandbox/mock fallback.');
}

try {
  TaskManager = require('expo-task-manager');
} catch (e) {
  console.log('[Background Worker] expo-task-manager is not available, Sir. Using sandbox/mock fallback.');
}

// Define the background task if TaskManager and BackgroundFetch are available
if (TaskManager && BackgroundFetch) {
  try {
    TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
      const now = new Date();
      console.log(`[Background Worker] Heartbeat running at: ${now.toLocaleString()}`);

      try {
        const token = await storage.getToken();
        const backendUrl = await storage.getBackendUrl();

        if (token && backendUrl && !token.startsWith('mock-')) {
          // Perform a lightweight ping to verify connection/health
          const response = await fetch(`${backendUrl.trim().replace(/\/$/, '')}/health`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            console.log('[Background Worker] Successfully pinged VoxKage Cloud Server.');
          } else {
            console.log('[Background Worker] Cloud Server ping returned non-200 status.');
          }
        }
      } catch (err: any) {
        console.log('[Background Worker] Error executing background task:', err.message || err);
      }

      return BackgroundFetch.BackgroundFetchResult.NewData;
    });
  } catch (err) {
    console.log('[Background Worker] Failed to define background task:', err);
  }
}

// Register background task
export const registerBackgroundTasks = async () => {
  // Prevent registration in Expo Go to suppress deprecation/unsupported console warnings
  const isExpoGo = Constants?.appOwnership === 'expo';
  if (isExpoGo) {
    console.log('[Background Worker] Running inside Expo Go sandbox, Sir. Skipping background task registration.');
    return;
  }

  if (!TaskManager || !BackgroundFetch) {
    console.log('[Background Worker] Background Fetch or Task Manager is not available. Skipping task registration, Sir.');
    return;
  }

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 15 * 60, // 15 minutes (OS minimum requirement)
        stopOnTerminate: false, // Continue executing after app is closed
        startOnBoot: true,      // Start task when phone is rebooted
      });
      console.log(`[Background Worker] Registered: ${BACKGROUND_FETCH_TASK}`);
    } else {
      console.log(`[Background Worker] Already registered: ${BACKGROUND_FETCH_TASK}`);
    }
  } catch (err) {
    console.log('[Background Worker] Failed to register background task:', err);
  }
};
