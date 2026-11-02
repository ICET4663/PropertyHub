/**
 * Picking, checking, uploading and opening files.
 *
 * Both buckets are private: files are read through short-lived signed URLs, never public links.
 *   documents:          properties/<propertyId>/<file>  or  tenants/<tenantId>/<file>   (20 MB)
 *   maintenance-photos: <requestId>/<file>                                               (10 MB)
 * Storage policies decide who may read and write each folder; the checks here only give a clear
 * message before a doomed upload.
 */
import { Linking, Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { DocFile } from '../types';
import { supabase } from './supabase';

export type Bucket = 'documents' | 'maintenance-photos';

export interface PickedFile {
  name: string;
  mimeType: string;
  size: number; // bytes, 0 if the platform didn't say
  uri: string; // local file on native, blob/data URL on web (usable as an <Image> source)
  file?: Blob; // web only
}

export const LIMITS: Record<Bucket, number> = { documents: 20 * 1024 * 1024, 'maintenance-photos': 10 * 1024 * 1024 };

export const ACCEPT = {
  images: ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'],
  pdf: ['application/pdf'],
  word: ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};
export const ID_TYPES = [...ACCEPT.images, ...ACCEPT.pdf];
export const DOC_TYPES = [...ACCEPT.images, ...ACCEPT.pdf, ...ACCEPT.word];

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif', webp: 'image/webp',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function mimeOf(name: string, given?: string | null): string {
  if (given && given !== 'application/octet-stream') return given;
  return EXT_MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

export function kindOf(f: { name: string; mimeType?: string }): DocFile['kind'] {
  const m = mimeOf(f.name, f.mimeType);
  return m.startsWith('image/') ? 'jpg' : m === 'application/pdf' ? 'pdf' : 'doc';
}

export function fmtSize(bytes: number): string {
  if (!bytes) return 'size unknown';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A message for the user if the file can't go in this bucket, otherwise null. */
export function checkFile(f: PickedFile, bucket: Bucket, accept: string[]): string | null {
  if (!accept.includes(f.mimeType)) {
    const allowed = [accept.some((m) => m.startsWith('image/')) && 'photos', accept.includes('application/pdf') && 'PDFs', accept.includes(ACCEPT.word[0]) && 'Word documents'].filter(Boolean).join(', ');
    return `${f.name} can’t be uploaded here. Use ${allowed}.`;
  }
  if (f.size > LIMITS[bucket]) return `${f.name} is ${fmtSize(f.size)}. The limit is ${fmtSize(LIMITS[bucket])}.`;
  return null;
}

export type PickResult = { files: PickedFile[] } | { error: string };

/** Opens the system file picker. An empty list means the user cancelled. */
export async function pickDocuments(accept: string[], multiple = false): Promise<PickResult> {
  try {
    const r = await DocumentPicker.getDocumentAsync({ type: accept, multiple, copyToCacheDirectory: true, base64: false });
    if (r.canceled) return { files: [] };
    return { files: r.assets.map((a) => ({ name: a.name, mimeType: mimeOf(a.name, a.mimeType), size: a.size ?? a.file?.size ?? 0, uri: a.uri, file: a.file })) };
  } catch (e) {
    return { error: `Couldn’t open your files: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Takes a photo with the camera, or picks from the photo library. */
export async function pickPhotos(source: 'camera' | 'library', limit = 1): Promise<PickResult> {
  try {
    if (Platform.OS !== 'web') {
      const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        return { error: source === 'camera'
          ? 'Camera access is off. Allow it in your phone’s settings, or choose a photo from your library instead.'
          : 'Photo access is off. Allow it in your phone’s settings, or take a new photo instead.' };
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: limit > 1, selectionLimit: limit };
    const r = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (r.canceled || !r.assets) return { files: [] };
    return {
      files: r.assets.slice(0, limit).map((a, i) => {
        const name = a.fileName ?? `photo-${Date.now()}-${i + 1}.jpg`;
        return { name, mimeType: mimeOf(name, a.mimeType), size: a.fileSize ?? a.file?.size ?? 0, uri: a.uri, file: a.file };
      }),
    };
  } catch (e) {
    return { error: `Couldn’t open the ${source === 'camera' ? 'camera' : 'photo library'}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Storage keys allow a limited character set; keep names readable and unique. */
export function objectName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize('NFKD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${base}${ext ? `.${ext}` : ''}`;
}

async function body(f: PickedFile): Promise<Blob | ArrayBuffer> {
  if (f.file) return f.file;
  // React Native can't upload a Blob with supabase-js; read the local file into an ArrayBuffer.
  const res = await fetch(f.uri);
  return res.arrayBuffer();
}

/** Uploads to `<folder>/<unique name>` and returns the object path. Throws with a readable message. */
export async function uploadFile(bucket: Bucket, folder: string, f: PickedFile): Promise<string> {
  const path = `${folder}/${objectName(f.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, await body(f), { contentType: f.mimeType, upsert: false });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes('row-level security') || m.includes('unauthorized') || m.includes('403')) throw new Error('You don’t have permission to upload files here.');
    if (m.includes('exceeded') || m.includes('too large') || m.includes('413')) throw new Error(`${f.name} is larger than the upload limit.`);
    throw new Error(`Couldn’t upload ${f.name}: ${error.message}`);
  }
  return path;
}

export async function removeFiles(bucket: Bucket, paths: string[]) {
  if (paths.length) await supabase.storage.from(bucket).remove(paths);
}

/** A link that works for 10 minutes. */
export async function signedUrl(bucket: Bucket, path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600, download ? { download } : undefined);
  if (error || !data) throw new Error(error?.message.includes('not found') ? 'This file is no longer available.' : 'You can’t open this file.');
  return data.signedUrl;
}

/**
 * Opens a stored file in the browser / system viewer.
 * On web the tab is opened before the await, so pop-up blockers treat it as part of the tap.
 */
export async function openFile(bucket: Bucket, path: string, download?: string): Promise<void> {
  const tab = Platform.OS === 'web' ? window.open('', '_blank') : null;
  try {
    const url = await signedUrl(bucket, path, download);
    if (tab) tab.location.href = url;
    else await Linking.openURL(url);
  } catch (e) {
    tab?.close();
    throw e;
  }
}

/**
 * Signed URLs for a maintenance request's photos, oldest first: the reporter's (`<id>/`) or,
 * with `completion`, the repairer's proof of the finished work (`<id>/completion/`).
 */
export async function requestPhotos(requestId: string, completion = false): Promise<{ path: string; url: string }[]> {
  const folder = completion ? `${requestId}/completion` : requestId;
  const { data, error } = await supabase.storage.from('maintenance-photos').list(folder, { sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(error.message);
  const paths = (data ?? []).filter((o) => o.id).map((o) => `${folder}/${o.name}`); // entries without an id are subfolders
  if (!paths.length) return [];
  const signed = await supabase.storage.from('maintenance-photos').createSignedUrls(paths, 600);
  if (signed.error) throw new Error(signed.error.message);
  return signed.data.flatMap((s) => (s.signedUrl && s.path ? [{ path: s.path, url: s.signedUrl }] : []));
}
