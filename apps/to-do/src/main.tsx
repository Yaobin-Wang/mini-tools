import { createRoot } from 'react-dom/client';
import App from './App';
import '@xyflow/react/dist/style.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './styles.css';
createRoot(document.getElementById('root')!).render(<App />);
