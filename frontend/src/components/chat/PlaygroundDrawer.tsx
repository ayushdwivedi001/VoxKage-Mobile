import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { styles } from './styles';

interface PlaygroundDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  playgroundAnim: Animated.Value;
  playgroundView: 'list' | 'preview';
  setPlaygroundView: (view: 'list' | 'preview') => void;
  playgroundProjectName: string;
  playgroundProjectId: string | null;
  setPlaygroundProjectId: (id: string | null) => void;
  setActiveEditingProjectId: (id: string | null) => void;
  isLoadingProjects: boolean;
  projects: any[];
  setPlaygroundHtml: (html: string) => void;
  setPlaygroundCss: (css: string) => void;
  setPlaygroundJs: (js: string) => void;
  setPlaygroundProjectName: (name: string) => void;
  setPlaygroundRevision: React.Dispatch<React.SetStateAction<number>>;
  projectToRename: { id: string; name: string } | null;
  setProjectToRename: (val: { id: string; name: string } | null) => void;
  renameProjectName: string;
  setRenameProjectName: (name: string) => void;
  handleRenameProject: (id: string, name: string) => void;
  handleDeleteProject: (id: string) => void;
  compiledSandboxHtml: string;
  playgroundRevision: number;
  token: string | null;
  backendUrl: string;
  currentSessionId: string | null;
}

