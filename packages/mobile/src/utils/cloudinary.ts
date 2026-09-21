// ============================================================
// Focussive Mobile — Cloudinary Upload Helper
// ============================================================

import { Platform } from 'react-native';

// Default Cloudinary configuration (can be customized or passed via env)
const DEFAULT_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'os1l5gui';
const DEFAULT_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'Focussive';

export interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  format: string;
  resource_type: string;
}

/**
 * Upload an image or GIF to Cloudinary via unsigned upload
 *
 * Uses XMLHttpRequest instead of Expo Winter fetch to avoid
 * "Unsupported FormDataPart implementation" errors with React Native file URIs.
 *
 * @param fileUri Local file URI from ImagePicker (e.g. file:///... or content://...)
 * @param resourceType 'image' | 'video' | 'auto' (GIFs and images use 'image' or 'auto')
 * @returns The secure URL from Cloudinary, or throws an error
 */
export async function uploadToCloudinary(
  fileUri: string,
  resourceType: 'image' | 'auto' = 'auto',
  cloudName: string = DEFAULT_CLOUD_NAME,
  uploadPreset: string = DEFAULT_UPLOAD_PRESET
): Promise<string> {
  const uriParts = fileUri.split('.');
  const fileType = (uriParts[uriParts.length - 1] || 'jpg').split('?')[0].toLowerCase();

  let mimeType = 'image/jpeg';
  if (fileType === 'png') mimeType = 'image/png';
  else if (fileType === 'gif') mimeType = 'image/gif';
  else if (fileType === 'webp') mimeType = 'image/webp';

  const formData = new FormData();

  if (Platform.OS === 'web') {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      formData.append('file', blob, `upload_${Date.now()}.${fileType}`);
    } catch {
      formData.append('file', fileUri);
    }
  } else {
    // Native React Native file part handled by RCTNetworking / XMLHttpRequest
    formData.append('file', {
      uri: fileUri,
      type: mimeType,
      name: `upload_${Date.now()}.${fileType}`,
    } as any);
  }

  formData.append('upload_preset', uploadPreset);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
          resolve(data.secure_url);
        } else {
          console.warn('[Cloudinary] Upload failed with status:', xhr.status, data);
          reject(new Error(data.error?.message || `Upload failed with status ${xhr.status}`));
        }
      } catch (err) {
        console.error('[Cloudinary] Failed to parse response:', xhr.responseText);
        reject(new Error('Failed to parse Cloudinary response'));
      }
    };

    xhr.onerror = (err) => {
      console.error('[Cloudinary] Network error via XHR:', err);
      reject(new Error('Network error during upload to Cloudinary'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Cloudinary upload timed out'));
    };

    xhr.send(formData);
  });
}

export const uploadImageToCloudinary = uploadToCloudinary;

