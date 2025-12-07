/**
 * WEAVER ENGINE - Algorithmic Art Generator
 * Three reactive, mouse-interactive visualization modes
 * No AI - Pure Code Art
 */

class WeaverEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('Weaver: Canvas not found:', canvasId);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        
        // Canvas sizing - use parent or fallback to window
        this.width = 800;
        this.height = 600;
        this.resizeCanvas();
        
        // Animation state
        this.animationId = null;
        this.time = 0;
        this.mode = 'yggdrasil';
        
        // Mouse tracking
        this.mx = this.width / 2;
        this.my = this.height / 2;
        
        // Event listeners
        window.addEventListener('resize', () => this.resizeCanvas());
        window.addEventListener('mousemove', e => {
            const rect = this.canvas.getBoundingClientRect();
            this.mx = e.clientX - rect.left;
            this.my = e.clientY - rect.top;
        });
        
        // Accent color from CSS
        this.hue = 145;
        this.accentColor = '#50fa7b';
        
        // Elder Futhark runes for The Void
        this.runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛈᛇᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'.split('');
        this.runeGrid = [];
        
        // Geometry rings
        this.rings = [];
        
        console.log('Weaver Engine initialized:', this.width, 'x', this.height);
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        
        const parent = this.canvas.parentElement;
        
        // REPAIR: Check multiple sources for valid dimensions
        // Priority: parent > computed style > window fallback
        let newWidth = 0;
        let newHeight = 0;
        
        if (parent) {
            // Try offsetWidth/Height first
            if (parent.offsetWidth > 0 && parent.offsetHeight > 0) {
                newWidth = parent.offsetWidth;
                newHeight = parent.offsetHeight;
            } else {
                // Fallback: try getBoundingClientRect (works even when display:none transitioning)
                const rect = parent.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    newWidth = rect.width;
                    newHeight = rect.height;
                }
            }
        }
        
        // Ultimate fallback to window size (never allow 0x0)
        if (newWidth < 100 || newHeight < 100) {
            newWidth = window.innerWidth - 300;
            newHeight = window.innerHeight - 150;
            console.log('[WEAVER] Using window fallback:', newWidth, 'x', newHeight);
        }
        
        this.width = newWidth;
        this.height = newHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.mx = this.width / 2;
        this.my = this.height / 2;
        
        this.initGeometry();
        this.initRuneGrid();
        
        console.log('[WEAVER] Canvas resized:', this.width, 'x', this.height);
    }
    
    updateAccentColor() {
        const style = getComputedStyle(document.documentElement);
        const hueVal = style.getPropertyValue('--hue-primary');
        if (hueVal) {
            this.hue = parseFloat(hueVal);
        }
    }
    
    // ============================================
    // MODE A: YGGDRASIL - Fractal Forest
    // ============================================
    initRuneGrid() {
        this.runeGrid = [];
        const cols = 60;
        const rows = 40;
        const cellW = this.width / cols;
        const cellH = this.height / rows;
        
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                this.runeGrid.push({
                    x: x * cellW + cellW / 2,
                    y: y * cellH + cellH / 2,
                    rune: this.runes[Math.floor(Math.random() * this.runes.length)],
                    baseOpacity: Math.random() * 0.3 + 0.1
                });
            }
        }
    }
    
    drawYggdrasil() {
        this.ctx.fillStyle = 'rgba(5, 10, 8, 0.15)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Calculate wind angle based on mouse position
        const windAngle = (this.mx / this.width - 0.5) * 0.4;
        
        // Draw multiple trees at different positions
        const treeCount = 5;
        const spacing = this.width / (treeCount + 1);
        
        for (let i = 0; i < treeCount; i++) {
            const treeX = spacing * (i + 1) + Math.sin(this.time * 0.5 + i) * 20;
            const treeY = this.height;
            const treeHeight = 80 + Math.sin(this.time * 0.3 + i * 2) * 20 + (i % 2) * 40;
            const seed = i * 1000;
            
            this.drawBranch(
                treeX, 
                treeY, 
                -Math.PI / 2 + windAngle * 0.5, 
                treeHeight, 
                8,
                windAngle,
                seed
            );
        }
    }
    
    drawBranch(x, y, angle, length, depth, wind, seed) {
        if (depth <= 0 || length < 4) return;
        
        // Calculate end point with wind influence
        const windInfluence = wind * (1 - depth / 8) * 0.3;
        const finalAngle = angle + windInfluence + Math.sin(this.time * 2 + seed) * 0.02;
        
        const endX = x + Math.cos(finalAngle) * length;
        const endY = y + Math.sin(finalAngle) * length;
        
        // Draw branch with glow
        const alpha = 0.3 + (depth / 8) * 0.5;
        const hue = this.hue + (8 - depth) * 5;
        
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(endX, endY);
        this.ctx.strokeStyle = `hsla(${hue}, 60%, ${40 + depth * 5}%, ${alpha})`;
        this.ctx.lineWidth = depth * 0.8;
        this.ctx.lineCap = 'round';
        this.ctx.stroke();
        
        // Add glow for main branches
        if (depth > 4) {
            this.ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.1)`;
            this.ctx.lineWidth = depth * 2;
            this.ctx.stroke();
        }
        
        // Recursive branching
        const branchAngle = 0.4 + Math.random() * 0.3;
        const lengthFactor = 0.65 + Math.random() * 0.15;
        
        // Left branch
        this.drawBranch(
            endX, endY, 
            finalAngle - branchAngle, 
            length * lengthFactor, 
            depth - 1, 
            wind,
            seed + 1
        );
        
        // Right branch
        this.drawBranch(
            endX, endY, 
            finalAngle + branchAngle, 
            length * lengthFactor, 
            depth - 1, 
            wind,
            seed + 2
        );
        
        // Sometimes add a third branch
        if (Math.random() > 0.6 && depth > 3) {
            this.drawBranch(
                endX, endY, 
                finalAngle + (Math.random() - 0.5) * 0.5, 
                length * lengthFactor * 0.8, 
                depth - 2, 
                wind,
                seed + 3
            );
        }
    }
    
    // ============================================
    // MODE B: THE VOID - Rune Dithering
    // ============================================
    drawVoid() {
        this.ctx.fillStyle = 'rgba(3, 8, 6, 0.3)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        const lanternRadius = 150;
        
        this.ctx.font = '14px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        for (const cell of this.runeGrid) {
            // Distance from mouse (lantern)
            const dx = cell.x - this.mx;
            const dy = cell.y - this.my;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Lantern effect - brighter near mouse
            let brightness = cell.baseOpacity;
            let runeIndex = Math.floor(this.runes.length * 0.8); // Dense by default
            
            if (dist < lanternRadius) {
                const factor = 1 - (dist / lanternRadius);
                brightness = cell.baseOpacity + factor * 0.8;
                // Shift to lighter runes near cursor
                runeIndex = Math.floor((1 - factor) * this.runes.length * 0.7);
            }
            
            // Add time-based shimmer
            brightness += Math.sin(this.time * 3 + cell.x * 0.1 + cell.y * 0.1) * 0.05;
            
            const rune = this.runes[Math.min(runeIndex, this.runes.length - 1)];
            const hue = this.hue + (dist < lanternRadius ? 20 : 0);
            
            this.ctx.fillStyle = `hsla(${hue}, 50%, ${50 + brightness * 30}%, ${brightness})`;
            this.ctx.fillText(rune, cell.x, cell.y);
        }
        
        // Draw lantern glow at cursor
        const gradient = this.ctx.createRadialGradient(this.mx, this.my, 0, this.mx, this.my, lanternRadius);
        gradient.addColorStop(0, `hsla(${this.hue}, 60%, 60%, 0.1)`);
        gradient.addColorStop(0.5, `hsla(${this.hue}, 50%, 40%, 0.03)`);
        gradient.addColorStop(1, 'transparent');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
    
    // ============================================
    // MODE C: SACRED GEOMETRY - Mandala
    // ============================================
    initGeometry() {
        this.rings = [];
        const ringCount = 12;
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const maxRadius = Math.min(this.width, this.height) * 0.4;
        
        // Prime numbers for rotation speeds
        const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37];
        
        for (let i = 0; i < ringCount; i++) {
            const radius = (maxRadius / ringCount) * (i + 1);
            const dotCount = 8 + i * 4;
            const speed = primes[i] * 0.001 * (i % 2 === 0 ? 1 : -1);
            
            this.rings.push({
                radius,
                dotCount,
                speed,
                rotation: Math.random() * Math.PI * 2,
                dots: []
            });
            
            // Initialize dots
            for (let j = 0; j < dotCount; j++) {
                const angle = (j / dotCount) * Math.PI * 2;
                this.rings[i].dots.push({
                    baseAngle: angle,
                    size: 2 + (ringCount - i) * 0.3
                });
            }
        }
    }
    
    drawGeometry() {
        this.ctx.fillStyle = 'rgba(5, 10, 8, 0.1)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        const centerX = this.width / 2;
        const centerY = this.height / 2;
        const magnetRadius = 200;
        
        // Distance from center to mouse
        const mdx = this.mx - centerX;
        const mdy = this.my - centerY;
        const mouseDist = Math.sqrt(mdx * mdx + mdy * mdy);
        const mouseAngle = Math.atan2(mdy, mdx);
        
        for (const ring of this.rings) {
            ring.rotation += ring.speed;
            
            for (const dot of ring.dots) {
                const angle = dot.baseAngle + ring.rotation;
                
                // Calculate base position
                let x = centerX + Math.cos(angle) * ring.radius;
                let y = centerY + Math.sin(angle) * ring.radius;
                
                // Apply magnetic warp from cursor
                const dx = x - this.mx;
                const dy = y - this.my;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < magnetRadius) {
                    const force = (1 - dist / magnetRadius) * 30;
                    x += (dx / dist) * force;
                    y += (dy / dist) * force;
                }
                
                // Draw dot with glow
                const hue = this.hue + (ring.radius / 10);
                const alpha = 0.6 + Math.sin(this.time * 2 + angle) * 0.2;
                
                // Glow
                this.ctx.beginPath();
                this.ctx.arc(x, y, dot.size * 3, 0, Math.PI * 2);
                this.ctx.fillStyle = `hsla(${hue}, 60%, 50%, 0.1)`;
                this.ctx.fill();
                
                // Core
                this.ctx.beginPath();
                this.ctx.arc(x, y, dot.size, 0, Math.PI * 2);
                this.ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${alpha})`;
                this.ctx.fill();
            }
        }
        
        // Draw connecting lines between adjacent ring dots
        this.ctx.strokeStyle = `hsla(${this.hue}, 40%, 40%, 0.1)`;
        this.ctx.lineWidth = 0.5;
        
        for (let i = 0; i < this.rings.length - 1; i++) {
            const ring = this.rings[i];
            const nextRing = this.rings[i + 1];
            
            for (let j = 0; j < Math.min(ring.dotCount, 8); j++) {
                const angle1 = ring.dots[j].baseAngle + ring.rotation;
                const angle2 = nextRing.dots[j % nextRing.dotCount].baseAngle + nextRing.rotation;
                
                const x1 = centerX + Math.cos(angle1) * ring.radius;
                const y1 = centerY + Math.sin(angle1) * ring.radius;
                const x2 = centerX + Math.cos(angle2) * nextRing.radius;
                const y2 = centerY + Math.sin(angle2) * nextRing.radius;
                
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
            }
        }
    }
    
    // ============================================
    // MAIN RENDER LOOP
    // ============================================
    render() {
        if (!this.canvas || !this.ctx) return;
        
        this.updateAccentColor();
        this.time += 0.016;
        
        // Trail effect - transparent fade
        this.ctx.fillStyle = 'rgba(5, 10, 5, 0.08)';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        switch (this.mode) {
            case 'yggdrasil':
                this.drawYggdrasil();
                break;
            case 'void':
                this.drawVoid();
                break;
            case 'geometry':
                this.drawGeometry();
                break;
        }
    }
    
    animate() {
        this.render();
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    start() {
        if (!this.canvas) return;
        this.resizeCanvas();
        if (!this.animationId) {
            console.log('Weaver: Starting animation, mode:', this.mode);
            this.animate();
        }
    }
    
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    setMode(mode) {
        this.mode = mode;
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
        if (mode === 'void') this.initRuneGrid();
        if (mode === 'geometry') this.initGeometry();
        console.log('Weaver: Mode changed to', mode);
    }
}

// Export for Electron
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WeaverEngine };
}
