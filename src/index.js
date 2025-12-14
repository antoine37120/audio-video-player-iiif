import videojs from 'video.js';
import WaveSurfer from 'wavesurfer.js';
import TimelinePlugin from 'wavesurfer.js/dist/plugin/wavesurfer.timeline.min.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugin/wavesurfer.regions.min.js';
import 'videojs-wavesurfer';
import './style.css';

// Expose WaveSurfer to window as it is used in the inline script
window.CremWaveSurfer = WaveSurfer;
// Expose videojs to window
window.CremVideojs = videojs;

// Re-attach plugins to WaveSurfer global if they are not attached automatically
// This is necessary because the inline script uses WaveSurfer.timeline.create and WaveSurfer.regions.create
if (!window.CremWaveSurfer.timeline) {
    window.CremWaveSurfer.timeline = TimelinePlugin;
}

if (!window.CremWaveSurfer.regions) {
    window.CremWaveSurfer.regions = RegionsPlugin;
}
