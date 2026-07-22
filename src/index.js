import * as Sentry from "@sentry/react";
Sentry.init({
  dsn: "https://2fcc5c7a601c3dc1aee5ec338a44186e@o4511781218287616.ingest.de.sentry.io/4511781335400528",
  tracesSampleRate: 1.0,
});
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import UpdateToast from './UpdateToast';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
    <UpdateToast />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
