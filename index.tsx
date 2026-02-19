import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Easter Egg: Console Signature
console.log(
  "%c Developed by ARC Club %c System Online ",
  "background: #10b981; color: #09090b; padding: 4px; border-radius: 4px 0 0 4px; font-weight: bold;",
  "background: #18181b; color: #fafafa; padding: 4px; border-radius: 0 4px 4px 0;"
);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);