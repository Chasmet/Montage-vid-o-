# Remix Studio

Application mobile-first de montage vidéo réaction manuel.

## Fonctions incluses

- Import d’une vidéo TikTok, Instagram, YouTube Shorts ou locale déjà enregistrée sur le téléphone.
- Détection automatique du format vertical ou horizontal.
- Découpe manuelle précise avec points d’entrée et de sortie.
- Trois pistes séparées : vidéo importée, caméra, liste finale.
- Enregistrement caméra avant/arrière avec choix du micro.
- Mode caméra vertical, horizontal ou automatique selon la vidéo importée.
- Réduction du bruit, anti-écho et contrôle automatique du gain.
- Vidéo de référence muette pendant l’enregistrement.
- Suppression, duplication, déplacement et glisser-déposer des clips.
- Volume, sourdine, recadrage et fondu par clip.
- Aperçu complet de la liste finale.
- Annuler/rétablir.
- Sauvegarde automatique locale dans IndexedDB.
- Installation comme PWA sur Android.
- Export vidéo local : MP4 lorsqu’il est pris en charge par le navigateur, sinon WebM.
- Fonctionnement sans compte et sans envoi des vidéos vers un serveur.

## Lancer en local

```bash
python3 -m http.server 8080
```

Ouvrir ensuite `http://localhost:8080`.

## Publier avec GitHub Pages

Dans GitHub :

1. Ouvrir **Settings**.
2. Ouvrir **Pages**.
3. Choisir **Deploy from a branch**.
4. Sélectionner la branche `main` et le dossier `/root`.

## Limite de la version web

Le format final dépend de `MediaRecorder` sur le téléphone. Chrome Android exporte souvent en WebM. La future version APK native utilisera Android Media3/FFmpeg pour garantir le MP4 H.264, accélérer le rendu et mieux gérer les longues vidéos.
