# 🎮 Tetris Fighters Online

A browser-based multiplayer Tetris game with cute anime-style character fighters — inspired by Super Puzzle Fighter II. No sign-up required. Just open and play.

## ✨ Features

- ♟️ **Multiplayer** — Real-time 1v1 via room codes
- 🤖 **CPU Mode** — Battle an AI opponent with heuristic piece placement
- 🏠 **Live Lobby** — See open rooms, create or join in one click
- 🎭 **Character Fighters** — 4 cute characters react to your clears (Miko, Kira, Zuko, Nova)
- 💥 **Garbage Attack System** — Line clears send junk rows to opponent
- 👻 **Ghost Piece + Hold** — Full modern Tetris controls
- 🎨 **Slick Neon Theme** — Kawaii pastel palette with particles & screen shake
- 🔇 **No sign-up, no install** — Runs 100% in browser

## 🕹️ Controls

| Action | Key |
|---|---|
| Move | ← → |
| Rotate | ↑ or Z |
| Soft Drop | ↓ |
| Hard Drop | Space |
| Hold | C |

## 🚀 Deploy to Render

1. Fork or push this repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect this repo
4. **Build command:** `npm install`
5. **Start command:** `npm start`
6. Done — your game is live!

## 🛠️ Run in GitHub Codespaces (browser-only dev)

1. Open this repo on GitHub
2. Click **Code → Codespaces → Create codespace on main**
3. In the terminal: `npm install && npm start`
4. Click **Open in Browser** when port 3000 is forwarded

## 📁 Project Structure

```
├── server.js          # Express + Socket.IO server & room manager
├── package.json       # Dependencies
└── public/
    ├── index.html     # All game screens (splash, lobby, game, result)
    ├── style.css      # Neon kawaii theme
    ├── game.js        # Tetris engine, CPU AI, renderer, particles
    └── lobby.js       # Socket.IO client, lobby UI, multiplayer sync
```

## 📜 License

MIT — open source, fork it, make it yours.
