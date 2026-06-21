import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { SwarmTask } from './SwarmTaskCard';

interface StickySvgPathingProps {
  task: SwarmTask | null;
  onCancel: (taskId: string) => Promise<void>;
}

export const StickySvgPathing: React.FC<StickySvgPathingProps> = ({ task, onCancel }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
    return null;
  }

  const subagents = task.subagents || [];
  const total = subagents.length;
  const completedCount = subagents.filter(a => a.status === 'completed').length;
  const progressPercent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  return (
    <>
      {/* Floating Sticky Bar */}
      <TouchableOpacity 
        onPress={() => setModalVisible(true)} 
        style={styles.floatingBar}
        activeOpacity={0.85}
      >
        <View style={styles.barContent}>
          {/* Svg Path Track */}
          <View style={styles.svgWrapper}>
            <Svg height="24" width={total * 30 + 10}>
              {subagents.map((agent, idx) => {
                const isLast = idx === total - 1;
                const isCompleted = agent.status === 'completed';
                const isRunning = agent.status === 'running';
                const isFailed = agent.status === 'failed';

                let circleColor = '#475569';
                if (isCompleted) circleColor = '#22c55e'; // Green
                else if (isRunning) circleColor = '#3b82f6'; // Blue
                else if (isFailed) circleColor = '#ef4444'; // Red

                // Next line color
                const nextAgent = !isLast ? subagents[idx + 1] : null;
                const lineCompleted = isCompleted && nextAgent && (nextAgent.status === 'completed' || nextAgent.status === 'running');

                const cx = idx * 30 + 15;
                const cy = 12;

                return (
                  <React.Fragment key={agent.id}>
                    {!isLast && (
                      <Line
                        x1={cx}
                        y1={cy}
                        x2={cx + 30}
                        y2={cy}
                        stroke={lineCompleted ? '#22c55e' : '#1e293b'}
                        strokeWidth="1.5"
                      />
                    )}
                    <Circle
                      cx={cx}
                      cy={cy}
                      r="5.5"
                      fill={isCompleted ? '#22c55e' : isFailed ? '#ef4444' : '#0c0c0c'}
                      stroke={circleColor}
                      strokeWidth="1.5"
                    />
                    {isRunning && (
                      <Circle
                        cx={cx}
                        cy={cy}
                        r="2.2"
                        fill="#3b82f6"
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </Svg>
          </View>

          {/* Label Details */}
          <Text style={styles.barLabel} numberOfLines={1}>
            {task.status === 'running' ? `Swarm Working... (${progressPercent}%)` : 'Initializing Swarm...'}
          </Text>
          <Ionicons name="chevron-down" size={14} color="#94a3b8" />
        </View>
      </TouchableOpacity>

      {/* Expandable Detail Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity 
            style={styles.modalContent}
            activeOpacity={1}
            onPress={() => {}}
          >
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="git-network" size={18} color="#60a5fa" />
                <Text style={styles.modalTitle}>VoxKage Agent Swarm</Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
              {/* Task Goal */}
              <View style={styles.goalCard}>
                <Text style={styles.sectionLabel}>Active Task Query</Text>
                <Text style={styles.goalText}>"{task.query}"</Text>
                <View style={styles.progressRow}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
                  </View>
                  <Text style={styles.progressPercent}>{progressPercent}%</Text>
                </View>
              </View>

              {/* Subagents Detail Checklist */}
              <Text style={styles.sectionLabel}>Swarm Subagents ({total})</Text>
              {subagents.map((agent) => {
                const isCompleted = agent.status === 'completed';
                const isRunning = agent.status === 'running';
                const isFailed = agent.status === 'failed';
                const isExpanded = expandedAgentId === agent.id;

                let iconName: any = 'ellipse-outline';
                let iconColor = '#64748b';
                if (isCompleted) {
                  iconName = 'checkmark-circle-outline';
                  iconColor = '#22c55e';
                } else if (isRunning) {
                  iconName = 'sync-outline';
                  iconColor = '#3b82f6';
                } else if (isFailed) {
                  iconName = 'close-circle-outline';
                  iconColor = '#ef4444';
                }

                return (
                  <View key={agent.id} style={styles.agentDetailCard}>
                    <TouchableOpacity 
                      onPress={() => setExpandedAgentId(isExpanded ? null : agent.id)}
                      style={styles.agentSummaryRow}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={iconName} size={18} color={iconColor} style={isRunning && styles.spinningIcon} />
                      <View style={styles.agentNameWrapper}>
                        <Text style={styles.agentName}>{agent.name}</Text>
                        <Text style={styles.agentRole}>{agent.role}</Text>
                      </View>
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#475569" />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.agentExpandedSection}>
                        <Text style={styles.agentTaskDetail}>
                          <Text style={styles.boldText}>Task: </Text>
                          {agent.task}
                        </Text>
                        <View style={styles.logBox}>
                          <Text style={styles.logText}>{agent.logs}</Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Cancel Button */}
              <TouchableOpacity 
                onPress={async () => {
                  setModalVisible(false);
                  await onCancel(task.task_id);
                }}
                style={styles.cancelBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="stop-circle-outline" size={16} color="#ef4444" />
                <Text style={styles.cancelBtnText}>Terminate Swarm Workflow</Text>
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  floatingBar: {
    backgroundColor: 'rgba(10, 10, 10, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    marginHorizontal: 12,
    marginVertical: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
      },
      default: {},
    }),
  },
  barContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  svgWrapper: {
    justifyContent: 'center',
  },
  barLabel: {
    color: '#94a3b8',
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginRight: 10,
    letterSpacing: -0.2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#050505',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#171717',
    padding: 16,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#171717',
    marginBottom: 12,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#171717',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  goalCard: {
    backgroundColor: '#0a0a0a',
    borderColor: '#171717',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  sectionLabel: {
    color: '#475569',
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  goalText: {
    color: '#f8fafc',
    fontSize: 13.5,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarBg: {
    flex: 1,
    height: 5,
    backgroundColor: '#171717',
    borderRadius: 2.5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#22c55e',
  },
  progressPercent: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'right',
  },
  agentDetailCard: {
    backgroundColor: '#0a0a0a',
    borderColor: '#171717',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 8,
    overflow: 'hidden',
  },
  agentSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  agentNameWrapper: {
    flex: 1,
  },
  agentName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  agentRole: {
    color: '#475569',
    fontSize: 10.5,
    marginTop: 1,
  },
  agentExpandedSection: {
    borderTopWidth: 1,
    borderTopColor: '#171717',
    padding: 12,
    backgroundColor: '#070707',
  },
  agentTaskDetail: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  boldText: {
    fontWeight: '600',
    color: '#64748b',
  },
  logBox: {
    backgroundColor: '#0c0c0c',
    borderColor: '#171717',
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
  },
  logText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 11,
    color: '#60a5fa',
  },
  cancelBtn: {
    marginTop: 16,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  cancelBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },
  spinningIcon: {
    // Wait, simple styling is fine
  },
});
