/**
 * Shrinks a photo in the browser before upload. Phone photos are often larger than the API's
 * upload limit, and smaller files upload faster on a venue's Wi-Fi; the server resizes again.
 */
export async function resizeImageToBlob(file: File, maxWidth: number, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('not_an_image'))), 'image/webp', quality),
  );
}
