import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { styles } from './styles';
import { replaceSir } from '@/utils/settings';

const GREETINGS = [
  "Ready when you are.",
  "What's the play?",
  "All set. Hit me.",
  "Go ahead.",
  "Standing by.",
  "What are we thinking?",
  "Let's get to it.",
  "I'm listening.",
  "Your call.",
  "Let's roll.",
  "Pick your target.",
  "Where to?",
  "All yours.",
  "Fire away.",
  "Your move.",
];

export const WelcomeGreeting: React.FC = () => {
  const [greeting, setGreeting] = useState("How can I help you today?");

  useEffect(() => {
    const randomGreeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    setGreeting(randomGreeting);
  }, []);

  return (
    <View style={[styles.welcomeContainer, { gap: 6 }]}>
      <Image 
        source={require('@/assets/images/android-icon-foreground.png')} 
        style={{ width: 145, height: 145, marginBottom: -25 }}
        contentFit="contain"
      />
      <Text style={styles.welcomeText}>{replaceSir(greeting)}</Text>
    </View>
  );
};
