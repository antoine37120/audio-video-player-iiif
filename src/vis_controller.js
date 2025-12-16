import videojs from 'video.js';
import { Timeline } from 'vis-timeline/peer';
import { DataSet } from 'vis-data/peer';
import 'vis-timeline/styles/vis-timeline-graph2d.css';
import 'video.js/dist/video-js.css';
import './style.css';

// Initialize datasets
const items = new DataSet([]);
const groups = new DataSet([
    { id: 0, content: 'Annotations' }
]);

// DOM Elements
const container = document.getElementById('visualization');
const videoElement = document.getElementById('myAudio');
const annotationDisplay = document.getElementById('annotation-display');

// Form Elements
const modalOverlay = document.getElementById('modal-overlay');
const annotationForm = document.getElementById('annotation-form'); // Inner form container
const annotationTypeSelect = document.getElementById('annotation-type');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const endTimeGroup = document.getElementById('end-time-group');
const annotationTextInput = document.getElementById('annotation-text');
const saveButton = document.getElementById('save-annotation');
const cancelButton = document.getElementById('cancel-annotation');

// Initialize Video.js
const player = videojs(videoElement, {
    controls: true,
    autoplay: false,
    preload: 'auto',
    fluid: true,
    width: '100%', // Responsive width
    height: 50 // Audio only height
});

// Initialize Timeline
const options = {
    width: '100%',
    height: '140px',
    stack: true,
    showCurrentTime: true,
    start: 0, // Start at 0
    zoomMin: 1000 * 10, // 10 seconds minimum zoom
    selectable: true,
    editable: {
        add: true,
        updateTime: true,
        updateGroup: false,
        remove: true
    },
    multiselect: false,
    onAdd: function (item, callback) {
        console.log('onAdd triggered!', item);
        showAnnotationForm(item, callback);
    }
};

const timeline = new Timeline(container, items, groups, options);

// IIIF Loader
async function loadIIIFAnnotations(url) {
    try {
        const response = await fetch(url);
        const data = await response.json();

        let parsedItems = [];

        // Handle IIIF Annotation List
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
                    } else {
                        // For point annotations, VisJS needs a start. 
                        // If we want it to look like a point, we don't set end.
                        // But for display logic, we might treat it as having a duration?
                        // VisJS 'point' type items don't have an end date.
                    }
                }

                return {
                    id: resource['@id'] || index + 1,
                    group: 0,
                    content: resource.resource.chars || '',
                    start: start,
                    end: end, // Can be null for point
                    type: type,
                    // Store extra data if needed
                    author: '' // Placeholder if author data exists
                };
            });
        }
        // Handle previous simple JSON format (fallback)
        else if (data.items) {
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

        items.add(parsedItems);
        timeline.fit();

        // Update timeline options with media duration once loaded
        player.one('loadedmetadata', () => {
            const duration = player.duration() * 1000;
            timeline.setOptions({
                end: duration,
                zoomMax: duration // Max zoom out is full duration
            });
        });

    } catch (error) {
        console.error('Error loading IIIF annotations:', error);
    }
}

// Sync Logic
const customTimeId = 'videoProgress';
timeline.addCustomTime(0, customTimeId);

player.on('timeupdate', () => {
    const currentTime = player.currentTime() * 1000;
    timeline.setCustomTime(currentTime, customTimeId);
    updateAnnotationDisplay(currentTime);
});

// Click Interaction
// Click Interaction
let startClickTime = 0;
let startClickPos = { x: 0, y: 0 };
let clickTimeout = null;
// Capture mousedown to detect drag vs click
// Alternative : utiliser l'événement vis-timeline directement
timeline.on('mouseDown', (properties) => {
    console.log('mousedown via timeline');
    startClickTime = new Date().getTime();
    if (properties.event) {
        startClickPos = { x: properties.event.clientX, y: properties.event.clientY };
    }
});

