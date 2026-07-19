# Remix Studio 2.0

[![Construire APK Android](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml/badge.svg)](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml)

Application Android et web de montage vidéo réaction manuel, conçue pour un usage mobile avec une interface compacte inspirée des éditeurs comme CapCut.

## Télécharger l’APK Android

- Dernière version : https://github.com/Chasmet/Montage-vid-o-/releases/tag/latest-apk
- Téléchargement direct : https://github.com/Chasmet/Montage-vid-o-/releases/download/latest-apk/RemixStudio.apk

Sur Android, autoriser temporairement l’installation d’applications provenant de GitHub ou du navigateur utilisé, puis ouvrir `RemixStudio.apk`.

L’APK est reconstruit automatiquement après chaque modification de la branche `main`. Il est aussi disponible dans **Actions > Construire APK Android > Artifacts > Remix-Studio-APK**.

## Utilisation

1. Appuyer sur **Importer** et sélectionner une vidéo présente sur le téléphone.
2. Placer le curseur au début du passage et appuyer sur **Début = curseur**.
3. Placer le curseur à la fin puis appuyer sur **Fin = curseur**.
4. Appuyer sur **Garder sur la piste** pour conserver le passage importé.
5. Ouvrir **Caméra**, choisir l’orientation et le micro, puis enregistrer la réaction.
6. Découper les parties utiles de la prise caméra.
7. Ajouter progressivement les extraits dans **Vidéos finales**.
8. Réorganiser les clips, régler le volume, le recadrage et les transitions.
9. Appuyer sur **Exporter** pour enregistrer la vidéo dans `Téléchargements/RemixStudio`.

## Fonctions incluses

- Interface mobile compacte façon CapCut.
- Grand aperçu vidéo et mode plein écran.
- Import de vidéos TikTok, Instagram, Shorts ou fichiers locaux déjà enregistrés.
- Détection automatique du format vertical ou horizontal.
- Découpe manuelle précise avec points d’entrée et de sortie.
- Trois pistes : **Vidéo importée**, **Caméra** et **Vidéos finales**.
- Miniatures automatiques sur les clips.
- Enregistrement caméra avant/arrière avec choix du micro.
- Mode caméra vertical, horizontal ou automatique selon la vidéo importée.
- Vidéo importée visible en référence muette pendant l’enregistrement.
- Réduction du bruit, anti-écho et contrôle automatique du gain.
- Suppression, duplication, déplacement et glisser-déposer des clips.
- Volume, sourdine, recadrage et fondu par clip.
- Aperçu complet de la vidéo finale.
- Annuler et rétablir jusqu’à 40 modifications.
- Sauvegarde automatique locale dans IndexedDB.
- Export HD 720p ou Full HD 1080p.
- MP4 quand le moteur Android le prend en charge, sinon WebM haute qualité.
- Export Android dans `Téléchargements/RemixStudio`.
- Fonctionnement hors ligne, sans compte et sans transfert des vidéos vers un serveur.

## Construction Android

Le workflow `.github/workflows/build-apk.yml` :

1. vérifie automatiquement tous les éléments HTML et les fichiers JavaScript ;
2. installe Java 17, Android SDK 35 et Gradle 8.9 ;
3. construit l’APK installable ;
4. publie `RemixStudio.apk` dans les artefacts GitHub et dans la version `latest-apk`.

## Version web locale

```bash
python3 -m http.server 8080
```

Ouvrir ensuite `http://localhost:8080`.
