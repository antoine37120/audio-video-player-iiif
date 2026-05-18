import videojs from 'video.js';
import { Timeline } from 'vis-timeline/peer';
import { DataSet } from 'vis-data/peer';
import moment from 'moment';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import 'video.js/dist/video-js.css';
import '../style.css'; // Adjust path if needed

class AnnotationPlayerIIIF extends HTMLElement {
    static get observedAttributes() {
        return [
            'iiif-annotation-list-url',
            'media-url',
            'media-type',
            'wave-form-url',
            'subtitle-files-url',
            'waveform-stroke-color',
            'waveform-stroke-width',
            'annotation-min-time-to-display',
            'annotation-properties-to-display',
            'can-add-annotation',
            'can-edit-all-annotation',
            'can-update-annotation-for-author-name',
            'colors',
            'iiif-permissions-path',
            'permissions-map',
            'permission-error-selector',
            'api-base-url',
            'resource-id',
            'share-iframe-url',
            'force-embedded-mode',
            'playback-rates',
            'help-selector'
        ];
    }

    constructor() {
        super();
        // Default values
        this._iiifAnnotationListUrl = null;
        this._mediaUrl = null;
        this._mediaType = 'audio'; // Default from usage
        this._waveFormUrl = null;
        this._subtitleFilesUrl = null;
        this._waveformStrokeColor = 'rgba(0, 0, 0, 0.2)'; // Lighter for readability
        this._waveformStrokeWidth = 1;
        this._annotationMinTimeToDisplay = 15;
        this._annotationPropertiesToDisplay = ['time', 'text', 'author'];
        this._canAddAnnotation = true;
        this._canEditAllAnnotation = true;
        this._canUpdateAnnotationForAuthorName = null;
        this._colors = ['#1890ff', '#333333', '#ffffff', '#eeeeee'];
        this._iiifPermissionsPath = 'omeka:permissions';
        this._permissionsMap = 'add:create,edit:edit,delete:delete';
        this._permissionErrorSelector = null;
        this._errorTimeout = null;
        this._apiBaseUrl = null;
        this._resourceId = null;
        this._shareIframeUrl = null;
        this._forceEmbeddedMode = false;
        this._playbackRates = [0.5, 1, 1.25, 1.5, 2];
        this._helpSelector = null;

        // Internal state
        this.isEmbedded = false;
        this._checkEmbeddedStatus();

        this.player = null;
        this.timeline = null;
        this.items = new DataSet([]);
        // this.groups = new DataSet([{ id: 0, content: 'Annotations' }]); // No groups used
        this.clickTimeout = null;
        this.startClickTime = 0;
        this.startClickPos = { x: 0, y: 0 };
    }

    connectedCallback() {
        this.render();
        this.initPlayer();
        this.initTimeline();
        this.loadData();
    }

    disconnectedCallback() {
        if (this.player) {
            this.player.dispose();
        }
        if (this.timeline) {
            this.timeline.destroy();
        }
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;

        switch (name) {
            case 'iiif-annotation-list-url':
                this._iiifAnnotationListUrl = newValue;
                this.loadIIIFAnnotations(newValue);
                break;
            case 'media-url':
                this._mediaUrl = newValue;
                if (this.player) {
                    let type = undefined;
                    if (this._mediaUrl.endsWith('.mp3')) type = 'audio/mpeg';
                    else if (this._mediaUrl.endsWith('.mp4')) type = 'video/mp4';
                    else if (this._mediaUrl.endsWith('.webm')) type = 'video/webm';
                    else if (this._mediaUrl.endsWith('.ogg')) type = 'video/ogg';
                    else if (this._mediaUrl.endsWith('.wav')) type = 'audio/wav';

                    if (!type && this._mediaType === 'video') type = 'video/mp4';
                    else if (!type && this._mediaType === 'audio') type = 'audio/mpeg';

                    this.player.src({
                        src: this._mediaUrl,
                        type: type
                    });
                }
                break;
            case 'media-type':
                this._mediaType = newValue;
                this.render();
                this.initPlayer();
                this.initTimeline(); // Reset timeline as duration might change
                this.loadData();
                break;
            case 'wave-form-url':
                this._waveFormUrl = newValue;
                this.loadWaveform(newValue);
                break;
            case 'subtitle-files-url':
                this._subtitleFilesUrl = JSON.parse(newValue || '[]');
                break;
            case 'waveform-stroke-color':
                this._waveformStrokeColor = newValue;
                this.drawWaveform();
                break;
            case 'waveform-stroke-width':
                this._waveformStrokeWidth = parseFloat(newValue);
                this.drawWaveform();
                break;
            case 'annotation-min-time-to-display':
                this._annotationMinTimeToDisplay = parseFloat(newValue);
                break;
            case 'annotation-properties-to-display':
                this._annotationPropertiesToDisplay = newValue.split(',').map(s => s.trim());
                break;
            case 'can-add-annotation':
                this._canAddAnnotation = newValue !== 'false';
                this.updateUI();
                break;
            case 'can-edit-all-annotation':
                this._canEditAllAnnotation = newValue !== 'false';
                break;
            case 'can-update-annotation-for-author-name':
                this._canUpdateAnnotationForAuthorName = newValue;
                break;
            case 'colors':
                try {
                    const parsed = JSON.parse(newValue);
                    if (Array.isArray(parsed) && parsed.length >= 1) {
                        this._colors = parsed;
                        this.updateColors();
                    }
                } catch (e) {
                    console.warn('Invalid colors attribute');
                }
                break;
            case 'iiif-permissions-path':
                this._iiifPermissionsPath = newValue;
                break;
            case 'permissions-map':
                this._permissionsMap = newValue;
                break;
            case 'permission-error-selector':
                this._permissionErrorSelector = newValue;
                break;
            case 'api-base-url':
                this._apiBaseUrl = newValue;
                break;
            case 'resource-id':
                this._resourceId = newValue;
                break;
            case 'force-embedded-mode':
                this._forceEmbeddedMode = newValue !== 'false';
                this._checkEmbeddedStatus();
                this.render(); // Re-render pour appliquer les classes CSS
                break;
            case 'share-iframe-url':
                this._shareIframeUrl = newValue;
                this.render();
                break;
            case 'playback-rates':
                try {
                    if (newValue === 'false') {
                        this._playbackRates = false;
                    } else {
                        const parsed = JSON.parse(newValue);
                        if (Array.isArray(parsed)) {
                            this._playbackRates = parsed;
                        } else {
                            console.warn('Invalid playback-rates attribute: must be an array or "false"');
                        }
                    }
                } catch (e) {
                    console.warn('Invalid playback-rates attribute: JSON parse error');
                }
                break;
            case 'help-selector':
                this._helpSelector = newValue;
                break;
        }
    }

