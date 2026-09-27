import React, { useEffect, useRef, useState } from 'react';
import { QUESTIONS_BY_LANGUAGE, UI_STRINGS } from '../data/questions';
import { submitCheckIn } from '../services/firestoreService';
import { toast } from '../components/Toast';

export default function ChatPage({ patient, onSubmitted }) {
  const language = patient.language || 'English';
  const questions = QUESTIONS_BY_LANGUAGE[language] || QUESTIONS_BY_LANGUAGE.English;
  const t = UI_STRINGS[language] || UI_STRINGS.English;

  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState(null);
  const [input, setInput] = useState('');
  const logRef = useRef(null);
  const askedRef = useRef(false);

  useEffect(() => {
    if (!askedRef.current) {
      askedRef.current = true;
      askNext(0);
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, typing, done]);

  function askNext(index) {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { who: 'bot', text: questions[index].text }]);
    }, 450);
  }

  async function handleSubmit() {
    const val = input.trim();
    if (!val || done) return;
    const q = questions[qIndex];
    setMessages(m => [...m, { who: 'user', text: val }]);
    const nextAnswers = { ...answers, [q.key]: val };
    setAnswers(nextAnswers);
    setInput('');
    const nextIndex = qIndex + 1;
    setQIndex(nextIndex);

    if (nextIndex >= questions.length) {
      setTyping(true);
      setTimeout(async () => {
        setTyping(false);
        setDone(true);
        const saved = await submitCheckIn(patient, nextAnswers);
        setResult(saved);
        toast('Check-in sent to a healthcare worker');
        if (onSubmitted) onSubmitted(saved);
      }, 600);
    } else {
      askNext(nextIndex);
    }
  }

  const total = questions.length;
  const pct = done ? 100 : Math.round((qIndex / total) * 100);

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
          <button className="sendbtn" onClick={handleSubmit} disabled={done}>{t.send}</button>
        </div>
      </div>
    </div>
  );
}
