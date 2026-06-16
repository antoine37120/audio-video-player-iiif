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
    subtitle-list-url="https://example.com/subtitles.json"
    subtitle-field-mapping='{"url": "url", "language": "language", "label": "label"}'
    <!-- Forme alternative : JSON inline
         subtitle-list-url='[{"url": "subs_fr.vtt", "language": "fr", "label": "Français"}]' -->
    annotation-properties-to-display="time,text,author"
    can-add-annotation="true"
    can-edit-all-annotation="true"
    colors='["#1890ff", "#333333", "#ffffff", "#eeeeee"]'
    iiif-permissions-path="omeka:permissions"
    permissions-map="add:create,edit:edit,delete:delete"
    permission-error-selector="#perm-error-msg"
    api-base-url="https://example.com/api/annotations"
    resource-id="123"
    share-iframe-url="iframe_demo.html"
    help-selector="#audio-player-help-text"
    playback-rates="[0.5, 1, 1.25, 1.5, 2]"
></annotation-player-iiif>
```

### Messages d'erreur personnalisés et Aide (Optionnel)

Vous pouvez définir des éléments HTML cachés contenant des messages d'erreur ou du texte d'aide à afficher dans des popups.

#### Erreur de permission
Utilisez `permission-error-selector` pour pointer vers un élément contenant un message d'erreur personnalisé à afficher lorsque l'utilisateur n'a pas les permissions nécessaires.

```html
<div id="perm-error-msg" style="display: none;">
    <p><strong>Accès refusé !</strong> Vous n'avez pas les droits pour cette action.</p>
</div>
```

#### Aide contextuelle
Utilisez `help-selector` pour pointer vers un élément contenant le texte d'aide. Un bouton "?" apparaîtra alors dans la barre de contrôles.

```html
<div id="audio-player-help-text" style="display: none;">
    <h3>Guide d'utilisation</h3>
    <p>Contenu HTML de l'aide...</p>
</div>
```

## Attributs et Propriétés

Voici la liste complète des attributs supportés :

### Configuration Média

*   **`media-url`** (Requis) : L'URL du fichier audio ou vidéo à lire.
*   **`media-type`** : Le type de média. Valeurs possibles : `audio` (défaut) ou `video`.
*   **`subtitle-files-url`** *(rétrocompatibilité)* : Une chaîne JSON représentant un tableau d'objets pour les pistes de sous-titres.
    *   Format : `[{"url": "chemin/vers/fichier.vtt", "language": "code_langue", "label": "Libellé"}]`
    *   Conservé pour ne pas casser les intégrations existantes. Préférez `subtitle-list-url` pour les nouveaux usages.
*   **`subtitle-list-url`** : Source des pistes de sous-titres. Accepte deux formats :
    *   Une **URL distante** (`http://` ou `https://`) vers un JSON : le composant effectue un `fetch` pour récupérer le tableau des pistes, puis les ajoute au lecteur (y compris après l'initialisation du player).
    *   Un **JSON inline** (commençant par `[` ou `{`) : parsé directement, équivalent à l'ancien `subtitle-files-url` (backward compat).
    *   Format attendu du tableau : `[{"url": "chemin/vers/fichier.vtt", "language": "code_langue", "label": "Libellé"}]`
*   **`subtitle-field-mapping`** : Permet de mapper les clés du JSON des sous-titres vers les propriétés attendues par le lecteur. Utile si votre source utilise des noms de champs différents (ex: `file`, `lang`, `name`).
    *   Format : `{"url": "clé_url", "language": "clé_langue", "label": "clé_libellé"}`
    *   Défaut : `{"url": "url", "language": "language", "label": "label"}`
*   **`playback-rates`** : Un tableau JSON des vitesses de lecture autorisées. Par défaut : `[0.5, 1, 1.25, 1.5, 2]`. Utiliser `"false"` (chaîne de caractères) pour désactiver le sélecteur de vitesse natif.

### Visualisation

*   **`wave-form-url`** : L'URL du fichier JSON contenant les données de la forme d'onde (généré par `audiowaveform` ou compatible).
*   **`waveform-stroke-color`** : La couleur du trait de la forme d'onde (ex: `rgba(0, 0, 0, 0.2)`). Défaut : `rgba(0, 0, 0, 0.2)`.
*   **`waveform-stroke-width`** : L'épaisseur du trait de la forme d'onde en pixels. Défaut : `1`.
*   **`colors`** : Un tableau JSON de 4 couleurs pour personnaliser l'interface : `[primaire, texte, arrière-plan, bordure]`.
    *   Exemple : `["#1890ff", "#333333", "#ffffff", "#eeeeee"]`

### Annotations

