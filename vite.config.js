import { defineConfig } from 'vite';
import css from 'rollup-plugin-css-only';

export default defineConfig({
    plugins: [
        css({ output: 'player-iiif-vis.css' })
    ],
    build: {
        lib: {
            entry: 'src/components/AnnotationPlayerIIIF.js',
            name: 'PlayerIIIF', // Required for iife/umd
            formats: ['umd'],
            fileName: () => 'player-iiif-vis.js',
        },
        cssCodeSplit: true, // Still good to keep
        rollupOptions: {
            output: {
                // assetFileNames logic might be redundant now if css plugin handles it, but harmless
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name === 'style.css') {
                        return 'player-iiif-vis.css';
                    }
                    return 'player-iiif-dependencies.[ext]';
                },
            },
        },
    },
});
