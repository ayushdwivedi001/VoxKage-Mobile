import { useState } from 'react';
import { ChatSession } from '@/components/chat/SidebarDrawer';
import { ChatMessage } from '@/components/chat/ChatFeed';

export function useChatSessions(
  backendUrl: string,
  token: string | null,
  inputText: string,
  wsRef: React.MutableRefObject<WebSocket | null>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  setStreamingText: React.Dispatch<React.SetStateAction<string>>,
  closeSidebar: () => void,
  showAlert: (title: string, message: string) => void,
  connectWebSocketRef: React.MutableRefObject<((sessionId: string, token: string, url: string) => void) | null>,
  scanMessagesForPlayground: (msgList: ChatMessage[]) => void
) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isNewChat, setIsNewChat] = useState(true);
  const [contextPercent, setContextPercent] = useState(0);
  const [compactionProgress, setCompactionProgress] = useState<number | null>(null);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionName, setEditingSessionName] = useState('');
  const [sessionToDelete, setSessionToDelete] = useState<{ id: string; name: string } | null>(null);

  const loadSessions = async (url: string, jwtToken: string) => {
    if (jwtToken.startsWith('mock-')) {
      const mockSessions: ChatSession[] = [
        { id: '1', name: 'Mock Chat Session 1', created_at: new Date().toISOString() },
        { id: '2', name: 'Mock Chat Session 2', created_at: new Date().toISOString() },
      ];
      setSessions(mockSessions);
      return;
    }

    try {
      const response = await fetch(`${url}/sessions`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(Array.isArray(data) ? data : (data.sessions || []));
      }
    } catch (e) {
      console.error('Failed to fetch sessions from API', e);
    }
  };

  const createNewSession = () => {
    // If we're already on an empty/new chat, do nothing to prevent duplicate empty states
    if (isNewChat && inputText.trim() === '') {
      closeSidebar();
      return;
    }

    setCurrentSessionId(null);
    setMessages([]);
    setIsNewChat(true);
    setStreamingText('');
    setContextPercent(0);
    closeSidebar();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const selectSession = async (sessionId: string) => {
    if (currentSessionId === sessionId) {
      closeSidebar();
      return;
    }

    setMessages([]);
    setStreamingText('');
    setContextPercent(0);
    setCompactionProgress(null);

    if (token?.startsWith('mock-')) {
      setCurrentSessionId(sessionId);
      setIsNewChat(false);
      const mockMsg: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Mock user message' },
        { id: '2', role: 'assistant', content: 'Mock assistant response. Here is some html:\n```html\n<h1>Hello Mock</h1>\n```' }
      ];
      setMessages(mockMsg);
      scanMessagesForPlayground(mockMsg);
      closeSidebar();
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
        connectWebSocketRef.current?.(sessionId, token || '', backendUrl);
      }
    } catch (e) {
      showAlert('Error', 'Failed to fetch session messages, Sir.');
    } finally {
      closeSidebar();
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
      const response = await fetch(
        `${backendUrl}/sessions/${sessionId}/rename?name=${encodeURIComponent(newName)}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
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

  return {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    isNewChat,
    setIsNewChat,
    contextPercent,
    setContextPercent,
    compactionProgress,
    setCompactionProgress,
    editingSessionId,
    setEditingSessionId,
    editingSessionName,
    setEditingSessionName,
    sessionToDelete,
    setSessionToDelete,
    loadSessions,
    createNewSession,
    selectSession,
    deleteSession,
    executeDeleteSession,
    handleRenameSession,
  };
}
