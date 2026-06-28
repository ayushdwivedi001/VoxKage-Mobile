import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

interface StagedAttachment {
  uri: string;
  name: string;
  type: 'image' | 'document';
  size: number;
  base64?: string;
  mimeType?: string;
}

export function useMediaPickers(
  backendUrl: string,
  token: string | null,
  activeModel: string,
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
  const [stagedAttachment, setStagedAttachment] = useState<StagedAttachment | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const handleCameraPress = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('Permission Denied', 'Camera access is required.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileSize = asset.fileSize || 0;
        const uriParts = asset.uri.split('/');
        const fileName = uriParts[uriParts.length - 1];

        setStagedAttachment({
          uri: asset.uri,
          name: fileName,
          type: 'image',
          size: fileSize,
          base64: asset.base64 || undefined,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      }
    } catch (e: any) {
      console.error(e);
      showAlert('Camera Error', `Failed to open camera: ${e.message}`);
    }
  };

  const handlePhotosPress = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('Permission Denied', 'Media library access is required.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileSize = asset.fileSize || 0;
        const uriParts = asset.uri.split('/');
        const fileName = uriParts[uriParts.length - 1];

        setStagedAttachment({
          uri: asset.uri,
          name: fileName,
          type: 'image',
          size: fileSize,
          base64: asset.base64 || undefined,
          mimeType: asset.mimeType || 'image/jpeg',
        });
      }
    } catch (e: any) {
      console.error(e);
      showAlert('Gallery Error', `Failed to open gallery: ${e.message}`);
    }
  };

  const handleFilesPress = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const fileSize = asset.size || 0;
        setStagedAttachment({
          uri: asset.uri,
          name: asset.name,
          type: 'document',
          size: fileSize,
          mimeType: asset.mimeType || 'application/octet-stream',
        });
      }
    } catch (e: any) {
      console.error(e);
      showAlert('Document Picker Error', `Failed to pick document: ${e.message}`);
    }
  };

  const handleFileUpload = async () => {
    if (!backendUrl || !token) {
      showAlert('Configuration Error', 'Unable to upload file.');
      return;
    }
    setUploadingFile(true);
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        const fileAsset = pickerResult.assets[0];
        setThinkingStatusLocal('Uploading document');
        
        const uploadUrl = `${backendUrl}/upload`;
        const mimeType = fileAsset.mimeType || 'application/octet-stream';
        const uploadRes = await performUpload(
          uploadUrl,
          fileAsset.uri,
          fileAsset.name,
          mimeType,
          token || '',
          activeModel
        );

        if (uploadRes && uploadRes.filename) {
          showAlert('Upload Successful', `File '${uploadRes.filename}' has been indexed.`);
        } else {
          showAlert('Upload Success', `File uploaded successfully.`);
        }
      }
    } catch (e: any) {
      console.error(e);
      showAlert('Upload Failed', `Could not upload file: ${e.message}`);
    } finally {
      setUploadingFile(false);
    }
  };

  // Internal helper to handle setting thinking status since handleFileUpload is localized
  const [thinkingStatusLocal, setThinkingStatusLocal] = useState<string | null>(null);

  return {
    stagedAttachment,
    setStagedAttachment,
    uploadingFile,
    setUploadingFile,
    handleCameraPress,
    handlePhotosPress,
    handleFilesPress,
    handleFileUpload,
    thinkingStatusLocal,
    setThinkingStatusLocal,
  };
}
