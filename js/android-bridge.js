(() => {
  const isAndroidApp = Boolean(window.Android?.beginDownload);
  window.isRemixStudioAndroid = isAndroidApp;

  function bytesToBase64(bytes) {
    let binary = '';
    const block = 0x8000;
    for (let index = 0; index < bytes.length; index += block) {
      binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + block, bytes.length)));
    }
    return btoa(binary);
  }

  async function saveBlobToAndroid(blob, filename) {
    const id = window.Android.beginDownload(filename, blob.type || 'application/octet-stream');
    if (!id) throw new Error('Android n’a pas pu préparer le fichier de sortie.');

    const chunkSize = 192 * 1024;
    try {
      for (let offset = 0, chunkIndex = 0; offset < blob.size; offset += chunkSize, chunkIndex += 1) {
        const buffer = await blob.slice(offset, Math.min(offset + chunkSize, blob.size)).arrayBuffer();
        const ok = window.Android.appendDownloadChunk(id, bytesToBase64(new Uint8Array(buffer)));
        if (!ok) throw new Error('Échec pendant l’écriture du fichier Android.');
        if (chunkIndex % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!window.Android.finishDownload(id)) throw new Error('Android n’a pas pu terminer le téléchargement.');
    } catch (error) {
      window.Android.cancelDownload(id);
      throw error;
    }
  }

  if (!isAndroidApp) return;

  document.documentElement.classList.add('android-app');

  document.addEventListener('click', async (event) => {
    const anchor = event.target.closest?.('a[download]');
    if (!anchor || !anchor.href?.startsWith('blob:')) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    try {
      const response = await fetch(anchor.href);
      if (!response.ok) throw new Error('Le fichier vidéo temporaire est inaccessible.');
      const blob = await response.blob();
      await saveBlobToAndroid(blob, anchor.download || 'remix-studio-video.mp4');
    } catch (error) {
      console.error('Téléchargement Android impossible', error);
      window.dispatchEvent(new CustomEvent('android-download-error', { detail: error.message }));
      alert(error.message || 'Le téléchargement Android a échoué.');
    }
  }, true);
})();
