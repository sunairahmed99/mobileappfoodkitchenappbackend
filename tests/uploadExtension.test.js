// E. Unit tests for the upload extension allowlist used by Config/cloudinary.js.
//
// The MIME type / file extension of an upload is derived from the file's magic
// bytes (and a fixed MIME allowlist), never from the client-supplied file name.
import {
  sniffImageType,
  resolveImageExtension,
} from '../Config/cloudinary.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = Buffer.from('GIF89a', 'ascii');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP', 'ascii')]);
const TEXT = Buffer.from('<?php echo "not an image"; ?>', 'ascii');

describe('E. Upload extension allowlist', () => {
  test('sniffs the real image type from magic bytes', () => {
    expect(sniffImageType(JPEG)).toBe('jpg');
    expect(sniffImageType(PNG)).toBe('png');
    expect(sniffImageType(GIF)).toBe('gif');
    expect(sniffImageType(WEBP)).toBe('webp');
    expect(sniffImageType(TEXT)).toBeNull();
  });

  test('a forged extension cannot influence the stored extension (sniffing wins)', () => {
    // Content is a JPEG even though the client declared image/png.
    expect(resolveImageExtension(JPEG, 'image/png')).toBe('jpg');
    // Content is plain text announced as a PHP file.
    expect(resolveImageExtension(TEXT, 'application/x-php')).toBe('jpg');
  });

  test('falls back to the declared MIME allowlist when the bytes are unrecognised', () => {
    expect(resolveImageExtension(Buffer.from([0x00, 0x01]), 'image/png')).toBe('png');
    expect(resolveImageExtension(Buffer.from([0x00, 0x01]), 'image/jpeg')).toBe('jpg');
    expect(resolveImageExtension(Buffer.from([0x00, 0x01]), 'image/webp')).toBe('webp');
    expect(resolveImageExtension(Buffer.from([0x00, 0x01]), 'image/gif')).toBe('gif');
  });

  test('never returns an executable/unknown extension', () => {
    const suspicious = ['php', 'phtml', 'js', 'html', 'asp', 'jsp'];
    suspicious.forEach((ext) => {
      const resolved = resolveImageExtension(Buffer.from([0x00, 0x01]), `application/x-${ext}`);
      expect(resolved).toBe('jpg');
      expect(suspicious).not.toContain(resolved);
    });
  });
});
