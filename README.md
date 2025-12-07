# PRIYAH ⚗️

> **An Arcane AI Assistant with Solana Vanity Wallet Forge**

A beautiful, high-fantasy themed Electron application that combines AI chat capabilities with a powerful Solana vanity address generator. Features a dynamic glassmorphic UI with customizable color harmonies and magical animations.

![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron)
![Node](https://img.shields.io/badge/Node-18+-339933?logo=node.js)
![Solana](https://img.shields.io/badge/Solana-Web3-9945FF?logo=solana)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## ✨ Features

### 🤖 AI Chat
- Local LLM support via **Ollama**
- Cloud Ollama & **Google Gemini** integration
- Web search with source verification (TruthSeeker)
- Code mode with project file management
- Multiple AI personas via the "Grimoire"

### ⚗️ Sorcerer's Forge (Vanity Wallet Generator)
- **RAW SPEED MODE**: 50,000-200,000+ keys/second
- Multi-suffix matching (e.g., `MOON,SUN,STAR`)
- Parallel worker threads (configurable CPU usage)
- Real-time telemetry dashboard
- Continuous mining with wallet collection
- One-click export to Phantom/Solflare

### 🎨 Dynamic Arcana UI
- **HSL Color Harmony System**: Pick primary color, secondary auto-calculates
- Adjustable harmony offset (0-180°)
- Magical pulse animations (toggleable)
- Resizable sidebar with drag handle
- Custom celestial cursor with lerp movement
- Glassmorphic dark fantasy theme

### 📊 System Monitoring
- Real-time CPU core visualization
- Temperature monitoring (real or synthetic fallback)
- Performance graphs and telemetry

---

## 📋 Prerequisites

Before installing PRIYAH, ensure you have:

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | 18+ | Runtime |
| **npm** | 9+ | Package manager |
| **Ollama** | Latest | Local AI (optional) |
| **Git** | Any | Cloning repo |

### Install Ollama (Recommended for AI features)

```bash
# macOS
brew install ollama

# Or download from https://ollama.ai
```

### Optional: Real CPU Temperature Monitoring

```bash
# Install osx-cpu-temp for accurate readings
brew install osx-cpu-temp
```

Without this, PRIYAH will show estimated temperatures (marked with `~`).

---

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/priyah.git
cd priyah
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Ollama (if using local AI)

```bash
# In a separate terminal
ollama serve

# Pull a model (first time only)
ollama pull llama3
```

### 4. Launch PRIYAH

```bash
npm start
```

---

## ⚙️ First-Time Setup

When PRIYAH launches for the first time:

1. **Click the ⚙️ Config button** in the header

2. **Choose your AI source:**
   - **Local (Ollama)**: Uses `http://127.0.0.1:11434` by default
   - **Cloud (Ollama Remote)**: Enter your remote Ollama URL
   - **Gemini**: Enter your Google AI API key

3. **Click "Scan"** to detect available models

4. **Select a model** (e.g., `llama3`, `mistral`, `gemma2`)

5. **(Optional)** Set a project path for Code Mode

6. **Click "Save"**

---

## 🎮 Usage Guide

### Chat Mode
- Type messages in the input field and press Enter
- Enable **Web** mode for internet-enhanced responses
- Enable **Code** mode to work with project files
- Use the **Grimoire** to activate AI personas

### Sorcerer's Forge
1. Switch to the **Forge** tab
2. Enter a prefix and/or suffixes (comma-separated)
3. Adjust worker count with the CPU slider
4. Click **Ignite** to start mining
5. Found wallets appear in the terminal below
6. Click a wallet to view details and export

### Dynamic Arcana (Theming)
1. Open **Config** → Dynamic Arcana section
2. Pick an **Accent Color** - the whole UI adapts
3. Adjust **Harmony Offset** (0° = monochrome, 180° = complementary)
4. Toggle **Magical Pulse** for breathing animations
5. Drag the sidebar edge to resize

---

## 🔧 Configuration

### Environment Variables (optional)

Create a `.env` file for defaults:

```env
OLLAMA_HOST=http://127.0.0.1:11434
GEMINI_API_KEY=your_key_here
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Cmd/Ctrl + K` | Focus input |
| `Cmd/Ctrl + S` | Save file (Code mode) |
| `Escape` | Close modals/portal |

---

## 🔐 Security Notes

- **Private keys** are stored encrypted in user data directory
- Keys are **never** transmitted over the network
- Wallet files are saved locally only
- Always verify addresses before sending funds

---

## 📁 Project Structure

```
priyah/
├── main.js           # Electron main process
├── index.html        # Frontend UI
├── styles.css        # Dynamic Arcana theme
├── wallet_engine.js  # VanityForge worker system
├── search_agent.js   # TruthSeeker web search
├── package.json      # Dependencies
└── icon.png          # App icon
```

---

## 🛠️ Development

```bash
# Run in development mode
npm start

# Package for distribution
npm run make
```

---

## 📝 Troubleshooting

### "Failed to fetch models"
- Ensure Ollama is running: `ollama serve`
- Check the host URL in Config (default: `http://127.0.0.1:11434`)

### Temperature shows `~` prefix
- This means synthetic/estimated temperature
- Install `osx-cpu-temp` for real readings: `brew install osx-cpu-temp`

### Forge is slow
- Increase worker count in the CPU slider
- Close other heavy applications
- Vanity addresses with more characters take exponentially longer

### Custom cursor not showing
- The cursor uses `mix-blend-mode: difference`
- It may be less visible on mid-gray backgrounds

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

---

## 🙏 Credits

- **Electron** - Cross-platform desktop apps
- **Ollama** - Local LLM serving
- **Solana Web3.js** - Blockchain interactions
- **Chart.js** - Telemetry graphs
- **Font Awesome** - Icons
- **Cinzel & Inter** - Typography

---

<div align="center">

**Built with 🧙‍♂️ arcane energy**

*"The forge burns eternal. The code is the spell."*

</div>
