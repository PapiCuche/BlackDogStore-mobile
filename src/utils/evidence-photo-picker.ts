import * as ImagePicker from 'expo-image-picker';

import {
  EVIDENCE_MAX_UPLOAD_BYTES,
  isAcceptedEvidenceMimeType,
} from '@/domain/internal/evidence-types';

/**
 * THE ONLY IMPORTER OF `expo-image-picker`.
 *
 * Same arrangement as `GlassSurface` for `expo-blur`: one file owns the native
 * module, so the permission prompt, the cancellation path and the limits are
 * written once instead of in every screen that wants a photo.
 *
 * It returns a plain description of a local file. It does not upload, does not
 * know about repair orders, and does not resize: the server decodes, reorients,
 * strips metadata and re-encodes every photo to WebP, so a second compression
 * here would only discard detail before the server ever sees it.
 */

export type PickedPhoto = {
  uri: string;
  name: string;
  mimeType: string;
  byteSize: number;
};

export type PickPhotoResult =
  | { status: 'picked'; photo: PickedPhoto }
  /** The person closed the picker. Not an error, and not worth a message. */
  | { status: 'cancelled' }
  /** The OS refused, and only the OS can change that. */
  | { status: 'denied' }
  /** The file is unusable before any upload is attempted. */
  | { status: 'rejected'; reason: string };

export type PhotoSource = 'camera' | 'library';

/**
 * A name for the file, because Django's multipart parser wants one.
 *
 * The picker usually reports the original name; when it does not, the extension
 * is derived from the MIME type for readability only. The server never trusts
 * either — it decodes the bytes to learn what the file really is.
 */
function filenameFor(asset: ImagePicker.ImagePickerAsset): string {
  if (asset.fileName) return asset.fileName;
  const subtype = (asset.mimeType ?? 'image/jpeg').split('/')[1] ?? 'jpg';
  return `evidencia.${subtype === 'jpeg' ? 'jpg' : subtype}`;
}

function describe(asset: ImagePicker.ImagePickerAsset): PickPhotoResult {
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const byteSize = asset.fileSize ?? 0;

  if (!isAcceptedEvidenceMimeType(asset.mimeType)) {
    return {
      status: 'rejected',
      reason: 'Ese tipo de archivo no sirve como evidencia. Usa una foto.',
    };
  }
  // The picker reports the size of the original file, so this spares a long
  // upload that would come back refused. The server checks it again.
  if (byteSize > EVIDENCE_MAX_UPLOAD_BYTES) {
    return {
      status: 'rejected',
      reason: 'La foto pesa más de lo que el servidor acepta (25 MB).',
    };
  }

  return {
    status: 'picked',
    photo: { uri: asset.uri, name: filenameFor(asset), mimeType, byteSize },
  };
}

/**
 * Ask for one photo, from the camera or from the library.
 *
 * `allowsEditing` is off deliberately: evidence of a repair is not something to
 * crop on the way in, and the crop tool would let a technician remove part of
 * what the photo documents.
 */
export async function pickEvidencePhoto(source: PhotoSource): Promise<PickPhotoResult> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    // 1 = the original bytes. The server is the one that compresses.
    quality: 1,
    exif: false,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled) return { status: 'cancelled' };
  const asset = result.assets?.[0];
  if (!asset) return { status: 'cancelled' };
  return describe(asset);
}
