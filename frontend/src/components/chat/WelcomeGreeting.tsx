import React from 'react';
import { View, Text } from 'react-native';
import { LogoV } from './LogoV';
import { styles } from './styles';

export const WelcomeGreeting: React.FC = () => {
  return (
    <View style={styles.welcomeContainer}>
      <LogoV size={72} />
      <Text style={styles.welcomeText}>How can I help you today, Sir?</Text>
    </View>
  );
};
