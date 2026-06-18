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
}) => {
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
    </>
  );
};
