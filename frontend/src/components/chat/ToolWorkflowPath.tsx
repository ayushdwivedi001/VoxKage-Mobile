import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

export interface WorkflowNode {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'success' | 'failed';
}

interface ToolWorkflowPathProps {
  nodes: WorkflowNode[];
}

export const ToolWorkflowPath: React.FC<ToolWorkflowPathProps> = ({ nodes }) => {
  if (!nodes || nodes.length === 0) return null;

  return (
    <View style={styles.workflowContainer}>
      <Text style={styles.workflowTitle}>VOXKAGE AGENTIC WORKFLOW</Text>
      
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        const isSuccess = node.status === 'success';
        const isRunning = node.status === 'running';
        const isFailed = node.status === 'failed';
        
        // Determine line color to next node
        const nextNode = !isLast ? nodes[index + 1] : null;
        const lineCompleted = isSuccess && nextNode && (nextNode.status === 'success' || nextNode.status === 'running');

        return (
          <View key={node.id} style={styles.workflowRow}>
            {/* SVG Left Indicator Column */}
            <View style={styles.workflowSvgCol}>
              <Svg height="56" width="30">
                {!isLast && (
                  <Line
                    x1="15"
                    y1="18"
                    x2="15"
                    y2="56"
                    stroke={lineCompleted ? '#3b82f6' : '#262626'}
                    strokeWidth="1.5"
                  />
                )}
                <Circle
                  cx="15"
                  cy="18"
                  r="7"
                  fill={isSuccess ? '#3b82f6' : isFailed ? '#ef4444' : '#0c0c0c'}
                  stroke={isSuccess ? '#3b82f6' : isRunning ? '#3b82f6' : isFailed ? '#ef4444' : '#262626'}
                  strokeWidth="1.5"
                />
                {isRunning && (
                  <Circle
                    cx="15"
                    cy="18"
                    r="3"
                    fill="#3b82f6"
                  />
                )}
              </Svg>
              {isSuccess && (
                <View style={styles.workflowCheckOverlay}>
                  <Ionicons name="checkmark" size={10} color="#ffffff" />
                </View>
              )}
              {isFailed && (
                <View style={styles.workflowCheckOverlay}>
                  <Ionicons name="close" size={10} color="#ffffff" />
                </View>
              )}
            </View>

            {/* Right Text Column */}
            <View style={styles.workflowTextCol}>
              <Text style={[
                styles.workflowLabel,
                (isSuccess || isRunning) && styles.workflowLabelActive,
                isFailed && styles.workflowLabelFailed
              ]}>
                {node.label}
              </Text>
              <Text style={[
                styles.workflowStatusText,
                isRunning && styles.workflowStatusRunning,
                isSuccess && styles.workflowStatusSuccess,
                isFailed && styles.workflowStatusFailed
              ]}>
                {isRunning ? 'in progress...' : isSuccess ? 'completed' : isFailed ? 'failed' : 'pending'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
};
