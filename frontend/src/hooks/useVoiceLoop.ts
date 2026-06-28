import React, { useState, useEffect } from 'react';
import { useAudioRecorder, RecordingPresets, AudioModule, useAudioRecorderState } from 'expo-audio';

export function useVoiceLoop(
  backendUrl: string,
  token: string | null,
  setInputText: React.Dispatch<React.SetStateAction<string>>,
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micVolume, setMicVolume] = useState(0.1);

  // Initialize the recorder with high quality and metering enabled
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  
  // Track state with 80ms interval for smooth visualizer waves
  const recorderState = useAudioRecorderState(audioRecorder, 80);

  // Sync micVolume from the recorder's decibel metering
  useEffect(() => {
    if (recorderState.isRecording && recorderState.metering !== undefined) {
      const db = recorderState.metering || -160;
      const normalized = Math.max(-60, Math.min(0, db));
      const vol = (normalized + 60) / 60;
      setMicVolume(vol);
    }
  }, [recorderState.isRecording, recorderState.metering]);

  // Handle active UI state sync
  useEffect(() => {
    setIsVoiceActive(recorderState.isRecording);
  }, [recorderState.isRecording]);

  const transcribeAudio = async (uri: string) => {
    setIsTranscribing(true);
    try {
      const url = `${backendUrl}/voice/transcribe`;
      const mimeType = 'audio/m4a';
      const res = await performUpload(url, uri, 'voice_input.m4a', mimeType, token || '');
      if (res && res.text) {
        setInputText(res.text);
      }
    } catch (e: any) {
      showAlert('Voice Transcription Failed', `Failed to transcribe: ${e.message}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleVoicePress = async () => {
    if (!audioRecorder) {
      showAlert(
        'Voice Recording Unavailable',
        'Microphone/Audio recording is not supported in this client. The expo-audio module could not be loaded.'
      );
      return;
    }

    if (!recorderState.isRecording) {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) {
          showAlert('Permission Denied', 'Microphone permission is required to record voice commands.');
          return;
        }

        // Configure audio mode for recording
        await AudioModule.setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
          interruptionMode: 'duckOthers',
          shouldRouteThroughEarpiece: false,
        });

        // Prepare and start recording with metering
        await audioRecorder.prepareToRecordAsync({
          ...RecordingPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        });
        
        await audioRecorder.record();
        setMicVolume(0.1);
      } catch (err: any) {
        showAlert('Microphone Error', `Failed to start recording: ${err.message}`);
      }
    } else {
      try {
        await audioRecorder.stop();
        const uri = audioRecorder.uri;
        if (uri) {
          await transcribeAudio(uri);
        }
      } catch (err: any) {
        console.error('Error stopping audio recording:', err);
      }
    }
  };

  return {
    isVoiceActive,
    isTranscribing,
    micVolume,
    handleVoicePress,
  };
}
