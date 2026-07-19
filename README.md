# Remix Studio 2.2

[![Construire APK Android](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml/badge.svg)](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml)

Application Android et web de montage vidéo mobile avec une timeline unique inspirée de CapCut.

## Télécharger l’APK Android

- Dernière version : https://github.com/Chasmet/Montage-vid-o-/releases/tag/latest-apk
- Téléchargement direct : https://github.com/Chasmet/Montage-vid-o-/releases/download/latest-apk/RemixStudio.apk

L’APK est reconstruit automatiquement après chaque modification de la branche `main`.

## Utilisation simplifiée

1. Appuyer sur **Importer** et sélectionner une vidéo.
2. La vidéo complète apparaît directement sur la timeline.
3. Faire glisser la timeline sous la ligne blanche pour choisir l’endroit précis.
4. Appuyer sur **Diviser** pour fractionner le clip.
5. Sélectionner un morceau puis utiliser **Volume**, **Tourner**, **Dupliquer** ou **Supprimer**.
6. Appuyer sur **Caméra** pour filmer une prise avec CameraX et le micro du téléphone.
7. La prise caméra est ajoutée automatiquement sur la même timeline.
8. Appuyer sur **Exporter** pour créer directement le montage final en 1080p.

## Fonctions incluses

- Une seule timeline : vidéo importée et prises caméra sur la même ligne.
- Aperçu vidéo permanent pendant le montage.
- Ligne blanche centrale façon CapCut pour choisir le temps exact.
- Division du clip au niveau de la ligne blanche.
- Rotation par pas de 90°.
- Volume, sourdine et recadrage par clip.
- Duplication, suppression et réorganisation des clips.
- Lecture continue de toute la timeline.
- Caméra Android native CameraX, avant/arrière et micro du téléphone.
- Orientation caméra automatique, verticale 9:16 ou horizontale 16:9.
- Ajout automatique des prises caméra dans le montage.
- Annuler et rétablir jusqu’à 40 modifications.
- Sauvegarde automatique locale dans IndexedDB.
- Export direct Full HD 1080p.
- MP4 quand le moteur Android le prend en charge, sinon WebM haute qualité.
- Export Android dans `Téléchargements/RemixStudio`.
- Fonctionnement hors ligne, sans compte et sans serveur.

## Migration automatique

Les anciens projets utilisant les pistes **Vidéo importée**, **Caméra** et **Vidéos finales** sont convertis automatiquement vers la timeline unique. Les clips déjà présents dans la piste finale sont conservés dans leur ordre.

## Construction Android

Le workflow `.github/workflows/build-apk.yml` vérifie l’interface et le JavaScript, construit l’APK puis publie `RemixStudio.apk` dans la version `latest-apk`.
