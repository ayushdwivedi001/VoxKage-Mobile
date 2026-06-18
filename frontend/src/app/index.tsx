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
  Modal,
} from 'react-native';

import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import { storage } from '@/utils/storage';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
const drawerWidth = Platform.OS === 'web' ? 366 : screenWidth;

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

// Gradient V Logo SVG (No box, clean geometric layered ribbons)
const LogoV = ({ size = 64 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
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

  // Models State
  const [models, setModels] = useState<string[]>(['deepseek-v4-flash-free', 'gemini-2.5-flash', 'claude-3.5-sonnet']);
  const [activeModel, setActiveModel] = useState('deepseek-v4-flash-free');
  const VARIANTS = ['Low', 'Medium', 'High', 'XHigh', 'Max'];
  const [activeVariantIndex, setActiveVariantIndex] = useState(2); // default High
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

  useEffect(() => {
    activeEditingProjectIdRef.current = activeEditingProjectId;
  }, [activeEditingProjectId]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

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
    if (jwtToken.startsWith('mock-')) {
      // Mock models list in simulation mode
      setModels(['deepseek-v4-flash-free', 'gemini-2.5-flash', 'claude-3.5-sonnet', 'openai-gpt-4o']);
      return;
    }
    try {
      const response = await fetch(`${url}/models`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        const modelList = Array.isArray(data) ? data : (data.models || []);
        if (modelList.length > 0) {
          setModels(modelList);
          if (!modelList.includes(activeModel)) {
            setActiveModel(modelList[0]);
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch models from API', e);
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
    const original = projects.find((p) => p.id === projectId);
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

  // Side Panel rename function
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
    const cleanBaseUrl = url.replace(/^(https?:\/\/)/, '');
    const wsUrl = `${wsScheme}://${cleanBaseUrl}/ws/chat/${sessionId}?token=${jwtToken}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'token') {
          setStreamingText((prev) => prev + data.content);
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
          setStreamingText((currText) => {
            if (currText.trim()) {
              const assistantMessageId = generateRandomId('assistant');
              const editingId = activeEditingProjectIdRef.current;
              
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
            return '';
          });
          setLoading(false);
          setThinkingStatus(null);
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
      setPlaygroundRevision((prev) => prev + 1);
    }
  };

  const hasCodeBlocks = (text: string) => {
    return /```html\n|```css\n|```javascript\n|```js\n/i.test(text);
  };

  const handleOpenCodeInPlayground = async (content: string, messageId: string) => {
    const htmlMatch = content.match(/```html\n([\s\S]*?)```/i);
    const cssMatch = content.match(/```css\n([\s\S]*?)```/i);
    const jsMatch = content.match(/```javascript\n([\s\S]*?)```/i) || content.match(/```js\n([\s\S]*?)```/i);

    const htmlCode = htmlMatch ? htmlMatch[1] : '<h1>Live Preview</h1>';
    const cssCode = cssMatch ? cssMatch[1] : '';
    const jsCode = jsMatch ? jsMatch[1] : '';

    setPlaygroundHtml(htmlCode);
    setPlaygroundCss(cssCode);
    setPlaygroundJs(jsCode);
    setPlaygroundRevision((prev) => prev + 1);

    // Set a default project name from session or fallback
    const session = sessions.find((s) => s.id === currentSessionId);
    const projName = session ? `Playground - ${session.name}` : 'Playground Preview';
    setPlaygroundProjectName(projName);

    // Get existing project ID associated with this message card, if any
    const existingProjectId = messageProjectIds[messageId] || null;

    // Save project to backend
    const savedId = await handleSaveProject(projName, htmlCode, cssCode, jsCode, existingProjectId);
    if (savedId) {
      setPlaygroundProjectId(savedId);
      if (!existingProjectId) {
        setMessageProjectIds((prev) => ({ ...prev, [messageId]: savedId }));
      }
    }
    
    // Open the drawer
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
      ? projects.find(p => p.id === activeEditingProjectId) 
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
    setThinkingStatus(null);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          message: userQuery,
          model: activeModel,
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
      
      // Poll connection status until open or timeout (5s)
      let checks = 0;
      const maxChecks = 25; // 25 * 200ms = 5000ms
      const interval = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          wsRef.current.send(
            JSON.stringify({
              message: userQuery,
              model: activeModel,
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

  const toggleVariant = () => {
    setActiveVariantIndex((prev) => (prev + 1) % VARIANTS.length);
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
        {messages.length === 0 && !inputText.trim() ? (
          <View style={styles.welcomeContainer}>
            <LogoV size={72} />
            <Text style={styles.welcomeText}>How can I help you today, Sir?</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={[
              ...messages,
              ...(streamingText
                ? [
                    {
                      id: 'streaming',
                      role: 'assistant',
                      content: streamingText,
                    } as ChatMessage,
                  ]
                : []),
              ...(loading
                ? [
                    {
                      id: 'thinking',
                      role: 'assistant',
                      content: thinkingStatus || 'VoxKage is processing, Sir...',
                    } as ChatMessage,
                  ]
                : []),
            ]}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.chatListContent}
            showsVerticalScrollIndicator={false}
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
                if (item.id === 'thinking') {
                  return (
                    <View style={styles.assistantBubbleWrapper}>
                      <View style={styles.assistantAvatar}>
                        <LogoV size={18} />
                      </View>
                      <View style={[styles.assistantBubble, styles.thinkingBubble]}>
                        <View style={styles.thinkingHeader}>
                          <ActivityIndicator size="small" color="#60a5fa" style={styles.thinkingSpinner} />
                          <Text style={styles.thinkingTitle}>VoxKage is thinking...</Text>
                        </View>
                      </View>
                    </View>
                  );
                }

                return (
                  <View style={styles.assistantBubbleWrapper}>
                    <View style={styles.assistantAvatar}>
                      <LogoV size={18} />
                    </View>
                    <View style={[styles.assistantBubble, hasCodeBlocks(item.content) && { minWidth: 160 }]}>
                      <MarkdownRenderer text={item.content} />
                      {item.id === 'streaming' && (
                        <View style={styles.typingIndicatorContainer}>
                          <ActivityIndicator size="small" color="#2563eb" />
                        </View>
                      )}
                      {hasCodeBlocks(item.content) && (
                        <TouchableOpacity
                          style={styles.openPlaygroundBubbleBtn}
                          onPress={() => handleOpenCodeInPlayground(item.content, item.id)}
                        >
                          <Ionicons name="play-circle-outline" size={14} color="#60a5fa" />
                          <Text style={styles.openPlaygroundBubbleBtnText}>Open in Playground</Text>
                        </TouchableOpacity>
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
          {showVariantDropdown && (
            <TouchableOpacity
              activeOpacity={1}
              style={styles.dropdownBackdrop}
              onPress={() => setShowVariantDropdown(false)}
            />
          )}
          {showVariantDropdown && (
            <View style={styles.variantDropdown}>
              {VARIANTS.map((v, i) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.variantDropdownItem,
                    activeVariantIndex === i && styles.variantDropdownItemActive,
                  ]}
                  onPress={() => {
                    setActiveVariantIndex(i);
                    setShowVariantDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.variantDropdownText,
                      activeVariantIndex === i && styles.variantDropdownTextActive,
                    ]}
                  >
                    {v}
                  </Text>
                  {activeVariantIndex === i && (
                    <Ionicons name="checkmark" size={12} color="#60a5fa" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Model & Variant Toggles (Capsules) — Placed above the input to avoid safe area overlap */}
          <View style={styles.capsulesContainer}>
            <TouchableOpacity
              style={styles.capsule}
              onPress={() => setShowModelModal(true)}
            >
              <Ionicons
                name="sparkles-outline"
                size={12}
                color="#60a5fa"
              />
              <Text style={styles.capsuleText}>
                {formatModelName(activeModel)}
              </Text>
              <Ionicons name="chevron-down" size={10} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.capsule}
              onPress={() => setShowVariantDropdown(!showVariantDropdown)}
            >
              <Ionicons
                name="options-outline"
                size={12}
                color="#60a5fa"
              />
              <Text style={styles.capsuleText}>
                Variant: {VARIANTS[activeVariantIndex]}
              </Text>
              <Ionicons name="chevron-down" size={10} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          {/* Refining HUD Bar */}
          {activeEditingProjectId && (
            <View style={styles.refiningHudBar}>
              <View style={styles.refiningHudLeft}>
                <Ionicons name="color-wand-outline" size={14} color="#60a5fa" />
                <Text style={styles.refiningHudText} numberOfLines={1}>
                  Refining: {projects.find(p => p.id === activeEditingProjectId)?.name || 'Untitled App'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.refiningHudCloseBtn}
                onPress={() => setActiveEditingProjectId(null)}
              >
                <Ionicons name="close-circle" size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputPill}>
            <TouchableOpacity
              onPress={handleFileUpload}
              style={styles.inputAddBtn}
              disabled={uploadingFile}
            >
              {uploadingFile ? (
                <ActivityIndicator size="small" color="#3b82f6" />
              ) : (
                <Ionicons name="add-outline" size={24} color="#94a3b8" />
              )}
            </TouchableOpacity>

            <TextInput
              style={styles.inputField}
              placeholder="Message VoxKage..."
              placeholderTextColor="#475569"
              value={inputText}
              onChangeText={setInputText}
              multiline={true}
            />

            <TouchableOpacity onPress={handleVoicePress} style={styles.inputVoiceBtn}>
              <Ionicons
                name={isVoiceActive ? 'mic' : 'mic-outline'}
                size={20}
                color={isVoiceActive ? '#ef4444' : '#94a3b8'}
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
                  color={inputText.trim() ? '#ffffff' : '#475569'}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Model Selection Overlay — Inline Bottom Sheet inside Phone Frame */}
      {showModelModal && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowModelModal(false)}
          style={styles.inlineModalBackdrop}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.inlineModalContent}
          >
            {/* Header */}
            <View style={styles.inlineModalHeader}>
              <View style={styles.inlineModalTitleRow}>
                <Ionicons name="hardware-chip-outline" size={18} color="#3b82f6" />
                <Text style={styles.inlineModalTitle}>Select Model</Text>
              </View>
              <TouchableOpacity onPress={() => setShowModelModal(false)} style={styles.inlineModalCloseBtn}>
                <Ionicons name="close" size={20} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {/* Variant Section */}
            <Text style={styles.inlineModalSectionLabel}>Reasoning Depth</Text>
            <View style={styles.variantChipRow}>
              {VARIANTS.map((v, i) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.inlineVariantChip,
                    activeVariantIndex === i && styles.inlineVariantChipActive,
                  ]}
                  onPress={() => setActiveVariantIndex(i)}
                >
                  <Text style={[styles.inlineVariantChipText, activeVariantIndex === i && styles.inlineVariantChipTextActive]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Models List */}
            <Text style={styles.inlineModalSectionLabel}>Available Models</Text>
            <ScrollView style={styles.inlineModalList} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
              {models.map((model) => (
                <TouchableOpacity
                  key={model}
                  style={[
                    styles.inlineModelItem,
                    activeModel === model && styles.inlineModelItemActive,
                  ]}
                  onPress={() => {
                    setActiveModel(model);
                    setShowModelModal(false);
                  }}
                >
                  <View style={styles.inlineModelItemDetails}>
                    <Text style={[styles.inlineModelName, activeModel === model && styles.inlineModelNameActive]}>
                      {formatModelName(model)}
                    </Text>
                    <Text style={styles.inlineModelId}>{model}</Text>
                  </View>
                  {activeModel === model && (
                    <Ionicons name="checkmark-circle" size={18} color="#3b82f6" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

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
          <Text style={styles.sidebarTitle}>VoxKage</Text>
          <TouchableOpacity onPress={closeSidebar}>
            <Ionicons name="close-outline" size={22} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={createNewSession} style={styles.newChatBtn}>
          <Ionicons name="chatbox-ellipses-outline" size={16} color="#ffffff" />
          <Text style={styles.newChatBtnText}>New Chat Thread</Text>
        </TouchableOpacity>

        {/* Dedicated Sandbox Playground Button in Sidebar */}
        <TouchableOpacity
          onPress={() => {
            closeSidebar();
            setPlaygroundView('list');
            openPlayground();
          }}
          style={styles.sidebarPlaygroundBtn}
        >
          <Ionicons name="code-slash-outline" size={16} color="#2563eb" />
          <Text style={styles.sidebarPlaygroundText}>Playground</Text>
        </TouchableOpacity>

        <Text style={styles.historyLabel}>History</Text>
        <ScrollView style={styles.sessionsList} showsVerticalScrollIndicator={false}>
          {sessions.map((s) => (
            <View
              key={s.id}
              style={[
                styles.sessionItemContainer,
                s.id === currentSessionId && styles.sessionItemActive,
              ]}
            >
              <Ionicons
                name="chatbubble-outline"
                size={16}
                color={s.id === currentSessionId ? '#2563eb' : '#4b5563'}
              />
              
              {editingSessionId === s.id ? (
                <TextInput
                  style={styles.sessionRenameInput}
                  value={editingSessionName}
                  onChangeText={setEditingSessionName}
                  autoFocus={true}
                  onSubmitEditing={() => handleRenameSession(s.id, editingSessionName)}
                  onBlur={() => handleRenameSession(s.id, editingSessionName)}
                  returnKeyType="done"
                />
              ) : (
                <TouchableOpacity
                  onPress={() => selectSession(s.id)}
                  style={styles.sessionTextWrapper}
                >
                  <Text
                    style={[
                      styles.sessionText,
                      s.id === currentSessionId && styles.sessionTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                </TouchableOpacity>
              )}

              {editingSessionId !== s.id && (
                <View style={styles.sessionActionRow}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingSessionId(s.id);
                      setEditingSessionName(s.name);
                    }}
                    style={styles.sessionActionBtn}
                  >
                    <Ionicons name="create-outline" size={14} color="#9ca3af" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => deleteSession(s.id)}
                    style={styles.sessionActionBtn}
                  >
                    <Ionicons name="trash-outline" size={13} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* Settings Popover inside Sidebar Drawer */}
        {showSidebarSettings && (
          <View style={styles.sidebarSettingsPopover}>
            <View style={styles.sidebarSettingsHeader}>
              <Text style={styles.sidebarSettingsTitle}>Settings</Text>
              <TouchableOpacity onPress={() => setShowSidebarSettings(false)}>
                <Ionicons name="close" size={16} color="#9ca3af" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                setShowSidebarSettings(false);
                closeSidebar();
                handleLogout();
              }}
              style={styles.sidebarSettingsItem}
            >
              <Ionicons name="log-out-outline" size={16} color="#ef4444" />
              <Text style={styles.sidebarSettingsItemText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.sidebarFooter}>
          <View style={styles.userSection}>
            <Ionicons name="person-circle-outline" size={32} color="#3b82f6" />
            <View style={styles.userInfo}>
              <Text style={styles.userHonorific}>Sir</Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {email || 'sir@voxkage.ai'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowSidebarSettings(!showSidebarSettings)}
              style={styles.settingsIconBtn}
            >
              <Ionicons name="settings-outline" size={18} color="#9ca3af" />
            </TouchableOpacity>
          </View>
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
        {/* Playground Header */}
        <View style={styles.playgroundHeader}>
          <TouchableOpacity 
            style={styles.playgroundBackBtn}
            onPress={() => {
              if (playgroundView === 'preview') {
                setPlaygroundView('list');
              } else {
                closePlayground();
              }
            }}
          >
            <Ionicons name="chevron-back" size={22} color="#60a5fa" />
            <Text style={styles.playgroundBackText}>
              {playgroundView === 'preview' ? 'Previews' : 'Chat'}
            </Text>
          </TouchableOpacity>
          
          <View style={[styles.playgroundTitleContainer, { pointerEvents: 'none' as any }]}>
            <Text style={styles.playgroundProjectTitle} numberOfLines={1}>
              {playgroundView === 'preview' ? playgroundProjectName : 'Playground'}
            </Text>
          </View>

          {playgroundView === 'preview' ? (
            <TouchableOpacity 
              style={styles.playgroundRefineBtn}
              onPress={() => {
                if (playgroundProjectId) {
                  setActiveEditingProjectId(playgroundProjectId);
                  closePlayground();
                }
              }}
            >
              <Ionicons name="color-wand-outline" size={16} color="#60a5fa" />
              <Text style={styles.playgroundRefineText}>Refine</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {/* Drawer Body content depends on playgroundView */}
        {playgroundView === 'list' ? (
          <View style={styles.playgroundListContainer}>
            {isLoadingProjects ? (
              <View style={styles.playgroundLoadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.playgroundLoadingText}>Loading previews, Sir...</Text>
              </View>
            ) : projects.length === 0 ? (
              <View style={styles.playgroundEmptyContainer}>
                <Ionicons name="folder-open-outline" size={64} color="#475569" style={styles.playgroundEmptyIcon} />
                <Text style={styles.playgroundEmptyTitle}>Playground is empty</Text>
                <Text style={styles.playgroundEmptyDesc}>
                  Live previews will show up here, Sir. Ask VoxKage to build an app or webpage to see it live here.
                </Text>
              </View>
            ) : (
              <ScrollView 
                style={styles.playgroundProjectsList} 
                contentContainerStyle={{ padding: 16, gap: 12 }}
                showsVerticalScrollIndicator={false}
              >
                {projects.map((p) => (
                  <View key={p.id} style={styles.projectItemContainer}>
                    <TouchableOpacity
                      style={styles.projectItemDetails}
                      onPress={() => {
                        setPlaygroundHtml(p.html || '');
                        setPlaygroundCss(p.css || '');
                        setPlaygroundJs(p.js || '');
                        setPlaygroundProjectName(p.name || 'Untitled App');
                        setPlaygroundProjectId(p.id);
                        setPlaygroundView('preview');
                        setPlaygroundRevision((prev) => prev + 1);
                      }}
                    >
                      <Ionicons name="cube-outline" size={18} color="#3b82f6" style={styles.projectItemIcon} />
                      <View style={{ flex: 1 }}>
                        {projectToRename?.id === p.id ? (
                          <TextInput
                            style={styles.projectRenameInput}
                            value={renameProjectName}
                            onChangeText={setRenameProjectName}
                            autoFocus={true}
                            onSubmitEditing={() => handleRenameProject(p.id, renameProjectName)}
                            onBlur={() => handleRenameProject(p.id, renameProjectName)}
                            returnKeyType="done"
                          />
                        ) : (
                          <Text style={styles.projectItemName} numberOfLines={1}>
                            {p.name || 'Untitled Preview'}
                          </Text>
                        )}
                        <Text style={styles.projectItemSub}>Tap to open preview, Sir</Text>
                      </View>
                    </TouchableOpacity>

                    {projectToRename?.id !== p.id && (
                      <View style={styles.projectActionRow}>
                        <TouchableOpacity
                          onPress={() => {
                            setProjectToRename({ id: p.id, name: p.name });
                            setRenameProjectName(p.name);
                          }}
                          style={styles.projectActionBtn}
                        >
                          <Ionicons name="create-outline" size={16} color="#94a3b8" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteProject(p.id)}
                          style={styles.projectActionBtn}
                        >
                          <Ionicons name="trash-outline" size={15} color="#ef4444" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        ) : (
          /* Live Preview sandbox */
          <View style={styles.sandboxContainer}>
            {Platform.OS === 'web' ? (
              // @ts-ignore
              <iframe
                key={`sb-${playgroundRevision}`}
                srcDoc={compiledSandboxHtml}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  border: 'none',
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#0d0d0d'
                }}
                title="Code Preview Sandbox"
              />
            ) : (
              <WebView
                key={`sb-wv-${playgroundRevision}`}
                originWhitelist={['*']}
                source={{ html: compiledSandboxHtml }}
                style={styles.webView}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                backgroundColor="#0d0d0d"
              />
            )}
          </View>
        )}
      </Animated.View>

      {/* Delete Confirmation Modal */}
      {sessionToDelete && (
        <View style={styles.confirmModalBackdrop}>
          <View style={styles.confirmModalContent}>
            <Ionicons name="trash-outline" size={32} color="#ef4444" style={styles.confirmIcon} />
            <Text style={styles.confirmTitle}>Delete Chat Thread</Text>
            <Text style={styles.confirmMessage}>
              Are you sure you want to permanently delete &quot;{sessionToDelete.name}&quot;, Sir?
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setSessionToDelete(null)}
              >
                <Text style={styles.confirmCancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={() => {
                  const id = sessionToDelete.id;
                  setSessionToDelete(null);
                  executeDeleteSession(id);
                }}
              >
                <Text style={styles.confirmDeleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050a18',
  },
  fluidBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    opacity: 0.95,
  },
  litBorderOverlay: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1.2,
    borderColor: '#3b82f6',
    borderRadius: Platform.OS === 'web' ? 32 : 0,
    zIndex: 999,
    ...Platform.select({
      web: {
        boxShadow: '0px 0px 12px rgba(59, 130, 246, 0.8)',
      },
      default: {
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  mainWrapper: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 44 : (Platform.OS === 'web' ? 40 : 20),
  },
  navBar: {
    flexDirection: 'row',
    height: 50,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#171717',
    zIndex: 10,
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
    backgroundColor: '#262626',
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
    backgroundColor: '#0c1222',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: '#1e293b',
    borderWidth: 1,
  },
  avatarText: {
    color: '#2563eb',
    fontWeight: 'bold',
    fontSize: 13,
  },
  assistantBubble: {
    flexShrink: 1,
    backgroundColor: 'rgba(12, 18, 33, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(12px)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      },
      default: {},
    }),
  },
  typingIndicatorContainer: {
    marginTop: 6,
    alignItems: 'flex-start',
  },
  thinkingBubble: {
    minWidth: 180,
  },
  thinkingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  thinkingSpinner: {
    marginRight: 6,
  },
  thinkingTitle: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
  },
  thinkingStatusText: {
    color: '#94a3b8',
    fontSize: 11,
    fontStyle: 'italic',
    paddingLeft: 20,
  },
  streamingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  streamingStatusText: {
    color: '#94a3b8',
    fontSize: 11,
    fontStyle: 'italic',
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
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  inputPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 24,
    paddingHorizontal: 6,
    minHeight: 48,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      },
      default: {},
    }),
  },
  inputAddBtn: {
    padding: 6,
  },
  inputField: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 14.5,
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'web' ? 12 : 8,
    paddingBottom: Platform.OS === 'web' ? 6 : 8,
    maxHeight: 120,
    ...Platform.select({
      web: {
        outlineStyle: 'none',
      } as any,
      default: {},
    }),
  },
  inputVoiceBtn: {
    padding: 6,
  },
  inputSendBtn: {
    padding: 4,
  },
  sendCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendCircleActive: {
    backgroundColor: '#3b82f6',
    ...Platform.select({
      web: {
        boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)',
      },
      default: {},
    }),
  },
  capsulesContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#0c1222',
    borderColor: '#1e293b',
    borderWidth: 1,
  },
  capsuleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
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
    backgroundColor: '#171717',
    borderRightWidth: 1,
    borderRightColor: '#262626',
    paddingTop: Platform.OS === 'ios' ? 44 : (Platform.OS === 'web' ? 40 : 20),
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
    marginBottom: 6,
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
  sidebarPlaygroundBtn: {
    marginHorizontal: 12,
    marginBottom: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#404040',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  sidebarPlaygroundText: {
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
  sessionItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  sessionItemActive: {
    backgroundColor: '#262626',
  },
  sessionTextWrapper: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  sessionText: {
    color: '#9ca3af',
    fontSize: 13.5,
  },
  sessionTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  sessionRenameInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13.5,
    padding: 0,
    margin: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#2563eb',
  },
  sessionActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionActionBtn: {
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
  settingsIconBtn: {
    padding: 6,
  },
  sidebarSettingsPopover: {
    position: 'absolute',
    bottom: 68,
    left: 12,
    right: 12,
    backgroundColor: '#0c1222',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    zIndex: 110,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      },
      default: {},
    }),
  },
  sidebarSettingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    marginBottom: 8,
  },
  sidebarSettingsTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sidebarSettingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sidebarSettingsItemText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  playgroundDrawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: drawerWidth,
    backgroundColor: '#08111f',
    borderLeftWidth: 1,
    borderLeftColor: '#111827',
    paddingTop: Platform.OS === 'ios' ? 44 : (Platform.OS === 'web' ? 40 : 20),
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
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#171717',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 20,
    paddingBottom: 40,
    gap: 8,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  modelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    backgroundColor: '#0d0d0d',
    borderWidth: 1,
    borderColor: '#262626',
    gap: 10,
  },
  modelItemActive: {
    borderColor: '#2563eb',
    backgroundColor: 'rgba(37,99,235,0.05)',
  },
  modelItemText: {
    color: '#9ca3af',
    fontSize: 14,
    flex: 1,
  },
  modelItemTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },

  // Inline Bottom Sheet Modal styles
  inlineModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
    zIndex: 998,
  },
  inlineModalContent: {
    backgroundColor: '#0c1222',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 18,
    paddingBottom: 30,
    maxHeight: '65%',
  },
  inlineModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  inlineModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineModalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  inlineModalCloseBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  inlineModalSectionLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  variantChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  inlineVariantChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  inlineVariantChipActive: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  inlineVariantChipText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  inlineVariantChipTextActive: {
    color: '#60a5fa',
  },
  inlineModalList: {
    marginTop: 4,
  },
  inlineModelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 6,
    gap: 8,
  },
  inlineModelItemActive: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  inlineModelItemDetails: {
    flex: 1,
  },
  inlineModelName: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  inlineModelNameActive: {
    color: '#ffffff',
  },
  inlineModelId: {
    color: '#475569',
    fontSize: 10,
    marginTop: 1,
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: -1000,
    bottom: -1000,
    left: -1000,
    right: -1000,
    zIndex: 999,
  },
  variantDropdown: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 112 : 104,
    right: 16,
    backgroundColor: '#0c1222',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 6,
    width: 130,
    zIndex: 1000,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      },
      default: {},
    }),
  },
  variantDropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  variantDropdownItemActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  variantDropdownText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  variantDropdownTextActive: {
    color: '#60a5fa',
  },
  confirmModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2000,
  },
  confirmModalContent: {
    width: '85%',
    maxWidth: 320,
    backgroundColor: '#0c1222',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 24,
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
      },
      default: {},
    }),
  },
  confirmIcon: {
    marginBottom: 16,
  },
  confirmTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  confirmMessage: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  confirmCancelBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmDeleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmDeleteBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  playgroundBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playgroundBackText: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
  },
  playgroundProjectTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 12,
  },
  playgroundListContainer: {
    flex: 1,
    backgroundColor: '#050a18',
  },
  playgroundLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  playgroundLoadingText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  playgroundEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  playgroundEmptyIcon: {
    marginBottom: 8,
    opacity: 0.5,
  },
  playgroundEmptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  playgroundEmptyDesc: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  playgroundProjectsList: {
    flex: 1,
  },
  projectItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c1222',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    padding: 12,
    gap: 12,
  },
  projectItemDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  projectItemIcon: {
    padding: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 10,
  },
  projectItemName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  projectItemSub: {
    color: '#475569',
    fontSize: 11,
    marginTop: 2,
  },
  projectRenameInput: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    borderBottomWidth: 1,
    borderBottomColor: '#2563eb',
    padding: 0,
    margin: 0,
    flex: 1,
  },
  projectActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectActionBtn: {
    padding: 6,
  },
  openPlaygroundBubbleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  openPlaygroundBubbleBtnText: {
    color: '#60a5fa',
    fontSize: 11.5,
    fontWeight: '600',
  },
  refiningHudBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  refiningHudLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  refiningHudText: {
    color: '#60a5fa',
    fontSize: 12.5,
    fontWeight: '600',
  },
  refiningHudCloseBtn: {
    padding: 2,
  },
  playgroundRefineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 1,
    borderRadius: 8,
  },
  playgroundRefineText: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '600',
  },
  playgroundTitleContainer: {
    position: 'absolute',
    left: 80,
    right: 80,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});
