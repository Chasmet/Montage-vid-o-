# Remix Studio 3.0

[![Construire APK Android](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml/badge.svg)](https://github.com/Chasmet/Montage-vid-o-/actions/workflows/build-apk.yml)

Application Android et web de montage vidéo mobile avec une timeline unique inspirée de CapCut.

## Télécharger l’APK Android

- Dernière version signée : https://github.com/Chasmet/Montage-vid-o-/releases/latest
- Si la signature release n’est pas configurée, l’APK debug est disponible dans les artefacts GitHub Actions.

L’APK est reconstruit automatiquement après chaque modification de la branche `main`. La publication d’une Release nécessite les quatre secrets GitHub `RELEASE_KEYSTORE_BASE64`, `RELEASE_KEYSTORE_PASSWORD`, `RELEASE_KEY_ALIAS` et `RELEASE_KEY_PASSWORD` (la même clé privée pour toutes les versions). Une installation existante ne peut conserver ses données lors d’une mise à jour que si les deux APK ont le même identifiant et la même signature. Ne publiez jamais la clé dans le dépôt.

## Réaction / Split Screen

Le troisième onglet importe une vidéo, filme la caméra frontale en haut et affiche la vidéo en bas sur un canevas vertical 9:16. Lecture, pause, déplacement dans la vidéo, volume, sourdine, zoom et repositionnement sont accessibles pendant l’enregistrement. Le bouton Pause suspend la prise et la lecture ensemble. L’export utilise l’encodeur du téléphone et sauvegarde en MP4 si disponible, sinon en WebM. Un casque évite le retour sonore dans le microphone.

## Mises à jour Android

Dans Réglages, activez la recherche automatique ou lancez une vérification manuelle. L’application vérifie `releases/latest`, télécharge l’APK signé et son SHA-256, contrôle l’identifiant et la signature de l’application, puis ouvre le programme d’installation Android. Android demande une confirmation. Le stockage des projets reste dans l’application tant que la signature est conservée et que l’installation se fait en mise à jour. Une ancienne installation debug signée avec une clé différente ne peut pas être mise à jour en place.

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

Les clips passent les uns après les autres en plein écran, selon l’ordre de la timeline. Ce mode reste inchangé dans la version 2.9.

### Mode 2 — Interview naturelle synchronisée

- Les clips sont associés deux par deux.
- Le premier parle à gauche pendant que le second reste animé silencieusement à droite.
- Le second parle ensuite à droite pendant que le premier reste animé silencieusement à gauche.
- L’application recherche automatiquement jusqu’à deux passages calmes pour créer des réactions naturelles.
- Une scène forte, comme un cri ou un geste brusque, n’est pas répétée en boucle.
- Quand aucun passage calme n’est disponible, une image choisie automatiquement reçoit un zoom et un déplacement très légers.
- Le côté qui ne parle pas est légèrement assombri.
- Le son actif, les volumes et les clips muets de la timeline sont respectés.
- Le dernier clip sans partenaire est exporté seul.
- L’analyse des réactions est terminée avant le démarrage du fichier final.
- L’enregistrement se met en pause pendant la préparation du duo suivant.
- Les secondes de chargement ne sont plus ajoutées à la vidéo finale.
- La durée du Mode 2 reste proche de la durée réelle de la timeline et du Mode 1.

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
- Protection anti-blocage pendant les exports.
- Export Full HD 1080p.
- MP4 quand Android le prend en charge, sinon WebM haute qualité.
- Fonctionnement hors ligne, sans compte et sans serveur.

## Construction Android

Le workflow `.github/workflows/build-apk.yml` teste l’interface, les données, l’insertion au curseur, le Mode 2 synchronisé, CameraX et le contenu réel de l’APK avant publication.
