// ============================================================
// Focussive Mobile — Cloudinary Upload Helper
// ============================================================

import { Alert } from 'react-native';

// Default Cloudinary configuration (can be customized or passed via env)
const DEFAULT_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'focussive';
const DEFAULT_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'focussive_preset';

export interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  format: string;
  resource_type: string;
}

/**
 * Upload an image or GIF to Cloudinary via unsigned upload
 *
 * @param fileUri Local file URI from ImagePicker (e.g. file:///...)
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
  const fileType = uriParts[uriParts.length - 1].toLowerCase();

  let mimeType = 'image/jpeg';
  if (fileType === 'png') mimeType = 'image/png';
  else if (fileType === 'gif') mimeType = 'image/gif';
  else if (fileType === 'webp') mimeType = 'image/webp';

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    type: mimeType,
    name: `upload_${Date.now()}.${fileType}`,
  } as any);
  formData.append('upload_preset', uploadPreset);

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        Accept: 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok || !data.secure_url) {
      console.warn('[Cloudinary] Upload failed with response:', data);
      throw new Error(data.error?.message || 'Cloudinary upload failed');
    }

    return data.secure_url;
  } catch (error: any) {
    console.error('[Cloudinary] Network / upload error:', error);
    throw error;
  }
}

export const uploadImageToCloudinary = uploadToCloudinary;

