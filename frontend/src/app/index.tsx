import React, { useState, useEffect, useRef } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Animated,
  Platform,
  Alert,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '@/utils/storage';

// Import refactored components & styles
import { styles, drawerWidth } from '@/components/chat/styles';
import { DeleteConfirmModal } from '@/components/chat/DeleteConfirmModal';
import { ModelSelectionModal } from '@/components/chat/ModelSelectionModal';
import { WelcomeGreeting } from '@/components/chat/WelcomeGreeting';
import { ChatFeed } from '@/components/chat/ChatFeed';
import { ChatInput } from '@/components/chat/ChatInput';
import { SidebarDrawer } from '@/components/chat/SidebarDrawer';
import { PlaygroundDrawer } from '@/components/chat/PlaygroundDrawer';
import { registerBackgroundTasks } from '@/utils/backgroundWorker';
import { VoiceWaveVisualizer } from '@/components/chat/VoiceWaveVisualizer';
import { SettingsModal } from '@/components/chat/SettingsModal';
import { settingsManager, replaceSir } from '@/utils/settings';

// Modular Sub-Components
import { FluidBackground } from '@/components/chat/FluidBackground';
import { BtwOverlay } from '@/components/chat/BtwOverlay';
import { ThinkingLogsModal } from '@/components/chat/ThinkingLogsModal';
import { SourcesModal } from '@/components/chat/SourcesModal';
import { StickySvgPathing } from '@/components/chat/StickySvgPathing';

// Modular Hooks
import { useChatSessions } from '@/hooks/useChatSessions';
import { usePlayground } from '@/hooks/usePlayground';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useVoiceLoop } from '@/hooks/useVoiceLoop';
import { useMediaPickers } from '@/hooks/useMediaPickers';

const performUpload = async (
  url: string,
  uri: string,
  name: string,
  mimeType: string,
  token: string,
  model?: string
): Promise<any> => {
  if (Platform.OS === 'web') {
    const blobRes = await fetch(uri);
    const blob = await blobRes.blob();
    const formData = new FormData();
    formData.append('file', blob, name);
    if (model) {
      formData.append('model', model);
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: formData,
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || `Upload failed with status ${response.status}`);
    }
    return response.json();
  } else {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            resolve({ status: 'success', raw: xhr.responseText });
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.detail || `Upload failed with status ${xhr.status}, Sir.`));
          } catch (e) {
            reject(new Error(`Upload failed with status ${xhr.status}, Sir.`));
          }
        }
      };
      
      xhr.onerror = () => {
        reject(new Error('Network request failed'));
      };
      
      const formData = new FormData();
      formData.append('file', {
        uri: uri,
        name: name,
        type: mimeType,
      } as any);
      if (model) {
        formData.append('model', model);
      }
      
      xhr.send(formData);
    });
  }
};