    _checkEmbeddedStatus() {
        this.isEmbedded = (window.self !== window.top) || this._forceEmbeddedMode;
    }

    // Getters and Setters for properties to sync with attributes
    get iiifAnnotationListUrl() { return this._iiifAnnotationListUrl; }
    set iiifAnnotationListUrl(val) { this.setAttribute('iiif-annotation-list-url', val); }

    get mediaUrl() { return this._mediaUrl; }
    set mediaUrl(val) { this.setAttribute('media-url', val); }

    get shareIframeUrl() { return this._shareIframeUrl; }
    set shareIframeUrl(val) { this.setAttribute('share-iframe-url', val); }

    get forceEmbeddedMode() { return this._forceEmbeddedMode; }
    set forceEmbeddedMode(val) { this.setAttribute('force-embedded-mode', val ? 'true' : 'false'); }

    // ... (Implement other getters/setters as needed)

    updateColors() {
        const [primary, text, bg, border] = this._colors;
        if (primary) this.style.setProperty('--p-col', primary);
        if (text) this.style.setProperty('--t-col', text);
        if (bg) this.style.setProperty('--bg-col', bg);
        if (border) this.style.setProperty('--b-col', border);
    }

    render() {
        this.updateColors(); // Init colors
        const containerClass = this.isEmbedded ? 'player-container is-embedded' : 'player-container';
        const mediaTag = this._mediaType === 'video' ? 'video' : 'audio';

        this.innerHTML = `
            <div class="${containerClass}">
                <${mediaTag} class="video-js vjs-default-skin"></${mediaTag}>
                <div class="visualization"></div>
                <div class="controls">
                    <button class="add-annotation-btn" title="Ajouter une annotation">
                        +
                    </button>
                    <input type="text" class="annotation-search" placeholder="Rechercher...">
                    ${this._shareIframeUrl ? `
                    <button class="share-btn" title="Générer le code d'intégration">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z"/>
                        </svg>
                    </button>
                    ` : ''}
                    ${this._helpSelector ? `
                    <button class="help-btn" title="Aide">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/>
                        </svg>
                    </button>
                    ` : ''}
                </div>
                <div class="annotation-display"></div>

                <!-- Popup d'erreur de permission -->
                <div class="permission-error-popup" style="display: none;">
                    <div class="error-content"></div>
                    <button class="close-error-btn">&times;</button>
                </div>
            </div>

            <!-- Modal -->
            <div class="modal-overlay">
                <div class="annotation-form">
                    <h3>Edit Annotation</h3>
                    <div class="form-group">
                        <label>Type:</label>
                        <select class="annotation-type">
                            <option value="point">Point</option>
                            <option value="range">Range</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Start Time (s):</label>
                        <input type="number" class="start-time" step="0.1">
                    </div>
                    <div class="form-group">
                        <label>Title:</label>
                        <input type="text" class="annotation-title">
                    </div>
                    <div class="form-group end-time-group" style="display:none;">
                        <label>End Time (s):</label>
                        <input type="number" class="end-time" step="0.1">
                    </div>
                    <div class="form-group">
                        <label>Text:</label>
                        <textarea class="annotation-text" rows="3"></textarea>
                    </div>
                    <div class="form-actions">
                        <button class="cancel-annotation">Cancel</button>
                        <button class="save-annotation">Save</button>
                    </div>
                </div>
            </div>

            <!-- Modal Share -->
            <div class="modal-share" style="display:none;">
                <div class="annotation-form">
                    <h3>Code d'intégration</h3>
                    <textarea class="share-code" readonly style="width:100%; min-height:80px; margin-bottom:10px; font-family:monospace; font-size:12px;"></textarea>
                    <div class="form-actions">
                        <button class="close-share">Fermer</button>
                        <button class="copy-share" style="background:var(--p-col); color:white;">Copier</button>
                    </div>
                </div>
            </div>

            <!-- Help Popup -->
            <div class="help-popup" style="display:none;">
                <div class="help-popup-content">
                    <button class="close-help-btn">&times;</button>
                    <div class="help-popup-body"></div>
                </div>
            </div>
        `;

        this.updateUI();
        this.bindEvents();

        // Ajout du listener pour fermer la popup
        const closeBtn = this.querySelector('.close-error-btn');
        if (closeBtn) {
            closeBtn.onclick = () => this.showPermissionError(false);
        }
    }