// Écouter le double-clic explicitement pour debug
timeline.on('doubleClick', (properties) => {
    console.log('doubleClick detected', properties);
    // Annuler le simple clic en attente pour ne pas interférer avec onAdd
    if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
    }
});

var addButton = document.getElementById('add-annotation-btn');
if (addButton) {
    addButton.addEventListener('click', function () {
        var currentTime = player.currentTime() * 1000; // Temps actuel en ms

        var newItem = {
            id: new Date().getTime(),
            start: new Date(currentTime),
            end: null,
            content: '',
            group: 0,
            type: 'point'
        };

        showAnnotationForm(newItem, function (item) {
            if (item) {
                items.add(item);
            }
        });
    });
}

timeline.on('click', (properties) => {
    console.log(properties);
    // 1. Don't seek if clicked on an item
    if (properties.item) {
        return;
    }

    // 2. Don't seek if it was a drag (long click / move)
    const endClickTime = new Date().getTime();
    const clickDuration = endClickTime - startClickTime;

    // Check movement distance
    const event = properties.event;
    const dist = Math.sqrt(
        Math.pow(event.clientX - startClickPos.x, 2) +
        Math.pow(event.clientY - startClickPos.y, 2)
    );

    // Thresholds: 
    // Distance > 5px implies drag/move
    // Duration > 500ms implies long press (optional, but requested "clic long")
    if (dist > 5 || clickDuration > 500) {
        return;
    }

    // 3. Utiliser un délai pour différencier simple clic vs double-clic
    const seekTime = properties.time ? properties.time.getTime() / 1000 : null;

    // Annuler tout timeout précédent
    if (clickTimeout) {
        clearTimeout(clickTimeout);
    }

    // Attendre un peu avant d'exécuter le seek (pour laisser le double-clic l'annuler)
    clickTimeout = setTimeout(function () {
        clickTimeout = null;
        if (seekTime !== null) {
            console.log('Seeking to time!');
            player.currentTime(seekTime);

            if (!player.paused()) {
                player.play();
            }
        }
    }, 250); // 250ms de délai - assez pour détecter un double-clic
});

// Annotation Form Logic
function showAnnotationForm(item, callback) {
    // Default values
    const start = item.start.getTime() / 1000;
    startTimeInput.value = start;

    // Determine type and end time
    if (item.end) {
        annotationTypeSelect.value = 'range';
        endTimeInput.value = item.end.getTime() / 1000;
        endTimeGroup.style.display = 'block';
    } else {
        annotationTypeSelect.value = 'point';
        endTimeInput.value = '';
        endTimeGroup.style.display = 'none';
    }

    annotationTextInput.value = item.content || '';

    // Show Modal
    modalOverlay.style.display = 'flex';

    // Type change handler
    annotationTypeSelect.onchange = () => {
        if (annotationTypeSelect.value === 'range') {
            endTimeGroup.style.display = 'block';
            if (!endTimeInput.value) {
                endTimeInput.value = parseFloat(startTimeInput.value) + 5; // Default 5s duration
            }
        } else {
            endTimeGroup.style.display = 'none';
        }
    };

    saveButton.onclick = () => {
        const type = annotationTypeSelect.value;
        const newStart = parseFloat(startTimeInput.value) * 1000;
        const text = annotationTextInput.value;

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
            item.end = null; // Clear end for point
        }

        callback(item);
        closeModal();
    };

    cancelButton.onclick = () => {
        callback(null);
        closeModal();
    };
}

function closeModal() {
    modalOverlay.style.display = 'none';
    saveButton.onclick = null;
    cancelButton.onclick = null;
    annotationTypeSelect.onchange = null;
}

