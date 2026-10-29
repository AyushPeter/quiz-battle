# Quiz Battle: Speed Arena

A real-time 2–8 player quiz game built with React, Vite, Express, and Socket.IO.

## Requirements
- Node.js 20+ recommended
- npm

## Run locally
Open two terminals.

### 1. Start the backend
```bash
cd server
npm install
npm run dev
```
The server runs on `http://localhost:3001`.

### 2. Start the frontend
In a second terminal:
```bash
cd client
npm install
npm run dev
```
Open the Vite URL shown in the terminal (usually `http://localhost:5173`).

Test with two browser windows. To test on a phone on the same Wi-Fi, configure `VITE_SERVER_URL` in `client/.env` to your computer's LAN IP and start Vite with `npm run dev -- --host 0.0.0.0`. Both devices must be on the same network for this local test.

## Deploy
- Deploy `server` to a Node hosting provider that supports WebSockets (for example Render). Set `NODE_VERSION=20` if supported. Start command: `npm start`. Set `CLIENT_ORIGIN` to your deployed frontend URL.
- Deploy `client` to a static hosting provider (for example Vercel). Build command: `npm run build`; output directory: `dist`. Set `VITE_SERVER_URL` to the deployed backend URL, without a trailing slash.
- Redeploy the frontend after setting `VITE_SERVER_URL`.
- Test the public URL from two separate devices. This repository is not published automatically by downloading it; you must deploy it to receive a public URL.

## Game rules
- 2–8 players, 10 questions, four answer choices, 20 seconds per question.
- Correct answers score 1,000 base points plus a speed bonus proportional to remaining time (up to 1,000 extra points).
- Wrong or missing answers score 0.
- The server owns timers, questions, answer validation, and scores.

## Notes
- Room state is stored in memory and resets when the server restarts.
- Questions are bundled in `server/src/questions.js`; add to that list to expand the question bank.
