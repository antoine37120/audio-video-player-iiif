# Documentation du Web Component `<annotation-player-iiif>`

Ce composant web permet d'afficher un lecteur audio/vidéo synchronisé avec une timeline interactive (VisJS) et une visualisation de la forme d'onde (Waveform). Il supporte l'affichage et l'édition d'annotations au format IIIF ou JSON simple, ainsi que les sous-titres.

## Installation

Assurez-vous d'avoir inclus le script du composant et la feuille de style associée dans votre page HTML.

```html
<link rel="stylesheet" href="dist/player-iiif-vis.css">
<script type="module" src="dist/player-iiif-vis.js"></script>
```

## Utilisation

Utilisez la balise `<annotation-player-iiif>` avec les attributs suivants pour configurer le lecteur.

```html
<annotation-player-iiif
    media-url="media/audio.mp3"
    media-type="audio"
    wave-form-url="public/waveform.json"
    iiif-annotation-list-url="https://example.com/annotations.json"
    subtitle-files-url='[{"url": "subs_fr.vtt", "language": "fr", "label": "Français"}]'
    annotation-properties-to-display="time,text,author"
    can-add-annotation="true"
    can-edit-all-annotation="true"
></annotation-player-iiif>
```

## Attributs et Propriétés

Voici la liste complète des attributs supportés :

### Configuration Média

*   **`media-url`** (Requis) : L'URL du fichier audio ou vidéo à lire.
*   **`media-type`** : Le type de média. Valeurs possibles : `audio` (défaut) ou `video`.
*   **`subtitle-files-url`** : Une chaîne JSON représentant un tableau d'objets pour les pistes de sous-titres.
    *   Format : `[{"url": "chemin/vers/fichier.vtt", "language": "code_langue", "label": "Libellé"}]`

### Visualisation

*   **`wave-form-url`** : L'URL du fichier JSON contenant les données de la forme d'onde (généré par `audiowaveform` ou compatible).
*   **`waveform-stroke-color`** : La couleur du trait de la forme d'onde (ex: `rgba(0, 0, 0, 0.48)`). Défaut : `rgba(0, 0, 0, 0.48)`.
*   **`waveform-stroke-width`** : L'épaisseur du trait de la forme d'onde en pixels. Défaut : `1`.

### Annotations

*   **`iiif-annotation-list-url`** : L'URL de la liste d'annotations (format IIIF Presentation API ou JSON simple).
*   **`annotation-min-time-to-display`** : Durée minimale (en secondes) pendant laquelle une annotation ponctuelle reste affichée dans la liste sous le lecteur. Défaut : `15`.
*   **`annotation-properties-to-display`** : Liste des propriétés de l'annotation à afficher, séparées par des virgules.
    *   Valeurs possibles : `time` (temps), `text` (contenu), `author` (auteur), `creator.id` (id du créateur).
    *   Exemple : `time,text,author`

### Permissions et Édition

*   **`can-add-annotation`** : `true` ou `false`. Affiche ou masque le bouton "Ajouter une annotation". Défaut : `true`.
*   **`can-edit-all-annotation`** : `true` ou `false`. Permet d'éditer (déplacer, redimensionner, modifier le texte) toutes les annotations. Défaut : `true`.
*   **`can-update-annotation-for-author-name`** : Si défini, permet d'éditer uniquement les annotations dont l'auteur correspond à cette valeur.

## Fonctionnalités

*   **Lecture Média** : Lecteur Video.js intégré avec contrôles persistants.
*   **Timeline Interactive** :
    *   Zoom avec la molette de la souris (Ctrl + Molette).
    *   Déplacement latéral (Drag & Drop).
    *   Sélection d'annotation au clic.
    *   Double-clic sur la timeline (si `can-add-annotation` est actif) pour créer une annotation.
    *   Double-clic sur une annotation (si permission accordée) pour l'éditer.
*   **Synchronisation** :
    *   Le curseur de la timeline suit la lecture.
    *   Cliquer sur la timeline déplace la tête de lecture.
    *   Les annotations s'affichent dynamiquement sous le lecteur en fonction du temps courant.
*   **Édition** :
    *   Formulaire modal pour créer/modifier des annotations (Type Point ou Plage, Temps, Texte).
    *   Support du Drag & Drop pour déplacer les annotations sur la timeline.

## Exemple Complet

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>Démonstration Annotation Player</title>
    <link rel="stylesheet" href="dist/player-iiif-vis.css">
    <style>
        body { font-family: sans-serif; margin: 20px; }
        #player-wrapper { max-width: 800px; margin: 0 auto; }
    </style>
</head>
<body>
    <div id="player-wrapper">
        <annotation-player-iiif
            media-url="media/interview.mp3"
            wave-form-url="data/waveform.json"
            iiif-annotation-list-url="data/annotations.json"
            subtitle-files-url='[{"url": "data/subs.vtt", "language": "fr", "label": "Français"}]'
            annotation-properties-to-display="time,text"
            can-add-annotation="true"
        ></annotation-player-iiif>
    </div>
    <script type="module" src="dist/player-iiif-vis.js"></script>
</body>
</html>
```
