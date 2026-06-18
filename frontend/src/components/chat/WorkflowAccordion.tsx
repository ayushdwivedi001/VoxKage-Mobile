import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface WorkflowStep {
  id: string;
  label: string;
  detail: string;
  status: 'completed' | 'active' | 'error';
  timestamp?: number;
}

export interface WorkflowAccordionProps {
  steps: WorkflowStep[];
}

function StepIcon({ status }: { status: WorkflowStep['status'] }) {
  if (status === 'completed') {
    return <Ionicons name="checkmark-circle" size={15} color="#22c55e" />;
  }
  if (status === 'error') {
    return <Ionicons name="alert-circle" size={15} color="#ef4444" />;
  }
  return <Ionicons name="ellipse-outline" size={15} color="#3b82f6" />;
}

function WorkflowStepRow({ step, index }: { step: WorkflowStep; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    Animated.timing(anim, {
      toValue: expanded ? 0 : 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
    setExpanded((e) => !e);
  };

  const detailHeight = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200],
  });

  const hasDetail = step.detail && step.detail.trim().length > 0;

  return (
    <View style={stepStyles.row}>
      {/* Timeline stem + dot */}
      <View style={stepStyles.timelineCol}>
        <View style={[
          stepStyles.dot,
          step.status === 'completed' && stepStyles.dotDone,
          step.status === 'error' && stepStyles.dotError,
          step.status === 'active' && stepStyles.dotActive,
        ]} />
      </View>

      {/* Content */}
      <View style={stepStyles.contentCol}>
        <TouchableOpacity
          onPress={hasDetail ? toggle : undefined}
          activeOpacity={hasDetail ? 0.7 : 1}
          style={stepStyles.labelRow}
        >
          <StepIcon status={step.status} />
          <Text
            style={[
              stepStyles.labelText,
              step.status === 'error' && stepStyles.labelError,
              step.status === 'active' && stepStyles.labelActive,
            ]}
            numberOfLines={2}
          >
            {step.label}
          </Text>
          {hasDetail && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={12}
              color="#475569"
              style={{ marginLeft: 'auto' }}
            />
          )}
        </TouchableOpacity>

        {/* Expandable detail log */}
        {hasDetail && (
          <Animated.View style={[stepStyles.detailWrap, { maxHeight: detailHeight }]}>
            <ScrollView
              style={stepStyles.detailScroll}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled
            >
              <Text style={stepStyles.detailText}>{step.detail}</Text>
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

export function WorkflowAccordion({ steps }: WorkflowAccordionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const collapseAnim = useRef(new Animated.Value(1)).current;

  if (!steps || steps.length === 0) return null;

  const toggleCollapse = () => {
    Animated.timing(collapseAnim, {
      toValue: collapsed ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
    setCollapsed((c) => !c);
  };

  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const hasError = steps.some((s) => s.status === 'error');

  const containerHeight = collapseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, steps.length * 56 + 20],
  });

  return (
    <View style={accordionStyles.wrapper}>
      {/* Header */}
      <TouchableOpacity
        style={accordionStyles.header}
        onPress={toggleCollapse}
        activeOpacity={0.8}
      >
        <View style={accordionStyles.headerLeft}>
          <View style={[
            accordionStyles.statusDot,
            hasError && accordionStyles.statusError,
            completedCount === steps.length && !hasError && accordionStyles.statusDone,
          ]} />
          <Ionicons name="terminal-outline" size={13} color="#60a5fa" />
          <Text style={accordionStyles.headerTitle}>
            Laptop Execution
          </Text>
        </View>
        <View style={accordionStyles.headerRight}>
          <Text style={accordionStyles.progressText}>
            {completedCount}/{steps.length} steps
          </Text>
          <Ionicons
            name={collapsed ? 'chevron-down' : 'chevron-up'}
            size={13}
            color="#475569"
          />
        </View>
      </TouchableOpacity>

      {/* Progress bar */}
      <View style={accordionStyles.progressBarBg}>
        <View
          style={[
            accordionStyles.progressBarFill,
            { width: `${(completedCount / steps.length) * 100}%` },
            hasError && accordionStyles.progressBarError,
          ]}
        />
      </View>

      {/* Steps */}
      <Animated.View style={[accordionStyles.stepsWrap, { maxHeight: containerHeight }]}>
        {steps.map((step, i) => (
          <WorkflowStepRow key={step.id} step={step} index={i} />
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * Parses raw laptop log text into structured WorkflowStep[].
 * Supports VoxKage task-runner format: [task-XXX] Executing command: ...
 * and general multi-line log text.
 */
export function parseLaptopLogToSteps(rawContent: string): WorkflowStep[] {
  if (!rawContent || !rawContent.trim()) return [];

  const lines = rawContent.split('\n').filter((l) => l.trim());
  const steps: WorkflowStep[] = [];
  let currentStep: { label: string; detailLines: string[] } | null = null;
  let idCounter = 0;

  const taskLineRegex = /\[task-[\w]+\]\s*(Executing command:|Running:|Completed:|Error:|✅|❌|→|Starting|Done)/i;
  const commandRegex = /(?:Executing command:|Running:|→\s*)(.*)/i;
  const errorRegex = /(?:error|Error|failed|❌)/i;
  const successRegex = /(?:completed|success|✅|done|finished|ok\b)/i;

  for (const line of lines) {
    if (taskLineRegex.test(line)) {
      // Save previous step
      if (currentStep) {
        const isError = errorRegex.test(currentStep.label);
        steps.push({
          id: `step-${idCounter++}`,
          label: currentStep.label,
          detail: currentStep.detailLines.join('\n'),
          status: isError ? 'error' : 'completed',
        });
      }
      // Extract command label
      const cmdMatch = line.match(commandRegex);
      const label = cmdMatch ? cmdMatch[1].trim() : line.trim();
      currentStep = { label, detailLines: [] };
    } else {
      if (currentStep) {
        currentStep.detailLines.push(line);
      } else {
        // First line that doesn't match task format — treat as a step on its own
        const isError = errorRegex.test(line);
        const isDone = successRegex.test(line);
        steps.push({
          id: `step-${idCounter++}`,
          label: line.trim().slice(0, 80),
          detail: '',
          status: isError ? 'error' : isDone ? 'completed' : 'active',
        });
      }
    }
  }

  // Push last step
  if (currentStep) {
    const isError = errorRegex.test(currentStep.label);
    steps.push({
      id: `step-${idCounter++}`,
      label: currentStep.label,
      detail: currentStep.detailLines.join('\n'),
      status: isError ? 'error' : 'completed',
    });
  }

  // If we got nothing useful (no task-format lines), fall back to raw line grouping
  if (steps.length === 0 && lines.length > 0) {
    return [{
      id: 'step-0',
      label: lines[0].trim().slice(0, 80),
      detail: lines.slice(1).join('\n'),
      status: errorRegex.test(rawContent) ? 'error' : 'completed',
    }];
  }

  return steps;
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  timelineCol: {
    width: 20,
    alignItems: 'center',
    paddingTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
    borderWidth: 2,
    borderColor: '#1e293b',
  },
  dotDone: {
    backgroundColor: '#22c55e',
    borderColor: '#16a34a',
  },
  dotError: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
  },
  dotActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  contentCol: {
    flex: 1,
    paddingLeft: 10,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 4,
  },
  labelText: {
    fontSize: 12.5,
    color: '#94a3b8',
    lineHeight: 17,
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  labelError: {
    color: '#f87171',
  },
  labelActive: {
    color: '#60a5fa',
  },
  detailWrap: {
    overflow: 'hidden',
    marginTop: 6,
  },
  detailScroll: {
    backgroundColor: '#050a18',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    maxHeight: 200,
  },
  detailText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

const accordionStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#0c1222',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginVertical: 8,
    overflow: 'hidden',
    alignSelf: 'stretch',
    marginLeft: -14,
    marginRight: -14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerTitle: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressText: {
    fontSize: 11,
    color: '#475569',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#475569',
  },
  statusDone: {
    backgroundColor: '#22c55e',
  },
  statusError: {
    backgroundColor: '#ef4444',
  },
  progressBarBg: {
    height: 2,
    backgroundColor: '#1e293b',
  },
  progressBarFill: {
    height: 2,
    backgroundColor: '#3b82f6',
    borderRadius: 1,
  },
  progressBarError: {
    backgroundColor: '#ef4444',
  },
  stepsWrap: {
    overflow: 'hidden',
    paddingVertical: 4,
  },
});
