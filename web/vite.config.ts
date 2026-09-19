import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // 5183 em vez do 5173 padrão do Vite, que costuma colidir com outros projetos
  // rodando em paralelo no mesmo host.
  server: {
    port: 5183,
    // O microfone só é liberado em contexto seguro, então testar no celular exige
    // HTTPS. O caminho suportado é o port forwarding do VS Code (Dev Tunnels);
    // sem esta lista o Vite rejeita o Host do tunnel.
    allowedHosts: ['.devtunnels.ms', '.ngrok-free.app', '.trycloudflare.com'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Meeting Voice Reports',
        short_name: 'MV Reports',
        // Sem isto o vite-plugin-pwa emite "lang": "en" por padrão.
        lang: 'pt-BR',
        description: 'Ouve reuniões, entrevistas e agendamentos e gera relatórios estruturados.',
        theme_color: '#0b6bcb',
        background_color: '#f4f6f8',
        // A Web Speech API não funciona em PWA instalado na tela de início do iOS, e o
        // app é inteiro STT — instalado em standalone ele simplesmente não serve pra
        // nada. O iOS ignora `display_override` e cai no `display`, então abre o ícone
        // como aba do Safari, onde funciona; Chrome e Edge leem o `display_override`
        // primeiro, seguem instaláveis e continuam abrindo em janela própria.
        display: 'browser',
        display_override: ['standalone'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
