# Remix Studio

[![Construire APK Android](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml/badge.svg)](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml)

Application Android et web mobile-first de montage vidéo réaction manuel.

## Télécharger l’APK Android

- Page de la dernière version : https://github.com/Chasmet/Montage-vid-o-/releases/tag/latest-apk
- Téléchargement direct : https://github.com/Chasmet/Montage-vid-o-/releases/download/latest-apk/RemixStudio.apk

Sur Android, autoriser temporairement l’installation d’applications provenant de GitHub ou du navigateur utilisé, puis ouvrir `RemixStudio.apk`.

L’APK est reconstruit automatiquement après chaque modification de la branche `main`. Il est également disponible dans **Actions > Construire APK Android > Artifacts > Remix-Studio-APK**.

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
- Export dans le dossier `Téléchargements/RemixStudio` depuis l’APK.
- Fonctionnement hors ligne : l’interface web est intégrée dans l’APK.
- Fonctionnement sans compte et sans envoi des vidéos vers un serveur.

## Fonctions Android ajoutées

- Permissions caméra et micro gérées par Android.
- Sélecteur de vidéos du téléphone.
- Pont natif pour enregistrer les vidéos exportées dans Téléchargements.
- Écran maintenu allumé pendant le montage et le rendu.
- Rotation verticale ou horizontale autorisée.
- WebView sécurisée sur une origine HTTPS locale fournie par AndroidX WebKit.

## Lancer la version web en local

```bash
python3 -m http.server 8080
```

Ouvrir ensuite `http://localhost:8080`.

## Publier la version web avec GitHub Pages

Dans GitHub :

1. Ouvrir **Settings**.
2. Ouvrir **Pages**.
3. Choisir **Deploy from a branch**.
4. Sélectionner la branche `main` et le dossier `/root`.

## Construction Android

Le workflow `.github/workflows/build-apk.yml` installe Java 17, Android SDK 35 et Gradle 8.9, construit `app-debug.apk`, le renomme `RemixStudio.apk`, conserve l’artefact pendant 90 jours et remplace automatiquement la version GitHub `latest-apk`.
