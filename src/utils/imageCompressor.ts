/**
 * Utilitário de compressão de imagens para garantir alta performance e
 * prevenir estouro de cota de armazenamento no navegador.
 */

export async function compressImageFile(
  file: File | Blob,
  maxDimension = 1280,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    // SVGs são vetoriais e leves: preserva diretamente
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback direto via FileReader
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Tenta WebP primeiro (maior compressão)
      try {
        const webpData = canvas.toDataURL('image/webp', quality);
        if (webpData.startsWith('data:image/webp')) {
          resolve(webpData);
          return;
        }
      } catch {
        // Continua para JPEG
      }

      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    };

    img.src = objectUrl;
  });
}

/**
 * Redimensiona e comprime uma string base64 excessivamente longa caso o usuário
 * cole ou importe dados pesados.
 */
export async function compressBase64Image(
  base64Str: string,
  maxDimension = 1280,
  quality = 0.82
): Promise<string> {
  if (!base64Str.startsWith('data:image/') || base64Str.length < 150000 || base64Str.includes('image/svg+xml')) {
    return base64Str;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      try {
        const webpData = canvas.toDataURL('image/webp', quality);
        if (webpData.startsWith('data:image/webp') && webpData.length < base64Str.length) {
          resolve(webpData);
          return;
        }
      } catch {
        // Segue para JPEG
      }

      const jpegData = canvas.toDataURL('image/jpeg', quality);
      resolve(jpegData.length < base64Str.length ? jpegData : base64Str);
    };

    img.onerror = () => resolve(base64Str);
    img.src = base64Str;
  });
}
