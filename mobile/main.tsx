import React from 'react';
import { createRoot } from 'react-dom/client';
import { installOffline } from './offline';
import { Workspace } from '../src/components/workspace';
import '../src/app/globals.css';
installOffline()
  .then(() => createRoot(document.getElementById('root')!).render(<Workspace />))
  .catch(() => {
    document.getElementById('root')!.textContent = 'Не удалось открыть локальную базу данных.';
  });