export const PlaygroundDrawer: React.FC<PlaygroundDrawerProps> = ({
  isOpen,
  onClose,
  playgroundAnim,
  playgroundView,
  setPlaygroundView,
  playgroundProjectName,
  playgroundProjectId,
  setPlaygroundProjectId,
  setActiveEditingProjectId,
  isLoadingProjects,
  projects,
  setPlaygroundHtml,
  setPlaygroundCss,
  setPlaygroundJs,
  setPlaygroundProjectName,
  setPlaygroundRevision,
  projectToRename,
  setProjectToRename,
  renameProjectName,
  setRenameProjectName,
  handleRenameProject,
  handleDeleteProject,
  compiledSandboxHtml,
  playgroundRevision,
  token,
  backendUrl,
  currentSessionId,
}) => {
  const [viewMode, setViewMode] = React.useState<'sandbox' | 'explorer' | 'fileviewer'>('sandbox');
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [selectedFileContent, setSelectedFileContent] = React.useState<string>('');

  // Reset view mode when project changes or drawer opens/closes
  React.useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setViewMode('sandbox');
        setSelectedFile(null);
        setSelectedFileContent('');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, playgroundProjectId]);

  return (
    <>
      {isOpen && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={onClose}
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
                onClose();
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {/* Eye Button (Toggle Live Preview / Files Browser) */}
              <TouchableOpacity
                style={{ padding: 4 }}
                onPress={() => {
                  if (viewMode === 'sandbox') {
                    setViewMode('explorer');
                  } else {
                    setViewMode('sandbox');
                  }
                }}
              >
                <Ionicons 
                  name={viewMode === 'sandbox' ? "eye-outline" : "eye-off-outline"} 
                  size={20} 
                  color="#60a5fa" 
                />
              </TouchableOpacity>

              {/* Download Button */}
              {playgroundProjectId && !playgroundProjectId.startsWith('mock-') && (
                <TouchableOpacity
                  style={{ padding: 4 }}
                  onPress={() => {
                    const downloadUrl = `${backendUrl}/projects/${playgroundProjectId}/download?token=${token}`;
                    if (Platform.OS === 'web') {
                      window.open(downloadUrl, '_blank');
                    } else {
                      import('react-native').then(({ Linking }) => {
                        Linking.openURL(downloadUrl);
                      });
                    }
                  }}
                >
                  <Ionicons name="download-outline" size={20} color="#60a5fa" />
                </TouchableOpacity>
              )}

              {/* Refine Button */}
              <TouchableOpacity 
                style={styles.playgroundRefineBtn}
                onPress={() => {
                  if (playgroundProjectId) {
                    setActiveEditingProjectId(playgroundProjectId);
                    onClose();
                  }
                }}
              >
                <Ionicons name="color-wand-outline" size={16} color="#60a5fa" />
                <Text style={styles.playgroundRefineText}>Refine</Text>
              </TouchableOpacity>
            </View>
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
          /* Live Preview sandbox or Explorer or File Viewer */
          <View style={{ flex: 1, backgroundColor: '#0d0d0d' }}>
            {viewMode === 'sandbox' ? (
              <View style={styles.sandboxContainer}>
                {(() => {
                  const activeProj = projects.find(p => p.id === playgroundProjectId);
                  const projectFiles = activeProj?.files || {};
                  // If the project only has index.html, style.css, and script.js (the typical single page case),
                  // we can preview completely locally using compiledSandboxHtml to bypass cross-origin cookie blocking.
                  const hasOtherFiles = Object.keys(projectFiles).some(
                    f => f !== 'index.html' && f !== 'style.css' && f !== 'script.js'
                  );
                  const useLocalPreview = !playgroundProjectId || playgroundProjectId.startsWith('mock-') || !hasOtherFiles;

                  if (Platform.OS === 'web') {
                    return (
                      // @ts-ignore
                      <iframe
                        key={`sb-${playgroundRevision}`}
                        src={useLocalPreview
                          ? undefined
                          : `${backendUrl}/projects/${playgroundProjectId}/preview/index.html?token=${token}&session_id=${currentSessionId || ''}`
                        }
                        srcDoc={useLocalPreview ? compiledSandboxHtml : undefined}
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
                    );
                  } else {
                    return (
                      <WebView
                        key={`sb-wv-${playgroundRevision}`}
                        originWhitelist={['*']}
                        source={useLocalPreview
                          ? { html: compiledSandboxHtml }
                          : { uri: `${backendUrl}/projects/${playgroundProjectId}/preview/index.html?token=${token}&session_id=${currentSessionId || ''}` }
                        }
                        style={styles.webView}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        backgroundColor="#0d0d0d"
                      />
                    );
                  }
                })()}

              </View>
            ) : viewMode === 'explorer' ? (
              <ScrollView 
                style={{ flex: 1, padding: 16 }}
                contentContainerStyle={{ paddingBottom: 32 }}
              >
                <Text style={{ color: '#94a3b8', fontSize: 13, marginBottom: 16, fontWeight: '600' }}>
                  Workspace Files, Sir:
                </Text>
                {(() => {
                  const activeProj = projects.find(p => p.id === playgroundProjectId);
                  const projectFiles = activeProj?.files || {};
                  
                  // If files dict is empty, build default files from html/css/js keys
                  const displayFiles = Object.keys(projectFiles).length > 0 
                    ? projectFiles 
                    : {
                        'index.html': activeProj?.html || '',
                        'style.css': activeProj?.css || '',
                        'script.js': activeProj?.js || ''
                      };

                  return Object.keys(displayFiles).sort().map(filePath => {
                    const getIconName = (path: string) => {
                      if (path.endsWith('.html')) return 'logo-html5';
                      if (path.endsWith('.css')) return 'logo-css3';
                      if (path.endsWith('.js') || path.endsWith('.json')) return 'logo-javascript';
                      return 'document-text-outline';
                    };

                    const getIconColor = (path: string) => {
                      if (path.endsWith('.html')) return '#f97316'; // orange
                      if (path.endsWith('.css')) return '#3b82f6'; // blue
                      if (path.endsWith('.js')) return '#eab308'; // yellow
                      return '#94a3b8'; // gray
                    };

                    return (
                      <TouchableOpacity
                        key={filePath}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 14,
                          borderBottomWidth: 1,
                          borderBottomColor: '#1e293b',
                          gap: 12
                        }}
                        onPress={() => {
                          setSelectedFile(filePath);
                          setSelectedFileContent(displayFiles[filePath] || '');
                          setViewMode('fileviewer');
                        }}
                      >
                        {/* @ts-ignore */}
                        <Ionicons name={getIconName(filePath)} size={20} color={getIconColor(filePath)} />
                        <Text style={{ color: '#f3f4f6', fontSize: 15, fontWeight: '500' }}>{filePath}</Text>
                      </TouchableOpacity>
                    );
                  });
                })()}
              </ScrollView>
            ) : (
              /* File Viewer Mode */
              <View style={{ flex: 1 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 14,
                  backgroundColor: '#111827',
                  borderBottomWidth: 1,
                  borderBottomColor: '#1e293b',
                  gap: 10
                }}>
                  <TouchableOpacity
                    onPress={() => setViewMode('explorer')}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#60a5fa" />
                    <Text style={{ color: '#60a5fa', fontSize: 15, fontWeight: '600' }}>Files</Text>
                  </TouchableOpacity>
                  <Text style={{ color: '#94a3b8', fontSize: 14, marginLeft: 10, flex: 1, fontWeight: '500' }} numberOfLines={1}>
                    {selectedFile}
                  </Text>
                </View>
                <ScrollView 
                  style={{ flex: 1, backgroundColor: '#090d16' }}
                  contentContainerStyle={{ paddingBottom: 40, flexDirection: 'row' }}
                >
                  {/* Line Numbers Column */}
                  <View style={{
                    paddingVertical: 16,
                    paddingLeft: 12,
                    paddingRight: 8,
                    backgroundColor: '#060910',
                    borderRightWidth: 1,
                    borderRightColor: '#1e293b',
                    minWidth: 40,
                    alignItems: 'flex-end',
                  }}>
                    {selectedFileContent.split('\n').map((_, idx) => (
                      <Text
                        key={idx}
                        style={{
                          fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                          color: '#475569',
                          fontSize: 12.5,
                          lineHeight: 20,
                          // @ts-ignore
                          userSelect: 'none',
                        }}
                      >
                        {idx + 1}
                      </Text>
                    ))}
                  </View>

                  {/* Code Viewer TextInput Column */}
                  <ScrollView
                    horizontal
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingVertical: 16, paddingHorizontal: 16 }}
                    showsHorizontalScrollIndicator={true}
                  >
                    <TextInput
                      multiline
                      editable={false}
                      value={selectedFileContent}
                      style={{
                        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
                        color: '#e2e8f0',
                        fontSize: 12.5,
                        lineHeight: 20,
                        minWidth: 800,
                        padding: 0,
                        margin: 0,
                        borderWidth: 0,
                        borderColor: 'transparent',
                        backgroundColor: 'transparent',
                        ...Platform.select({
                          web: {
                            outlineStyle: 'none',
                            borderStyle: 'none',
                            backgroundColor: 'transparent',
                            whiteSpace: 'pre',
                            boxShadow: 'none',
                          } as any,
                          default: {}
                        })
                      }}
                    />
                  </ScrollView>
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </Animated.View>
    </>
  );
};
