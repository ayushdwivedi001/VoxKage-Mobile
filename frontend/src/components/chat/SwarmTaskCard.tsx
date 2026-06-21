import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

export interface SwarmAgent {
  id: string;
  name: string;
  role: string;
  task: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  logs: string;
}

export interface SwarmTask {
  task_id: string;
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  subagents: SwarmAgent[];
  final_result: string | null;
}

interface SwarmTaskCardProps {
  task: SwarmTask;
}

export const SwarmTaskCard: React.FC<SwarmTaskCardProps> = ({ task }) => {
  if (!task || !task.subagents) return null;

  return (
    <View style={styles.cardContainer}>
      {/* Header Row */}
      <View style={styles.cardHeader}>
        <Ionicons name="git-network-outline" size={16} color="#60a5fa" />
        <Text style={styles.cardTitle}>VOXKAGE AGENT SWARM DEPLOYED</Text>
        <Text style={[styles.statusBadge, styles[`statusBadge_${task.status}`]]}>
          {task.status.toUpperCase()}
        </Text>
      </View>

      {/* Query Section */}
      <View style={styles.queryContainer}>
        <Text style={styles.queryLabel}>PRIMARY GOAL</Text>
        <Text style={styles.queryText}>"{task.query}"</Text>
      </View>

      {/* Checklist / Todo tree */}
      <View style={styles.agentsList}>
        {task.subagents.map((agent, index) => {
          const isLast = index === task.subagents.length - 1;
          const isCompleted = agent.status === 'completed';
          const isRunning = agent.status === 'running';
          const isFailed = agent.status === 'failed';

          // SVG Colors
          let dotColor = '#475569';
          let strokeColor = '#334155';
          if (isCompleted) {
            dotColor = '#22c55e'; // Green
            strokeColor = '#22c55e';
          } else if (isRunning) {
            dotColor = '#3b82f6'; // Blue
            strokeColor = '#3b82f6';
          } else if (isFailed) {
            dotColor = '#ef4444'; // Red
            strokeColor = '#ef4444';
          }

          // Next line color
          const nextAgent = !isLast ? task.subagents[index + 1] : null;
          const lineCompleted = isCompleted && nextAgent && (nextAgent.status === 'completed' || nextAgent.status === 'running');

          return (
            <View key={agent.id} style={styles.agentRow}>
              {/* Left SVG Connection Column */}
              <View style={styles.svgCol}>
                <Svg height="65" width="24">
                  {!isLast && (
                    <Line
                      x1="12"
                      y1="20"
                      x2="12"
                      y2="65"
                      stroke={lineCompleted ? '#22c55e' : '#1e293b'}
                      strokeWidth="1.5"
                    />
                  )}
                  <Circle
                    cx="12"
                    cy="18"
                    r="6"
                    fill={isCompleted ? '#22c55e' : isFailed ? '#ef4444' : '#0f172a'}
                    stroke={strokeColor}
                    strokeWidth="1.5"
                  />
                  {isRunning && (
                    <Circle
                      cx="12"
                      cy="18"
                      r="2.5"
                      fill="#3b82f6"
                    />
                  )}
                </Svg>
              </View>

              {/* Right Agent Details Column */}
              <View style={styles.agentDetails}>
                <View style={styles.agentHeader}>
                  <Text style={[styles.agentName, (isCompleted || isRunning) && styles.agentNameActive]}>
                    {agent.name}
                  </Text>
                  <Text style={styles.agentRole}>{agent.role}</Text>
                </View>
                
                <Text style={styles.agentTask} numberOfLines={1}>
                  Task: {agent.task}
                </Text>
                
                <Text style={[styles.agentLogs, isRunning && styles.agentLogsRunning]}>
                  {agent.logs}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#0c0c0c',
    borderColor: '#171717',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginVertical: 6,
    alignSelf: 'stretch',
    ...Platform.select({
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
      },
      default: {},
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#171717',
    paddingBottom: 8,
  },
  cardTitle: {
    color: '#94a3b8',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    flex: 1,
  },
  statusBadge: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  statusBadge_pending: {
    color: '#94a3b8',
    backgroundColor: '#1e293b',
  },
  statusBadge_running: {
    color: '#60a5fa',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  statusBadge_completed: {
    color: '#4ade80',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  statusBadge_failed: {
    color: '#f87171',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  statusBadge_cancelled: {
    color: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  queryContainer: {
    backgroundColor: '#070707',
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
    borderLeftWidth: 1.5,
    borderLeftColor: '#3b82f6',
  },
  queryLabel: {
    color: '#475569',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  queryText: {
    color: '#f8fafc',
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 16,
  },
  agentsList: {
    gap: 4,
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  svgCol: {
    alignItems: 'center',
    width: 24,
  },
  agentDetails: {
    flex: 1,
    paddingBottom: 10,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 1.5,
  },
  agentName: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  agentNameActive: {
    color: '#f1f5f9',
  },
  agentRole: {
    color: '#475569',
    fontSize: 10,
  },
  agentTask: {
    color: '#475569',
    fontSize: 11.5,
    marginBottom: 3,
  },
  agentLogs: {
    color: '#475569',
    fontSize: 11,
    fontStyle: 'italic',
  },
  agentLogsRunning: {
    color: '#60a5fa',
  },
});
