import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/components/chat/ChatFeed';
import { WorkflowNode } from '@/components/chat/ToolWorkflowPath';
import { ChatSession } from '@/components/chat/SidebarDrawer';
import { executeMobileTool } from '@/utils/mobileTools';
import { storage } from '@/utils/storage';

interface StagedAttachment {
  uri: string;
  name: string;
  type: 'image' | 'document';
  size: number;
  base64?: string;
  mimeType?: string;
}

export function useWebSocket(
  backendUrl: string,
  token: string | null,
  activeModel: string,
  VARIANTS: string[],
  activeVariantIndex: number,
  sessionRef: React.MutableRefObject<{
    currentSessionId: string | null;
    setCurrentSessionId: React.Dispatch<React.SetStateAction<string | null>>;
    setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
    setIsNewChat: React.Dispatch<React.SetStateAction<boolean>>;
    setContextPercent: React.Dispatch<React.SetStateAction<number>>;
    setCompactionProgress: React.Dispatch<React.SetStateAction<number | null>>;
    setIsThinkingLogsOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  }>,
  stagedAttachment: StagedAttachment | null,
  setStagedAttachment: React.Dispatch<React.SetStateAction<StagedAttachment | null>>,
  activeEditingProjectId: string | null,
  setActiveEditingProjectId: React.Dispatch<React.SetStateAction<string | null>>,
  projects: any[],
  loadProjectsRef: React.MutableRefObject<((url: string, jwtToken: string) => Promise<void>) | null>,
  setPlaygroundHtml: React.Dispatch<React.SetStateAction<string>>,
  setPlaygroundCss: React.Dispatch<React.SetStateAction<string>>,
  setPlaygroundJs: React.Dispatch<React.SetStateAction<string>>,
  setPlaygroundProjectName: React.Dispatch<React.SetStateAction<string>>,
  setPlaygroundRevision: React.Dispatch<React.SetStateAction<number>>,
  setPlaygroundView: React.Dispatch<React.SetStateAction<'list' | 'preview'>>,
  openPlayground: () => void,
  handleSaveProjectRef: React.MutableRefObject<((
    name: string,
    html: string,
    css: string,
    js: string,
    projectId: string | null
  ) => Promise<string | null>) | null>,
  setUploadingFile: React.Dispatch<React.SetStateAction<boolean>>,
  showAlert: (title: string, message: string) => void,
  performUpload: (
    url: string,
    uri: string,
    name: string,
    mimeType: string,
    token: string,
    model?: string
  ) => Promise<any>
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);

  const [bridgeMode, setBridgeMode] = useState<'laptop' | 'mobile_local'>('laptop');
  const [mobileLocalIp, setMobileLocalIp] = useState('');

  useEffect(() => {
    const loadBridgeSettings = async () => {
      const mode = await storage.getBridgeMode();
      const ip = await storage.getMobileLocalIp();
      setBridgeMode(mode);
      setMobileLocalIp(ip);
    };
    loadBridgeSettings();
  }, [token]);

  const [workflowNodes, setWorkflowNodes] = useState<WorkflowNode[]>([]);
  const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);

  const [confirmationToolName, setConfirmationToolName] = useState<string | null>(null);
  const [confirmationToolLabel, setConfirmationToolLabel] = useState<string | null>(null);
  const [confirmationRequestId, setConfirmationRequestId] = useState<string | null>(null);

  const [showBtwOverlay, setShowBtwOverlay] = useState(false);
  const [btwMessages, setBtwMessages] = useState<{ role: string; content: string }[]>([]);
  const [btwLoading, setBtwLoading] = useState(false);

  const [messageProjectIds, setMessageProjectIds] = useState<Record<string, string>>({});
  const [activeSwarmTask, setActiveSwarmTask] = useState<any | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const wasLastInputVoice = useRef(false);
  const streamingTextRef = useRef('');
  const activeEditingProjectIdRef = useRef<string | null>(null);
  const projectsRef = useRef<any[]>([]);

  // Pacing streaming buffer & state refs
  const rawStreamingBufferRef = useRef('');
  const displayedStreamingTextRef = useRef('');
  const pacingIntervalRef = useRef<any>(null);
  const isDoneReceivedRef = useRef(false);
  const pendingDoneDataRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (pacingIntervalRef.current) {
        clearInterval(pacingIntervalRef.current);
      }
    };
  }, []);

  // Sync projects and activeEditingProjectId states to their refs to prevent stale websocket message handler read values
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    activeEditingProjectIdRef.current = activeEditingProjectId;
  }, [activeEditingProjectId]);

  const resetPacingRefs = () => {
    if (pacingIntervalRef.current) {
      clearInterval(pacingIntervalRef.current);
      pacingIntervalRef.current = null;
    }
    rawStreamingBufferRef.current = '';
    displayedStreamingTextRef.current = '';
    isDoneReceivedRef.current = false;
    pendingDoneDataRef.current = null;
  };

  const handleDoneExecution = async () => {
    sessionRef.current.setCompactionProgress(null);
    const associatedProjectId = pendingDoneDataRef.current?.project_id || null;
    const currText = displayedStreamingTextRef.current;

    // Clear streaming text state
    setStreamingText('');
    streamingTextRef.current = '';
    displayedStreamingTextRef.current = '';
    rawStreamingBufferRef.current = '';
    isDoneReceivedRef.current = false;
    pendingDoneDataRef.current = null;

    if (currText.trim()) {
      const assistantMessageId = generateRandomId('assistant');
      const editingId = associatedProjectId || activeEditingProjectIdRef.current;

      if (editingId) {
        setMessageProjectIds((prevMap) => ({ ...prevMap, [assistantMessageId]: editingId }));
      }

      // Check if there is playground code in the response
      const htmlMatch = currText.match(/```html\n([\s\S]*?)```/i);
      const cssMatch = currText.match(/```css\n([\s\S]*?)```/i);
      const jsMatch =
        currText.match(/```javascript\n([\s\S]*?)```/i) ||
        currText.match(/```js\n([\s\S]*?)```/i);
      const hasPlaygroundCode = htmlMatch || cssMatch || jsMatch;

      setMessages((prev) => {
        const updated = [
          ...prev,
          { id: assistantMessageId, role: 'assistant' as const, content: currText },
        ];
        scanMessagesForPlayground(updated);
        return updated;
      });

      if (editingId && hasPlaygroundCode) {
        const htmlCode = htmlMatch ? htmlMatch[1] : '';
        const cssCode = cssMatch ? cssMatch[1] : '';
        const jsCode = jsMatch ? jsMatch[1] : '';

        const originalProj = projectsRef.current.find((p) => p.id === editingId);
        if (originalProj) {
          const finalHtml = htmlCode || originalProj.html || '';
          const finalCss = cssCode || originalProj.css || '';
          const finalJs = jsCode || originalProj.js || '';

          setPlaygroundHtml(finalHtml);
          setPlaygroundCss(finalCss);
          setPlaygroundJs(finalJs);
          setPlaygroundRevision((prev) => prev + 1);

          let projName = originalProj.name;
          const isPlaceholderName =
            projName === 'Workspace Project' ||
            projName === 'New Live App' ||
            projName === 'New Chat' ||
            projName.startsWith('Playground -');

          if (isPlaceholderName && finalHtml) {
            const titleMatch = finalHtml.match(/<title>([\s\S]*?)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
              const parsedTitle = titleMatch[1].trim();
              const genericTitles = ['preview', 'index', 'home', 'document', 'html', 'untitled', 'untitled document', 'app', 'my app', 'my project', 'workspace project', 'new live app', 'new chat'];
              if (parsedTitle && !genericTitles.includes(parsedTitle.toLowerCase())) {
                projName = parsedTitle;
                setPlaygroundProjectName(projName);
              }
            }
          }

          if (handleSaveProjectRef.current) {
            // Save project asynchronously in the background to prevent UI lockup
            (async () => {
              try {
                await handleSaveProjectRef.current!(
                  projName,
                  finalHtml,
                  finalCss,
                  finalJs,
                  editingId
                );
              } catch (saveErr) {
                console.error('[useWebSocket] Error saving playground project in background:', saveErr);
              }
            })();
          }
        }
      }
    }

    // Immediately unlock UI loading state and clear thinking status
    setLoading(false);
    setThinkingStatus(null);

    if (associatedProjectId) {
      // Reload projects asynchronously in the background to prevent UI lockup
      (async () => {
        try {
          await loadProjectsRef.current?.(backendUrl, token || '');
        } catch (loadErr) {
          console.error('[useWebSocket] Error reloading projects in background:', loadErr);
        }
      })();
    }
  };

  const startPacingLoop = () => {
    if (pacingIntervalRef.current) return;

    pacingIntervalRef.current = setInterval(() => {
      const buffer = rawStreamingBufferRef.current;
      const displayed = displayedStreamingTextRef.current;

      if (displayed.length < buffer.length) {
        const diff = buffer.length - displayed.length;
        let charsToAppend = 1;
        if (diff > 250) {
          charsToAppend = 16;
        } else if (diff > 120) {
          charsToAppend = 8;
        } else if (diff > 50) {
          charsToAppend = 4;
        } else if (diff > 15) {
          charsToAppend = 2;
        }

        const nextText = displayed + buffer.substring(displayed.length, displayed.length + charsToAppend);
        // Guard: only call setState if the text has actually changed, preventing
        // "Maximum update depth exceeded" from setInterval firing at 18ms intervals.
        if (nextText !== displayed) {
          displayedStreamingTextRef.current = nextText;
          setStreamingText(nextText);
          streamingTextRef.current = nextText;
        }
      } else if (isDoneReceivedRef.current) {
        clearInterval(pacingIntervalRef.current);
        pacingIntervalRef.current = null;
        handleDoneExecution();
      }
    }, 18);
  };


  const updateStreamingText = (text: string | ((prev: string) => string)) => {
    setStreamingText((prev) => {
      const next = typeof text === 'function' ? text(prev) : text;
      streamingTextRef.current = next;
      return next;
    });
  };

  const generateRandomId = (prefix: string = 'rand'): string => {
    return `${prefix}-${Math.floor(Math.random() * 10000000)}`;
  };

  const scanMessagesForPlayground = (msgList: ChatMessage[]) => {
    let htmlCode = '';
    let cssCode = '';
    let jsCode = '';

    for (const msg of msgList) {
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
      setPlaygroundHtml(htmlCode || '<h1>Live Preview</h1>');
      setPlaygroundCss(cssCode || '');
      setPlaygroundJs(jsCode || '');
      setPlaygroundProjectName('Live Preview Sandbox');
      setPlaygroundRevision((prev) => prev + 1);
    }
  };

  const connectWebSocket = (sessionId: string, jwtToken: string, url: string) => {
    if (wsRef.current) wsRef.current.close();
    resetPacingRefs();

    const wsScheme = url.startsWith('https') ? 'wss' : 'ws';
    const cleanBaseUrl = url.replace(/^(https?:\/\/)/, '').replace(/\/$/, '');
    const wsUrl = `${wsScheme}://${cleanBaseUrl}/ws/chat/${sessionId}?token=${jwtToken}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };

    ws.onclose = (e) => {
      console.log('WebSocket connection closed:', e);
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'token') {
          rawStreamingBufferRef.current += data.content;
          startPacingLoop();
        } else if (data.type === 'context_sync') {
          sessionRef.current.setContextPercent(data.percent);
        } else if (data.type === 'compaction_progress') {
          sessionRef.current.setCompactionProgress(data.progress);
        } else if (data.type === 'proxy_completion_request') {
          const { request_id, payload } = data;

          const runProxyQuery = async () => {
            try {
              let completionsUrl = 'https://opencode.ai/zen/v1/chat/completions';
              const currentBridgeMode = await storage.getBridgeMode();
              const currentMobileLocalIp = await storage.getMobileLocalIp();
              
              if (currentBridgeMode === 'mobile_local' && currentMobileLocalIp) {
                let formattedIp = currentMobileLocalIp.trim();
                if (!formattedIp.startsWith('http')) {
                  formattedIp = `http://${formattedIp}`;
                }
                if (!formattedIp.includes('/chat/completions') && !formattedIp.includes('/v1')) {
                  completionsUrl = `${formattedIp}/v1/chat/completions`;
                } else if (formattedIp.includes('/v1') && !formattedIp.includes('/chat/completions')) {
                  completionsUrl = `${formattedIp}/chat/completions`;
                } else {
                  completionsUrl = formattedIp;
                }
                console.log(`[Proxy] Routing completions via Mobile Local Bridge IP URL: ${completionsUrl}`);
              }

              const response = await fetch(completionsUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${payload.api_key}`,
                },
                body: JSON.stringify({
                  model: payload.model,
                  messages: payload.messages,
                  tools: payload.tools,
                  tool_choice: payload.tool_choice,
                  temperature: payload.temperature,
                  stream: true,
                }),
              });

              if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
              }

              if (response.body && typeof response.body.getReader === 'function') {
                const reader = response.body.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = '';

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    const cleanLine = line.replace(/^data:\s*/, '').trim();
                    if (!cleanLine) continue;
                    if (cleanLine === '[DONE]') continue;

                    try {
                      const chunk = JSON.parse(cleanLine);
                      const delta = chunk.choices?.[0]?.delta;
                      if (delta) {
                        ws.send(
                          JSON.stringify({
                            type: 'proxy_completion_chunk',
                            request_id,
                            delta,
                          })
                        );
                      }
                    } catch (e) {
                      // skip parsing errors
                    }
                  }
                }
              } else {
                const resJson = await response.json();
                const content = resJson.choices?.[0]?.message?.content || '';
                const toolCalls = resJson.choices?.[0]?.message?.tool_calls;
                ws.send(
                  JSON.stringify({
                    type: 'proxy_completion_chunk',
                    request_id,
                    delta: { content, tool_calls: toolCalls },
                  })
                );
              }

              ws.send(
                JSON.stringify({
                  type: 'proxy_completion_done',
                  request_id,
                })
              );
            } catch (err: any) {
              console.error('[-] Proxy completions execution failed:', err);
              ws.send(
                JSON.stringify({
                  type: 'proxy_completion_error',
                  request_id,
                  error: err?.message || String(err),
                })
              );
            }
          };

          runProxyQuery();
        } else if (data.type === 'mobile_tool_call') {
          const { request_id, tool_name, arguments: toolArgs } = data;
          const runMobileTool = async () => {
            try {
              const result = await executeMobileTool(tool_name, toolArgs);
              ws.send(
                JSON.stringify({
                  type: 'mobile_tool_response',
                  request_id,
                  status: 'success',
                  result,
                })
              );
            } catch (err: any) {
              console.error('[-] Mobile tool execution failed:', err);
              ws.send(
                JSON.stringify({
                  type: 'mobile_tool_response',
                  request_id,
                  status: 'error',
                  result: err?.message || String(err),
                })
              );
            }
          };
          runMobileTool();
        } else if (data.type === 'error') {
          sessionRef.current.setCompactionProgress(null);
          resetPacingRefs();
          let errorMsg = data.content;
          if (errorMsg && errorMsg.includes('Upstream error:')) {
            try {
              const rawJson = errorMsg
                .substring(errorMsg.indexOf('Upstream error:') + 'Upstream error:'.length)
                .trim();
              const parsed = JSON.parse(rawJson);
              if (parsed?.error?.message) {
                errorMsg = parsed.error.message;
              }
            } catch (e) {
              // fallback
            }
          }
          showAlert('Engine Error', errorMsg);
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
          sessionRef.current.setSessions((prev) =>
            prev.map((s) => (s.id === sessionId ? { ...s, name: data.name } : s))
          );
        } else if (data.type === 'tool_plan') {
          setWorkflowNodes(data.nodes || []);
        } else if (data.type === 'tool_start') {
          setWorkflowNodes((prev) =>
            prev.map((n) => (n.id === data.node_id ? { ...n, status: 'running' } : n))
          );
        } else if (data.type === 'tool_success') {
          setWorkflowNodes((prev) =>
            prev.map((n) => (n.id === data.node_id ? { ...n, status: 'success' } : n))
          );
        } else if (data.type === 'tool_failed') {
          setWorkflowNodes((prev) =>
            prev.map((n) => (n.id === data.node_id ? { ...n, status: 'failed' } : n))
          );
        } else if (data.type === 'agent_thought') {
          const timestamp = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          setThinkingLogs((prev) => [...prev, `[${timestamp}] ${data.content}`]);
        } else if (data.type === 'tool_confirm_request') {
          setConfirmationToolName(data.tool_name);
          setConfirmationToolLabel(data.label || data.tool_name);
          setConfirmationRequestId(data.request_id);
        } else if (data.type === 'swarm_update') {
          if (data.session_id === sessionId) {
            setActiveSwarmTask(data.active_swarm);
          }
        } else if (data.type === 'swarm_complete') {
          if (data.session_id === sessionId) {
            setActiveSwarmTask(null);
            setMessages((prev) => {
              const filtered = prev.filter((m) => m.id !== 'swarm-progress-msg');
              return [
                ...filtered,
                { id: generateRandomId('assistant'), role: 'assistant' as const, content: data.final_report },
              ];
            });
            executeMobileTool('mobile_show_notification', {
              title: 'Swarm Task Completed',
              body: 'The research query has been compiled successfully.',
            }).catch(() => {});
          }
        } else if (data.type === 'swarm_error') {
          if (data.session_id === sessionId) {
            setActiveSwarmTask(null);
            setMessages((prev) => {
              const filtered = prev.filter((m) => m.id !== 'swarm-progress-msg');
              return [
                ...filtered,
                { id: generateRandomId('assistant'), role: 'assistant' as const, content: `[Swarm Task Failed: ${data.error}]` },
              ];
            });
          }
        } else if (data.type === 'done') {
          pendingDoneDataRef.current = data;
          isDoneReceivedRef.current = true;
          startPacingLoop();
        }
      } catch (e) {
        console.error('Socket message parse error', e);
      }
    };
  };

  const ensureSessionId = async (): Promise<string | null> => {
    let targetSessionId = sessionRef.current.currentSessionId;
    if (targetSessionId) return targetSessionId;

    if (!token || !backendUrl) return null;
    try {
      const response = await fetch(`${backendUrl.trim().replace(/\/$/, '')}/sessions?name=New Chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const session = await response.json();
        sessionRef.current.setSessions((prev) => [session, ...prev]);
        sessionRef.current.setCurrentSessionId(session.id);
        sessionRef.current.setIsNewChat(false);
        connectWebSocket(session.id, token, backendUrl);
        return session.id;
      }
    } catch (e) {
      console.error('Error in ensureSessionId:', e);
    }
    return null;
  };

  const ensureWebSocketConnected = (
    sessionId: string,
    initialStatus: string = 'Thinking...'
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        resolve(true);
        return;
      }

      setThinkingStatus(initialStatus);

      if (
        !wsRef.current ||
        (wsRef.current.readyState !== WebSocket.OPEN &&
          wsRef.current.readyState !== WebSocket.CONNECTING)
      ) {
        connectWebSocket(sessionId, token || '', backendUrl);
      }

      let checks = 0;
      const maxChecks = 125;
      const interval = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          resolve(true);
        } else {
          checks++;
          if (checks % 15 === 0) {
            setThinkingStatus('Initiating Cloud Engine...');
          }
          if (checks >= maxChecks) {
            clearInterval(interval);
            resolve(false);
          }
        }
      }, 200);
    });
  };

  const handleStopGeneration = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const currText = displayedStreamingTextRef.current || streamingTextRef.current;
    resetPacingRefs();
    updateStreamingText('');

    if (currText.trim()) {
      const assistantMessageId = generateRandomId('assistant');
      const stoppedContent = currText + '\n\n*[Generation stopped.]*';

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

  const handleSendMessage = async (overrideText?: string) => {
    const currentBridgeMode = await storage.getBridgeMode();
    const currentMobileLocalIp = await storage.getMobileLocalIp();
    setBridgeMode(currentBridgeMode);
    setMobileLocalIp(currentMobileLocalIp);

    const textToUse = typeof overrideText === 'string' ? overrideText : undefined;
    const userQuery = textToUse !== undefined ? textToUse.trim() : inputText.trim();
    if (!userQuery && !stagedAttachment) return;

    resetPacingRefs();
    setWorkflowNodes([]);
    setThinkingLogs([]);
    sessionRef.current.setIsThinkingLogsOpen?.(false);
    setConfirmationToolName(null);
    setConfirmationToolLabel(null);
    setConfirmationRequestId(null);

    wasLastInputVoice.current = textToUse !== undefined;

    if (showBtwOverlay || userQuery.startsWith('/btw')) {
      const isInitial = !showBtwOverlay;
      setInputText('');
      setStagedAttachment(null);
      setShowBtwOverlay(true);
      setBtwLoading(true);

      const prompt = isInitial && userQuery.startsWith('/btw') ? userQuery : userQuery;
      const updatedMessages = [...(isInitial ? [] : btwMessages), { role: 'user', content: prompt }];
      setBtwMessages(updatedMessages);

      if (token?.startsWith('mock-')) {
        setTimeout(() => {
          setBtwMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content:
                'This is a side-channel reply in mock mode. I can answer quick doubts here.',
            },
          ]);
          setBtwLoading(false);
        }, 800);
        return;
      }

      let targetSessionId = await ensureSessionId();
      if (!targetSessionId) {
        showAlert('Error', 'Could not initialize session.');
        setBtwLoading(false);
        return;
      }

      const wsConnected = await ensureWebSocketConnected(targetSessionId, 'Connecting side-channel..');
      if (!wsConnected) {
        showAlert('Connection Failed', 'Socket connection is currently down. Cannot route side-question.');
        setBtwLoading(false);
        return;
      }

      try {
        const response = await fetch(`${backendUrl.trim().replace(/\/$/, '')}/chat/btw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ 
            messages: updatedMessages,
            bridge_mode: currentBridgeMode,
            mobile_local_ip: currentMobileLocalIp || undefined
          }),
        });
        if (response.ok) {
          const resData = await response.json();
          setBtwMessages((prev) => [...prev, { role: 'assistant', content: resData.response }]);
        } else {
          setBtwMessages((prev) => [
            ...prev,
            { role: 'assistant', content: '[Error querying side-channel.]' },
          ]);
        }
      } catch (err: any) {
        setBtwMessages((prev) => [...prev, { role: 'assistant', content: `[Error: ${err.message}]` }]);
      } finally {
        setBtwLoading(false);
      }
      return;
    }

    if (userQuery.startsWith('/agents')) {
      setInputText('');
      setStagedAttachment(null);
      
      const cleanText = userQuery.replace(/^\/agents\s*/, '').trim();
      if (!cleanText) {
        showAlert('Invalid Query', 'Please describe the task for the agents.');
        return;
      }

      setLoading(true);
      setStreamingText('');

      let targetSessionId = await ensureSessionId();
      if (!targetSessionId) {
        showAlert('Error', 'Could not initialize session.');
        setLoading(false);
        return;
      }

      const wsConnected = await ensureWebSocketConnected(targetSessionId, 'Warming up swarm environment...');
      if (!wsConnected) {
        showAlert('Connection Failed', 'Socket connection is currently down. Cannot route swarm task.');
        setLoading(false);
        setThinkingStatus(null);
        return;
      }

      // Add local messages for user prompt and placeholder for swarm progress card
      setMessages((prev) => [
        ...prev,
        { id: generateRandomId('user'), role: 'user', content: userQuery },
        { id: 'swarm-progress-msg', role: 'assistant', content: '', type: 'swarm_progress' as any }
      ]);

      if (token?.startsWith('mock-')) {
        const mockTaskId = `swarm-mock-${Math.floor(Math.random() * 100000)}`;
        const mockActiveSwarm = {
          task_id: mockTaskId,
          query: cleanText,
          status: 'running',
          subagents: [
            { id: 'agent-1', name: 'Agent Researcher', role: 'Web Research', task: 'Search web for info', status: 'running', logs: 'Searching...' },
            { id: 'agent-2', name: 'Agent Analyzer', role: 'Analyze Data', task: 'Analyze findings', status: 'pending', logs: 'Waiting...' },
            { id: 'agent-3', name: 'Agent Verifier', role: 'Verify Facts', task: 'Verify details', status: 'pending', logs: 'Waiting...' }
          ],
          final_result: null
        };
        setActiveSwarmTask(mockActiveSwarm);
        
        // Simulate progress
        setTimeout(() => {
          setActiveSwarmTask((prev: any) => {
            if (!prev) return null;
            const updated = JSON.parse(JSON.stringify(prev));
            updated.subagents[0].status = 'completed';
            updated.subagents[0].logs = 'Task complete.';
            updated.subagents[1].status = 'running';
            updated.subagents[1].logs = 'Structuring comparisons...';
            return updated;
          });
        }, 1500);

        setTimeout(() => {
          setActiveSwarmTask((prev: any) => {
            if (!prev) return null;
            const updated = JSON.parse(JSON.stringify(prev));
            updated.subagents[1].status = 'completed';
            updated.subagents[1].logs = 'Task complete.';
            updated.subagents[2].status = 'running';
            updated.subagents[2].logs = 'Verifying sources...';
            return updated;
          });
        }, 3000);

        setTimeout(() => {
          setActiveSwarmTask((prev: any) => {
            if (!prev) return null;
            const updated = JSON.parse(JSON.stringify(prev));
            updated.subagents[2].status = 'completed';
            updated.subagents[2].logs = 'Task complete.';
            updated.status = 'completed';
            return updated;
          });
          
          setMessages((prev) => {
            const filtered = prev.filter((m) => m.id !== 'swarm-progress-msg');
            return [
              ...filtered,
              {
                id: generateRandomId('assistant'),
                role: 'assistant',
                content: 'I have gathered and analyzed the research. Here is the final compiled summary with links and charts.'
              }
            ];
          });
          setActiveSwarmTask(null);
          setLoading(false);
        }, 4500);
        return;
      }

      try {
        const response = await fetch(`${backendUrl.trim().replace(/\/$/, '')}/chat/swarm/launch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query: userQuery,
            session_id: targetSessionId,
            model_key: activeModel,
            bridge_mode: currentBridgeMode,
            mobile_local_ip: currentMobileLocalIp || undefined,
          }),
        });

        if (response.ok) {
          const resData = await response.json();
          if (resData.active_swarm) {
            setActiveSwarmTask(resData.active_swarm);
          }
        } else {
          const errText = await response.text();
          showAlert('Swarm Launch Error', errText || 'Failed to launch swarm task.');
          setMessages((prev) => prev.filter((m) => m.id !== 'swarm-progress-msg'));
        }
      } catch (err: any) {
        showAlert('Swarm Launch Error', err.message || String(err));
        setMessages((prev) => prev.filter((m) => m.id !== 'swarm-progress-msg'));
      } finally {
        setLoading(false);
      }
      return;
    }

    const staged = stagedAttachment;

    if (token?.startsWith('mock-')) {
      let targetSessionId = sessionRef.current.currentSessionId;
      if (!targetSessionId) {
        const newMockId = generateRandomId('mock');
        const newMockSession: ChatSession = {
          id: newMockId,
          name: 'New Chat',
          created_at: new Date().toISOString().split('T')[0],
        };
        sessionRef.current.setSessions((prev) => [newMockSession, ...prev]);
        sessionRef.current.setCurrentSessionId(newMockId);
        targetSessionId = newMockId;
      }

      let displayMsg = userQuery;
      if (staged) {
        displayMsg = userQuery
          ? `${userQuery}\n\n📎 Attached ${staged.type === 'image' ? 'Image' : 'Document'}: ${staged.name}`
          : `📎 Attached ${staged.type === 'image' ? 'Image' : 'Document'}: ${staged.name}`;
      }

      setInputText('');
      setStagedAttachment(null);
      setLoading(true);
      sessionRef.current.setIsNewChat(false);
      setMessages((prev) => [
        ...prev,
        { id: generateRandomId('user'), role: 'user', content: displayMsg },
      ]);
      setStreamingText('');

      setTimeout(() => {
        let isCodeQuery = /dashboard|html|website|page/i.test(userQuery);
        let isCmdQuery = /run|git|sys/i.test(userQuery);

        let responseTemplate = `I am online in Simulation Mode. Let me know what you need.`;
        if (staged) {
          responseTemplate = `I see the attached ${staged.type} '${staged.name}'. I have indexed its content in Supabase. How can I help you with it?`;
        } else if (isCodeQuery) {
          responseTemplate = [
            'I have constructed an interactive live preview app dashboard for you. You can slide open the Code Playground drawer on the right to view it live.',
            '',
            '```html',
            '<!DOCTYPE html>',
            '<html>',
            '<head>',
            '<style>',
            'body { font-family: sans-serif; background: #090d16; color: #fff; padding: 20px; }',
            '.card { background: #171717; border: 1px solid #262626; border-radius: 12px; padding: 24px; text-align: center; }',
            'h1 { color: #3b82f6; }',
            'button { background: #2563eb; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; }',
            '</style>',
            '</head>',
            '<body>',
            "<div class='card'>",
            '<h1>VoxKage Mobile Live Sandbox</h1>',
            '<p>This is a live compiled application built by VoxKage.</p>',
            '<button onclick=\'alert("Hello!")\'>Trigger Interaction</button>',
            '</div>',
            '</body>',
            '</html>',
            '```',
          ].join('\n');
        } else if (isCmdQuery) {
          setMessages((prev) => [
            ...prev,
            {
              id: `log-${Math.random()}`,
              role: 'laptop' as const,
              content: [
                `[task-419] Executing command: ${userQuery}`,
                'On branch main',
                "Your branch is up to date with 'origin/main'.",
                '',
                'nothing to commit, working tree clean',
              ].join('\n'),
            },
          ]);
          responseTemplate = `The power shell command execution completed. Working tree is clean.`;
        }

        let words = responseTemplate.split(' ');
        let currentIdx = 0;
        const interval = setInterval(() => {
          if (currentIdx < words.length) {
            setStreamingText(
              (prev) => prev + (currentIdx === 0 ? '' : ' ') + words[currentIdx]
            );
            currentIdx++;
          } else {
            clearInterval(interval);
            setStreamingText((currText) => {
              setMessages((prev) => [
                ...prev,
                {
                  id: `assistant-${Math.random()}`,
                  role: 'assistant' as const,
                  content: currText,
                },
              ]);
              return '';
            });
            setLoading(false);
          }
        }, 80);
      }, 1000);
      return;
    }
    let targetSessionId = await ensureSessionId();
    if (!targetSessionId) {
      setLoading(false);
      return;
    }

    let uploadedDocId: string | null = null;

    if (staged && (staged.type === 'document' || staged.type === 'image')) {
      setUploadingFile(true);
      setThinkingStatus(`Uploading and indexing ${staged.type}`);

      try {
        const uploadUrl = `${backendUrl}/rag/upload`;
        const mimeType =
          staged.mimeType || (staged.type === 'image' ? 'image/jpeg' : 'application/octet-stream');
        const uploadRes = await performUpload(
          uploadUrl,
          staged.uri,
          staged.name,
          mimeType,
          token || '',
          activeModel
        );
        uploadedDocId = uploadRes.document_id;

        setMessages((prev) => [
          ...prev,
          {
            id: generateRandomId('system'),
            role: 'laptop',
            content: `📄 Document indexed: ${staged.name}\nVector RAG version has been stored.`,
          },
        ]);
      } catch (err: any) {
        showAlert('Upload Error', `Failed to upload document: ${err.message}`);
        setUploadingFile(false);
        return;
      } finally {
        setUploadingFile(false);
      }
    }

    let displayMsg = userQuery;
    if (staged) {
      displayMsg = userQuery
        ? `${userQuery}\n\n📎 Attached ${staged.type === 'image' ? 'Image' : 'Document'}: ${staged.name}`
        : `📎 Attached ${staged.type === 'image' ? 'Image' : 'Document'}: ${staged.name}`;
    }

    const activeProject = activeEditingProjectId
      ? projectsRef.current.find((p) => p.id === activeEditingProjectId)
      : null;

    const clientTimeStr = new Date().toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    setMessages((prev) => [
      ...prev,
      { id: generateRandomId('user'), role: 'user', content: displayMsg },
    ]);
    setInputText('');
    setStagedAttachment(null);
    setLoading(true);
    setStreamingText('');
    setThinkingStatus('Thinking...');

    const constructPayload = () => {
      return JSON.stringify({
        message: displayMsg,
        model: activeModel,
        variant: VARIANTS[activeVariantIndex],
        client_time: clientTimeStr,
        active_project: activeProject
          ? {
              id: activeProject.id,
              name: activeProject.name,
              html: activeProject.html,
              css: activeProject.css,
              js: activeProject.js,
            }
          : null,
        document_id: uploadedDocId || undefined,
        image: undefined,
        bridge_mode: currentBridgeMode,
        mobile_local_ip: currentMobileLocalIp || undefined,
      });
    };

    const wsConnected = await ensureWebSocketConnected(targetSessionId);
    if (wsConnected && wsRef.current) {
      setThinkingStatus('Thinking...');
      wsRef.current.send(constructPayload());
    } else {
      showAlert('Connection Failed', 'Socket connection is currently down. Please retry.');
      setLoading(false);
      setThinkingStatus(null);
    }
  };

  const handleRetryMessage = async (message: ChatMessage, index: number) => {
    // Locate the corresponding user message index (which precedes index)
    let userMsgIndex = -1;
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userMsgIndex = i;
        break;
      }
    }
    if (userMsgIndex === -1) return;

    const previousUserQuery = messages[userMsgIndex].content;

    // Remove this user message and all subsequent messages locally
    setMessages((prev) => prev.slice(0, userMsgIndex));

    resetPacingRefs();

    if (token?.startsWith('mock-')) {
      handleSendMessage(previousUserQuery);
      return;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'retry_message',
          message_id: message.id,
        })
      );
    }

    handleSendMessage(previousUserQuery);
  };

  const sendConfirmationResponse = (confirm: boolean, alwaysAllow: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && confirmationRequestId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'tool_confirm_response',
          request_id: confirmationRequestId,
          confirm,
          always_allow: alwaysAllow,
        })
      );
      setConfirmationToolName(null);
      setConfirmationToolLabel(null);
      setConfirmationRequestId(null);
    }
  };

  const handleDrillAnswer = async (answer: string) => {
    const clientTimeStr = new Date().toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    resetPacingRefs();
    setMessages((prev) => [
      ...prev,
      { id: generateRandomId('user'), role: 'user', content: answer },
    ]);
    setLoading(true);
    setStreamingText('');
    setThinkingStatus('Thinking...');

    const payload = JSON.stringify({
      message: answer,
      model: activeModel,
      variant: VARIANTS[activeVariantIndex],
      client_time: clientTimeStr,
      active_project: null,
      document_id: undefined,
      image: undefined,
    });

    let targetSessionId = await ensureSessionId();
    if (!targetSessionId) {
      setLoading(false);
      return;
    }

    const wsConnected = await ensureWebSocketConnected(targetSessionId);
    if (wsConnected && wsRef.current) {
      setThinkingStatus('Thinking...');
      wsRef.current.send(payload);
    } else {
      showAlert('Connection Failed', 'Socket connection is currently down. Please retry.');
      setLoading(false);
      setThinkingStatus(null);
    }
  };

  const cancelSwarmTask = async (taskId: string) => {
    try {
      if (token?.startsWith('mock-')) {
        setActiveSwarmTask(null);
        setLoading(false);
        setMessages((prev) => prev.filter((m) => m.id !== 'swarm-progress-msg'));
        return;
      }

      const response = await fetch(`${backendUrl.trim().replace(/\/$/, '')}/chat/swarm/${taskId}/cancel`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        setActiveSwarmTask(null);
        setMessages((prev) => prev.filter((m) => m.id !== 'swarm-progress-msg'));
      } else {
        console.error('Failed to cancel swarm task.');
      }
    } catch (err) {
      console.error('Error canceling swarm task:', err);
    }
  };

  return {
    messages,
    setMessages,
    inputText,
    setInputText,
    loading,
    setLoading,
    streamingText,
    setStreamingText,
    thinkingStatus,
    setThinkingStatus,
    workflowNodes,
    setWorkflowNodes,
    thinkingLogs,
    setThinkingLogs,
    confirmationToolName,
    setConfirmationToolName,
    confirmationToolLabel,
    setConfirmationToolLabel,
    confirmationRequestId,
    setConfirmationRequestId,
    showBtwOverlay,
    setShowBtwOverlay,
    btwMessages,
    setBtwMessages,
    btwLoading,
    setBtwLoading,
    messageProjectIds,
    setMessageProjectIds,
    activeSwarmTask,
    setActiveSwarmTask,
    cancelSwarmTask,
    wsRef,
    connectWebSocket,
    handleSendMessage,
    handleRetryMessage,
    handleStopGeneration,
    sendConfirmationResponse,
    handleDrillAnswer,
  };
}
