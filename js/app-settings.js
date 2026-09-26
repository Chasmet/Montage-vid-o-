(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const native = Boolean(window.Android?.checkForUpdate);
  let automaticCheck = false;
  const status = (message) => { $('updateStatus').textContent = message; };
  $('settingsBtn').addEventListener('click', () => $('appSettings').classList.remove('hidden'));
  $('closeSettings').addEventListener('click', () => $('appSettings').classList.add('hidden'));
  if (!native) {
    $('autoUpdateToggle').disabled = $('checkUpdateBtn').disabled = true;
    status('Mises à jour APK disponibles dans l’application Android.');
    return;
  }
  $('appVersion').textContent = `Version ${window.Android.getAppVersion()}`;
  $('autoUpdateToggle').checked = window.Android.getAutoUpdate();
  $('autoUpdateToggle').addEventListener('change', () => {
    window.Android.setAutoUpdate($('autoUpdateToggle').checked);
    status($('autoUpdateToggle').checked ? 'Recherche automatique activée.' : 'Recherche automatique désactivée.');
  });
  $('checkUpdateBtn').addEventListener('click', () => { automaticCheck = false; window.Android.checkForUpdate(); });
  window.onRemixUpdate = (state, message) => {
    status(message);
    $('checkUpdateBtn').disabled = state === 'checking' || state === 'downloading';
    const previous = $('installUpdateBtn');
    if (previous) previous.remove();
    if (state === 'available') {
      $('appSettings').classList.remove('hidden');
      const button = document.createElement('button');
      button.id = 'installUpdateBtn';
      button.type = 'button';
      button.textContent = 'Télécharger et installer';
      button.addEventListener('click', () => {
        button.disabled = true;
        window.Android.installUpdate();
      });
      $('updateStatus').after(button);
      if (automaticCheck && $('autoUpdateToggle').checked) window.Android.installUpdate();
    }
    if (state !== 'checking') automaticCheck = false;
  };
  if ($('autoUpdateToggle').checked) setTimeout(() => { automaticCheck = true; window.Android.checkForUpdate(); }, 3500);
})();