const COMMANDS = [
  { name: '/compact', desc: 'Compress active chat history.' },
  { name: '/btw', desc: 'Ask a quick stateless side-question.' },
  { name: '/drill', desc: 'Initiate structured requirements scoping.' },
  { name: '/agents', desc: 'Launch a background swarm of agents for a task.' },
];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const [token, setToken] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState('');
  const [email, setEmail] = useState<string | null>(null);

  // Models & Variant State
  const [models, setModels] = useState<string[]>([
    'deepseek-v4-flash-free',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'mimo-v2.5-free',
    'claude-sonnet-4'
  ]);
  const [activeModel, setActiveModel] = useState('deepseek-v4-flash-free');
  const VARIANTS = ['Low', 'Medium', 'High', 'XHigh', 'Max'];
  const [activeVariantIndex, setActiveVariantIndex] = useState(4); // default Max
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showVariantDropdown, setShowVariantDropdown] = useState(false);
  const [showMediaPopover, setShowMediaPopover] = useState(false);

  // UI Toggles & Drawers
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);
  const [showSidebarSettings, setShowSidebarSettings] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [honorific, setHonorific] = useState('Sir');
  const [showCommandPopup, setShowCommandPopup] = useState(false);
  const [commandPopupActiveIndex, setCommandPopupActiveIndex] = useState(0);

  // Sources Bottom Sheet State
  const [isSourcesDrawerOpen, setIsSourcesDrawerOpen] = useState(false);
  const [activeSources, setActiveSources] = useState<{ title: string; url: string; domain: string }[]>([]);

  // Thinking Logs Bottom Sheet State
  const [isThinkingLogsOpen, setIsThinkingLogsOpen] = useState(false);

  // Animated Drawers
  const [sidebarAnim] = useState(() => new Animated.Value(-280));
  const [playgroundAnim] = useState(() => new Animated.Value(drawerWidth));
  const [borderGlowAnim] = useState(() => new Animated.Value(0));
  const [keyboardAnim] = useState(() => new Animated.Value(insets.bottom));

  const flatListRef = useRef<any>(null);

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const openSidebar = () => {
    setIsSidebarOpen(true);
    Animated.timing(sidebarAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  const closeSidebar = () => {
    Animated.timing(sidebarAnim, {
      toValue: -280,
      duration: 220,
      useNativeDriver: false,
    }).start(() => setIsSidebarOpen(false));
  };

  const openPlayground = () => {
    setIsPlaygroundOpen(true);
    Animated.timing(playgroundAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  const closePlayground = () => {
    Animated.timing(playgroundAnim, {
      toValue: drawerWidth,
      duration: 220,
      useNativeDriver: false,
    }).start(() => setIsPlaygroundOpen(false));
  };

  // 1. Declare Refs to decouple circular dependencies
  const sessionRef = useRef({
    currentSessionId: null as string | null,
    sessions: [] as any[],
    setCurrentSessionId: (() => {}) as React.Dispatch<React.SetStateAction<string | null>>,
    setSessions: (() => {}) as React.Dispatch<React.SetStateAction<any[]>>,
    setIsNewChat: (() => {}) as React.Dispatch<React.SetStateAction<boolean>>,
    setContextPercent: (() => {}) as React.Dispatch<React.SetStateAction<number>>,
    setCompactionProgress: (() => {}) as React.Dispatch<React.SetStateAction<number | null>>,
    setIsThinkingLogsOpen: (() => {}) as React.Dispatch<React.SetStateAction<boolean>>,
  });

  const loadProjectsRef = useRef<((url: string, jwtToken: string) => Promise<void>) | null>(null);
  const handleSaveProjectRef = useRef<((name: string, html: string, css: string, js: string, projectId: string | null) => Promise<string | null>) | null>(null);
  const connectWebSocketRef = useRef<((sessionId: string, token: string, url: string) => void) | null>(null);
  const handleSendMessageRef = useRef<((overrideText?: string) => Promise<void>) | null>(null);

  // Instantiating Modular Hooks
  const mediaPickers = useMediaPickers(
    backendUrl,
    token,
    activeModel,
    showAlert,
    performUpload
  );

  const playground = usePlayground(
    backendUrl,
    token,
    openPlayground,
    showAlert
  );

  const webSocket = useWebSocket(
    backendUrl,
    token,
    activeModel,
    VARIANTS,
    activeVariantIndex,
    sessionRef,
    mediaPickers.stagedAttachment,
    mediaPickers.setStagedAttachment,
    playground.activeEditingProjectId,
    playground.setActiveEditingProjectId,
    playground.projects,
    loadProjectsRef,
    playground.setPlaygroundHtml,
    playground.setPlaygroundCss,
    playground.setPlaygroundJs,
    playground.setPlaygroundProjectName,
    playground.setPlaygroundRevision,
    playground.setPlaygroundView,
    openPlayground,
    handleSaveProjectRef,
    mediaPickers.setUploadingFile,
    showAlert,
    performUpload
  );

  const chatSessions = useChatSessions(
    backendUrl,
    token,
    webSocket.inputText,
    webSocket.wsRef,
    webSocket.setMessages,
    webSocket.setStreamingText,
    closeSidebar,
    showAlert,
    connectWebSocketRef,
    (msgs) => {
      // Inline scanner helper
      let htmlCode = '';
      let cssCode = '';
      let jsCode = '';
      for (const msg of msgs) {
        if (msg.role !== 'assistant') continue;
        const htmlMatch = msg.content.match(/```html\n([\s\S]*?)```/);
        const cssMatch = msg.content.match(/```css\n([\s\S]*?)```/);
        const jsMatch =
          msg.content.match(/```javascript\n([\s\S]*?)```/) || msg.content.match(/```js\n([\s\S]*?)```/);

        if (htmlMatch) htmlCode = htmlMatch[1];
        if (cssMatch) cssCode = cssMatch[1];
        if (jsMatch) jsCode = jsMatch[1];
      }
      if (htmlCode || cssCode || jsCode) {
        playground.setPlaygroundHtml(htmlCode || '<h1>Live Preview</h1>');
        playground.setPlaygroundCss(cssCode || '');
        playground.setPlaygroundJs(jsCode || '');
        playground.setPlaygroundProjectName('Live Preview Sandbox');
        playground.setPlaygroundRevision((prev) => prev + 1);
      }
    }
  );

  const voiceLoop = useVoiceLoop(
    backendUrl,
    token,
    webSocket.setInputText,
    showAlert,
    performUpload
  );

  // Sync refs with the latest state values on every render
  sessionRef.current = {
    currentSessionId: chatSessions.currentSessionId,
    sessions: chatSessions.sessions,
    setCurrentSessionId: chatSessions.setCurrentSessionId,
    setSessions: chatSessions.setSessions,
    setIsNewChat: chatSessions.setIsNewChat,
    setContextPercent: chatSessions.setContextPercent,
    setCompactionProgress: chatSessions.setCompactionProgress,
    setIsThinkingLogsOpen,
  };

  loadProjectsRef.current = playground.loadProjects;
  handleSaveProjectRef.current = playground.handleSaveProject;
  connectWebSocketRef.current = webSocket.connectWebSocket;
  handleSendMessageRef.current = webSocket.handleSendMessage;

  const wsRef = webSocket.wsRef;

  // Sync state between hook states
  const sessions = chatSessions.sessions;
  const currentSessionId = chatSessions.currentSessionId;
  const messages = webSocket.messages;
  const inputText = webSocket.inputText;
  const loading = webSocket.loading || mediaPickers.uploadingFile;
  const streamingText = webSocket.streamingText;
  const thinkingStatus = webSocket.thinkingStatus || mediaPickers.thinkingStatusLocal;
  const isNewChat = chatSessions.isNewChat;
  const contextPercent = chatSessions.contextPercent;
  const compactionProgress = chatSessions.compactionProgress;
  const editingSessionId = chatSessions.editingSessionId;
  const editingSessionName = chatSessions.editingSessionName;
  const sessionToDelete = chatSessions.sessionToDelete;

  const handleToggleFavorite = async (modelId: string) => {
    const nextFavs = favorites.includes(modelId)
      ? favorites.filter((id) => id !== modelId)
      : [...favorites, modelId];
    setFavorites(nextFavs);
    await storage.setFavoriteModels(nextFavs);

    if (token && !token.startsWith('mock-') && backendUrl) {
      try {
        await fetch(`${backendUrl.trim().replace(/\/$/, '')}/user/favorites`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ favorites: nextFavs }),
        });
      } catch (e) {
        console.error('Failed to sync favorites to cloud', e);
      }
    }
  };

  const handleLogout = async () => {
    await storage.clearAuth();
    if (wsRef.current) wsRef.current.close();
    router.replace('/login');
  };

  const handleKeyPress = (e: any) => {
    if (e.nativeEvent.key === 'Enter') {
      const activeCmd = filteredCommands[commandPopupActiveIndex];
      if (showCommandPopup && activeCmd) {
        webSocket.setInputText(activeCmd.name + ' ');
        setShowCommandPopup(false);
      } else {
        webSocket.handleSendMessage();
      }
    }
  };

  const formatModelName = (modelId: string) => {
    if (modelId === 'deepseek-v4-flash-free') return 'DeepSeek Flash';
    if (modelId === 'deepseek-v4-flash') return 'DeepSeek Flash';
    if (modelId === 'gemini-2.5-flash') return 'Gemini Flash';
    if (modelId === 'claude-3.5-sonnet') return 'Claude 3.5';
    return modelId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  async function fetchModels(url: string, jwtToken: string) {
    const storedFavs = await storage.getFavoriteModels();
    setFavorites(storedFavs);

    if (jwtToken && !jwtToken.startsWith('mock-')) {
      try {
        const favsResponse = await fetch(`${url.trim().replace(/\/$/, '')}/user/favorites`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
        if (favsResponse.ok) {
          const favsData = await favsResponse.json();
          const cloudFavs = favsData.favorite_models || [];
          if (Array.isArray(cloudFavs)) {
            setFavorites(cloudFavs);
            await storage.setFavoriteModels(cloudFavs);
          }
        }
      } catch (e) {
        console.error('Failed to fetch favorites from database', e);
      }
    }

    let rawList: string[] = [];
    if (jwtToken.startsWith('mock-')) {
      rawList = [
        'deepseek-v4-flash-free',
        'deepseek-v4-flash',
        'deepseek-v4-pro',
        'gemini-2.5-flash',
        'claude-3.5-sonnet',
        'claude-opus-4-1',
        'claude-opus-4-5',
        'claude-opus-4-6',
        'claude-opus-4-7',
        'claude-opus-4-8',
      ];
    } else {
      try {
        const response = await fetch(`${url}/models`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          rawList = Array.isArray(data) ? data : data.models || [];
        }
      } catch (e) {
        console.error('Failed to fetch models from API', e);
      }
    }

    if (rawList.length > 0) {
      setModels(rawList);
      if (!rawList.includes(activeModel)) {
        const fallback = rawList.includes('deepseek-v4-flash-free')
          ? 'deepseek-v4-flash-free'
          : rawList[0];
        setActiveModel(fallback);
      }
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = await storage.getToken();
      const storedEmail = await storage.getEmail();
      const storedUrl = await storage.getBackendUrl();

      registerBackgroundTasks();

      if (!storedToken) {
        router.replace('/login');
        return;
      }

      setToken(storedToken);
      setEmail(storedEmail);
      setBackendUrl(storedUrl);

      Animated.sequence([
        Animated.timing(borderGlowAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(borderGlowAnim, {
          toValue: 0.35,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(borderGlowAnim, {
          toValue: 0.75,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(borderGlowAnim, {
          toValue: 0.22,
          duration: 1500,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();

      fetchModels(storedUrl, storedToken);

      if (storedToken.startsWith('mock-')) {
        chatSessions.setSessions([
          { id: 'mock-1', name: 'Mock Live Dashboard Preview', created_at: '2026-06-17' },
          { id: 'mock-2', name: 'System Volume command log', created_at: '2026-06-17' },
        ]);
        playground.setProjects([
          {
            id: 'mock-p1',
            name: 'Todo App responsive preview',
            html: '<h1>Todo App responsive preview</h1>',
            css: '',
            js: '',
          },
        ]);
      } else {
        chatSessions.loadSessions(storedUrl, storedToken);
        playground.loadProjects(storedUrl, storedToken);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    const initSettings = async () => {
      await settingsManager.initialize();
      setHonorific(settingsManager.getHonorific());
    };
    initSettings();

    const unsubscribe = settingsManager.subscribe(() => {
      setHonorific(settingsManager.getHonorific());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    // Keep initial/hidden keyboard padding synced with insets.bottom
    keyboardAnim.setValue(insets.bottom);
  }, [insets.bottom]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const targetPadding = Platform.OS === 'android'
        ? e.endCoordinates.height + insets.bottom + 12
        : e.endCoordinates.height + 12;

      Animated.timing(keyboardAnim, {
        toValue: targetPadding,
        duration: Platform.OS === 'ios' ? 250 : 150,
        useNativeDriver: false,
      }).start();
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      Animated.timing(keyboardAnim, {
        toValue: insets.bottom,
        duration: Platform.OS === 'ios' ? 200 : 100,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  useEffect(() => {
    if (inputText.startsWith('/')) {
      const lowerInput = inputText.toLowerCase();

      const hasExactCommand = COMMANDS.some(
        (cmd) => lowerInput === cmd.name.toLowerCase() || lowerInput.startsWith(cmd.name.toLowerCase() + ' ')
      );

      if (hasExactCommand) {
        setShowCommandPopup(false);
        return;
      }

      const matches = COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(lowerInput));

      if (matches.length > 0) {
        setShowCommandPopup(true);
        setCommandPopupActiveIndex((prev) => (prev >= matches.length ? 0 : prev));
      } else {
        setShowCommandPopup(false);
      }
    } else {
      setShowCommandPopup(false);
    }
  }, [inputText]);

  const filteredCommands = inputText.startsWith('/')
    ? COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(inputText.toLowerCase()))
    : [];

  const compileSandboxHTML = () => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              padding: 20px;
              color: #f3f4f6;
              background-color: #0d0d0d;
              margin: 0;
            }
            ${playground.playgroundCss}
          </style>
        </head>
        <body>
          ${playground.playgroundHtml}
          <script>${playground.playgroundJs}</script>
        </body>
      </html>
    `;
  };

  const compiledSandboxHtml = compileSandboxHTML();

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
          *::-webkit-scrollbar {
            display: none !important;
          }
          * {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
        `,
          }}
        />
      )}

      {/* Fluid WebGL-style animated wavy background */}
      <FluidBackground />

      {/* Border Lit Up Entrance Animation Overlay */}
      <Animated.View
        style={[
          styles.litBorderOverlay,
          {
            opacity: borderGlowAnim,
            pointerEvents: 'none' as any,
          },
        ]}
      />

      <Animated.View
        style={[
          styles.mainWrapper,
          Platform.OS !== 'web' && {
            paddingTop: insets.top,
            paddingBottom: keyboardAnim as any,
          },
        ]}
      >
        {/* Navigation Bar */}
        <View style={styles.navBar}>
          <TouchableOpacity onPress={openSidebar} style={styles.navButton}>
            <Ionicons name="menu-outline" size={22} color="#9ca3af" />
          </TouchableOpacity>

          <Text style={styles.navTitle} numberOfLines={1}>
            {isNewChat
              ? 'New Chat'
              : sessions.find((s) => s.id === currentSessionId)?.name || 'Active Session'}
          </Text>

          <TouchableOpacity onPress={chatSessions.createNewSession} style={styles.navButton}>
            <Ionicons name="add-outline" size={22} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* Sticky Swarm Progress Indicator */}
        <StickySvgPathing task={webSocket.activeSwarmTask} onCancel={webSocket.cancelSwarmTask} />

        {/* Chat Feed */}
        {messages.length === 0 && !inputText.trim() && !loading && !streamingText ? (
          <WelcomeGreeting />
        ) : (
          <ChatFeed
            flatListRef={flatListRef}
            messages={messages}
            streamingText={streamingText}
            loading={loading}
            thinkingStatus={thinkingStatus}
            handleOpenCodeInPlayground={(content, msgId) => 
              playground.handleOpenCodeInPlayground(
                content,
                msgId,
                chatSessions.sessions,
                chatSessions.currentSessionId,
                webSocket.messageProjectIds,
                webSocket.setMessageProjectIds
              )
            }
            messageProjectIds={webSocket.messageProjectIds}
            onDrillAnswer={webSocket.handleDrillAnswer}
            onRetry={webSocket.handleRetryMessage}
            workflowNodes={webSocket.workflowNodes}
            thinkingLogs={webSocket.thinkingLogs}
            onOpenThinkingDrawer={() => setIsThinkingLogsOpen(true)}
            confirmationToolName={webSocket.confirmationToolName}
            confirmationToolLabel={webSocket.confirmationToolLabel}
            onSendConfirmationResponse={webSocket.sendConfirmationResponse}
            onOpenSourcesDrawer={(sources) => {
              setActiveSources(sources);
              setIsSourcesDrawerOpen(true);
            }}
            activeSwarmTask={webSocket.activeSwarmTask}
          />
        )}

        {/* Relative wrapper to sync absolute positioned autocomplete suggestion popup with ChatInput during padding changes */}
        <View style={{ position: 'relative', width: '100%', zIndex: 10 }}>
          {/* Autocomplete suggestion popup */}
          {showCommandPopup && filteredCommands.length > 0 && (
            <View style={styles.commandPopupContainer}>
              {filteredCommands.map((cmd, idx) => {
                const isActive = commandPopupActiveIndex === idx;
                return (
                  <TouchableOpacity
                    key={cmd.name}
                    style={[styles.commandPopupItem, isActive && styles.commandPopupActive]}
                    onPress={() => {
                      webSocket.setInputText(cmd.name + ' ');
                      setShowCommandPopup(false);
                    }}
                  >
                    <Text style={styles.commandPopupText}>{cmd.name}</Text>
                    <Text style={styles.commandPopupDesc}>{cmd.desc}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Input Bar Section */}
          <ChatInput
            inputText={inputText}
            setInputText={webSocket.setInputText}
            handleSendMessage={webSocket.handleSendMessage}
            handleFileUpload={mediaPickers.handleFileUpload}
            handleVoicePress={voiceLoop.handleVoicePress}
            isVoiceActive={voiceLoop.isVoiceActive}
            isTranscribing={voiceLoop.isTranscribing}
            micVolume={voiceLoop.micVolume}
            uploadingFile={loading}
            loading={loading}
            showBtwOverlay={webSocket.showBtwOverlay}
            activeModel={activeModel}
            formatModelName={formatModelName}
            VARIANTS={VARIANTS}
            activeVariantIndex={activeVariantIndex}
            setActiveVariantIndex={setActiveVariantIndex}
            showVariantDropdown={showVariantDropdown}
            setShowVariantDropdown={setShowVariantDropdown}
            setShowModelModal={setShowModelModal}
            activeEditingProjectId={playground.activeEditingProjectId}
            projects={playground.projects}
            setActiveEditingProjectId={playground.setActiveEditingProjectId}
            handleStopGeneration={webSocket.handleStopGeneration}
            contextPercent={contextPercent}
            stagedAttachment={mediaPickers.stagedAttachment}
            setStagedAttachment={mediaPickers.setStagedAttachment}
            showMediaPopover={showMediaPopover}
            setShowMediaPopover={setShowMediaPopover}
            handleCameraPress={mediaPickers.handleCameraPress}
            handlePhotosPress={mediaPickers.handlePhotosPress}
            handleFilesPress={mediaPickers.handleFilesPress}
            onKeyPress={handleKeyPress}
          />
        </View>
      </Animated.View>

      {/* Stateless Side-Channel /btw Bottom Sheet Backdrop and Overlay */}
      <BtwOverlay
        visible={webSocket.showBtwOverlay}
        onClose={() => {
          webSocket.setShowBtwOverlay(false);
          webSocket.setBtwMessages([]);
        }}
        messages={webSocket.btwMessages}
        loading={webSocket.btwLoading}
      />

      {/* Model Selection Overlay — Inline Bottom Sheet inside Phone Frame */}
      <ModelSelectionModal
        visible={showModelModal}
        onClose={() => setShowModelModal(false)}
        models={models}
        activeModel={activeModel}
        setActiveModel={setActiveModel}
        VARIANTS={VARIANTS}
        activeVariantIndex={activeVariantIndex}
        setActiveVariantIndex={setActiveVariantIndex}
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
      />


      {/* Sidebar Drawer */}
      <SidebarDrawer
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        sidebarAnim={sidebarAnim}
        createNewSession={chatSessions.createNewSession}
        sessions={sessions}
        currentSessionId={currentSessionId}
        selectSession={chatSessions.selectSession}
        editingSessionId={editingSessionId}
        setEditingSessionId={chatSessions.setEditingSessionId}
        editingSessionName={editingSessionName}
        setEditingSessionName={chatSessions.setEditingSessionName}
        handleRenameSession={chatSessions.handleRenameSession}
        deleteSession={chatSessions.deleteSession}
        showSidebarSettings={showSidebarSettings}
        setShowSidebarSettings={setShowSidebarSettings}
        handleLogout={handleLogout}
        email={email}
        onPlaygroundPress={() => {
          closeSidebar();
          playground.setPlaygroundView('list');
          openPlayground();
        }}
        onSettingsPress={() => {
          closeSidebar();
          setShowSettingsModal(true);
        }}
        honorific={honorific}
      />

      {/* Code Playground Drawer */}
      <PlaygroundDrawer
        isOpen={isPlaygroundOpen}
        onClose={closePlayground}
        playgroundAnim={playgroundAnim}
        playgroundView={playground.playgroundView}
        setPlaygroundView={playground.setPlaygroundView}
        playgroundProjectName={playground.playgroundProjectName}
        playgroundProjectId={playground.playgroundProjectId}
        setPlaygroundProjectId={playground.setPlaygroundProjectId}
        setActiveEditingProjectId={playground.setActiveEditingProjectId}
        isLoadingProjects={playground.isLoadingProjects}
        projects={playground.projects}
        setPlaygroundHtml={playground.setPlaygroundHtml}
        setPlaygroundCss={playground.setPlaygroundCss}
        setPlaygroundJs={playground.setPlaygroundJs}
        setPlaygroundProjectName={playground.setPlaygroundProjectName}
        setPlaygroundRevision={playground.setPlaygroundRevision}
        projectToRename={playground.projectToRename}
        setProjectToRename={playground.setProjectToRename}
        renameProjectName={playground.renameProjectName}
        setRenameProjectName={playground.setRenameProjectName}
        handleRenameProject={playground.handleRenameProject}
        handleDeleteProject={playground.handleDeleteProject}
        compiledSandboxHtml={compiledSandboxHtml}
        playgroundRevision={playground.playgroundRevision}
        token={token}
        backendUrl={backendUrl}
        currentSessionId={currentSessionId}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        sessionToDelete={sessionToDelete}
        onCancel={() => chatSessions.setSessionToDelete(null)}
        onConfirm={(id) => {
          chatSessions.setSessionToDelete(null);
          chatSessions.executeDeleteSession(id);
        }}
      />

      {/* Thinking Logs Bottom Sheet Drawer */}
      <ThinkingLogsModal
        visible={isThinkingLogsOpen}
        onClose={() => setIsThinkingLogsOpen(false)}
        thinkingLogs={webSocket.thinkingLogs}
      />

      {/* Sources Bottom Sheet Drawer */}
      <SourcesModal
        visible={isSourcesDrawerOpen}
        onClose={() => setIsSourcesDrawerOpen(false)}
        sources={activeSources}
      />

      {/* Settings Modal */}
      <SettingsModal
        visible={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        email={email}
        onLogout={handleLogout}
        models={models}
        activeModel={activeModel}
        setActiveModel={setActiveModel}
      />
    </View>
  );
}
