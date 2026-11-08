import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Dev proxy: the client talks to /api and Vite forwards it to the server,
// so no CORS juggling in development. In production set VITE_API_URL to
// the deployed server URL (see README).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000', '/socket.io': { target: 'http://localhost:5000', ws: true } } },
});
