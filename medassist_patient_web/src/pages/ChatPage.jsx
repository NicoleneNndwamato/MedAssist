import React, { useEffect, useRef, useState } from 'react';
import { UI_STRINGS } from '../data/questions';
import { submitCheckIn } from '../services/firestoreService';
import { toast } from '../components/Toast';

const CHAT_URL = 'https://chatmessage-pvyz6ypfha-uc.a.run.app';

const LANGUAGE_CODES = { English: 'en-ZA', isiZulu: 'zu-ZA', Afrikaans: 'af-ZA' };

const ERROR_TEXT = {
  English: 'Sorry, something went wrong. Please try again.',
  isiZulu: 'Uxolo, kube nenkinga. Sicela uzame futhi.',
  Afrikaans: 'Jammer, iets het verkeerd gegaan. Probeer asseblief weer.',
};

async function callChat(body) {
  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Chat request failed: ' + res.status);
  return res.json();
}

function summaryToAnswers(summary, needsAmbulanceFlag) {
  const s = summary || {};
  return {
    name: [s.name, s.surname].filter(Boolean).join(' '),
    age: s.age || '',
    location: s.location || '',
    symptoms: s.symptoms || '',
    duration: s.symptomDuration || '',
    lastVisit: s.lastVisit || '',
    pastHistory: s.medicalHistory || '',
    medication: s.medications || '',
    ambulance: needsAmbulanceFlag ? 'yes' : s.needsAmbulance || '',
    emergencyContact: s.emergencyContactNumber || '',
  };
}

export default function ChatPage({ patient, onSubmitted }) {
  const language = patient.language || 'English';
  const languageCode = LANGUAGE_CODES[language] || 'en-ZA';
  const t = UI_STRINGS[language] || UI_STRINGS.English;

  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);
  const [answers, setAnswers] = useState({});
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState(0);
  const logRef = useRef(null);
  const startedRef = useRef(false);
  const sessionIdRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, typing, done]);

  async function start() {
    setTyping(true);
    try {
      const data = await callChat({
        sessionId: sessionIdRef.current,
        language: languageCode,
        phoneNumber: patient.phone || undefined,
      });
      setMessages([{ who: 'bot', text: data.reply }]);
    } catch (err) {
      console.error(err);
      setMessages([{ who: 'bot', text: ERROR_TEXT[language] || ERROR_TEXT.English }]);
    } finally {
      setTyping(false);
    }
  }

  async function finish(data) {
    const finalAnswers = summaryToAnswers(data.summary, data.needsAmbulanceFlag);
    setAnswers(finalAnswers);
    setDone(true);
    try {
      const saved = await submitCheckIn(patient, finalAnswers);
      setResult(saved);
      toast('Check-in sent to a healthcare worker');
      if (onSubmitted) onSubmitted(saved);
    } catch (err) {
      console.error(err);
      toast(ERROR_TEXT[language] || ERROR_TEXT.English);
    }
  }

  async function handleSubmit() {
    const val = input.trim();
    if (!val || done || typing) return;
    setMessages(m => [...m, { who: 'user', text: val }]);
    setInput('');
    setTurns(n => n + 1);
    setTyping(true);
    try {
      const data = await callChat({
        sessionId: sessionIdRef.current,
        language: languageCode,
        message: val,
      });
      setMessages(m => [...m, { who: 'bot', text: data.reply }]);
      if (data.done) await finish(data);
    } catch (err) {
      console.error(err);
      setMessages(m => [...m, { who: 'bot', text: ERROR_TEXT[language] || ERROR_TEXT.English }]);
    } finally {
      setTyping(false);
    }
  }

  const pct = done ? 100 : Math.min(90, turns * 10);

  return (
    <div className="panel">
      <h2 className="pt">{t.chatTitle}</h2>
      <p className="subtle">{t.chatSub}</p>
      <div className="progresswrap"><div className="progresstrack"><div className="progressfill" style={{ width: pct + '%' }} /></div></div>
      <div className="chatwrap">
        <div className="chatlog" ref={logRef}>
          {messages.map((m, i) => <div key={i} className={`msg ${m.who}`}>{m.text}</div>)}
          {typing && <div className="typing">{t.typing}</div>}
          {done && result && (
            <div className="summary-card">
              <h3>{t.summaryTitle}</h3>
              <div>{t.summaryThanks(answers.name || patient.name)}</div>
              <div className={`status-pill ${result.aiPriority === 'IMMEDIATE' ? 'emergency' : 'standard'}`}>
                {result.aiPriority === 'IMMEDIATE' ? t.emergencyPill : t.standardPill}
              </div>
            </div>
          )}
        </div>
        <div className="chatinput">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder={done ? t.done : t.placeholder}
            disabled={done}
          />
          <button className="sendbtn" onClick={handleSubmit} disabled={done || typing}>{t.send}</button>
        </div>
      </div>
    </div>
  );
}