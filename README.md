# PRIYAH

> **An Arcane AI Assistant with Solana Vanity Wallet Forge**

A fantasy-themed Electron application combining AI chat with a high-speed Solana vanity address generator. Features dynamic glassmorphic UI with customizable color harmonies.

![Electron](https://img.shields.io/badge/Electron-29-47848F?logo=electron)
![Node](https://img.shields.io/badge/Node-18+-339933?logo=node.js)
![Solana](https://img.shields.io/badge/Solana-Web3-9945FF?logo=solana)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## Features

### AI Chat
- Local LLM support via **Ollama**
- Cloud Ollama & **Google Gemini** integration
- Web search with source verification (TruthSeeker)
- Code mode with project file management

### Sorcerer's Forge (Vanity Wallet Generator)
- **RAW SPEED MODE**: 50,000-200,000+ keys/second
- Multi-suffix matching (e.g., `MOON,SUN,STAR`)
- Parallel worker threads (configurable CPU usage)
- Real-time telemetry dashboard
- One-click export to Phantom/Solflare

### Dynamic Arcana UI
- **HSL Color Harmony System**: Pick primary color, secondary auto-calculates
- Adjustable harmony offset (0-180°)
- Astral fluid shader background
- Glassmorphic dark fantasy theme

---

## Installation

### Mac / Linux

#### Prerequisites

```bash
# Check Node.js (requires 18+)
node --version

# If not installed, use Homebrew (Mac) or your package manager
brew install node

# Or use nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
```

#### Install Ollama (for local AI)

```bash
# Mac
brew install ollama

# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

#### Optional: CPU Temperature Monitoring

```bash
# Mac - for accurate readings instead of estimates
brew install osx-cpu-temp

# Linux - install lm-sensors
sudo apt install lm-sensors  # Debian/Ubuntu
sudo sensors-detect
```

#### Clone & Run

```bash
git clone https://github.com/xiello/priyah.git
cd priyah
npm install
npm start
```

#### Start Ollama (separate terminal)

```bash
ollama serve
ollama pull llama3  # First time only
```

---

### Windows

#### Prerequisites

1. **Install Node.js 18+**
   - Download from [nodejs.org](https://nodejs.org/)
   - Choose the LTS version
   - Run installer, check "Add to PATH"

2. **Install Git**
   - Download from [git-scm.com](https://git-scm.com/download/win)
   - Use default settings

3. **Verify installation** (open PowerShell or Command Prompt):
   ```powershell
   node --version
   git --version
   ```

#### Install Ollama (for local AI)

1. Download from [ollama.com/download](https://ollama.com/download)
2. Run the installer
3. Ollama runs automatically in the system tray

#### Clone & Run

Open PowerShell or Command Prompt:

```powershell
git clone https://github.com/xiello/priyah.git
cd priyah
npm install
npm start
```

#### Pull an AI model (first time)

```powershell
ollama pull llama3
```

---

### Pre-built Releases (Windows/Mac/Linux)

Download ready-to-run executables from the [Releases](https://github.com/xiello/priyah/releases) page:

| Platform | File |
|----------|------|
| Windows | `Priyah-1.0.0-Setup.exe` |
| macOS | `Priyah-1.0.0.dmg` |
| Linux | `Priyah-1.0.0.AppImage` |

> **Note:** You still need Ollama installed separately for local AI features.

---

## First-Time Setup

1. **Click Config** in the header
2. **Choose AI source:**
   - **Local (Ollama)**: Default `http://127.0.0.1:11434`
   - **Cloud (Ollama Remote)**: Enter remote URL
   - **Gemini**: Enter Google AI API key
3. **Click Scan** to detect models
4. **Select a model** (e.g., `llama3`, `mistral`)
5. **Click Save**

---

## Usage

### Chat
- Type messages and press Enter
- Enable **Web** for internet-enhanced responses
- Enable **Code** to work with project files

### Forge (Vanity Wallet)
1. Switch to **Forge** tab
2. Enter prefix/suffixes (comma-separated)
3. Adjust CPU slider for worker count
4. Click **Ignite** to start
5. Click found wallets to export

### Theming
- Open **Config** → Dynamic Arcana
- Pick **Accent Color** - UI adapts automatically
- Adjust **Harmony Offset** (0-180°)

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Cmd/Ctrl + S` | Save file (Code mode) |
| `Escape` | Close modals |

---

## Security

- Private keys stored encrypted locally
- Keys never transmitted over network
- Always verify addresses before sending funds

---

## Troubleshooting

### "Failed to fetch models"
- Ensure Ollama is running: `ollama serve`
- Check host URL in Config

### Temperature shows `~`
- Estimated reading (real sensor not found)
- Mac: `brew install osx-cpu-temp`
- Linux: `sudo apt install lm-sensors`

### Forge is slow
- Increase worker count
- Longer patterns = exponentially more time

---

## Building from Source

```bash
# Development
npm start

# Build executables
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

Outputs go to `dist/` folder.

---

## License

MIT License - See [LICENSE](LICENSE)

---

## Credits

Electron | Ollama | Solana Web3.js | Chart.js | Font Awesome

---

<div align="center">
<i>"The forge burns eternal."</i>
</div>
