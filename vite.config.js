import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [],
    build: {
        lib: {
            entry: 'src/components/AnnotationPlayerIIIF.js',
            name: 'PlayerIIIF', // Required for iife/umd
            formats: ['es'],
            fileName: () => 'player-iiif-vis.js',
        },
        cssCodeSplit: true,
        rollupOptions: {
            output: {
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name && assetInfo.name.endsWith('.css')) {
                        return 'player-iiif-vis.css';
                    }
                    return 'player-iiif-dependencies.[ext]';
                },
            },
        },
    },
});
