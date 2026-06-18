import React, { useState, useEffect, useRef } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  FlatList,
  LogBox,
} from 'react-native';

LogBox.ignoreLogs(['Cannot record touch end without a touch start']);

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { WebView } from 'react-native-webview';
import { storage } from '@/utils/storage';

// Import refactored components & styles
import { styles, drawerWidth } from '@/components/chat/styles';
import { DeleteConfirmModal } from '@/components/chat/DeleteConfirmModal';
import { ModelSelectionModal } from '@/components/chat/ModelSelectionModal';
import { WelcomeGreeting } from '@/components/chat/WelcomeGreeting';
import { ChatFeed, ChatMessage } from '@/components/chat/ChatFeed';
import { ChatInput } from '@/components/chat/ChatInput';
import { SidebarDrawer, ChatSession } from '@/components/chat/SidebarDrawer';
import { PlaygroundDrawer } from '@/components/chat/PlaygroundDrawer';

const generateRandomId = (prefix: string = 'rand'): string => {
  return `${prefix}-${Math.floor(Math.random() * 10000000)}`;
};

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
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [isNewChat, setIsNewChat] = useState(true);

  // Models & Variant State
  const [models, setModels] = useState<string[]>([
    'deepseek-v4-flash-free',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'gemini-2.5-flash',
    'claude-3.5-sonnet'
  ]);
  const [activeModel, setActiveModel] = useState('deepseek-v4-flash-free');
  const VARIANTS = ['Low', 'Medium', 'High', 'XHigh', 'Max'];
  const [activeVariantIndex, setActiveVariantIndex] = useState(2); // default High
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showModelModal, setShowModelModal] = useState(false);
  const [showVariantDropdown, setShowVariantDropdown] = useState(false);

  // Inline Sidebar Session Rename State
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState('');
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; name: string } | null>(null);

  // UI Toggles & Controls
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Playground Code Sandbox State
  const [playgroundHtml, setPlaygroundHtml] = useState('<h1>No live preview compiled yet, Sir.</h1><p>Ask VoxKage to build an app/web page to see it live here.</p>');
  const [playgroundCss, setPlaygroundCss] = useState('');
  const [playgroundJs, setPlaygroundJs] = useState('');
  const [playgroundProjectName, setPlaygroundProjectName] = useState('New Live App');
  const [playgroundProjectId, setPlaygroundProjectId] = useState<string | null>(null);
  const [playgroundRevision, setPlaygroundRevision] = useState(0);
  const [activeEditingProjectId, setActiveEditingProjectId] = useState<string | null>(null);

  // Playground list state
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectToRename, setProjectToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameProjectName, setRenameProjectName] = useState('');
  const [playgroundView, setPlaygroundView] = useState<'list' | 'preview'>('list');
  const [messageProjectIds, setMessageProjectIds] = useState<Record<string, string>>({});

  // Animated Drawers
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);
  const [showSidebarSettings, setShowSidebarSettings] = useState(false);

  const [sidebarAnim] = useState(() => new Animated.Value(-280));
  const [playgroundAnim] = useState(() => new Animated.Value(drawerWidth));

  // Border lit up entrance animation
  const [borderGlowAnim] = useState(() => new Animated.Value(0));

  // References
  const wsRef = useRef<WebSocket | null>(null);
  const flatListRef = useRef<FlatList | null>(null);
  const activeEditingProjectIdRef = useRef<string | null>(null);
  const projectsRef = useRef<any[]>([]);
  const streamingTextRef = useRef('');

  const updateStreamingText = (text: string | ((prev: string) => string)) => {
    setStreamingText((prev) => {
      const next = typeof text === 'function' ? text(prev) : text;
      streamingTextRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    activeEditingProjectIdRef.current = activeEditingProjectId;
  }, [activeEditingProjectId]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);



  const handleToggleFavorite = async (modelId: string) => {
    const nextFavs = favorites.includes(modelId)
      ? favorites.filter(id => id !== modelId)
      : [...favorites, modelId];
    setFavorites(nextFavs);
    await storage.setFavoriteModels(nextFavs);
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

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

      // Trigger border lighting entrance transition (gracious breathing pulse)
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
        })
      ]).start();

      // Fetch dynamic models list from backend
      fetchModels(storedUrl, storedToken);

      if (storedToken.startsWith('mock-')) {
        setSessions([
          { id: 'mock-1', name: 'Mock Live Dashboard Preview', created_at: '2026-06-17' },
          { id: 'mock-2', name: 'System Volume command log', created_at: '2026-06-17' },
        ]);
        setProjects([
          { id: 'mock-p1', name: 'Todo App responsive preview', html: '<h1>Todo App responsive preview</h1>', css: '', js: '' }
        ]);
      } else {
        loadSessions(storedUrl, storedToken);
        loadProjects(storedUrl, storedToken);
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

  // Fluid background HTML (Canvas-based perlin noise shader)
  const fluidBackgroundHTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #03060f; overflow: hidden; width: 100vw; height: 100vh; }
  canvas { display: block; width: 100vw; height: 100vh; filter: blur(4px); }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let w = canvas.width = window.innerWidth;
let h = canvas.height = window.innerHeight;
let t = 0;

// Create an offscreen noise pattern to achieve an organic paper/film grain texture
const noiseCanvas = document.createElement('canvas');
const nCtx = noiseCanvas.getContext('2d');
noiseCanvas.width = 128;
noiseCanvas.height = 128;
const nData = nCtx.createImageData(128, 128);
const d = nData.data;
for (let i = 0; i < d.length; i += 4) {
  const val = Math.floor(Math.random() * 255);
  d[i] = val;     // R
  d[i+1] = val;   // G
  d[i+2] = val;   // B
  d[i+3] = 22;    // Alpha (grain opacity ~8.6%)
}
nCtx.putImageData(nData, 0, 0);
const noisePattern = ctx.createPattern(noiseCanvas, 'repeat');

function draw() {
  ctx.fillStyle = '#020409';
  ctx.fillRect(0, 0, w, h);

  const numRibbons = 15;
  for (let i = 0; i < numRibbons; i++) {
    const ratio = i / numRibbons;
    const speed = 0.25 + ratio * 0.15;
    const amp = 60 + ratio * 80;
    const freq = 0.002 + ratio * 0.002;
    
    ctx.beginPath();
    const steps = 40;
    const pts = [];
    for (let y = 0; y <= h; y += h / steps) {
      const xOffset = Math.sin(y * freq + t * speed + ratio * Math.PI * 2) * amp;
      // Widen the spread (1.4x screen width) so margins are fully covered
      const xCenter = w * 0.5 + (ratio - 0.5) * (w * 1.4) + xOffset;
      pts.push({ x: xCenter, y });
    }
    
    // Substantially widen ribbons (180px - 460px width) for seamless blending
    const ribbonWidth = 180 + ratio * 280;
    ctx.moveTo(pts[0].x - ribbonWidth * 0.5, pts[0].y);
    for (let j = 1; j < pts.length; j++) {
      ctx.lineTo(pts[j].x - ribbonWidth * 0.5, pts[j].y);
    }
    for (let j = pts.length - 1; j >= 0; j--) {
      ctx.lineTo(pts[j].x + ribbonWidth * 0.5, pts[j].y);
    }
    ctx.closePath();
    
    const grad = ctx.createLinearGradient(w * 0.5, 0, w * 0.5, h);
    const alpha = 0.16 + Math.sin(t * 0.12 + ratio * 3) * 0.04;
    
    grad.addColorStop(0, 'rgba(2, 4, 15, 0)');
    grad.addColorStop(0.18, 'rgba(5, 30, 95, ' + (alpha * 0.55) + ')');
    grad.addColorStop(0.48, 'rgba(30, 135, 255, ' + (alpha * 0.95) + ')');
    grad.addColorStop(0.68, 'rgba(255, 225, 215, ' + (alpha * 1.15) + ')');
    grad.addColorStop(0.85, 'rgba(235, 45, 45, ' + (alpha * 1.45) + ')');
    grad.addColorStop(1, 'rgba(120, 15, 15, ' + (alpha * 0.95) + ')');
    
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Draw the fine vertical ribbed lines texture overlay
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.012)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < w; x += 3) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  ctx.stroke();

  // Draw noise grain overlay
  ctx.fillStyle = noisePattern;
  ctx.fillRect(0, 0, w, h);

  t += 0.004;
  requestAnimationFrame(draw);
}
draw();
window.onresize = () => {
  w = canvas.width = window.innerWidth;
  h = canvas.height = window.innerHeight;
};
<\/script>
</body>
</html>
  `;

  const formatModelName = (modelId: string) => {
    if (modelId === 'deepseek-v4-flash-free') return 'DeepSeek Flash (Free)';
    if (modelId === 'gemini-2.5-flash') return 'Gemini 2.5 Flash';
    if (modelId === 'claude-3.5-sonnet') return 'Claude 3.5 Sonnet';
    return modelId
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  async function fetchModels(url: string, jwtToken: string) {
    const storedFavs = await storage.getFavoriteModels();
    setFavorites(storedFavs);

    let rawList: string[] = [];
    if (jwtToken.startsWith('mock-')) {
      rawList = [
        'deepseek-v4-flash-free', 'deepseek-v4-flash', 'deepseek-v4-pro',
        'gemini-2.5-flash', 'claude-3.5-sonnet',
        'claude-opus-4-1', 'claude-opus-4-5', 'claude-opus-4-6', 'claude-opus-4-7', 'claude-opus-4-8'
      ];
    } else {
      try {
        const response = await fetch(`${url}/models`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
        });
        if (response.ok) {
          const data = await response.json();
          rawList = Array.isArray(data) ? data : (data.models || []);
        }
      } catch (e) {
        console.error('Failed to fetch models from API', e);
      }
    }

    if (rawList.length > 0) {
      setModels(rawList);
      if (!rawList.includes(activeModel)) {
        const fallback = rawList.includes('deepseek-v4-flash-free') ? 'deepseek-v4-flash-free' : rawList[0];
        setActiveModel(fallback);
      }
    }
  }

  async function loadSessions(url: string, jwtToken: string) {
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
  }

  async function loadProjects(url: string, jwtToken: string) {
    setIsLoadingProjects(true);
    try {
      const response = await fetch(`${url}/projects`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (e) {
      console.error('Failed to load projects', e);
    } finally {
      setIsLoadingProjects(false);
    }
  }

  const handleSaveProject = async (name: string, html: string, css: string, js: string, projectId: string | null = null) => {
    if (token?.startsWith('mock-')) {
      const newMockId = projectId || generateRandomId('mock-p');
      const newProj = { id: newMockId, name, html, css, js };
      setProjects((prev) => {
        const filtered = prev.filter((p) => p.id !== newMockId);
        return [newProj, ...filtered];
      });
      setPlaygroundProjectId(newMockId);
      setPlaygroundProjectName(name);
      return newMockId;
    }

    if (!token || !backendUrl) return null;
    
    // Clean and sanitise targetUrl
    let targetUrl = backendUrl.trim().replace(/\/$/, '');
    if (targetUrl.startsWith('http://') && targetUrl.includes('.hf.space')) {
      targetUrl = targetUrl.replace('http://', 'https://');
    }

    try {
      const response = await fetch(`${targetUrl}/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          html,
          css,
          js,
          project_id: projectId || null,
        }),
      });
      if (response.ok) {
        const savedProj = await response.json();
        setProjects((prev) => {
          const filtered = prev.filter((p) => p.id !== savedProj.id);
          return [savedProj, ...filtered];
        });
        setPlaygroundProjectId(savedProj.id);
        setPlaygroundProjectName(savedProj.name);
        return savedProj.id;
      }
    } catch (e) {
      console.error('Failed to save project', e);
      showAlert('Connection Warning', 'Unable to sync preview with the cloud. Running locally, Sir.');
    }
    return null;
  };

  const handleDeleteProject = async (projectId: string) => {
    if (token?.startsWith('mock-')) {
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (playgroundProjectId === projectId) {
        setPlaygroundHtml('<h1>No live preview compiled yet, Sir.</h1>');
        setPlaygroundCss('');
        setPlaygroundJs('');
        setPlaygroundProjectName('New Live App');
        setPlaygroundProjectId(null);
      }
      return;
    }

    if (!token || !backendUrl) return;
    try {
      const response = await fetch(`${backendUrl}/projects/${projectId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        if (playgroundProjectId === projectId) {
          setPlaygroundHtml('<h1>No live preview compiled yet, Sir.</h1>');
          setPlaygroundCss('');
          setPlaygroundJs('');
          setPlaygroundProjectName('New Live App');
          setPlaygroundProjectId(null);
        }
      }
    } catch (e) {
      console.error('Failed to delete project', e);
      showAlert('Error', 'Failed to delete preview, Sir.');
    }
  };

  const handleRenameProject = async (projectId: string, newName: string) => {
    if (!newName.trim()) return;
    if (token?.startsWith('mock-')) {
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, name: newName } : p))
      );
      if (playgroundProjectId === projectId) {
        setPlaygroundProjectName(newName);
      }
      setProjectToRename(null);
      return;
    }

    if (!token || !backendUrl) return;
    const original = projectsRef.current.find((p) => p.id === projectId);
    if (!original) return;

    try {
      const response = await fetch(`${backendUrl}/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newName,
          html: original.html,
          css: original.css,
          js: original.js,
          project_id: projectId,
        }),
      });
      if (response.ok) {
        const savedProj = await response.json();
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? savedProj : p))
        );
        if (playgroundProjectId === projectId) {
          setPlaygroundProjectName(savedProj.name);
        }
      }
    } catch (e) {
      console.error('Failed to rename project', e);
      showAlert('Error', 'Failed to rename preview, Sir.');
    } finally {
      setProjectToRename(null);
    }
  };

  const createNewSession = async () => {
    if (token?.startsWith('mock-')) {
      const newMockId = generateRandomId('mock');
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
      showAlert('Error', 'Failed to create new session, Sir.');
    }
  };

  const deleteSession = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      setSessionToDelete({ id: session.id, name: session.name });
    }
  };

  const executeDeleteSession = async (sessionId: string) => {
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
      } else {
        showAlert('Error', 'Failed to delete session, Sir.');
      }
    } catch (e) {
      showAlert('Error', 'Failed to delete session, Sir.');
    }
  };

  const handleRenameSession = async (sessionId: string, newName: string) => {
    if (!newName.trim()) return;

    if (token?.startsWith('mock-')) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, name: newName } : s))
      );
      setEditingSessionId(null);
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/sessions/${sessionId}/rename?name=${encodeURIComponent(newName)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, name: newName } : s))
        );
      } else {
        showAlert('Error', 'Failed to rename session, Sir.');
      }
    } catch (e) {
      console.error(e);
      showAlert('Error', 'Connection failure renaming session, Sir.');
    } finally {
      setEditingSessionId(null);
    }
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
      showAlert('Error', 'Failed to fetch session messages, Sir.');
    } finally {
      setLoading(false);
      closeSidebar();
    }
  };

  const connectWebSocket = (sessionId: string, jwtToken: string, url: string) => {
    if (wsRef.current) wsRef.current.close();

    const wsScheme = url.startsWith('https') ? 'wss' : 'ws';
    const cleanBaseUrl = url.replace(/^(https?:\/\/)/, '').replace(/\/$/, '');
    const wsUrl = `${wsScheme}://${cleanBaseUrl}/ws/chat/${sessionId}?token=${jwtToken}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onerror = (err) => {
      console.error("WebSocket Error, Sir:", err);
    };

    ws.onclose = (e) => {
      console.log("WebSocket connection closed, Sir:", e);
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'token') {
          updateStreamingText((prev) => prev + data.content);
        } else if (data.type === 'error') {
          let errorMsg = data.content;
          if (errorMsg && errorMsg.includes('Upstream error:')) {
            try {
              const rawJson = errorMsg.substring(errorMsg.indexOf('Upstream error:') + 'Upstream error:'.length).trim();
              const parsed = JSON.parse(rawJson);
              if (parsed?.error?.message) {
                errorMsg = parsed.error.message;
              }
            } catch (e) {
              // fallback to raw string
            }
          }
          showAlert('Engine Error, Sir', errorMsg);
          setLoading(false);
          setThinkingStatus(null);
          updateStreamingText('');
        } else if (data.type === 'hud_log') {
          setThinkingStatus(data.content);
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
                { id: generateRandomId('log'), role: 'laptop' as const, content: data.content },
              ];
            }
          });
        } else if (data.type === 'rename') {
          setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, name: data.name } : s))
          );
        } else if (data.type === 'done') {
          const associatedProjectId = data.project_id || null;
          const currText = streamingTextRef.current;
          updateStreamingText('');
          
          if (currText.trim()) {
            const assistantMessageId = generateRandomId('assistant');
            const editingId = associatedProjectId || activeEditingProjectIdRef.current;
            
            if (editingId) {
              setMessageProjectIds((prevMap) => ({ ...prevMap, [assistantMessageId]: editingId }));
            }

            setMessages((prev) => {
              const updated = [
                ...prev,
                { id: assistantMessageId, role: 'assistant' as const, content: currText },
              ];
              scanMessagesForPlayground(updated);

              // Auto-save code block updates to the active editing project if refining
              if (editingId) {
                const htmlMatch = currText.match(/```html\n([\s\S]*?)```/i);
                const cssMatch = currText.match(/```css\n([\s\S]*?)```/i);
                const jsMatch = currText.match(/```javascript\n([\s\S]*?)```/i) || currText.match(/```js\n([\s\S]*?)```/i);
                
                if (htmlMatch || cssMatch || jsMatch) {
                  const htmlCode = htmlMatch ? htmlMatch[1] : '';
                  const cssCode = cssMatch ? cssMatch[1] : '';
                  const jsCode = jsMatch ? jsMatch[1] : '';
                  
                  const originalProj = projectsRef.current.find(p => p.id === editingId);
                  if (originalProj) {
                    const finalHtml = htmlCode || originalProj.html || '';
                    const finalCss = cssCode || originalProj.css || '';
                    const finalJs = jsCode || originalProj.js || '';
                    
                    setPlaygroundHtml(finalHtml);
                    setPlaygroundCss(finalCss);
                    setPlaygroundJs(finalJs);
                    setPlaygroundRevision((prev) => prev + 1);

                    handleSaveProject(
                      originalProj.name,
                      finalHtml,
                      finalCss,
                      finalJs,
                      editingId
                    );
                  }
                }
              }

              return updated;
            });
          }
          if (associatedProjectId) {
            loadProjects(backendUrl, token || '');
          }
          setLoading(false);
          setThinkingStatus(null);
        }
      } catch (e) {
        console.error('Socket message parse error', e);
      }
    };
  };

  const handleStopGeneration = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const currText = streamingTextRef.current;
    updateStreamingText('');

    if (currText.trim()) {
      const assistantMessageId = generateRandomId('assistant');
      const stoppedContent = currText + '\n\n*[Generation stopped, Sir.]*';
      
      const editingId = activeEditingProjectIdRef.current;
      if (editingId) {
        setMessageProjectIds((prevMap) => ({ ...prevMap, [assistantMessageId]: editingId }));
      }

      setMessages((prev) => {
        const updated = [
          ...prev,
          { id: assistantMessageId, role: 'assistant' as const, content: stoppedContent },
        ];
        scanMessagesForPlayground(updated);
        return updated;
      });
    }

    setLoading(false);
    setThinkingStatus(null);
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
      setPlaygroundRevision((prev) => prev + 1);
    }
  };

  const handleOpenCodeInPlayground = async (content: string, messageId: string) => {
    const existingProjectId = messageProjectIds[messageId] || null;
    
    if (existingProjectId) {
      let p = projectsRef.current.find(proj => proj.id === existingProjectId);
      if (!p && token && backendUrl) {
        try {
          const response = await fetch(`${backendUrl}/projects/${existingProjectId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            p = await response.json();
            setProjects(prev => [p, ...prev.filter(proj => proj.id !== existingProjectId)]);
          }
        } catch (e) {
          console.error("Failed to fetch project directly", e);
        }
      }
      if (p) {
        setPlaygroundHtml(p.html || '');
        setPlaygroundCss(p.css || '');
        setPlaygroundJs(p.js || '');
        setPlaygroundProjectName(p.name || 'Untitled App');
        setPlaygroundProjectId(p.id);
        setPlaygroundView('preview');
        setPlaygroundRevision((prev) => prev + 1);
        openPlayground();
        return;
      }
    }

    const htmlMatch = content.match(/```html\n([\s\S]*?)```/i);
    const cssMatch = content.match(/```css\n([\s\S]*?)```/i);
    const jsMatch = content.match(/```javascript\n([\s\S]*?)```/i) || content.match(/```js\n([\s\S]*?)```/i);

    if (!htmlMatch && !cssMatch && !jsMatch) {
      return;
    }

    const htmlCode = htmlMatch ? htmlMatch[1] : '<h1>Live Preview</h1>';
    const cssCode = cssMatch ? cssMatch[1] : '';
    const jsCode = jsMatch ? jsMatch[1] : '';

    setPlaygroundHtml(htmlCode);
    setPlaygroundCss(cssCode);
    setPlaygroundJs(jsCode);
    setPlaygroundRevision((prev) => prev + 1);

    const session = sessions.find((s) => s.id === currentSessionId);
    const projName = session ? `Playground - ${session.name}` : 'Playground Preview';
    setPlaygroundProjectName(projName);

    const savedId = await handleSaveProject(projName, htmlCode, cssCode, jsCode, existingProjectId);
    if (savedId) {
      setPlaygroundProjectId(savedId);
      setPlaygroundView('preview');
      openPlayground();
      loadProjects(backendUrl, token || '');
      if (!existingProjectId) {
        setMessageProjectIds((prev) => ({ ...prev, [messageId]: savedId }));
      }
    }
    setPlaygroundView('preview');
    openPlayground();
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    if (token?.startsWith('mock-')) {
      const userQuery = inputText.trim();
      setInputText('');
      setLoading(true);
      setIsNewChat(false);
      setMessages((prev) => [
        ...prev,
        { id: generateRandomId('user'), role: 'user', content: userQuery },
      ]);
      setStreamingText('');

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
          showAlert('Error', 'Failed to initialize session.');
          return;
        }
      } catch (e) {
        showAlert('Error', 'Could not initialize session.');
        return;
      }
    }

    const userQuery = inputText.trim();
    const activeProject = activeEditingProjectId 
      ? projectsRef.current.find(p => p.id === activeEditingProjectId) 
      : null;

    // Generate current local date/time string on client to bypass server timezone issues
    const clientTimeStr = new Date().toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    setMessages((prev) => [
      ...prev,
      { id: generateRandomId('user'), role: 'user', content: userQuery },
    ]);
    setInputText('');
    setLoading(true);
    setStreamingText('');
    setThinkingStatus('Connecting to VoxKage core, Sir...');

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          message: userQuery,
          model: activeModel,
          variant: VARIANTS[activeVariantIndex],
          client_time: clientTimeStr,
          active_project: activeProject ? {
            id: activeProject.id,
            name: activeProject.name,
            html: activeProject.html,
            css: activeProject.css,
            js: activeProject.js
          } : null,
        })
      );
    } else {
      // Connect only if there is no socket or if it's closed/closing
      if (!wsRef.current || (wsRef.current.readyState !== WebSocket.OPEN && wsRef.current.readyState !== WebSocket.CONNECTING)) {
        connectWebSocket(targetSessionId || '', token || '', backendUrl);
      }
      
      // Poll connection status until open or timeout (25s to allow HF Space wake up)
      let checks = 0;
      const maxChecks = 125; // 125 * 200ms = 25000ms
      const interval = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          setThinkingStatus('VoxKage is processing, Sir...');
          wsRef.current.send(
            JSON.stringify({
              message: userQuery,
              model: activeModel,
              variant: VARIANTS[activeVariantIndex],
              client_time: clientTimeStr,
              active_project: activeProject ? {
                id: activeProject.id,
                name: activeProject.name,
                html: activeProject.html,
                css: activeProject.css,
                js: activeProject.js
              } : null,
            })
          );
        } else {
          checks++;
          if (checks % 15 === 0) {
            setThinkingStatus('Waking up cloud engine, Sir... Please stand by.');
          }
          if (checks >= maxChecks) {
            clearInterval(interval);
            showAlert('Connection Failed', 'Socket connection is currently down. Please retry, Sir.');
            setLoading(false);
            setThinkingStatus(null);
          }
        }
      }, 200);
    }
  };

  const handleFileUpload = async () => {
    if (token?.startsWith('mock-')) {
      setMessages((prev) => [
        ...prev,
        { id: generateRandomId('mock-file'), role: 'laptop', content: '📄 Document indexed: AyushResume.pdf\nVector RAG store updated in Supabase.' }
      ]);
      showAlert('Mock Indexed', 'Simulator Mode: Document successfully indexed.');
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
        showAlert(
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
        showAlert('Upload Failed', data.detail || 'Failed to process document, Sir.');
      }
    } catch (e: any) {
      showAlert('Error', `Document upload failed: ${e.message}`);
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
    if (token && backendUrl) {
      loadProjects(backendUrl, token);
    }
    setIsPlaygroundOpen(true);
    Animated.timing(playgroundAnim, {
      toValue: 0,
      duration: 250,
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
      {Platform.OS === 'web' && (
        <style dangerouslySetInnerHTML={{ __html: `
          *::-webkit-scrollbar {
            display: none !important;
          }
          * {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
          }
        `}} />
      )}
      {/* Fluid WebGL-style animated wavy background */}
      {Platform.OS === 'web' ? (
        // @ts-ignore
        <iframe
          srcDoc={fluidBackgroundHTML}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            border: 'none',
            width: '100%',
            height: '100%',
            zIndex: 0,
            pointerEvents: 'none',
          }}
          title="Fluid Background Shader"
        />
      ) : (
        <WebView
          source={{ html: fluidBackgroundHTML }}
          style={[styles.fluidBackground, { pointerEvents: 'none' as any }]}
          scrollEnabled={false}
          javaScriptEnabled={true}
        />
      )}

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

          <TouchableOpacity onPress={createNewSession} style={styles.navButton}>
            <Ionicons name="add-outline" size={22} color="#9ca3af" />
          </TouchableOpacity>
        </View>

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
            handleOpenCodeInPlayground={handleOpenCodeInPlayground}
            messageProjectIds={messageProjectIds}
            token={token}
            backendUrl={backendUrl}
          />
        )}

        {/* Input Bar Section */}
        <ChatInput
          inputText={inputText}
          setInputText={setInputText}
          handleSendMessage={handleSendMessage}
          handleFileUpload={handleFileUpload}
          handleVoicePress={handleVoicePress}
          isVoiceActive={isVoiceActive}
          uploadingFile={uploadingFile}
          loading={loading}
          activeModel={activeModel}
          formatModelName={formatModelName}
          VARIANTS={VARIANTS}
          activeVariantIndex={activeVariantIndex}
          setActiveVariantIndex={setActiveVariantIndex}
          showVariantDropdown={showVariantDropdown}
          setShowVariantDropdown={setShowVariantDropdown}
          setShowModelModal={setShowModelModal}
          activeEditingProjectId={activeEditingProjectId}
          projects={projects}
          setActiveEditingProjectId={setActiveEditingProjectId}
          handleStopGeneration={handleStopGeneration}
        />
      </KeyboardAvoidingView>

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

      {/* Voice pulse overlay */}
      {isVoiceActive && (
        <View style={styles.voiceOverlay}>
          <Text style={styles.voiceTitle}>Listening...</Text>
          <ActivityIndicator size="large" color="#ef4444" style={styles.voiceIndicator} />
          <Text style={styles.voiceSubtitle}>Speak your instruction, Sir</Text>
        </View>
      )}

      {/* Sidebar Drawer */}
      <SidebarDrawer
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        sidebarAnim={sidebarAnim}
        createNewSession={createNewSession}
        sessions={sessions}
        currentSessionId={currentSessionId}
        selectSession={selectSession}
        editingSessionId={editingSessionId}
        setEditingSessionId={setEditingSessionId}
        editingSessionName={editingSessionName}
        setEditingSessionName={setEditingSessionName}
        handleRenameSession={handleRenameSession}
        deleteSession={deleteSession}
        showSidebarSettings={showSidebarSettings}
        setShowSidebarSettings={setShowSidebarSettings}
        handleLogout={handleLogout}
        email={email}
        onPlaygroundPress={() => {
          closeSidebar();
          setPlaygroundView('list');
          openPlayground();
        }}
      />

      {/* Code Playground Drawer */}
      <PlaygroundDrawer
        isOpen={isPlaygroundOpen}
        onClose={closePlayground}
        playgroundAnim={playgroundAnim}
        playgroundView={playgroundView}
        setPlaygroundView={setPlaygroundView}
        playgroundProjectName={playgroundProjectName}
        playgroundProjectId={playgroundProjectId}
        setPlaygroundProjectId={setPlaygroundProjectId}
        setActiveEditingProjectId={setActiveEditingProjectId}
        isLoadingProjects={isLoadingProjects}
        projects={projects}
        setPlaygroundHtml={setPlaygroundHtml}
        setPlaygroundCss={setPlaygroundCss}
        setPlaygroundJs={setPlaygroundJs}
        setPlaygroundProjectName={setPlaygroundProjectName}
        setPlaygroundRevision={setPlaygroundRevision}
        projectToRename={projectToRename}
        setProjectToRename={setProjectToRename}
        renameProjectName={renameProjectName}
        setRenameProjectName={setRenameProjectName}
        handleRenameProject={handleRenameProject}
        handleDeleteProject={handleDeleteProject}
        compiledSandboxHtml={compiledSandboxHtml}
        playgroundRevision={playgroundRevision}
        token={token}
        backendUrl={backendUrl}
        currentSessionId={currentSessionId}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        sessionToDelete={sessionToDelete}
        onCancel={() => setSessionToDelete(null)}
        onConfirm={(id) => {
          setSessionToDelete(null);
          executeDeleteSession(id);
        }}
      />
    </View>
  );
}
