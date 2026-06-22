import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

interface VoiceWaveVisualizerProps {
  active: boolean;
  volume?: number;
  inline?: boolean;
}

export const VoiceWaveVisualizer: React.FC<VoiceWaveVisualizerProps> = ({ 
  active, 
  volume = 0.0,
  inline = false 
}) => {
  // Initialize animations to 0.0 so that their baseline contribution is zero
  const animations = useRef(Array.from({ length: 9 }, () => new Animated.Value(0.0))).current;
  const volumeAnim = useRef(new Animated.Value(0.0)).current;

  useEffect(() => {
    if (active) {
      const loops = animations.map((anim, index) => {
        // Vary duration and height scale to emulate organic voice frequencies
        const duration = 300 + Math.random() * 400;
        const targetScale = 0.6 + Math.random() * 1.2;
        
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: targetScale,
              duration: duration,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.0,
              duration: duration,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
      });

      // Stagger animations for a fluid wave visual ripple
      animations.forEach((_, idx) => {
        setTimeout(() => {
          loops[idx].start();
        }, idx * 60);
      });

      return () => {
        animations.forEach((anim) => anim.stopAnimation());
      };
    } else {
      animations.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0.0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    }
  }, [active]);

  // Smoothly animate the volume change to prevent sudden visual jumps
  useEffect(() => {
    Animated.timing(volumeAnim, {
      toValue: active ? volume : 0.0,
      duration: 60,
      useNativeDriver: true,
    }).start();
  }, [volume, active]);

  // Premium brand color palette: electric blue to violet to rose/red
  const colors = [
    '#3b82f6', '#4f46e5', '#6366f1', '#8b5cf6', '#a855f7',
    '#ec4899', '#f43f5e', '#ef4444', '#f97316'
  ];

  return (
    <View style={inline ? styles.inlineContainer : styles.waveContainer}>
      {animations.map((anim, index) => {
        // scaleY = baseline (0.15) + (anim * volumeAnim * 1.5)
        // This guarantees that if volumeAnim is 0, scaleY is exactly 0.15 (completely flat/stopped bars).
        // When active speech is detected, the bars scale and wiggle proportionally to the volume.
        const scaleY = Animated.add(
          0.15,
          Animated.multiply(anim, Animated.multiply(volumeAnim, 1.5))
        );

        return (
          <Animated.View
            key={index}
            style={[
              inline ? styles.inlineBar : styles.waveBar,
              {
                backgroundColor: colors[index],
                transform: [{ scaleY }],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 100,
    width: '90%',
    marginVertical: 30,
  },
  waveBar: {
    width: 5,
    height: 60,
    borderRadius: 3,
    marginHorizontal: 3.5,
  },
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    width: '100%',
  },
  inlineBar: {
    width: 3,
    height: 20,
    borderRadius: 1.5,
    marginHorizontal: 1.5,
  },
});
