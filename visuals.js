/**
 * ASTRAL VISUALS - Fluid Shader Background
 * Low-res pixelated smoke/fluid effect with accent color tinting
 */

class AstralVisuals {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Low-res for pixelated effect
        this.width = 150;
        this.height = 100;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        
        // Time for animation
        this.time = 0;
        this.animationId = null;
        
        // Accent color (will be updated from CSS)
        this.hue = 145; // Default green
        
        // Noise permutation table
        this.perm = this.generatePermutation();
        
        // Image data for direct pixel manipulation
        this.imageData = this.ctx.createImageData(this.width, this.height);
    }
    
    generatePermutation() {
        const p = [];
        for (let i = 0; i < 256; i++) p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        return [...p, ...p]; // Duplicate for wrapping
    }
    
    // Fade function for smoother noise
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    
    // Linear interpolation
    lerp(a, b, t) {
        return a + t * (b - a);
    }
    
    // Gradient function
    grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }
    
    // 2D Perlin noise
    noise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        
        x -= Math.floor(x);
        y -= Math.floor(y);
        
        const u = this.fade(x);
        const v = this.fade(y);
        
        const A = this.perm[X] + Y;
        const B = this.perm[X + 1] + Y;
        
        return this.lerp(
            this.lerp(
                this.grad(this.perm[A], x, y),
                this.grad(this.perm[B], x - 1, y),
                u
            ),
            this.lerp(
                this.grad(this.perm[A + 1], x, y - 1),
                this.grad(this.perm[B + 1], x - 1, y - 1),
                u
            ),
            v
        );
    }
    
    // Fractal Brownian motion for organic look
    fbm(x, y, octaves = 4) {
        let value = 0;
        let amplitude = 0.5;
        let frequency = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            value += amplitude * this.noise(x * frequency, y * frequency);
            maxValue += amplitude;
            amplitude *= 0.5;
            frequency *= 2;
        }
        
        return value / maxValue;
    }
    
    // Domain warping for fluid effect
    warpedNoise(x, y, t) {
        // First layer of warping
        const warp1X = this.fbm(x + t * 0.1, y + t * 0.05) * 2;
        const warp1Y = this.fbm(x + 5.2 + t * 0.08, y + 1.3 - t * 0.06) * 2;
        
        // Second layer of warping (domain warping)
        const warp2X = this.fbm(x + warp1X + t * 0.05, y + warp1Y - t * 0.03) * 1.5;
        const warp2Y = this.fbm(x + warp1X + 3.7 - t * 0.04, y + warp1Y + 8.3 + t * 0.02) * 1.5;
        
        // Final noise with warping
        return this.fbm(x + warp2X, y + warp2Y);
    }
    
    // Convert HSL to RGB
    hslToRgb(h, s, l) {
        h /= 360;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h * 12) % 12;
            return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        };
        return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
    }
    
    updateAccentColor() {
        const style = getComputedStyle(document.documentElement);
        const hueVal = style.getPropertyValue('--hue-primary');
        if (hueVal) {
            this.hue = parseFloat(hueVal);
        }
    }
    
    render() {
        this.updateAccentColor();
        const data = this.imageData.data;
        
        const scale = 0.02; // Noise scale
        
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                // Get warped noise value
                const n = this.warpedNoise(x * scale, y * scale, this.time);
                
                // Map noise to 0-1 range
                const value = (n + 1) * 0.5;
                
                // Create layered effect
                const base = value * 0.6;
                const highlight = Math.pow(value, 3) * 0.4;
                const combined = base + highlight;
                
                // Convert to color with accent hue
                const lightness = 0.03 + combined * 0.15; // Very dark, subtle glow
                const saturation = 0.4 + value * 0.3;
                const [r, g, b] = this.hslToRgb(this.hue, saturation, lightness);
                
                // Set pixel
                const i = (y * this.width + x) * 4;
                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
                data[i + 3] = 255;
            }
        }
        
        this.ctx.putImageData(this.imageData, 0, 0);
    }
    
    animate() {
        this.time += 0.008; // Slow movement
        this.render();
        this.animationId = requestAnimationFrame(() => this.animate());
    }
    
    start() {
        if (!this.animationId) {
            this.animate();
        }
    }
    
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
    
    // Pause when tab not visible
    handleVisibility() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stop();
            } else {
                this.start();
            }
        });
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AstralVisuals };
}
