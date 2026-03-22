Voici les spécifications détaillées pour la mise en place de ce système de prise en charge d'iframe.

### 1. Nouveaux attributs et Propriétés internes

*   **`share-iframe-url`** : L'URL de base à utiliser pour le code d'intégration généré.
*   **`force-embedded-mode`** : (Booléen, défaut: `false`). Permet de forcer l'affichage "compact avec scroll" même si le composant n'est pas techniquement dans une iframe.
*   **`this.isEmbedded`** : Propriété interne calculée : `true` si (`window.self !== window.top`) OU si `force-embedded-mode="true"`.

### 2. Comportement du Layout (CSS)

Le conteneur principal (`.player-container`) doit changer de comportement selon le mode :

*   **Mode Standard (Hébergé/Direct) :**
    *   La hauteur s'adapte au contenu ou au conteneur parent.
    *   Pas de scroll global sur le composant.
*   **Mode Embedded (Iframe) :**
    *   `height: 100vh;` ou `100%;` pour occuper tout l'espace de l'iframe.
    *   `overflow-y: auto;` sur le conteneur principal pour permettre de scroller l'ensemble {Lecteur + Timeline + Liste}.
    *   Le bouton "Partager" est masqué pour éviter les partages en cascade.

### 3. Modifications du Code source

Voici les modifications à appliquer dans `AnnotationPlayerIIIF.js` :

```javascript
// ... existing code ...
        static get observedAttributes() {
            return [
                'iiif-annotation-list-url',
                'media-url',
                'share-iframe-url',
                'force-embedded-mode',
                'media-type',
// ... existing code ...
        constructor() {
            super();
            // ... existing code ...
            this._resourceId = null;
            this._shareIframeUrl = null;
            this._forceEmbeddedMode = false;

            // Détection initiale
            this._checkEmbeddedStatus();
// ... existing code ...
        attributeChangedCallback(name, oldValue, newValue) {
            if (oldValue === newValue) return;

            switch (name) {
                case 'force-embedded-mode':
                    this._forceEmbeddedMode = newValue !== 'false';
                    this._checkEmbeddedStatus();
                    this.render(); // Re-render pour appliquer les classes CSS
                    break;
                case 'share-iframe-url':
// ... existing code ...
        }

        _checkEmbeddedStatus() {
            this.isEmbedded = (window.self !== window.top) || this._forceEmbeddedMode;
        }

        render() {
            this.updateColors();
            // On ajoute une classe conditionnelle au conteneur
            const containerClass = this.isEmbedded ? 'player-container is-embedded' : 'player-container';
            
            this.innerHTML = `
                <div class="${containerClass}">
                    <audio class="video-js vjs-default-skin"></audio>
                    <div class="visualization"></div>
                    <div class="controls">
                        <button class="add-annotation-btn" title="Ajouter une annotation">+</button>
                        <input type="text" class="annotation-search" placeholder="Rechercher...">
                        ${!this.isEmbedded ? `
                        <button class="share-btn" title="Générer le code d'intégration">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
                            </svg>
                        </button>` : ''}
                    </div>
                    <div class="annotation-display"></div>
                    
                    <!-- Modal Share -->
                    <div class="modal-share" style="display:none;">
                        <div class="annotation-form">
                            <h3>Code d'intégration</h3>
                            <textarea class="share-code" readonly></textarea>
                            <div class="form-actions">
                                <button class="close-share">Fermer</button>
                                <button class="copy-share">Copier</button>
                            </div>
                        </div>
                    </div>
                    <!-- ... rest of existing modals ... -->
                </div>
            `;
// ... existing code ...
```


### 4. Styles CSS requis (à ajouter dans `style.css`)

Pour que le défilement global fonctionne correctement dans l'iframe :

```css
/* Mode normal */
.player-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    background: var(--bg-col);
}

/* Mode Iframe / Embedded */
.player-container.is-embedded {
    height: 100vh; /* Prend toute la hauteur disponible dans l'iframe */
    overflow-y: auto; /* Active le scroll global interne */
    overflow-x: hidden;
}

/* On s'assure que les éléments ne sont pas écrasés */
.visualization {
    flex-shrink: 0;
    min-height: 140px;
}

.video-js {
    flex-shrink: 0;
}

.annotation-display {
    flex-grow: 1;
}
```


### 5. Génération du code d'intégration

Le code généré dans la modal de partage doit refléter les dimensions que vous avez citées pour assurer la continuité :

```javascript
showShareModal() {
    const textarea = this.querySelector('.share-code');
    const url = this._shareIframeUrl || window.location.href;
    // On utilise les dimensions historiques par défaut
    const code = `<iframe width='362' height='215' frameborder='0' scrolling='no' src='${url}'></iframe>`;
    textarea.value = code;
    this.querySelector('.modal-share').style.display = 'flex';
}
```


### Pourquoi c'est la meilleure solution ?
1.  **Régression visuelle nulle** : Les utilisateurs qui ont déjà des iframes en 362x215 verront le nouveau lecteur apparaître. S'il est trop grand, ils pourront scroller à l'intérieur de l'iframe.
2.  **Expérience utilisateur préservée** : En scrollant l'ensemble du bloc, on garde la cohérence visuelle Lecteur -> Timeline -> Texte.
3.  **Simplicité** : Un seul composant gère tous les cas d'usage par simple détection de contexte.