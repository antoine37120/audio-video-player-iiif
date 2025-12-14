import videojs from 'video.js';
import { Timeline } from 'vis-timeline/peer';
import { DataSet } from 'vis-data/peer';
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
            'can-update-annotation-for-author-name'
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

        // Internal state
        this.player = null;
        this.timeline = null;
        this.items = new DataSet([]);
        this.groups = new DataSet([{ id: 0, content: 'Annotations' }]);
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
        }
    }

    // Getters and Setters for properties to sync with attributes
    get iiifAnnotationListUrl() { return this._iiifAnnotationListUrl; }
    set iiifAnnotationListUrl(val) { this.setAttribute('iiif-annotation-list-url', val); }

    get mediaUrl() { return this._mediaUrl; }
    set mediaUrl(val) { this.setAttribute('media-url', val); }

    // ... (Implement other getters/setters as needed)

    render() {
        this.innerHTML = `
            <div class="player-container">
                <audio class="video-js vjs-default-skin"></audio>
                <div class="visualization"></div>
                <div class="controls">
                    <button class="add-annotation-btn">
                        + Ajouter une annotation
                    </button>
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
                this.timeline.setOptions({
                    end: duration,
                    zoomMax: duration
                });
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
            height: '200px',
            stack: true,
            showCurrentTime: true,
            start: 0,
            zoomMin: 1000 * 10,
            selectable: true,
            editable: {
                add: this._canAddAnnotation,
                updateTime: true, // We might want to restrict this too based on permissions
                updateGroup: false,
                remove: true // And this
            },
            multiselect: false,
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

        this.timeline = new Timeline(container, this.items, this.groups, options);
        this.timeline.addCustomTime(0, 'videoProgress');

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

            if (data['@type'] === 'sc:AnnotationList' && data.resources) {
                parsedItems = data.resources.map((resource, index) => {
                    const on = resource.on;
                    const timeMatch = on.match(/t=([\d\.]+)(,([\d\.]+))?/);
                    let start = 0;
                    let end = null;
                    let type = 'point';

                    if (timeMatch) {
                        start = parseFloat(timeMatch[1]) * 1000;
                        if (timeMatch[3]) {
                            end = parseFloat(timeMatch[3]) * 1000;
                            type = 'range';
                        }
                    }

                    return {
                        id: resource['@id'] || index + 1,
                        group: 0,
                        content: resource.resource.chars || '',
                        start: start,
                        end: end,
                        type: type,
                        author: ''
                    };
                });
            } else if (data.items) {
                parsedItems = data.items.map((item, index) => {
                    const target = item.target;
                    const timeMatch = target.match(/t=([\d\.]+),([\d\.]+)/);
                    let start = 0;
                    let end = 0;

                    if (timeMatch) {
                        start = parseFloat(timeMatch[1]) * 1000;
                        end = parseFloat(timeMatch[2]) * 1000;
                    }

                    return {
                        id: index + 1,
                        group: 0,
                        content: item.body.value,
                        start: start,
                        end: end,
                        type: 'range'
                    };
                });
            }

            this.items.clear();
            this.items.add(parsedItems);
            if (this.timeline) this.timeline.fit();

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
        if (!display) return;

        const activeAnnotations = this.items.get({
            filter: (item) => {
                const start = item.start;
                let end = item.end;
                if (!end) end = start;
                const minDisplayEnd = start + (this._annotationMinTimeToDisplay * 1000);
                const effectiveEnd = Math.max(end, minDisplayEnd);
                return currentTime >= start && currentTime <= effectiveEnd;
            }
        });

        activeAnnotations.sort((a, b) => a.start - b.start);

        display.innerHTML = '';
        activeAnnotations.forEach(item => {
            const div = document.createElement('div');
            div.className = 'annotation-card';

            const startTimeStr = this.formatTime(item.start / 1000);
            let timeStr = startTimeStr;
            if (item.type === 'range' && item.end) {
                timeStr += ` - ${this.formatTime(item.end / 1000)}`;
            }

            let html = '';
            if (this._annotationPropertiesToDisplay.includes('time')) {
                html += `<span class="annotation-time">[${timeStr}]</span> : `;
            }
            if (this._annotationPropertiesToDisplay.includes('text')) {
                html += this.escapeHtml(item.content);
            }
            if (this._annotationPropertiesToDisplay.includes('author') && item.author) {
                html += ` <span class="annotation-author">(${this.escapeHtml(item.author)})</span>`;
            }

            div.innerHTML = html;
            display.appendChild(div);
        });
    }

    showAnnotationForm(item, callback) {
        const modal = this.querySelector('.modal-overlay');
        const typeSelect = this.querySelector('.annotation-type');
        const startTimeInput = this.querySelector('.start-time');
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

        textInput.value = item.content || '';
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
            const text = textInput.value;

            item.content = text;
            item.start = newStart;
            item.type = type;
            item.group = 0;

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
