import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 5183 em vez do 5173 padrão do Vite, que costuma colidir com outros projetos
  // rodando em paralelo no mesmo host.
  server: {
    port: 5183,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Meeting Voice Reports',
        short_name: 'MV Reports',
        description: 'Ouve reuniões, entrevistas e agendamentos e gera relatórios estruturados.',
        theme_color: '#0b6bcb',
        background_color: '#f4f6f8',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
