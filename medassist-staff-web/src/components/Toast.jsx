import React, { useEffect, useState } from 'react';

let listener = null;
export function toast(message) {
  if (listener) listener(message);
}

export function ToastHost() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    listener = (m) => {
      setMsg(m);
      window.clearTimeout(window.__toastTimer);
      window.__toastTimer = window.setTimeout(() => setMsg(null), 2200);
    };
    return () => { listener = null; };
  }, []);
  return <div className={`toast ${msg ? 'show' : ''}`}>{msg}</div>;
}
