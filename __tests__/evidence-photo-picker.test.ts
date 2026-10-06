/**
 * The one importer of `expo-image-picker`.
 *
 * Same arrangement as `GlassSurface` for `expo-blur`: the native module has a
 * single door, so the permission prompt, the cancellation path and the limits
 * are written once.
 *
 * WHAT THE SERVER OWNS. `evidence_images.process` decodes the file to find out
 * what it really is — the extension is never consulted — then reorients it,
 * strips metadata and re-encodes it to WebP. The two checks here exist only to
 * avoid an upload that would travel for a minute and come back a 413.
 */
const mockLaunchLibrary = jest.fn();
const mockLaunchCamera = jest.fn();
const mockRequestLibrary = jest.fn();
const mockRequestCamera = jest.fn();

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchLibrary(...args),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCamera(...args),
  requestMediaLibraryPermissionsAsync: () => mockRequestLibrary(),
  requestCameraPermissionsAsync: () => mockRequestCamera(),
}));

import { pickEvidencePhoto } from '@/utils/evidence-photo-picker';

const ASSET = {
  uri: 'file:///tmp/IMG_0042.HEIC',
  width: 4032,
  height: 3024,
  fileName: 'IMG_0042.HEIC',
  fileSize: 2_400_000,
  mimeType: 'image/heic',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRequestLibrary.mockResolvedValue({ granted: true });
  mockRequestCamera.mockResolvedValue({ granted: true });
  mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [ASSET] });
  mockLaunchCamera.mockResolvedValue({ canceled: false, assets: [ASSET] });
});

describe('permission', () => {
  it('asks for the library before opening the library', async () => {
    await pickEvidencePhoto('library');

    expect(mockRequestLibrary).toHaveBeenCalled();
    expect(mockRequestCamera).not.toHaveBeenCalled();
  });

  it('asks for the camera before opening the camera', async () => {
    await pickEvidencePhoto('camera');

    expect(mockRequestCamera).toHaveBeenCalled();
    expect(mockLaunchCamera).toHaveBeenCalled();
  });

  it('opens nothing when the OS refuses', async () => {
    mockRequestCamera.mockResolvedValue({ granted: false });

    expect(await pickEvidencePhoto('camera')).toEqual({ status: 'denied' });
    expect(mockLaunchCamera).not.toHaveBeenCalled();
  });
});

describe('what it asks the picker for', () => {
  it('asks for one image, uncropped and uncompressed', async () => {
    await pickEvidencePhoto('library');

    expect(mockLaunchLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: ['images'],
        // Cropping evidence on the way in would let part of what the photo
        // documents be removed.
        allowsEditing: false,
        allowsMultipleSelection: false,
        // The server compresses. Doing it twice only loses detail.
        quality: 1,
        exif: false,
      }),
    );
  });
});

describe('the answer', () => {
  it('describes a local file the uploader can send', async () => {
    const result = await pickEvidencePhoto('library');

    expect(result).toEqual({
      status: 'picked',
      photo: {
        uri: 'file:///tmp/IMG_0042.HEIC',
        name: 'IMG_0042.HEIC',
        mimeType: 'image/heic',
        byteSize: 2_400_000,
      },
    });
  });

  it('invents a filename only when the picker reports none', async () => {
    // Django's multipart parser wants a filename. The server still decodes the
    // bytes to learn what the file is.
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ ...ASSET, fileName: null, mimeType: 'image/jpeg' }],
    });

    const result = await pickEvidencePhoto('library');

    expect(result).toMatchObject({ photo: { name: 'evidencia.jpg' } });
  });

  it('reads a closed picker as a cancellation, not a failure', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: true, assets: null });

    expect(await pickEvidencePhoto('library')).toEqual({ status: 'cancelled' });
  });

  it('reads an empty selection as a cancellation too', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: false, assets: [] });

    expect(await pickEvidencePhoto('library')).toEqual({ status: 'cancelled' });
  });
});

describe('the two checks it makes before an upload', () => {
  it('refuses a file over the size the server accepts', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ ...ASSET, fileSize: 26 * 1024 * 1024 }],
    });

    expect(await pickEvidencePhoto('library')).toMatchObject({ status: 'rejected' });
  });

  it('refuses a type the server cannot decode', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ ...ASSET, mimeType: 'image/gif', fileName: 'meme.gif' }],
    });

    expect(await pickEvidencePhoto('library')).toMatchObject({ status: 'rejected' });
  });

  it('accepts HEIC, which is what an iPhone hands over by default', async () => {
    // "High Efficiency" is the factory setting. Refusing it here would refuse
    // most iPhone photos; the server decodes it with `pillow-heif` and says so
    // plainly when that is missing.
    expect(await pickEvidencePhoto('library')).toMatchObject({ status: 'picked' });
  });

  it('sends a file whose type the picker did not report', async () => {
    // Unknown is not the same as wrong, and the decoder is the authority.
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ ...ASSET, mimeType: undefined }],
    });

    expect(await pickEvidencePhoto('library')).toMatchObject({ status: 'picked' });
  });
});
