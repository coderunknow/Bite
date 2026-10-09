import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { ProjectStorage } from './storage/database';
import { Studio } from './app/studio';
import { App } from './ui/App';

const studio = new Studio();
void studio.init(() => ProjectStorage.open());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App studio={studio} />
  </StrictMode>,
);
