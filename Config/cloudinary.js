import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.Cloudinaryname,
  api_key: process.env.Cloudinarykey,
  api_secret: process.env.Cloudinarysecret,
});

import fs from 'fs';
import path from 'path';

// Only these image types may ever be written to disk.
const MIME_EXTENSION_ALLOWLIST = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Sniff the real image type from the file's magic bytes.
 * Returns null when the buffer is not a recognised image.
 */
export const sniffImageType = (buffer) => {
  if (!buffer || buffer.length < 4) return null;

  const startsWith = (bytes) => bytes.every((byte, index) => buffer[index] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
};

/**
 * Resolve the stored file extension from the sniffed content first, then the
 * declared MIME type, using a fixed allowlist. The client-supplied file name is
 * never used, so it can never influence the extension that is written.
 */
export const resolveImageExtension = (buffer, mimeType) => {
  const sniffed = sniffImageType(buffer);
  if (sniffed) return sniffed;

  const declared = typeof mimeType === 'string' ? MIME_EXTENSION_ALLOWLIST[mimeType.toLowerCase()] : null;
  return declared || 'jpg';
};

/**
 * Upload a memory buffer to Cloudinary (with local disk storage fallback if Cloudinary credentials or network fail)
 * @param {Buffer} fileBuffer
 * @param {string} folder
 * @param {string} originalName
 * @param {string} [mimeType]
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
export const uploadToCloudinary = (fileBuffer, folder = 'homefoods', originalName = 'image.jpg', mimeType = '') => {
  return new Promise((resolve, reject) => {
    const saveLocally = () => {
      try {
        const ext = `.${resolveImageExtension(fileBuffer, mimeType)}`;
        const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '_');
        const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const uploadDir = path.join(process.cwd(), 'uploads', cleanFolder);

        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, uniqueFilename);
        fs.writeFileSync(filePath, fileBuffer);

        const port = process.env.PORT || 9000;
        const host = process.env.HOST_IP || '192.168.100.33';
        const secure_url = `http://${host}:${port}/uploads/${cleanFolder}/${uniqueFilename}`;

        console.log(`[Upload] Image saved locally to ${secure_url}`);
        return resolve({
          secure_url,
          public_id: `local_${cleanFolder}_${uniqueFilename}`,
        });
      } catch (localErr) {
        console.error('Local upload fallback failed:', localErr);
        return reject(localErr);
      }
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error) {
          console.warn('[Cloudinary Warning]', error.message || error);
          console.log('[Upload] Falling back to local storage server...');
          return saveLocally();
        }
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );
    uploadStream.end(fileBuffer);
  });
};

/**
 * Delete an image from Cloudinary by its public ID
 * @param {string} publicId
 */
export const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Error deleting image from Cloudinary:', error.message);
    return null;
  }
};

export default cloudinary;
