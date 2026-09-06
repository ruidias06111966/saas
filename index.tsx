import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BarreiraDeErro } from './components/BarreiraDeErro';
import { iniciarMonitoramento } from './services/monitoring';
import { registrarServiceWorker } from './services/pwa';
import './index.css';

// Antes de renderizar, para que um erro na primeira renderização também seja
// registrado. Sem DSN configurado esta chamada não faz nada.
iniciarMonitoramento();

// Deixa o app instalável no celular. Em desenvolvimento não faz nada.
registrarServiceWorker();

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado no index.html');

createRoot(container).render(
  <React.StrictMode>
    <BarreiraDeErro>
      <App />
    </BarreiraDeErro>
  </React.StrictMode>,
);
