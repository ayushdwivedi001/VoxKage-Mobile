import { useState } from 'react';
import { ChatSession } from '@/components/chat/SidebarDrawer';

export function usePlayground(
  backendUrl: string,
  token: string | null,
  openPlayground: () => void,
  showAlert: (title: string, message: string) => void
) {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [activeEditingProjectId, setActiveEditingProjectId] = useState<string | null>(null);

  const [playgroundHtml, setPlaygroundHtml] = useState(
    '<h1>No live preview compiled yet, Sir.</h1><p>Ask VoxKage to build an app/web page to see it live here.</p>'
  );
  const [playgroundCss, setPlaygroundCss] = useState('');
  const [playgroundJs, setPlaygroundJs] = useState('');
  const [playgroundProjectName, setPlaygroundProjectName] = useState('New Live App');
  const [playgroundProjectId, setPlaygroundProjectId] = useState<string | null>(null);
  const [playgroundRevision, setPlaygroundRevision] = useState(0);

  const [projectToRename, setProjectToRename] = useState<{ id: string; name: string } | null>(null);
  const [renameProjectName, setRenameProjectName] = useState('');
  const [playgroundView, setPlaygroundView] = useState<'list' | 'preview'>('list');

  const generateRandomId = (prefix: string = 'rand'): string => {
    return `${prefix}-${Math.floor(Math.random() * 10000000)}`;
  };

  const loadProjects = async (url: string, jwtToken: string) => {
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
  };

  const handleSaveProject = async (
    name: string,
    html: string,
    css: string,
    js: string,
    projectId: string | null = null
  ) => {
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

  const handleOpenCodeInPlayground = async (
    content: string,
    messageId: string,
    sessions: ChatSession[],
    currentSessionId: string | null,
    messageProjectIds: Record<string, string>,
    setMessageProjectIds: React.Dispatch<React.SetStateAction<Record<string, string>>>
  ) => {
    const existingProjectId = messageProjectIds[messageId] || null;

    // First attempt to restore it if it already exists cloud-side
    if (existingProjectId) {
      try {
        const response = await fetch(`${backendUrl}/projects/${existingProjectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const cloudProject = await response.json();
          setPlaygroundHtml(cloudProject.html || '');
          setPlaygroundCss(cloudProject.css || '');
          setPlaygroundJs(cloudProject.js || '');
          setPlaygroundProjectName(cloudProject.name || 'Interactive App');
          setPlaygroundProjectId(existingProjectId);
          setActiveEditingProjectId(existingProjectId);
          setPlaygroundRevision((prev) => prev + 1);
          setPlaygroundView('preview');
          openPlayground();
          return;
        }
      } catch (e) {
        console.error('Failed to sync code workspace state', e);
      }
    }

    const htmlMatch = content.match(/```html\n([\s\S]*?)```/i);
    const cssMatch = content.match(/```css\n([\s\S]*?)```/i);
    const jsMatch = content.match(/```javascript\n([\s\S]*?)```/i) || content.match(/```js\n([\s\S]*?)```/i);

    if (!htmlMatch && !cssMatch && !jsMatch) {
      showAlert('Workspace Notice', 'There is no compiled playground markup or styles in this message, Sir.');
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
    let projName = session ? `Playground - ${session.name}` : 'Playground Preview';

    if (htmlCode) {
      const titleMatch = htmlCode.match(/<title>([\s\S]*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const parsedTitle = titleMatch[1].trim();
        const genericTitles = ['preview', 'index', 'home', 'document', 'html', 'untitled', 'untitled document', 'app', 'my app', 'my project', 'workspace project', 'new live app', 'new chat'];
        if (parsedTitle && !genericTitles.includes(parsedTitle.toLowerCase())) {
          projName = parsedTitle;
        }
      }
    }

    const savedId = await handleSaveProject(projName, htmlCode, cssCode, jsCode, existingProjectId);
    if (savedId) {
      setMessageProjectIds((prevMap) => ({ ...prevMap, [messageId]: savedId }));
      setActiveEditingProjectId(savedId);
    }

    setPlaygroundView('preview');
    openPlayground();
  };

  return {
    projects,
    setProjects,
    isLoadingProjects,
    setIsLoadingProjects,
    activeEditingProjectId,
    setActiveEditingProjectId,
    playgroundHtml,
    setPlaygroundHtml,
    playgroundCss,
    setPlaygroundCss,
    playgroundJs,
    setPlaygroundJs,
    playgroundProjectName,
    setPlaygroundProjectName,
    playgroundProjectId,
    setPlaygroundProjectId,
    playgroundRevision,
    setPlaygroundRevision,
    projectToRename,
    setProjectToRename,
    renameProjectName,
    setRenameProjectName,
    playgroundView,
    setPlaygroundView,
    loadProjects,
    handleSaveProject,
    handleDeleteProject,
    handleRenameProject,
    handleOpenCodeInPlayground,
  };
}
