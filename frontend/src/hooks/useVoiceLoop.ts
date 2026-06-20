import { useState, useRef } from 'react';

let Audio: any = null;
try {
  const ExpoAV = require('expo-av');
  Audio = ExpoAV ? ExpoAV.Audio : null;
} catch (e) {
  console.log('[useVoiceLoop] expo-av is not available, Sir. Using sandbox/mock fallback.');
}

export function useVoiceLoop(
  backendUrl: string,
  token: string | null,
  setInputText: React.Dispatch<React.SetStateAction<string>>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setThinkingStatus: React.Dispatch<React.SetStateAction<string | null>>,
  handleSendMessageRef: React.MutableRefObject<((overrideText?: string) => Promise<void>) | null>,
  showAlert: (title: string, message: string) => void,
  performUpload: (
    url: string,
    uri: string,
    name: string,
    mimeType: string,
    token: string,
    model?: string
  ) => Promise<any>
) {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [micVolume, setMicVolume] = useState(0.1);
  const recordingRef = useRef<any>(null);

  const transcribeAudio = async (uri: string) => {
    setThinkingStatus('Transcribing voice prompt, Sir...');
    setLoading(true);
    try {
      const url = `${backendUrl}/voice/transcribe`;
      const mimeType = 'audio/m4a';
      const res = await performUpload(url, uri, 'voice_input.m4a', mimeType, token || '');
      if (res && res.text) {
        setInputText(res.text);
        // Automatically submit the message
        handleSendMessageRef.current?.(res.text);
      }
    } catch (e: any) {
      showAlert('Voice Transcription Failed', `Failed to transcribe: ${e.message}`);
    } finally {
      setLoading(false);
      setThinkingStatus(null);
    }
  };

  const handleVoicePress = async () => {
    if (!Audio) {
      showAlert(
        'Voice Recording Unavailable',
        'Microphone/Audio recording is not supported in this client. The expo-av module could not be loaded, Sir.'
      );
      return;
    }
    if (!isVoiceActive) {
      try {
        const { granted } = await Audio.requestPermissionsAsync();
        if (!granted) {
          showAlert('Permission Denied', 'Microphone permission is required to record voice commands, Sir.');
          return;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        setIsVoiceActive(true);
        setMicVolume(0.1);

        const { recording } = await Audio.Recording.createAsync(
          {
            isMeteringEnabled: true,
            android: {
              extension: '.m4a',
              outputFormat: Audio.AndroidOutputFormat.MPEG_4,
              audioEncoder: Audio.AndroidAudioEncoder.AAC,
              sampleRate: 16000,
              numberOfChannels: 1,
              bitRate: 64000,
            },
            ios: {
              extension: '.m4a',
              outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
              audioQuality: Audio.IOSAudioQuality.MEDIUM,
              sampleRate: 16000,
              numberOfChannels: 1,
              bitRate: 64000,
            },
            web: {},
          },
          (status: any) => {
            if (status.metering !== undefined) {
              const db = status.metering || -160;
              const normalized = Math.max(-60, Math.min(0, db));
              const vol = (normalized + 60) / 60;
              setMicVolume(vol);
            }
          },
          80
        );
        recordingRef.current = recording;
      } catch (err: any) {
        showAlert('Microphone Error', `Failed to start recording: ${err.message}`);
        setIsVoiceActive(false);
      }
    } else {
      setIsVoiceActive(false);
      const recording = recordingRef.current;
      if (recording) {
        recordingRef.current = null;
        try {
          await recording.stopAndUnloadAsync();
          const uri = recording.getURI();
          if (uri) {
            await transcribeAudio(uri);
          }
        } catch (err: any) {
          console.error('Error stopping audio recording:', err);
        }
      }
    }
  };

  return {
    isVoiceActive,
    micVolume,
    handleVoicePress,
  };
}