// Annotation Display Logic
function updateAnnotationDisplay(currentTime) {
    const activeAnnotations = items.get({
        filter: function (item) {
            // Display condition:
            // 1. Current time is within item start and end (for ranges)
            // 2. OR Current time is within item start and start + 15s (for points or short ranges?)
            // Requirement: "Une anotation doit apparaitre tant que le curseur de lecture n'a pas atteind sa fin et au minimum pendant 15s."

            const start = item.start; // ms
            let end = item.end; // ms

            // If point, treat as having 0 duration for "end" check, but we apply the 15s rule
            if (!end) {
                end = start;
            }

            const minDisplayEnd = start + (15 * 1000); // 15 seconds minimum
            const effectiveEnd = Math.max(end, minDisplayEnd);

            return currentTime >= start && currentTime <= effectiveEnd;
        }
    });

    // Sort by start time, then by z-index (if we had one). 
    // Requirement: "L'annotation qui apparait, doit être placé au dessus des autres." -> Last one added or specific sort?
    // Usually "on top" means visually on top in the DOM, which means last in the list.
    // Let's sort by start time.
    activeAnnotations.sort((a, b) => a.start - b.start);

    renderAnnotations(activeAnnotations);
}

function renderAnnotations(annotations) {
    annotationDisplay.innerHTML = '';

    annotations.forEach(item => {
        const div = document.createElement('div');
        div.className = 'annotation-card';

        const startTimeStr = formatTime(item.start / 1000);
        let timeStr = startTimeStr;

        if (item.type === 'range' && item.end) {
            const endTimeStr = formatTime(item.end / 1000);
            timeStr += ` - ${endTimeStr}`;
        }

        // Format: [Start] - [End] : [Text] [Author]
        let html = `<span class="annotation-time">[${timeStr}]</span> : ${escapeHtml(item.content)}`;

        if (item.author) {
            html += ` <span class="annotation-author">(${escapeHtml(item.author)})</span>`;
        }

        div.innerHTML = html;
        annotationDisplay.appendChild(div);
    });
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Load initial data
// Try loading the new IIIF file
let iiifSrc = videoElement.getAttribute('data-iiif-src');
loadIIIFAnnotations(iiifSrc);
loadWaveform('public/waveform.json');

// Waveform Visualization Logic (Kept mostly same, just ensuring context)
async function loadWaveform(url) {
    try {
        const response = await fetch(url);
        const waveformData = await response.json();
        renderWaveform(waveformData);
    } catch (error) {
        console.error('Error loading waveform:', error);
    }
}

function renderWaveform(waveformData) {
    const visPanel = container.querySelector('.vis-panel.vis-center');
    if (!visPanel) {
        // Retry if VisJS isn't ready yet
        setTimeout(() => renderWaveform(waveformData), 100);
        return;
    }

    // Check if canvas already exists
    let canvas = visPanel.querySelector('.waveform-canvas');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'waveform-canvas';
        // Insert as first child to be behind items
        visPanel.insertBefore(canvas, visPanel.firstChild);
    }

    const ctx = canvas.getContext('2d');

    function draw() {
        const windowRange = timeline.getWindow();
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
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.48)';
        ctx.lineWidth = 1;

        const secondsPerPoint = waveformData.samples_per_pixel / waveformData.sample_rate;

        const startIndex = Math.floor((start / 1000) / secondsPerPoint);
        const endIndex = Math.ceil((end / 1000) / secondsPerPoint);

        const first = Math.max(0, startIndex);
        const last = Math.min(waveformData.data.length - 1, endIndex);

        const centerY = height / 2;

        // Scale amplitude based on bit depth
        const bits = waveformData.bits || 16;
        const maxAmplitude = Math.pow(2, bits - 1);
        const scaleY = (height / 2) / maxAmplitude * 0.8;

        for (let i = first; i <= last; i++) {
            const value = waveformData.data[i];
            const timeMs = i * secondsPerPoint * 1000;
            const x = (timeMs - start) / (end - start) * width;
            const y = centerY - (value * scaleY);

            if (i === first) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }

    timeline.on('rangechanged', draw);
    timeline.on('changed', draw);

    draw();
}

// Expose for debugging
window.player = player;
window.timeline = timeline;
window.items = items;
