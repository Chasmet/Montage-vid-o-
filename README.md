# Remix Studio 2.8

[![Construire APK Android](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml/badge.svg)](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml)

Application Android et web de montage vidéo mobile avec une timeline unique inspirée de CapCut.

## Télécharger l’APK Android

- Dernière version : https://github.com/Chasmet/Montage-vid-o-/releases/tag/latest-apk
- Téléchargement direct : https://github.com/Chasmet/Montage-vid-o-/releases/download/latest-apk/RemixStudio.apk

L’APK est reconstruit automatiquement après chaque modification de la branche `main`.

## Utilisation simplifiée

1. Appuyer sur **Importer** et sélectionner une vidéo.
2. La vidéo apparaît directement sur la timeline.
3. Pincer la timeline avec deux doigts pour la réduire ou l’agrandir.
4. Placer la ligne blanche à l’endroit précis.
5. Appuyer sur **Diviser** pour fractionner le clip.
6. Importer ou filmer : le nouveau média est inséré à la ligne blanche.
7. Appuyer sur **Exporter**.
8. Choisir **Mode 1** ou **Mode 2 — Interview naturelle**.

## Modes d’export

### Mode 1 — Montage normal

Les clips passent les uns après les autres en plein écran, selon l’ordre de la timeline.

### Mode 2 — Interview naturelle

- Les clips sont associés deux par deux.
- Le premier parle à gauche pendant que le second reste animé silencieusement à droite.
- Le second parle ensuite à droite pendant que le premier reste animé silencieusement à gauche.
- L’application recherche automatiquement jusqu’à deux passages calmes pour créer des réactions naturelles.
- Une scène forte, comme un cri ou un geste brusque, n’est pas répétée en boucle.
- Quand aucun passage calme n’est disponible, une image choisie automatiquement reçoit un zoom et un déplacement très légers.
- Le côté qui ne parle pas est légèrement assombri.
- Le son actif, les volumes et les clips muets de la timeline sont respectés.
- Le dernier clip sans partenaire est exporté seul.
- La durée totale du projet est conservée.

## Fonctions incluses

- Une seule timeline pour les vidéos importées et les prises caméra.
- Insertion automatique à la ligne blanche après une division.
- Zoom tactile par pincement à deux doigts.
- Aperçu compact conservant le ratio original.
- Division, rotation, volume, sourdine, duplication et suppression.
- Caméra Android native CameraX et micro du téléphone.
- Annuler et rétablir jusqu’à 40 modifications.
- Sauvegarde automatique locale dans IndexedDB.
- Auto-réparation des médias et protection du stockage.
- Export Full HD 1080p.
- MP4 quand Android le prend en charge, sinon WebM haute qualité.
- Fonctionnement hors ligne, sans compte et sans serveur.

## Construction Android

Le workflow `.github/workflows/build-apk.yml` teste l’interface, les données, l’insertion au curseur, le Mode 2, CameraX et le contenu réel de l’APK avant publication.
