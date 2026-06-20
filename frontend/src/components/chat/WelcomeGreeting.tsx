import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { LogoV } from './LogoV';
import { styles } from './styles';

const GREETINGS = [
  "How can I help you today, Sir?",
  "At your service, Sir. What shall we coordinate today?",
  "System online, Sir. Awaiting your instructions.",
  "Good day, Sir. I stand ready for multi-task orchestration.",
  "All modules initialized, Sir. Ready to execute your commands.",
  "VoxKage Mobile interface ready. How may I assist you, Sir?"
];

export const WelcomeGreeting: React.FC = () => {
  const [greeting, setGreeting] = useState("How can I help you today, Sir?");

  useEffect(() => {
    const randomGreeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    setGreeting(randomGreeting);
  }, []);

  return (
    <View style={styles.welcomeContainer}>
      <LogoV size={72} />
      <Text style={styles.welcomeText}>{greeting}</Text>
    </View>
  );
};
