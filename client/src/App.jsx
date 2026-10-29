import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "./socket.js";

function Button({ children, onClick, variant = "primary", disabled = false, ...props }) {
  return <button className={`button ${variant}`} onClick={onClick} disabled={disabled} {...props}>{children}</button>;
}
function Avatar({ name }) {
  return <div className="avatar">{(name || "?").slice(0, 1).toUpperCase()}</div>;
}
function formatTime(ms) {
  return Math.max(0, Math.ceil(ms / 1000));
}

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [screen, setScreen] = useState("home");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [answerSent, setAnswerSent] = useState(false);
  const [lastPoints, setLastPoints] = useState(null);
  const questionNumberRef = useRef(null);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onUpdate = next => {
      setRoom(next);
      if (next.status === "question") {
        setScreen("game");
        if (questionNumberRef.current !== next.questionNumber) {
          questionNumberRef.current = next.questionNumber;
          setAnswerSent(false);
          setLastPoints(null);
          setError("");
        }
        setNotice("");
      } else if (next.status === "reveal") {
        setScreen("reveal");
      } else if (next.status === "finished") {
        setScreen("results");
      } else {
        setScreen("lobby");
      }
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:update", onUpdate);
    const tick = setInterval(() => setNow(Date.now()), 100);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:update", onUpdate);
      clearInterval(tick);
    };
  }, []);

  const me = useMemo(() => room?.players?.find(p => p.id === socket.id), [room]);
  const sortedPlayers = useMemo(() => [...(room?.players || [])].sort((a, b) => b.score - a.score), [room]);
  const seconds = room?.deadline ? formatTime(room.deadline - now) : 20;
  const progress = room?.deadline ? Math.max(0, Math.min(100, ((room.deadline - now) / 20000) * 100)) : 100;

  function emitAck(event, payload) {
    return new Promise(resolve => socket.emit(event, payload, response => resolve(response || { ok: false, error: "No response from server." })));
  }
  async function createRoom(e) {
    e?.preventDefault();
    setError("");
    if (!name.trim()) return setError("Enter a nickname first.");
    const res = await emitAck("room:create", { name });
    if (!res.ok) return setError(res.error);
    setRoomCode(res.code);
    setScreen("lobby");
  }
  async function joinRoom(e) {
    e?.preventDefault();
    setError("");
    if (!name.trim()) return setError("Enter a nickname first.");
    if (joinCode.trim().length < 4) return setError("Enter the room code shared by your host.");
    const res = await emitAck("room:join", { code: joinCode, name });
    if (!res.ok) return setError(res.error);
    setRoomCode(res.code);
    setScreen("lobby");
  }
  async function startGame() {
    setError("");
    const res = await emitAck("game:start", { code: roomCode });
    if (!res.ok) setError(res.error);
  }
  async function submitAnswer(index) {
    if (answerSent) return;
    setAnswerSent(true);
    const res = await emitAck("answer:submit", { code: roomCode, selectedIndex: index });
    if (!res.ok) setError(res.error);
    else setLastPoints(res.pointsEarned);
  }
  function leaveRoom() {
    socket.emit("room:leave", { code: roomCode });
    setRoom(null);
    setRoomCode("");
    setScreen("home");
    setError("");
    setNotice("");
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(roomCode);
      setNotice("Room code copied!");
    } catch {
      setNotice(`Share this code: ${roomCode}`);
    }
    setTimeout(() => setNotice(""), 2200);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => screen === "home" ? null : leaveRoom()} aria-label="Quiz Battle home">
          <span className="brand-mark">Q</span><span>QUIZ<span className="brand-light">BATTLE</span></span>
        </button>
        <div className="connection"><span className={`status-dot ${connected ? "online" : ""}`} />{connected ? "ONLINE" : "CONNECTING"}</div>
      </header>

      {screen === "home" && (
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line" /> REAL-TIME MULTIPLAYER <span className="eyebrow-line" /></div>
          <h1>Think fast.<br /><span>Win big.</span></h1>
          <p className="hero-copy">A little knowledge. A lot of speed. Challenge your friends in the ultimate quiz showdown.</p>
          <div className="hero-stats"><div><strong>02–08</strong><small>PLAYERS</small></div><div><strong>10</strong><small>QUESTIONS</small></div><div><strong>20s</strong><small>PER ROUND</small></div></div>
          <div className="panel home-panel">
            <label htmlFor="nickname">YOUR NICKNAME</label>
            <input id="nickname" value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder="Enter your player name" onKeyDown={e => { if (e.key === "Enter") createRoom(e); }} />
            <Button onClick={createRoom}>＋ Create a room <span>→</span></Button>
            <div className="divider"><span>OR JOIN YOUR FRIENDS</span></div>
            <form className="join-row" onSubmit={joinRoom}>
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ENTER ROOM CODE" aria-label="Room code" />
              <Button type="submit">Join</Button>
            </form>
            {error && <p className="error">{error}</p>}
          </div>
          <p className="microcopy">✦ Free to play · No account needed · Just bring your brain</p>
        </section>
      )}

      {screen === "lobby" && room && (
        <section className="content-section">
          <div className="eyebrow"><span className="eyebrow-line" /> GET READY <span className="eyebrow-line" /></div>
          <h1 className="section-title">The <span>arena</span> awaits.</h1>
          <p className="section-copy">Invite your friends. The fastest brain takes the crown.</p>
          <div className="panel lobby-panel">
            <div className="room-code-label">YOUR ROOM CODE</div>
            <button className="room-code" onClick={copyCode} title="Copy room code">{room.code}<span>▣</span></button>
            <p className="muted">Share this code with friends to join your match.</p>
            {notice && <p className="notice">{notice}</p>}
            <div className="lobby-divider"><span>PLAYERS</span><span>{room.players.length}/8</span></div>
            <div className="player-grid">
              {room.players.map((p, i) => <div className="player-tile" key={p.id}><Avatar name={p.name} /><div><strong>{p.name}{p.id === room.hostId && <span className="host-tag"> HOST</span>}</strong><small>{p.connected ? "Ready to play" : "Reconnecting…"}</small></div><span className="player-number">{String(i + 1).padStart(2, "0")}</span></div>)}
              {Array.from({ length: Math.max(0, 2 - room.players.length) }).map((_, i) => <div className="player-tile empty" key={`empty-${i}`}><div className="avatar">+</div><div><strong>Waiting for player</strong><small>Share your room code</small></div></div>)}
            </div>
            <div className="lobby-footer"><span>⚡ 10 mixed questions · 20 seconds each</span><Button onClick={startGame} disabled={room.players.length < 2 || socket.id !== room.hostId}>Start battle <span>→</span></Button></div>
            {room.players.length < 2 && <p className="muted center">Waiting for at least one more player…</p>}
            {error && <p className="error">{error}</p>}
          </div>
          <Button variant="ghost" onClick={leaveRoom}>← Leave room</Button>
        </section>
      )}

      {(screen === "game" || screen === "reveal") && room?.question && (
        <section className="content-section game-section">
          <div className="game-topline"><span className="pill">{room.question.category}</span><span className="question-count">QUESTION <strong>{String(room.questionNumber).padStart(2, "0")}</strong> / {room.questionCount}</span></div>
          <div className="timer-wrap"><div className="timer-track"><div className={`timer-fill ${seconds <= 5 ? "urgent" : ""}`} style={{ width: `${progress}%` }} /></div><span className={seconds <= 5 ? "urgent-text" : ""}>00:{String(seconds).padStart(2, "0")}</span></div>
          <div className="question-panel">
            <div className="question-kicker">CHOOSE YOUR ANSWER</div>
            <h2>{room.question.question}</h2>
            <div className="answers-grid">
              {room.question.options.map((option, i) => {
                const reveal = screen === "reveal";
                const correct = reveal && room.result?.correctIndex === i;
                return <button key={option} className={`answer-option ${answerSent ? "submitted" : ""} ${correct ? "correct" : ""}`} onClick={() => screen === "game" && submitAnswer(i)} disabled={screen !== "game" || answerSent}>
                  <span className="option-letter">{["A", "B", "C", "D"][i]}</span><span>{option}</span>{correct && <span className="correct-check">✓</span>}
                </button>;
              })}
            </div>
            {screen === "game" && <div className="answer-status">{answerSent ? "✓ Answer locked in. Good luck!" : "Choose carefully — speed earns bonus points."}{lastPoints !== null && <strong> +{lastPoints.toLocaleString()} pts</strong>}</div>}
            {screen === "reveal" && <div className="reveal-banner">Correct answer revealed! Next question loading…</div>}
          </div>
          <div className="live-score-panel"><div className="score-heading"><span>LIVE LEADERBOARD</span><span>⚡ LIVE</span></div>{sortedPlayers.map((p, i) => <div className={`score-row ${p.id === socket.id ? "you" : ""}`} key={p.id}><span className="rank">{i + 1}</span><Avatar name={p.name} /><strong>{p.name}{p.id === socket.id ? " (You)" : ""}</strong><span className="score-points">{p.score.toLocaleString()} <small>PTS</small></span></div>)}</div>
          {error && <p className="error">{error}</p>}
          <Button variant="ghost" onClick={leaveRoom}>Leave match</Button>
        </section>
      )}

      {screen === "results" && room && (
        <section className="content-section results-section">
          <div className="eyebrow"><span className="eyebrow-line" /> MATCH COMPLETE <span className="eyebrow-line" /></div>
          <div className="trophy">🏆</div>
          <h1 className="section-title">The <span>champion</span><br />has been crowned.</h1>
          <p className="section-copy">Ten questions. Quick thinking. One leaderboard.</p>
          <div className="panel results-panel">
            {sortedPlayers.map((p, i) => <div className={`final-row place-${i + 1} ${p.id === socket.id ? "you" : ""}`} key={p.id}><span className="final-rank">{i === 0 ? "👑" : `#${i + 1}`}</span><Avatar name={p.name} /><div className="final-name"><strong>{p.name}{p.id === socket.id ? " (You)" : ""}</strong><small>{i === 0 ? "QUIZ CHAMPION" : "GREAT GAME"}</small></div><strong className="final-score">{p.score.toLocaleString()}<small>PTS</small></strong></div>)}
            <Button onClick={leaveRoom}>Back to home <span>→</span></Button>
          </div>
        </section>
      )}

      <footer className="footer"><span>QUIZ BATTLE <b>·</b> SPEED ARENA</span><span>BUILT FOR BRIGHT MINDS <b>✦</b></span></footer>
    </main>
  );
}
