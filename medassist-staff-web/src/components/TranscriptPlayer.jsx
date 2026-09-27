import React, { useEffect, useRef, useState } from 'react';

// Simulates "listening to the recording" by highlighting the transcript
// word-by-word on a timer, like synced captions. There is no real audio
// file stored for these mock cases, so this stands in for it until the
// app has actual call recordings to play.
export default function TranscriptPlayer({ transcript }) {
  const words = (transcript || 'No transcript stored for this case.').split(/\s+/);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearInterval(timerRef.current), []);

  function play() {
    clearInterval(timerRef.current);
    setPlaying(true);
    let i = index >= words.length - 1 ? 0 : index;
    setIndex(i);
    timerRef.current = setInterval(() => {
      i += 1;
      if (i >= words.length) {
        clearInterval(timerRef.current);
        setPlaying(false);
        return;
      }
      setIndex(i);
    }, 320);
  }

  function pause() {
    clearInterval(timerRef.current);
    setPlaying(false);
  }

  const progress = words.length > 1 ? Math.round((Math.max(index, 0) / (words.length - 1)) * 100) : 0;

  return (
    <div>
      <div className="tplayer">
        <button className="playbtn" onClick={() => (playing ? pause() : play())}>
          {playing ? '⏸' : '▶'}
        </button>
        <div className="progressbar"><div className="fill" style={{ width: progress + '%' }} /></div>
      </div>
      <div className="transcript">
        {words.map((w, i) => (
          <span key={i} className={`w ${i < index ? 'said' : i === index ? 'current' : 'upcoming'}`}>
            {w}{' '}
          </span>
        ))}
      </div>
    </div>
  );
}