    showPermissionError(show, customMessage = null) {
        const popup = this.querySelector('.permission-error-popup');
        const content = this.querySelector('.error-content');

        if (!popup || !content) return;

        if (show) {
            let message = customMessage;

            // Si pas de message spécifique passé, on cherche via le sélecteur
            if (!message && this._permissionErrorSelector) {
                const sourceElement = document.querySelector(this._permissionErrorSelector);
                if (sourceElement) {
                    message = sourceElement.innerHTML;
                }
            }

            // Fallback si rien n'est trouvé
            message = message || "Vous n'avez pas l'autorisation d'effectuer cette action.";

            content.innerHTML = message;
            popup.style.display = 'flex';

            // Auto-fermeture après 5 secondes
            if (this._errorTimeout) clearTimeout(this._errorTimeout);
            this._errorTimeout = setTimeout(() => this.showPermissionError(false), 5000);
        } else {
            popup.style.display = 'none';
        }
    }

    async _apiCall(action, id = null, data = null) {
        if (!this._apiBaseUrl) {
            console.error('API Base URL is not defined');
            return null;
        }

        let url = this._apiBaseUrl;
        let method = 'POST';

        switch (action) {
            case 'list':
                url += '';
                method = 'GET';
                break;
            case 'get':
                url += `/get/${id}`;
                method = 'GET';
                break;
            case 'create':
                url += '/create';
                method = 'POST';
                break;
            case 'update':
                url += `/update/${id}`;
                method = 'POST'; // Specification says PUT/POST
                break;
            case 'delete':
                url += `/delete/${id}`;
                method = 'POST'; // Specification says DELETE/POST
                break;
            case 'iiif':
                url += `/iiif/${id}`;
                method = 'GET';
                break;
            default:
                console.error(`Unknown API action: ${action}`);
                return null;
        }

        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('API Call failed:', error);
            this.showPermissionError(true, `Erreur lors de la communication avec l'API : ${error.message}`);
            return null;
        }
    }

    updateUI() {
        const addBtn = this.querySelector('.add-annotation-btn');
        if (addBtn) {
            addBtn.style.display = this._canAddAnnotation ? 'inline-block' : 'none';
        }
    }

    initPlayer() {
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }

        const videoElement = this.querySelector('.video-js');
        let playerHeight = 30;
        if (!videoElement) return;

        if (this._mediaType === 'video') {
            playerHeight = 300;
        }

        this.player = videojs(videoElement, {
            controls: true,
            autoplay: false,
            preload: 'auto',
            fluid: false,
            width: '100%',
            height: playerHeight,
            loadingSpinner: false,
            bigPlayButton: this._mediaType === 'video',
            inactivityTimeout: 0, // Keep controls visible
            playbackRates: this._playbackRates,
        });

        // Set src after initialization
        if (this._mediaUrl) {
            let type = undefined;
            if (this._mediaUrl.endsWith('.mp3')) type = 'audio/mpeg';
            else if (this._mediaUrl.endsWith('.mp4')) type = 'video/mp4';
            else if (this._mediaUrl.endsWith('.webm')) type = 'video/webm';
            else if (this._mediaUrl.endsWith('.ogg')) type = 'video/ogg';
            else if (this._mediaUrl.endsWith('.wav')) type = 'audio/wav';

            // Fallback for URLs without extension if mediaType is known
            if (!type && this._mediaType === 'video') type = 'video/mp4'; // Probable default
            else if (!type && this._mediaType === 'audio') type = 'audio/mpeg';

            this.player.src({
                src: this._mediaUrl,
                type: type
            });
        }

        // Add subtitles if available
        if (this._subtitleFilesUrl && Array.isArray(this._subtitleFilesUrl)) {
            this._subtitleFilesUrl.forEach(track => {
                this.player.addRemoteTextTrack({
                    kind: 'subtitles',
                    label: track.label || track.language,
                    srclang: track.language,
                    src: track.url
                }, false);
            });
            if (this._mediaType !== 'video') playerHeight = 90;
        }

        this.player.on('ready', () => {
            //this.player.userActive(false);
        })

        this.player.on('loadedmetadata', () => {
            const duration = this.player.duration() * 1000;
            if (this.timeline) {
                console.log('Setting timeline options with duration:', duration);
                this.timeline.setOptions({
                    min: new Date(0),
                    max: new Date(duration),
                    end: new Date(duration),
                    zoomMax: duration
                });
                this.timeline.setWindow(new Date(0), new Date(duration));
            }
        });

        this.player.on('timeupdate', () => {
            const currentTime = this.player.currentTime() * 1000;
            if (this.timeline) {
                this.timeline.setCustomTime(currentTime, 'videoProgress');
            }
            this.updateAnnotationDisplay(currentTime);
        });
    }

    initTimeline() {
        if (this.timeline) {
            this.timeline.destroy();
            this.timeline = null;
        }

        const container = this.querySelector('.visualization');
        const options = {
            width: '100%',
            height: '140px',
            stack: true,
            showCurrentTime: true,
            start: 0,
            zoomMin: 20000,
            selectable: true,
            editable: {
                add: this._canAddAnnotation,
                updateTime: true, // We might want to restrict this too based on permissions
                updateGroup: false,
                remove: true // And this
            },
            template: (item, element, data) => {
                if (item.type === 'point') {
                    element.classList.add('point-annotation');
                }
                return item.content;
            },
            multiselect: false,
            moment: function(date) {
                return moment(date).utc();
            },
            format: {
                minorLabels: {
                    millisecond: 'SSS',
                    second: 's',
                    minute: 'HH:mm',
                    hour: 'HH:mm',
                    weekday: 'ddd D',
                    day: 'D',
                    week: 'w',
                    month: 'MMM',
                    year: 'YYYY'
                },
                majorLabels: {
                    millisecond: 'HH:mm:ss',
                    second: 'HH:mm',
                    minute: '',
                    hour: '',
                    weekday: '',
                    day: '',
                    week: '',
                    month: '',
                    year: ''
                }
            },
            onAdd: async (item, callback) => {
                item.isNew = true;
                this.showAnnotationForm(item, (newItem) => {
                    if (newItem) {
                        this.items.add(newItem);
                        callback(newItem);
                    } else {
                        callback(null);
                    }
                });
            },
            onMove: async (item, callback) => {
                if (this.canEditItem(item, 'edit')) {
                    if (this._apiBaseUrl) {
                        const data = {
                            time: (item.start instanceof Date ? item.start.getTime() : item.start) / 1000,
                            title: item.content
                        };
                        const result = await this._apiCall('update', item.id, data);
                        if (result) {
                            const processed = this._processIIIFItem(result);
                            this.items.update(processed); // Force update in DataSet
                            callback(processed);
                        } else {
                            callback(null);
                        }
                    } else {
                        callback(item);
                    }
                } else {
                    this.showPermissionError(true);
                    callback(null); // Cancel move
                }
            },
            onRemove: async (item, callback) => {
                if (this.canEditItem(item, 'delete')) {
                    if (this._apiBaseUrl) {
                        const result = await this._apiCall('delete', item.id);
                        if (result && result.status === 'deleted') {
                            callback(item);
                        } else {
                            callback(null);
                        }
                    } else {
                        callback(item);
                    }
                } else {
                    this.showPermissionError(true);
                    callback(null);
                }
            },
            onUpdate: async (item, callback) => {
                if (this.canEditItem(item, 'edit')) {
                    this.showAnnotationForm(item, (updatedItem) => {
                        if (updatedItem) {
                            this.items.update(updatedItem);
                            callback(updatedItem);
                        } else {
                            callback(null);
                        }
                    });
                } else {
                    this.showPermissionError(true);
                    callback(null);
                }
            }
        };

        // Do not pass groups to remove left column
        this.timeline = new Timeline(container, this.items, options);
        this.timeline.addCustomTime(0, 'videoProgress');

        // Listen for item changes to update the list
        this.items.on('*', () => {
             if (this.player) {
                 this.updateAnnotationDisplay(this.player.currentTime() * 1000);
             }
        });

        // Bind Timeline Events
        this.timeline.on('mouseDown', (props) => this.handleMouseDown(props));
        this.timeline.on('click', (props) => this.handleClick(props));
        this.timeline.on('rangechanged', () => this.drawWaveform());
        this.timeline.on('changed', () => this.drawWaveform());
        this.timeline.on('doubleClick', (props) => {
            if (props.item) {
                const item = this.items.get(props.item);
                if (this.canEditItem(item, 'edit')) {
                    this.showAnnotationForm(item, (updatedItem) => {
                        if (updatedItem) this.items.update(updatedItem);
                    });
                } else {
                    this.showPermissionError(true);
                }
            }
        });

        this.addNavigationControls(container);
    }

    addNavigationControls(container) {
        const controls = document.createElement('div');
        controls.className = 'timeline-navigation';
        Object.assign(controls.style, {
            position: 'absolute',
            top: '5px',
            right: '5px',
            zIndex: '1000',
            display: 'flex',
            gap: '5px'
        });

        const btnStyle = {
            width: '20px',
            height: '20px',
            background: 'white',
            border: '1px solid #333',
            color: '#333',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0',
            fontSize: '14px',
            borderRadius: '2px',
            outline: 'none'
        };

        const createBtn = (icon, action, title) => {
            const btn = document.createElement('button');
            btn.innerHTML = icon;
            btn.title = title;
            Object.assign(btn.style, btnStyle);

            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                action();
            };
            return btn;
        };

        const move = (percentage) => {
            if (!this.timeline) return;
            const range = this.timeline.getWindow();
            const interval = range.end - range.start;
            const moveStep = interval * percentage;
            this.timeline.setWindow({
                start: range.start.valueOf() + moveStep,
                end: range.end.valueOf() + moveStep,
            });
        };

        controls.appendChild(createBtn('\u25C0', () => move(-0.5), 'Move Left'));
        controls.appendChild(createBtn('\u25B6', () => move(0.5), 'Move Right'));
        controls.appendChild(createBtn('+', () => this.timeline.zoomIn(0.5), 'Zoom In'));
        controls.appendChild(createBtn('-', () => this.timeline.zoomOut(0.5), 'Zoom Out'));

        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        container.appendChild(controls);
    }

    canEditItem(item, action = 'edit') {
        // 1. Priorité aux réglages globaux "admin"
        if (this._canEditAllAnnotation) return true;

        // 2. Vérification par nom d'auteur (legacy)
        if (this._canUpdateAnnotationForAuthorName && item && item.author === this._canUpdateAnnotationForAuthorName) return true;

        // 3. Vérification de la map des permissions IIIF
        const mapStr = this._permissionsMap || 'add:create,edit:edit,delete:delete';
        const map = Object.fromEntries(mapStr.split(',').map(s => s.split(':')));
        const permissionKey = map[action];

        // 4. Vérification des droits de l'item extraits du IIIF
        if (item && item.permissions && permissionKey) {
            return item.permissions[permissionKey] === true;
        }

        // 5. Fallback sur les anciens attributs (ex: can-add-annotation)
        if (action === 'add') return this._canAddAnnotation;

        return false;
    }


    handleMouseDown(properties) {
        this.startClickTime = new Date().getTime();
        if (properties.event) {
            this.startClickPos = { x: properties.event.clientX, y: properties.event.clientY };
        }
    }

    handleClick(properties) {
        if (properties.item) return;

        const endClickTime = new Date().getTime();
        const clickDuration = endClickTime - this.startClickTime;
        const event = properties.event;
        const dist = Math.sqrt(
            Math.pow(event.clientX - this.startClickPos.x, 2) +
            Math.pow(event.clientY - this.startClickPos.y, 2)
        );

        if (dist > 5 || clickDuration > 500) return;

        const seekTime = properties.time ? properties.time.getTime() / 1000 : null;

        if (this.clickTimeout) clearTimeout(this.clickTimeout);

        this.clickTimeout = setTimeout(() => {
            this.clickTimeout = null;
            if (seekTime !== null && this.player) {
                this.player.currentTime(seekTime);
                if (!this.player.paused()) {
                    this.player.play();
                }
            }
        }, 250);
    }

    bindEvents() {
        const addBtn = this.querySelector('.add-annotation-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (!this.player) return;

                if (!this.canEditItem(null, 'add')) {
                    this.showPermissionError(true);
                    return;
                }

                const currentTime = this.player.currentTime() * 1000;
                const newItem = {
                    id: new Date().getTime(),
                    start: new Date(currentTime),
                    end: null,
                    content: '',
                    group: 0,
                    type: 'point',
                    isNew: true
                };
                this.showAnnotationForm(newItem, (item) => {
                    if (item) this.items.add(item);
                });
            });
        }

        const shareBtn = this.querySelector('.share-btn');
        if (shareBtn) {
            shareBtn.addEventListener('click', () => this.showShareModal());
        }

        const helpBtn = this.querySelector('.help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.showHelpPopup());
        }

        const closeHelpBtn = this.querySelector('.close-help-btn');
        if (closeHelpBtn) {
            closeHelpBtn.onclick = () => this.hideHelpPopup();
        }

        const helpPopup = this.querySelector('.help-popup');
        if (helpPopup) {
            helpPopup.onclick = (e) => {
                if (e.target === helpPopup) {
                    this.hideHelpPopup();
                }
            };
        }

        const closeShareBtn = this.querySelector('.close-share');
        if (closeShareBtn) {
            closeShareBtn.onclick = () => {
                this.querySelector('.modal-share').style.display = 'none';
            };
        }

        const copyShareBtn = this.querySelector('.copy-share');
        if (copyShareBtn) {
            copyShareBtn.onclick = () => {
                const textarea = this.querySelector('.share-code');
                textarea.select();
                document.execCommand('copy');
                copyShareBtn.innerText = 'Copié !';
                setTimeout(() => {
                    copyShareBtn.innerText = 'Copier';
                }, 2000);
            };
        }

        const searchInput = this.querySelector('.annotation-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (this.player) {
                    this.updateAnnotationDisplay(this.player.currentTime() * 1000);
                }
            });
        }
    }

    loadData() {
        if (this._iiifAnnotationListUrl) {
            this.loadIIIFAnnotations(this._iiifAnnotationListUrl);
        }
        if (this._waveFormUrl) {
            this.loadWaveform(this._waveFormUrl);
        }
    }

    _processIIIFItem(item, index = 0) {
        const target = item.target || item.on;
        // Handle different target structures (string or object)
        const targetStr = typeof target === 'string' ? target : (target && target.id ? target.id : '');
        const timeMatch = targetStr.match(/t=([\d\.]+)(,([\d\.]+))?/);

        let start = 0;
        let end = null;
        let type = 'point';

        if (timeMatch) {
            start = parseFloat(timeMatch[1]) * 1000;
            // Check if there is an end time and if it is greater than start (and > 0)
            if (timeMatch[3]) {
                const parsedEnd = parseFloat(timeMatch[3]) * 1000;
                if (parsedEnd > start && parsedEnd > 0) {
                    end = parsedEnd;
                    type = 'range';
                }
            }
        }

        // Extract Creator
        let creatorName = '';
        if (item.creator) {
            if (item.creator.label && item.creator.label.none) {
                creatorName = Array.isArray(item.creator.label.none) ? item.creator.label.none.join(', ') : item.creator.label.none;
            } else if (item.creator.name) {
                creatorName = item.creator.name;
            } else if (item.creator.id) {
                creatorName = item.creator.id;
            }
        }

        // Extract permissions
        const permissionsPath = this._iiifPermissionsPath || 'omeka:permissions';
        const itemPermissions = item[permissionsPath] || {};

        return {
            id: item['@id'] || item.id || index + 1,
            // group: 0, // No group
            content: (item.body && item.body.label) ? item.body.label : (item.body && item.body.value ? item.body.value : ''),
            value: (item.body && item.body.value) ? item.body.value : '',
            label: (item.body && item.body.label) ? item.body.label : '',
            start: start,
            end: end,
            type: type,
            author: creatorName,
            created: item.created || '',
            permissions: itemPermissions, // Stockage des droits spécifiques à l'item
            isNew: false
        };
    }

    async loadIIIFAnnotations(url) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            let parsedItems = [];

            if (data['@type'] === 'sc:AnnotationList' && data.resources) {
                parsedItems = data.resources.map((item, index) => this._processIIIFItem(item, index));
            } else if (data.items || (data.type === 'AnnotationPage' && data.items)) {
                const itemsToProcess = data.items || (data.type === 'AnnotationPage' ? data.items : []);
                parsedItems = itemsToProcess.map((item, index) => this._processIIIFItem(item, index));
            }

            this.items.clear();
            this.items.add(parsedItems);
            if (this.timeline) this.timeline.fit();
            this.updateAnnotationDisplay(0); // Initial render

        } catch (error) {
            console.error('Error loading IIIF annotations:', error);
        }
    }

    async loadWaveform(url) {
        try {
            const response = await fetch(url);
            this.waveformData = await response.json();
            this.drawWaveform();
        } catch (error) {
            console.error('Error loading waveform:', error);
        }
    }

    drawWaveform() {
        if (!this.waveformData || !this.timeline) return;

        const visPanel = this.querySelector('.vis-panel.vis-center');
        if (!visPanel) return;

        let canvas = visPanel.querySelector('.waveform-canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.className = 'waveform-canvas';
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.zIndex = '-1';
            canvas.style.pointerEvents = 'none';
            visPanel.insertBefore(canvas, visPanel.firstChild);
        }

        const ctx = canvas.getContext('2d', { alpha: true });
        const windowRange = this.timeline.getWindow();
        const start = windowRange.start.getTime();
        const end = windowRange.end.getTime();
        const width = Math.floor(visPanel.offsetWidth);
        const height = Math.floor(visPanel.offsetHeight);

        if (width <= 0 || height <= 0) return;

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            // On some browsers, setting width/height clears the context and its properties
        }

        ctx.clearRect(0, 0, width, height);

        ctx.beginPath();
        ctx.strokeStyle = this._waveformStrokeColor || 'rgba(0, 0, 0, 0.2)';
        ctx.lineWidth = this._waveformStrokeWidth || 1;

        const secondsPerPoint = this.waveformData.samples_per_pixel / this.waveformData.sample_rate;
        const startIndex = Math.floor((start / 1000) / secondsPerPoint);
        const endIndex = Math.ceil((end / 1000) / secondsPerPoint);
        const first = Math.max(0, startIndex);
        const last = Math.min(this.waveformData.data.length - 1, endIndex);
        const centerY = height / 2;
        const bits = this.waveformData.bits || 16;
        const maxAmplitude = Math.pow(2, bits - 1);
        const scaleY = (height / 2) / maxAmplitude * 0.8;

        for (let i = first; i <= last; i++) {
            const value = this.waveformData.data[i];
            const timeMs = i * secondsPerPoint * 1000;
            const x = (timeMs - start) / (end - start) * width;
            const y = centerY - (value * scaleY);

            if (i === first) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    updateAnnotationDisplay(currentTime) {
        const display = this.querySelector('.annotation-display');
        const searchInput = this.querySelector('.annotation-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

        if (!display) return;

        // Get all items to display list, not just active ones
        // But we filter by search term
        const allAnnotations = this.items.get({
            filter: (item) => {
                if (!searchTerm) return true;
                const text = (item.content + ' ' + item.value + ' ' + item.label).toLowerCase();
                return text.includes(searchTerm);
            }
        });

        // Sort by start time
        allAnnotations.sort((a, b) => a.start - b.start);

        // Check if we need to re-render (e.g. items changed count or search changed or order changed or content changed)
        const currentContentHash = allAnnotations.map(a => `${a.id}:${a.content}:${a.value}:${a.start}:${a.end}`).join('|');
        const contentChanged = display.dataset.lastContentHash !== currentContentHash;

        if (display.children.length !== allAnnotations.length || display.dataset.lastSearch !== searchTerm || contentChanged) {
            this.renderAnnotationList(display, allAnnotations);
            display.dataset.lastSearch = searchTerm;
            display.dataset.lastContentHash = currentContentHash;
        }

        this.updateActiveAnnotations(display, allAnnotations, currentTime);
    }

    renderAnnotationList(container, annotations) {
        container.innerHTML = '';
        annotations.forEach(item => {
            const div = document.createElement('div');
            div.className = 'annotation-card';
            div.dataset.id = item.id;

            // Click to seek
            div.onclick = () => {
                if (this.player) {
                    this.player.currentTime(item.start / 1000);
                    this.player.play();
                }
            };

            const startTimeStr = this.formatTime(item.start / 1000);
            let timeStr = startTimeStr;
            if (item.type === 'range' && item.end) {
                timeStr += ` - ${this.formatTime(item.end / 1000)}`;
            }

            let html = `
                <div class="annotation-header">
                    <span class="annotation-label">${this.escapeHtml(item.label || item.content)}</span>
                    <span class="annotation-time">${timeStr}</span>
                    <button class="edit-annotation-btn" title="Edit">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                </div>
                <div class="annotation-body">
                    ${this.escapeHtml(item.value)}
                </div>
                <div class="annotation-footer">
                    <span class="annotation-creator">${this.escapeHtml(item.author)}</span>
                    <span class="annotation-date">${this.escapeHtml(item.created)}</span>
                </div>
                <div class="annotation-progress-bar"></div>
            `;

            div.innerHTML = html;

            // Bind edit button
            const editBtn = div.querySelector('.edit-annotation-btn');
            if (editBtn) {
                editBtn.onclick = (e) => {
                    e.stopPropagation(); // Prevent seeking
                    if (this.canEditItem(item, 'edit')) {
                        this.showAnnotationForm(item, (updatedItem) => {
                            if (updatedItem) this.items.update(updatedItem);
                        });
                    } else {
                        this.showPermissionError(true);
                    }
                };
                // Hide if not editable
                if (!this.canEditItem(item, 'edit')) {
                    editBtn.style.display = 'none';
                }
            }

            container.appendChild(div);
        });
    }

    updateActiveAnnotations(container, annotations, currentTime) {
        let activeFound = false;
        let isHovering = container.matches(':hover');

        Array.from(container.children).forEach((div, index) => {
            const item = annotations[index];
            if (!item) return;

            // Check if active
            const start = item.start;
            let end = item.end;
            if (!end) end = start + 1000; // Point annotation fallback

            // "Pour les annotions ponctuel trouver un petit effet qui les met en exergue ponctuellement."
            // Let's use 2s for point.
            if (item.type === 'point') end = start + 2000;

            const isActive = currentTime >= start && currentTime <= end;
            const isPast = currentTime > end;

            // Apply past class
            if (isPast) {
                div.classList.add('past');
            } else {
                div.classList.remove('past');
            }

            if (isActive) {
                div.classList.add('active');
                if (item.type === 'point') {
                     div.classList.add('pulse-effect');
                } else {
                     div.classList.remove('pulse-effect');
                }

                // Update Progress Bar
                if (item.type === 'range') {
                    const duration = end - start;
                    const progress = Math.min(100, Math.max(0, ((currentTime - start) / duration) * 100));
                    const progressBar = div.querySelector('.annotation-progress-bar');
                    if (progressBar) {
                        progressBar.style.width = `${progress}%`;
                    }
                }

                // Scroll to view if not hovering and first active found
                if (!activeFound && !isHovering) {
                    const container = this.querySelector('.annotation-display');
                    if (container) {
                        const containerRect = container.getBoundingClientRect();
                        const itemRect = div.getBoundingClientRect();

                        // Only scroll if the item is not fully visible in the container
                        // We add a small buffer (1px) to avoid rounding issues
                        const isFullyVisible = (itemRect.top >= (containerRect.top - 1) && itemRect.bottom <= (containerRect.bottom + 1));

                        if (!isFullyVisible) {
                            const scrollTop = div.offsetTop - container.offsetTop - (container.clientHeight / 2) + (div.clientHeight / 2);
                            container.scrollTo({
                                top: scrollTop,
                                behavior: 'smooth'
                            });
                        }
                    }
                    activeFound = true;
                }

            } else {
                div.classList.remove('active', 'pulse-effect');
                const progressBar = div.querySelector('.annotation-progress-bar');
                if (progressBar) progressBar.style.width = '0%';
            }
        });
    }

    showAnnotationForm(item, callback) {
        const modal = this.querySelector('.modal-overlay');
        const typeSelect = this.querySelector('.annotation-type');
        const startTimeInput = this.querySelector('.start-time');
        const titleInput = this.querySelector('.annotation-title');
        const endTimeInput = this.querySelector('.end-time');
        const endTimeGroup = this.querySelector('.end-time-group');
        const textInput = this.querySelector('.annotation-text');
        const saveBtn = this.querySelector('.save-annotation');
        const cancelBtn = this.querySelector('.cancel-annotation');

        const getTimestamp = (val) => (val instanceof Date) ? val.getTime() : val;
        const start = getTimestamp(item.start) / 1000;
        startTimeInput.value = start;

        if (item.end) {
            typeSelect.value = 'range';
            endTimeInput.value = getTimestamp(item.end) / 1000;
            endTimeGroup.style.display = 'block';
        } else {
            typeSelect.value = 'point';
            endTimeInput.value = '';
            endTimeGroup.style.display = 'none';
        }

        titleInput.value = item.label || '';
        textInput.value = item.value || item.content || '';
        modal.style.display = 'flex';

        typeSelect.onchange = () => {
            if (typeSelect.value === 'range') {
                endTimeGroup.style.display = 'block';
                if (!endTimeInput.value) {
                    endTimeInput.value = parseFloat(startTimeInput.value) + 5;
                }
            } else {
                endTimeGroup.style.display = 'none';
            }
        };

        // Remove old listeners to prevent duplicates if any
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);

        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

                newSaveBtn.onclick = async () => {
                    const type = typeSelect.value;
                    const newStart = parseFloat(startTimeInput.value) * 1000;
                    const title = titleInput.value;
                    const text = textInput.value;

                    // Prepare data for API
                    const apiData = {
                        resource_id: this._resourceId,
                        time: newStart / 1000,
                        title: title,
                        text: text
                    };

                    if (type === 'range') {
                        const newEnd = parseFloat(endTimeInput.value) * 1000;
                        if (isNaN(newEnd) || newEnd <= newStart) {
                            alert('Invalid End Time');
                            return;
                        }
                        apiData.end_time = newEnd / 1000;
                    }

                    if (this._apiBaseUrl) {
                        // Determine if it's an update or create
                        // We check if item.id is a "real" ID (from API) or a temporary one
                        // Usually temporary IDs are large numbers from Date().getTime()
                        // Let's assume if it was loaded from IIIF it has a string ID or small numeric ID
                        // For this implementation, let's use a simple heuristic: if it's a new item (from onAdd)
                        // it might not have the properties from _processIIIFItem yet.

                        // Better: check if the item already exists in the DataSet
                        const existingItem = this.items.get(item.id);
                        // On considère comme nouveau si item.isNew est true OU si l'item n'existe pas encore dans le DataSet
                        const isNew = item.isNew || !existingItem;

                        if (isNew) {
                            const result = await this._apiCall('create', null, apiData);
                            if (result) {
                                const processed = this._processIIIFItem(result);
                                // If there was a temporary item in the DataSet, remove it
                                if (existingItem) {
                                    this.items.remove(item.id);
                                }
                                modal.style.display = 'none';
                                callback(processed);
                            }
                        } else {
                            const result = await this._apiCall('update', item.id, apiData);
                            if (result) {
                                const processed = this._processIIIFItem(result);
                                modal.style.display = 'none';
                                callback(processed);
                            }
                        }
                        // If result is null, _apiCall already showed an error, we stay in the modal
                    } else {
                        // No API, local update only
                        item.label = title;
                        item.value = text;
                        item.content = title || text;
                        item.start = newStart;
                        item.type = type;
                        if (type === 'range') {
                            item.end = parseFloat(endTimeInput.value) * 1000;
                        } else {
                            item.end = null;
                        }
                        modal.style.display = 'none';
                        callback(item);
                    }
                };

        newCancelBtn.onclick = () => {
            callback(null);
            modal.style.display = 'none';
        };
    }

    showShareModal() {
        const textarea = this.querySelector('.share-code');
        const url = this._shareIframeUrl || window.location.href;
        // On utilise les dimensions historiques par défaut
        const code = `<iframe width='362' height='215' frameborder='0' scrolling='no' src='${url}'></iframe>`;
        textarea.value = code;
        this.querySelector('.modal-share').style.display = 'flex';
    }

    showHelpPopup() {
        if (!this._helpSelector) return;
        const sourceElement = document.querySelector(this._helpSelector);
        if (sourceElement) {
            const body = this.querySelector('.help-popup-body');
            if (body) {
                body.innerHTML = sourceElement.innerHTML;
                this.querySelector('.help-popup').style.display = 'flex';
            }
        }
    }

    hideHelpPopup() {
        const popup = this.querySelector('.help-popup');
        if (popup) {
            popup.style.display = 'none';
        }
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

customElements.define('annotation-player-iiif', AnnotationPlayerIIIF);
export default AnnotationPlayerIIIF;
