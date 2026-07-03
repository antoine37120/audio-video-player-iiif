## Prompt 1 — Ajouter un bouton d'aide avec popup et sélecteur CSS pour le contenu

**Contexte :** Le composant `<annotation-player-iiif>` a déjà un bouton de partage (`.share-btn`) dans la barre `.controls`, qui ouvre une modale. Le module OmekaS place désormais le texte d'aide dans une balise cachée dans la page (`<div id="audio-player-help-text" style="display:none;">...contenu HTML...</div>`). Le composant reçoit un attribut `help-selector="#audio-player-help-text"` contenant le sélecteur CSS de cette balise. Il faut ajouter un bouton d'aide juste à droite du bouton de partage, et une popup qui affiche le contenu extrait de cette balise (via innerHTML). Pas de titre "Aide" dans la popup — uniquement le contenu de la balise.

**Objectif :** Ajouter un bouton aide (icône `?`) dans les contrôles, et une popup modale qui lit le contenu depuis la balise ciblée par `help-selector`.

**Tâches à réaliser :**

1. **Ajouter l'attribut help-selector** (`src/components/AnnotationPlayerIIIF.js`) :
   - Dans `observedAttributes` : ajouter `'help-selector'`
   - Dans le constructeur : ajouter `this._helpSelector = null;`
   - Dans `attributeChangedCallback` : ajouter un case :
     ```js
     case 'help-selector':
         this._helpSelector = newValue;
         break;
     ```

2. **Ajouter le bouton d'aide dans render()** (`src/components/AnnotationPlayerIIIF.js`, bloc `.controls` autour ligne 257) :
   - APRÈS le bloc du bouton share `${this._shareIframeUrl ? ...}`, ajouter :
     ```html
     ${this._helpSelector ? `
     <button class="help-btn" title="Aide">
         <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
             <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
         </svg>
     </button>
     ` : ''}
     ```

3. **Ajouter le HTML de la popup d'aide dans render()** (`src/components/AnnotationPlayerIIIF.js`, APRÈS `.modal-share` ligne ~312) :
   ```html
   <!-- Help Popup -->
   <div class="help-popup" style="display:none;">
       <div class="help-popup-content">
           <button class="close-help-btn">&times;</button>
           <div class="help-popup-body"></div>
       </div>
   </div>
   ```
   Note : pas de `<h3>Aide</h3>` — uniquement le bouton fermer et le conteneur du texte.

4. **Ajouter les méthodes showHelpPopup / hideHelpPopup** (`src/components/AnnotationPlayerIIIF.js`, avant `formatTime()` vers ligne 1320) :
   - `showHelpPopup()` : trouver la balise via `document.querySelector(this._helpSelector)`, extraire son `innerHTML`, l'insérer dans `.help-popup-body`, afficher la popup. Si la balise n'existe pas ou si le sélecteur est vide, ne rien faire.
   - `hideHelpPopup()` : cacher la popup

5. **Lier les événements dans bindEvents()** (`src/components/AnnotationPlayerIIIF.js`, après le bloc shareBtn lignes 819-822) :
   - Ajouter les handlers pour `.help-btn`, `.close-help-btn`, `.help-popup` (clic sur overlay pour fermer)

6. **Ajouter le CSS** (`src/style.css`) :
   - Style `.help-btn` (identique à `.share-btn` : 32×32, primary color)
   - Style `.help-popup` (overlay semi-transparent, popup centrée)
   - Style `.help-popup-content` (carte blanche arrondie, 450px max)
   - Style `.close-help-btn` (bouton × en haut à droite)
   - Style `.help-popup-body` (contenu du texte, padding)
   - Version embedded : `.player-container.is-embedded ~ .help-popup` en position absolute

**Fichiers de référence à consulter :**
- `src/components/AnnotationPlayerIIIF.js` (observedAttributes lignes 10-33, render() lignes 237-313, bindEvents() lignes 792-852, showShareModal() lignes 1311-1318)
- `src/style.css` (styles .share-btn lignes 80-96, styles .modal-share lignes 162-198)

**Contraintes :**
- Le bouton aide n'apparaît que si `help-selector` est présent et non vide
- Style du bouton aide identique au bouton partage
- La popup n'a PAS de titre "Aide" — juste le bouton × fermer et le contenu extrait
- Le contenu est extrait via `document.querySelector(this._helpSelector).innerHTML` — lecture seule à l'ouverture
- Si la balise ciblée n'existe pas, ne pas afficher la popup (silencieusement)
- Fermeture : clic sur ×, ou clic sur l'overlay en dehors du contenu
- Mode embedded : popup en position absolute, z-index: 2000
