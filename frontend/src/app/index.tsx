import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Animated,
  Dimensions,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Clipboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { storage } from '@/utils/storage';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'laptop';
  content: string;
  timestamp?: number;
}

interface ChatSession {
  id: string;
  name: string;
  created_at: string;
}

export default function ChatScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [backendUrl, setBackendUrl] = useState('');
  const [email, setEmail] = useState<string | null>(null);

  // Chat Data State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isNewChat, setIsNewChat] = useState(true);

  // UI Toggles & Controls
  const [isDeepThink, setIsDeepThink] = useState(false);
  const [isSearch, setIsSearch] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Playground Code Sandbox State
  const [playgroundHtml, setPlaygroundHtml] = useState('<h1>No live preview compiled yet, Sir.</h1><p>Ask VoxKage to build an app/web page to see it live here.</p>');
  const [playgroundCss, setPlaygroundCss] = useState('');
  const [playgroundJs, setPlaygroundJs] = useState('');
  const [playgroundProjectName, setPlaygroundProjectName] = useState('Live Preview Sandbox');

  // Animated Drawers
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);

  const sidebarAnim = useRef(new Animated.Value(-280)).current;
  const playgroundAnim = useRef(new Animated.Value(screenWidth)).current;

  // References
  const wsRef = useRef<WebSocket | null>(null);
  const flatListRef = useRef<FlatList | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const storedToken = await storage.getToken();
      const storedEmail = await storage.getEmail();
      const storedUrl = await storage.getBackendUrl();

      if (!storedToken) {
        router.replace('/login');
        return;
      }

      setToken(storedToken);
      setEmail(storedEmail);
      setBackendUrl(storedUrl);

      if (storedToken.startsWith('mock-')) {
        // Load mock sessions for Simulator Mode
        setSessions([
          { id: 'mock-1', name: 'Mock Live Dashboard Preview', created_at: '2026-06-17' },
          { id: 'mock-2', name: 'System Volume command log', created_at: '2026-06-17' },
        ]);
      } else {
        loadSessions(storedUrl, storedToken);
      }
    };
    checkAuth();
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages, streamingText]);

  // Gradient V Logo SVG (No box, clean)
  const LogoV = ({ size = 64 }: { size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#2563eb" />
          <Stop offset="50%" stopColor="#1d4ed8" />
          <Stop offset="100%" stopColor="#020617" />
        </SvgGradient>
      </Defs>
      <Path
        d="M20 15 L43 82 L57 82 L80 15 L63 15 L50 56 L37 15 Z"
        fill="url(#logoGrad)"
      />
    </Svg>
  );

  const loadSessions = async (url: string, jwtToken: string) => {
    try {
      const response = await fetch(`${url}/sessions`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
  };

  const createNewSession = async () => {
    if (token?.startsWith('mock-')) {
      const newMockId = `mock-${Math.random()}`;
      const newMockSession: ChatSession = {
        id: newMockId,
        name: 'New Chat',
        created_at: '2026-06-17',
      };
      setSessions((prev) => [newMockSession, ...prev]);
      setCurrentSessionId(newMockId);
      setMessages([]);
      setIsNewChat(true);
      closeSidebar();
      return;
    }

    if (!token || !backendUrl) return;
    try {
      const response = await fetch(`${backendUrl}/sessions?name=New Chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const session = await response.json();
        setSessions((prev) => [session, ...prev]);
        selectSession(session.id);
        closeSidebar();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create new session, Sir.');
    }
  };

  const deleteSession = async (sessionId: string) => {
    Alert.alert(
      'Delete Session',
      'Are you sure you want to delete this chat session, Sir?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (token?.startsWith('mock-')) {
              setSessions((prev) => prev.filter((s) => s.id !== sessionId));
              if (currentSessionId === sessionId) {
                setMessages([]);
                setCurrentSessionId(null);
                setIsNewChat(true);
              }
              return;
            }

            try {
              const response = await fetch(`${backendUrl}/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              if (response.ok) {
                setSessions((prev) => prev.filter((s) => s.id !== sessionId));
                if (currentSessionId === sessionId) {
                  setMessages([]);
                  setCurrentSessionId(null);
                  setIsNewChat(true);
                }
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to delete session, Sir.');
            }
          },
        },
      ]
    );
  };

  const selectSession = async (sessionId: string) => {
    setLoading(true);
    setMessages([]);
    setStreamingText('');

    if (token?.startsWith('mock-')) {
      setCurrentSessionId(sessionId);
      setIsNewChat(false);
      setLoading(false);
      closeSidebar();

      if (sessionId === 'mock-1') {
        const mockMsgs: ChatMessage[] = [
          { id: '1', role: 'user', content: 'Build an interactive live preview app dashboard' },
          {
            id: '2',
            role: 'assistant',
            content: `Certainly, Sir. I have constructed a responsive live preview dashboard for you. You can slide open the Code Playground drawer on the right to view it live.\n\n\`\`\`html\n<!DOCTYPE html>\n<html>\n<head>\n<style>\nbody { font-family: sans-serif; background: #090d16; color: #fff; padding: 20px; }\n.card { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 24px; text-align: center; }\nh1 { color: #3b82f6; }\nbutton { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }\n</style>\n</head>\n<body>\n<div class='card'>\n<h1>VoxKage Mobile Live Sandbox</h1>\n<p>This is a live compiled application built by VoxKage, Sir.</p>\n<button onclick='alert("Hello Sir!")'>Trigger Interaction</button>\n</div>\n</body>\n</html>\n\`\`\`\n`,
          },
        ];
        setMessages(mockMsgs);
        scanMessagesForPlayground(mockMsgs);
      } else {
        const mockMsgs: ChatMessage[] = [
          { id: '1', role: 'user', content: 'Run git status on my laptop' },
          { id: '2', role: 'laptop', content: `[task-419] Executing command: git status\nOn branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean` },
          { id: '3', role: 'assistant', content: 'The power shell execution completed, Sir. Your git repository working tree is clean with nothing to commit.' },
        ];
        setMessages(mockMsgs);
      }
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`${backendUrl}/sessions/${sessionId}`, { headers });

      if (res.ok) {
        const data = await res.json();
        setCurrentSessionId(sessionId);
        setIsNewChat(false);

        const formattedMsgs: ChatMessage[] = data.messages.map((m: any) => ({
          id: m.id || `${Math.random()}`,
          role: m.role,
          content: m.content,
        }));
        setMessages(formattedMsgs);
        scanMessagesForPlayground(formattedMsgs);
        connectWebSocket(sessionId, token || '', backendUrl);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to fetch session messages, Sir.');
    } finally {
      setLoading(false);
      closeSidebar();
    }
  };

  const connectWebSocket = (sessionId: string, jwtToken: string, url: string) => {
    if (wsRef.current) wsRef.current.close();

    const wsScheme = url.startsWith('https') ? 'wss' : 'ws';
    const cleanBaseUrl = url.replace(/^(https?:\/\/)/, '');
    const wsUrl = `${wsScheme}://${cleanBaseUrl}/ws/chat/${sessionId}?token=${jwtToken}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'token') {
          setStreamingText((prev) => prev + data.content);
        } else if (data.type === 'laptop_log') {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'laptop') {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + '\n' + data.content },
              ];
            } else {
              return [
                ...prev,
                { id: `log-${Math.random()}`, role: 'laptop' as const, content: data.content },
              ];
            }
          });
        } else if (data.type === 'rename') {
          setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, name: data.name } : s))
          );
        } else if (data.type === 'done') {
          setStreamingText((currText) => {
            if (currText.trim()) {
              setMessages((prev) => {
                const updated = [
                  ...prev,
                  { id: `assistant-${Math.random()}`, role: 'assistant' as const, content: currText },
                ];
                scanMessagesForPlayground(updated);
                return updated;
              });
            }
            return '';
          });
          setLoading(false);
        }
      } catch (e) {
        console.error('Socket message parse error', e);
      }
    };
  };

  const scanMessagesForPlayground = (msgList: ChatMessage[]) => {
    let htmlCode = '';
    let cssCode = '';
    let jsCode = '';

    for (const msg of msgList) {
      if (msg.role !== 'assistant') continue;
      const htmlMatch = msg.content.match(/```html\n([\s\S]*?)```/);
      const cssMatch = msg.content.match(/```css\n([\s\S]*?)```/);
      const jsMatch = msg.content.match(/```javascript\n([\s\S]*?)```/) || msg.content.match(/```js\n([\s\S]*?)```/);

      if (htmlMatch) htmlCode = htmlMatch[1];
      if (cssMatch) cssCode = cssMatch[1];
      if (jsMatch) jsCode = jsMatch[1];
    }

    if (htmlCode || cssCode || jsCode) {
      setPlaygroundHtml(htmlCode || '<h1>Live Preview</h1>');
      setPlaygroundCss(cssCode || '');
      setPlaygroundJs(jsCode || '');
      setPlaygroundProjectName('Live Preview Sandbox');
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    // Simulator Mode Logic
    if (token?.startsWith('mock-')) {
      const userQuery = inputText.trim();
      setInputText('');
      setLoading(true);
      setIsNewChat(false);
      setMessages((prev) => [
        ...prev,
        { id: `user-${Math.random()}`, role: 'user', content: userQuery },
      ]);
      setStreamingText('');

      // Simulate streaming response
      setTimeout(() => {
        let isCodeQuery = /dashboard|html|website|page/i.test(userQuery);
        let isCmdQuery = /run|git|sys/i.test(userQuery);
        
        let responseTemplate = `Certainly, Sir. I am online in Simulation Mode. Let me know what you need.`;
        if (isCodeQuery) {
          responseTemplate = `Certainly, Sir. I have constructed an interactive live preview app dashboard for you. You can slide open the Code Playground drawer on the right to view it live.\n\n\`\`\`html\n<!DOCTYPE html>\n<html>\n<head>\n<style>\nbody { font-family: sans-serif; background: #090d16; color: #fff; padding: 20px; }\n.card { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 24px; text-align: center; }\nh1 { color: #3b82f6; }\nbutton { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }\n</style>\n</head>\n<body>\n<div class='card'>\n<h1>VoxKage Mobile Live Sandbox</h1>\n<p>This is a live compiled application built by VoxKage, Sir.</p>\n<button onclick='alert("Hello Sir!")'>Trigger Interaction</button>\n</div>\n</body>\n</html>\n\`\`\`\n`;
        } else if (isCmdQuery) {
          setMessages((prev) => [
            ...prev,
            { id: `log-${Math.random()}`, role: 'laptop' as const, content: `[task-419] Executing command: ${userQuery}\nOn branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean` }
          ]);
          responseTemplate = `The power shell command execution completed, Sir. Working tree is clean.`;
        }

        let words = responseTemplate.split(' ');
        let currentIdx = 0;
        const interval = setInterval(() => {
          if (currentIdx < words.length) {
            setStreamingText((prev) => prev + (currentIdx === 0 ? '' : ' ') + words[currentIdx]);
            currentIdx++;
          } else {
            clearInterval(interval);
            setStreamingText((currText) => {
              setMessages((prev) => {
                const updated = [
                  ...prev,
                  { id: `assistant-${Math.random()}`, role: 'assistant' as const, content: currText }
                ];
                scanMessagesForPlayground(updated);
                return updated;
              });
              return '';
            });
            setLoading(false);
          }
        }, 80);
      }, 1000);
      return;
    }

    let targetSessionId = currentSessionId;
    if (!targetSessionId) {
      if (!token || !backendUrl) return;
      try {
        const response = await fetch(`${backendUrl}/sessions?name=New Chat`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const session = await response.json();
          setSessions((prev) => [session, ...prev]);
          targetSessionId = session.id;
          setCurrentSessionId(session.id);
          setIsNewChat(false);
          connectWebSocket(session.id, token, backendUrl);
        } else {
          Alert.alert('Error', 'Failed to initialize session.');
          return;
        }
      } catch (e) {
        Alert.alert('Error', 'Could not initialize session.');
        return;
      }
    }

    const userQuery = inputText.trim();
    setMessages((prev) => [
      ...prev,
      { id: `user-${Math.random()}`, role: 'user', content: userQuery },
    ]);
    setInputText('');
    setLoading(true);
    setStreamingText('');

    let modelKey = 'deepseek-flash';
    if (isDeepThink) {
      modelKey = 'claude-sonnet';
    } else if (isSearch) {
      modelKey = 'gemini-flash';
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          message: userQuery,
          model: modelKey,
        })
      );
    } else {
      connectWebSocket(targetSessionId || '', token || '', backendUrl);
      setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              message: userQuery,
              model: modelKey,
            })
          );
        } else {
          Alert.alert('Connection Failed', 'Socket connection is currently down. Please retry, Sir.');
          setLoading(false);
        }
      }, 1000);
    }
  };

  const handleFileUpload = async () => {
    if (token?.startsWith('mock-')) {
      setMessages((prev) => [
        ...prev,
        { id: `mock-file-${Math.random()}`, role: 'laptop', content: '📄 Document indexed: AyushResume.pdf\nVector RAG store updated in Supabase.' }
      ]);
      Alert.alert('Mock Indexed', 'Simulator Mode: Document successfully indexed.');
      return;
    }

    if (!token || !backendUrl) return;

    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        return;
      }

      const fileAsset = pickerResult.assets[0];
      setUploadingFile(true);

      const formData = new FormData();
      formData.append('file', {
        uri: fileAsset.uri,
        name: fileAsset.name,
        type: fileAsset.mimeType || 'application/octet-stream',
      } as any);

      const response = await fetch(`${backendUrl}/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        Alert.alert(
          'Upload Successful',
          `Document '${fileAsset.name}' was successfully uploaded and indexed into Supabase RAG memory, Sir.`
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `system-${Math.random()}`,
            role: 'laptop',
            content: `📄 Document indexed: ${fileAsset.name}\nVector RAG store updated in Supabase.`,
          },
        ]);
      } else {
        Alert.alert('Upload Failed', data.detail || 'Failed to process document, Sir.');
      }
    } catch (e: any) {
      Alert.alert('Error', `Document upload failed: ${e.message}`);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleVoicePress = () => {
    setIsVoiceActive(!isVoiceActive);
    if (!isVoiceActive) {
      setTimeout(() => {
        setIsVoiceActive(false);
        setInputText('Run git status and check my workspace files');
      }, 3000);
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
      duration: 200,
      useNativeDriver: false,
    }).start(() => setIsSidebarOpen(false));
  };

  const openPlayground = () => {
    setIsPlaygroundOpen(true);
    Animated.timing(playgroundAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  };

  const closePlayground = () => {
    Animated.timing(playgroundAnim, {
      toValue: screenWidth,
      duration: 220,
      useNativeDriver: false,
    }).start(() => setIsPlaygroundOpen(false));
  };

  const handleLogout = async () => {
    await storage.clearAuth();
    if (wsRef.current) wsRef.current.close();
    router.replace('/login');
  };

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
            ${playgroundCss}
          </style>
        </head>
        <body>
          ${playgroundHtml}
          <script>${playgroundJs}</script>
        </body>
      </html>
    `;
  };

  const compiledSandboxHtml = compileSandboxHTML();

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.mainWrapper}
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

          <View style={styles.navRightButtons}>
            <TouchableOpacity onPress={createNewSession} style={styles.navButton}>
              <Ionicons name="add-outline" size={22} color="#9ca3af" />
            </TouchableOpacity>

            <TouchableOpacity onPress={openPlayground} style={styles.playgroundBtn}>
              <Ionicons name="code-slash-outline" size={18} color="#2563eb" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Chat Feed */}
        {isNewChat && messages.length === 0 ? (
          <View style={styles.welcomeContainer}>
            <LogoV size={72} />
            <Text style={styles.welcomeText}>How can I help you today, Sir?</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={
              streamingText
                ? [
                    ...messages,
                    {
                      id: 'streaming',
                      role: 'assistant',
                      content: streamingText,
                    } as ChatMessage,
                  ]
                : messages
            }
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatListContent}
            renderItem={({ item }) => {
              if (item.role === 'user') {
                return (
                  <View style={styles.userBubbleWrapper}>
                    <View style={styles.userBubble}>
                      <Text style={styles.userMessageText}>{item.content}</Text>
                    </View>
                  </View>
                );
              } else if (item.role === 'laptop') {
                return (
                  <View style={styles.laptopLogWrapper}>
                    <View style={styles.laptopLogBar} />
                    <View style={styles.laptopLogCard}>
                      <View style={styles.laptopLogHeader}>
                        <Ionicons name="terminal-outline" size={13} color="#2563eb" />
                        <Text style={styles.laptopLogTitle}>Laptop execution output</Text>
                      </View>
                      <Text style={styles.laptopLogText}>{item.content}</Text>
                    </View>
                  </View>
                );
              } else {
                return (
                  <View style={styles.assistantBubbleWrapper}>
                    <View style={styles.assistantAvatar}>
                      <Text style={styles.avatarText}>V</Text>
                    </View>
                    <View style={styles.assistantBubble}>
                      <MarkdownRenderer text={item.content} />
                      {item.id === 'streaming' && (
                        <View style={styles.typingIndicatorContainer}>
                          <ActivityIndicator size="small" color="#2563eb" />
                        </View>
                      )}
                    </View>
                  </View>
                );
              }
            }}
          />
        )}

        {/* Input Bar Section */}
        <View style={styles.inputAreaContainer}>
          <View style={styles.inputPill}>
            <TouchableOpacity
              onPress={handleFileUpload}
              style={styles.inputAddBtn}
              disabled={uploadingFile}
            >
              {uploadingFile ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Ionicons name="add-outline" size={24} color="#9ca3af" />
              )}
            </TouchableOpacity>

            <TextInput
              style={styles.inputField}
              placeholder="Message VoxKage..."
              placeholderTextColor="#4b5563"
              value={inputText}
              onChangeText={setInputText}
              multiline={true}
            />

            <TouchableOpacity onPress={handleVoicePress} style={styles.inputVoiceBtn}>
              <Ionicons
                name={isVoiceActive ? 'mic' : 'mic-outline'}
                size={20}
                color={isVoiceActive ? '#ef4444' : '#9ca3af'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSendMessage}
              style={styles.inputSendBtn}
              disabled={loading}
            >
              <View style={[styles.sendCircle, inputText.trim() && styles.sendCircleActive]}>
                <Ionicons
                  name="arrow-up"
                  size={16}
                  color={inputText.trim() ? '#ffffff' : '#4b5563'}
                />
              </View>
            </TouchableOpacity>
          </View>

          {/* Model Selection Capsules */}
          <View style={styles.capsulesContainer}>
            <TouchableOpacity
              style={[styles.capsule, isDeepThink && styles.capsuleActive]}
              onPress={() => {
                setIsDeepThink(!isDeepThink);
                if (isDeepThink) setIsSearch(false);
              }}
            >
              <Ionicons
                name="bulb-outline"
                size={12}
                color={isDeepThink ? '#ffffff' : '#2563eb'}
              />
              <Text style={[styles.capsuleText, isDeepThink && styles.capsuleTextActive]}>
                DeepThink (R1)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.capsule, isSearch && styles.capsuleActive]}
              onPress={() => {
                setIsSearch(!isSearch);
                if (isSearch) setIsDeepThink(false);
              }}
            >
              <Ionicons
                name="earth-outline"
                size={12}
                color={isSearch ? '#ffffff' : '#2563eb'}
              />
              <Text style={[styles.capsuleText, isSearch && styles.capsuleTextActive]}>
                Search
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Voice pulse overlay */}
      {isVoiceActive && (
        <View style={styles.voiceOverlay}>
          <Text style={styles.voiceTitle}>Listening...</Text>
          <ActivityIndicator size="large" color="#ef4444" style={styles.voiceIndicator} />
          <Text style={styles.voiceSubtitle}>Speak your instruction, Sir</Text>
        </View>
      )}

      {/* Sidebar Drawer */}
      {isSidebarOpen && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeSidebar}
          style={styles.drawerBackdrop}
        />
      )}
      <Animated.View style={[styles.sidebarDrawer, { left: sidebarAnim }]}>
        <View style={styles.sidebarHeader}>
          <LogoV size={24} />
          <Text style={styles.sidebarTitle}>VoxKage Mobile</Text>
          <TouchableOpacity onPress={closeSidebar}>
            <Ionicons name="close-outline" size={22} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={createNewSession} style={styles.newChatBtn}>
          <Ionicons name="chatbox-ellipses-outline" size={16} color="#ffffff" />
          <Text style={styles.newChatBtnText}>New Chat Thread</Text>
        </TouchableOpacity>

        <Text style={styles.historyLabel}>History</Text>
        <ScrollView style={styles.sessionsList}>
          {sessions.map((s) => (
            <TouchableOpacity
              key={s.id}
              onPress={() => selectSession(s.id)}
              style={[
                styles.sessionItem,
                s.id === currentSessionId && styles.sessionItemActive,
              ]}
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={s.id === currentSessionId ? '#2563eb' : '#4b5563'}
              />
              <Text
                style={[
                  styles.sessionText,
                  s.id === currentSessionId && styles.sessionTextActive,
                ]}
                numberOfLines={1}
              >
                {s.name}
              </Text>
              <TouchableOpacity
                onPress={() => deleteSession(s.id)}
                style={styles.sessionDeleteBtn}
              >
                <Ionicons name="trash-outline" size={13} color="#ef4444" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.sidebarFooter}>
          <View style={styles.userSection}>
            <Ionicons name="person-circle-outline" size={28} color="#2563eb" />
            <View style={styles.userInfo}>
              <Text style={styles.userHonorific}>Sir</Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {email || 'sir@voxkage.ai'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={18} color="#ef4444" />
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Code Playground Drawer */}
      {isPlaygroundOpen && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={closePlayground}
          style={styles.drawerBackdrop}
        />
      )}
      <Animated.View style={[styles.playgroundDrawer, { left: playgroundAnim }]}>
        <View style={styles.playgroundHeader}>
          <View style={styles.playgroundTitleRow}>
            <Ionicons name="code-slash" size={18} color="#2563eb" />
            <Text style={styles.playgroundTitle}>{playgroundProjectName}</Text>
          </View>
          <TouchableOpacity onPress={closePlayground}>
            <Ionicons name="close-outline" size={22} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        <View style={styles.playgroundTabs}>
          <View style={[styles.playgroundTab, styles.playgroundTabActive]}>
            <Text style={styles.playgroundTabText}>Live View</Text>
          </View>
        </View>

        <View style={styles.sandboxContainer}>
          {Platform.OS === 'web' ? (
            <iframe
              srcDoc={compiledSandboxHtml}
              style={{ border: 'none', width: '100%', height: '100%', backgroundColor: '#0d0d0d' }}
              title="Code Preview Sandbox"
            />
          ) : (
            <WebView
              originWhitelist={['*']}
              source={{ html: compiledSandboxHtml }}
              style={styles.webView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              backgroundColor="#0d0d0d"
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d', // solid dark theme
  },
  mainWrapper: {
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    height: 50,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#171717',
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e5e7eb',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  navRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playgroundBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#262626',
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f3f4f6',
    textAlign: 'center',
  },
  chatListContent: {
    padding: 12,
    gap: 12,
    paddingBottom: 20,
  },
  userBubbleWrapper: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    marginBottom: 4,
  },
  userBubble: {
    backgroundColor: '#262626', // flat gray bubble
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userMessageText: {
    color: '#f3f4f6',
    fontSize: 14.5,
    lineHeight: 19,
  },
  assistantBubbleWrapper: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'flex-start',
    maxWidth: '90%',
    marginBottom: 4,
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#171717',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#262626',
    borderWidth: 1,
  },
  avatarText: {
    color: '#2563eb',
    fontWeight: 'bold',
    fontSize: 13,
  },
  assistantBubble: {
    flex: 1,
    paddingVertical: 4, // flat transparent card like ChatGPT/Gemini
  },
  typingIndicatorContainer: {
    marginTop: 6,
    alignItems: 'flex-start',
  },
  laptopLogWrapper: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginVertical: 4,
    paddingLeft: 38,
  },
  laptopLogBar: {
    width: 2,
    backgroundColor: '#2563eb',
    borderRadius: 1,
    marginRight: 10,
  },
  laptopLogCard: {
    flex: 1,
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 10,
    padding: 10,
  },
  laptopLogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  laptopLogTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
  },
  laptopLogText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11.5,
    color: '#9ca3af',
    lineHeight: 15,
  },
  inputAreaContainer: {
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    backgroundColor: '#0d0d0d',
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#171717', // flat dark gray field
    borderWidth: 1,
    borderColor: '#262626',
    borderRadius: 24,
    paddingHorizontal: 6,
    minHeight: 46,
  },
  inputAddBtn: {
    padding: 6,
  },
  inputField: {
    flex: 1,
    color: '#f3f4f6',
    fontSize: 14.5,
    paddingHorizontal: 6,
    paddingVertical: 8,
    maxHeight: 120,
  },
  inputVoiceBtn: {
    padding: 6,
  },
  inputSendBtn: {
    padding: 4,
  },
  sendCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#262626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendCircleActive: {
    backgroundColor: '#2563eb', // turns active blue when text exists
  },
  capsulesContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#171717',
    borderColor: '#262626',
    borderWidth: 1,
  },
  capsuleActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  capsuleText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9ca3af',
  },
  capsuleTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  voiceOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(13, 13, 13, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
  },
  voiceTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 20,
  },
  voiceIndicator: {
    marginBottom: 20,
    transform: [{ scale: 1.3 }],
  },
  voiceSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 100,
  },
  sidebarDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 280,
    backgroundColor: '#171717', // flat dark gray drawer
    borderRightWidth: 1,
    borderRightColor: '#262626',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    zIndex: 101,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    gap: 8,
  },
  sidebarTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    flex: 1,
  },
  newChatBtn: {
    margin: 12,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  newChatBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  historyLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  sessionsList: {
    flex: 1,
  },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  sessionItemActive: {
    backgroundColor: '#262626',
  },
  sessionText: {
    color: '#9ca3af',
    fontSize: 13.5,
    flex: 1,
  },
  sessionTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  sessionDeleteBtn: {
    padding: 4,
  },
  sidebarFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  userInfo: {
    flex: 1,
  },
  userHonorific: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  userEmail: {
    color: '#4b5563',
    fontSize: 11,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  playgroundDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: screenWidth * 0.9,
    backgroundColor: '#0d0d0d',
    borderLeftWidth: 1,
    borderLeftColor: '#262626',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    zIndex: 101,
  },
  playgroundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },
  playgroundTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playgroundTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  playgroundTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },
  playgroundTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playgroundTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
  },
  playgroundTabText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  sandboxContainer: {
    flex: 1,
  },
  webView: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
});
