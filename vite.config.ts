import { defineConfig } from 'vite';

export default defineConfig({
 server:{
  port:5173,
  strictPort:true,
  proxy:{
   '/socket':{target:'ws://127.0.0.1:8787',ws:true},
   '/health':'http://127.0.0.1:8787',
   '/api':'http://127.0.0.1:8787'
  }
 },
 build:{
  chunkSizeWarningLimit:1200,
  rollupOptions:{
   output:{
    manualChunks(id){
     if(id.includes('@babylonjs/core'))return 'babylon-core';
     if(id.includes('@babylonjs/loaders'))return 'babylon-loaders';
     if(id.includes('@babylonjs/materials'))return 'babylon-materials';
    }
   }
  }
 }
});
