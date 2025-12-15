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
            'colors'
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
        this._waveformStrokeColor = 'rgba(0, 0, 0, 0.48)';
        this._waveformStrokeWidth = 1;
        this._annotationMinTimeToDisplay = 15;
        this._annotationPropertiesToDisplay = ['time', 'text', 'author'];
        this._canAddAnnotation = true;
        this._canEditAllAnnotation = true;
        this._canUpdateAnnotationForAuthorName = null;
        this._colors = ['#1890ff', '#333333', '#ffffff', '#eeeeee'];

        // Internal state
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
                // Re-init player if needed or src change
                break;
            case 'media-type':
                this._mediaType = newValue;
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
        }
    }

    // Getters and Setters for properties to sync with attributes
    get iiifAnnotationListUrl() { return this._iiifAnnotationListUrl; }
    set iiifAnnotationListUrl(val) { this.setAttribute('iiif-annotation-list-url', val); }

    get mediaUrl() { return this._mediaUrl; }
    set mediaUrl(val) { this.setAttribute('media-url', val); }

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
        this.innerHTML = `
            <div class="player-container">
                <audio class="video-js vjs-default-skin"></audio>
                <div class="visualization"></div>
                <div class="controls">
                    <button class="add-annotation-btn" title="Ajouter une annotation">
                        +
                    </button>
                    <input type="text" class="annotation-search" placeholder="Rechercher...">
                </div>
                <div class="annotation-display"></div>
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
        `;

        this.updateUI();
        this.bindEvents();
    }

    updateUI() {
        const addBtn = this.querySelector('.add-annotation-btn');
        if (addBtn) {
            addBtn.style.display = this._canAddAnnotation ? 'inline-block' : 'none';
        }
    }

    initPlayer() {
        const videoElement = this.querySelector('.video-js');
        let playerHeight = 30;
        if (!videoElement) return;

        // Set src if available
        if (this._mediaUrl) {
            videoElement.src = this._mediaUrl;
        }

        // Add subtitles if available
        if (this._subtitleFilesUrl && Array.isArray(this._subtitleFilesUrl)) {
            this._subtitleFilesUrl.forEach(track => {
                const trackEl = document.createElement('track');
                trackEl.kind = 'subtitles';
                trackEl.label = track.label || track.language;
                trackEl.srclang = track.language;
                trackEl.src = track.url;
                videoElement.appendChild(trackEl);
                playerHeight = 90;
            });
        }

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
            bigPlayButton: false,
            inactivityTimeout: 0, // Keep controls visible
            //bigPlayButton: false, // Hide the initial big play button*/
        });

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
            onAdd: (item, callback) => {
                this.showAnnotationForm(item, callback);
            },
            onMove: (item, callback) => {
                if (this.canEditItem(item)) {
                    callback(item);
                } else {
                    callback(null); // Cancel move
                }
            },
            onRemove: (item, callback) => {
                if (this.canEditItem(item)) {
                    callback(item);
                } else {
                    callback(null);
                }
            },
            onUpdate: (item, callback) => {
                if (this.canEditItem(item)) {
                    this.showAnnotationForm(item, callback);
                } else {
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
                if (this.canEditItem(item)) {
                    this.showAnnotationForm(item, (updatedItem) => {
                        if (updatedItem) this.items.update(updatedItem);
                    });
                }
            }
        });
    }

    canEditItem(item) {
        if (this._canEditAllAnnotation) return true;
        if (this._canUpdateAnnotationForAuthorName && item.author === this._canUpdateAnnotationForAuthorName) return true;
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
                const currentTime = this.player.currentTime() * 1000;
                const newItem = {
                    id: new Date().getTime(),
                    start: new Date(currentTime),
                    end: null,
                    content: '',
                    group: 0,
                    type: 'point'
                };
                this.showAnnotationForm(newItem, (item) => {
                    if (item) this.items.add(item);
                });
            });
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

    async loadIIIFAnnotations(url) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            let parsedItems = [];

            const processItem = (item, index) => {
                const target = item.target || item.on;
                // Handle different target structures (string or object)
                const targetStr = typeof target === 'string' ? target : (target.id || '');
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
                    created: item.created || ''
                };
            };

            if (data['@type'] === 'sc:AnnotationList' && data.resources) {
                parsedItems = data.resources.map(processItem);
            } else if (data.items || (data.type === 'AnnotationPage' && data.items)) {
                parsedItems = data.items.map(processItem);
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

        const ctx = canvas.getContext('2d');
        const windowRange = this.timeline.getWindow();
        const start = windowRange.start.getTime();
        const end = windowRange.end.getTime();
        const width = visPanel.offsetWidth;
        const height = visPanel.offsetHeight;

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        ctx.clearRect(0, 0, width, height);
        ctx.beginPath();
        ctx.strokeStyle = this._waveformStrokeColor;
        ctx.lineWidth = this._waveformStrokeWidth;

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

        // Check if we need to re-render (e.g. items changed count or search changed)
        if (display.children.length !== allAnnotations.length || display.dataset.lastSearch !== searchTerm) {
            this.renderAnnotationList(display, allAnnotations);
            display.dataset.lastSearch = searchTerm;
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
                    if (this.canEditItem(item)) {
                        this.showAnnotationForm(item, (updatedItem) => {
                            if (updatedItem) this.items.update(updatedItem);
                        });
                    }
                };
                // Hide if not editable
                if (!this.canEditItem(item)) {
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
                    div.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

        const start = item.start.getTime() / 1000;
        startTimeInput.value = start;

        if (item.end) {
            typeSelect.value = 'range';
            endTimeInput.value = item.end.getTime() / 1000;
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

        newSaveBtn.onclick = () => {
            const type = typeSelect.value;
            const newStart = parseFloat(startTimeInput.value) * 1000;
            const title = titleInput.value;
            const text = textInput.value;

            item.label = title;
            item.value = text;
            item.content = title || text;
            item.start = newStart;
            item.type = type;
            // item.group = 0; // No group

            if (type === 'range') {
                const newEnd = parseFloat(endTimeInput.value) * 1000;
                if (isNaN(newEnd) || newEnd <= newStart) {
                    alert('Invalid End Time');
                    return;
                }
                item.end = newEnd;
            } else {
                item.end = null;
            }

            callback(item);
            modal.style.display = 'none';
        };

        newCancelBtn.onclick = () => {
            callback(null);
            modal.style.display = 'none';
        };
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