*   **`iiif-annotation-list-url`** : L'URL de la liste d'annotations (format IIIF Presentation API ou JSON simple).
*   **`annotation-min-time-to-display`** : Durée minimale (en secondes) pendant laquelle une annotation ponctuelle reste affichée dans la liste sous le lecteur. Défaut : `15`.
*   **`annotation-properties-to-display`** : Liste des propriétés de l'annotation à afficher, séparées par des virgules.
    *   Valeurs possibles : `time`, `text`, `author`, `creator.id`.
    *   Exemple : `time,text,author`

### Permissions et API

*   **`can-add-annotation`** : `true` ou `false`. Affiche ou masque le bouton "Ajouter une annotation". Défaut : `true`.
*   **`can-edit-all-annotation`** : `true` ou `false`. Permet d'éditer toutes les annotations sans restriction. Défaut : `true`.
*   **`can-update-annotation-for-author-name`** : Si défini, permet d'éditer uniquement les annotations dont l'auteur correspond à cette valeur.
*   **`iiif-permissions-path`** : Chemin vers l'objet de permissions dans le JSON IIIF. Défaut : `omeka:permissions`.
*   **`permissions-map`** : Correspondance entre les actions du player et les clés de permissions IIIF.
    *   Format : `add:clé,edit:clé,delete:clé`. Défaut : `add:create,edit:edit,delete:delete`.
*   **`permission-error-selector`** : Sélecteur CSS vers un élément contenant un message d'erreur personnalisé.
*   **`api-base-url`** : URL de base pour les appels API (CRUD des annotations).
*   **`resource-id`** : Identifiant de la ressource parente pour l'API.

### Intégration et Partage

*   **`share-iframe-url`** : L'URL utilisée pour générer le code d'iframe dans la modal de partage. Si absent, le bouton "Partager" n'est pas affiché.
*   **`help-selector`** : Sélecteur CSS vers un élément HTML caché contenant le texte d'aide. Si présent, un bouton "?" est affiché.
*   **`force-embedded-mode`** : `true` ou `false`. Force le mode embarqué (compact, hauteur fixe de 100vh, scroll interne). Ce mode est automatiquement activé si le composant est détecté à l'intérieur d'une iframe.

## Fonctionnalités

*   **Lecture Média** : Lecteur Video.js intégré avec contrôles persistants, support des sous-titres (VTT) et réglage de la vitesse de lecture.
*   **Timeline Interactive** :
    *   Zoom avec la molette de la souris (Ctrl + Molette) ou boutons de contrôle (+/-).
    *   Déplacement latéral (Drag & Drop) ou boutons de navigation (flèches).
    *   Sélection d'annotation au clic pour déplacer la tête de lecture.
    *   Double-clic sur la timeline (si permis) pour créer une annotation.
    *   Double-clic sur une annotation (si permis) pour l'éditer.
*   **Synchronisation** :
    *   Le curseur de la timeline suit la lecture.
    *   Cliquer sur la timeline déplace la tête de lecture.
    *   Les annotations s'affichent dynamiquement sous le lecteur avec un effet de mise en exergue (pulse) pour les annotations ponctuelles.
    *   Auto-scroll de la liste des annotations pour suivre la lecture (si la souris n'est pas sur la liste).
*   **Recherche et Filtrage** :
    *   Barre de recherche intégrée pour filtrer les annotations par texte, label ou auteur.
*   **Aide Contextuelle** :
    *   Bouton "?" (si `help-selector` est présent) ouvrant une popup avec le contenu HTML extrait dynamiquement de la page.
*   **Partage** :
    *   Bouton "Partager" (si `share-iframe-url` est présent) ouvrant une modal avec le code d'intégration HTML (iframe) prêt à être copié.
*   **Mode Embarqué (Embedded)** :
    *   Le composant s'adapte automatiquement lorsqu'il est utilisé dans une iframe ou si `force-embedded-mode="true"` : il occupe alors toute la hauteur disponible (100vh) avec un scroll interne pour la liste des annotations.
*   **Édition et API** :
    *   Formulaire modal pour créer/modifier des annotations (Point ou Plage).
    *   Synchronisation automatique avec une API distante (Create, Update, Delete).
    *   Gestion fine des droits basée sur les métadonnées IIIF (via Omeka S ou autre).
    *   Support du Drag & Drop pour déplacer les annotations.

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
        <!-- Optionnel : Message d'erreur personnalisé -->
        <div id="perm-error-msg" style="display: none;">
            <p><strong>Accès refusé !</strong> Vous n'avez pas les droits nécessaires.</p>
        </div>

        <annotation-player-iiif
            media-url="media/interview.mp3"
            media-type="audio"
            wave-form-url="data/waveform.json"
            iiif-annotation-list-url="data/annotations.json"
            subtitle-list-url="data/subtitles.json"
            annotation-properties-to-display="time,text,author"
            can-add-annotation="false"
            can-edit-all-annotation="false"
            api-base-url="https://votre-api.com/annotations"
            permission-error-selector="#perm-error-msg"
        ></annotation-player-iiif>
    </div>
    <script type="module" src="dist/player-iiif-vis.js"></script>
</body>
</html>
```
