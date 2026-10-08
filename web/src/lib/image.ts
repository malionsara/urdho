/**
 * Shrinks an uploaded photo in the browser before it is stored. The real upload (milestone 6)
 * resizes on the server too; this keeps the demo's localStorage small.
 */
export async function resizeImage(file: File, maxWidth = 800, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/webp', quality);
}
