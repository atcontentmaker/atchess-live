/**
 * victory-animation.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Cinematic victory / defeat / resign animations for ATChess Live.
 *
 * WIN  - smooth ~120fps trophy presentation with particles, confetti,
 *         shimmer rays, and a crown drop sequence.
 * LOSE - same trophy begins to rise, then a robot villain crashes in,
 *         snatches the cup with an evil grin, and drags it off-screen.
 *
 * Integration: drop this file next to l.html and add
 *   <script src="victory-animation.js"></script>
 * anywhere after the main inline <script>.
 *
 * The module patches window.updateStatus so it fires automatically on
 * checkmate. No other files are modified.
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

(function () {
    'use strict';

    // Cooldown guard so the animation does not replay on every updateStatus call.
    let _animPlayed = false;
    window.__vaResignRequested = false;

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Style injection
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function injectStyles() {
        if (document.getElementById('va-styles')) return;
        const s = document.createElement('style');
        s.id = 'va-styles';
        s.textContent = `
            @keyframes va-backdrop-in {
                from { opacity: 0; }
                to   { opacity: 1; }
            }
            @keyframes va-trophy-rise {
                0%   { transform: translateY(120px) scale(0.6); opacity: 0; }
                60%  { transform: translateY(-14px) scale(1.05); opacity: 1; }
                80%  { transform: translateY(6px) scale(0.98); opacity: 1; }
                100% { transform: translateY(0px) scale(1); opacity: 1; }
            }
            @keyframes va-trophy-bob {
                0%, 100% { transform: translateY(0px) scale(1); }
                50%       { transform: translateY(-8px) scale(1.02); }
            }
            @keyframes va-ray-spin {
                from { transform: rotate(0deg); }
                to   { transform: rotate(360deg); }
            }
            @keyframes va-crown-drop {
                0%   { transform: translateY(-80px) rotate(-15deg); opacity: 0; }
                65%  { transform: translateY(8px) rotate(4deg); opacity: 1; }
                80%  { transform: translateY(-4px) rotate(-2deg); }
                100% { transform: translateY(0) rotate(0deg); opacity: 1; }
            }
            @keyframes va-title-in {
                0%   { transform: scale(0.5) translateY(30px); opacity: 0; letter-spacing: 0.5em; }
                70%  { transform: scale(1.07) translateY(-4px); opacity: 1; letter-spacing: 0.1em; }
                100% { transform: scale(1) translateY(0); opacity: 1; letter-spacing: 0.08em; }
            }
            @keyframes va-subtitle-in {
                from { opacity: 0; transform: translateY(16px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes va-btn-in {
                from { opacity: 0; transform: translateY(10px) scale(0.92); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes va-shimmer {
                0%   { left: -100%; }
                100% { left: 150%; }
            }
            @keyframes va-particle-float {
                0%   { transform: translate(0,0) rotate(0deg) scale(1); opacity: 1; }
                100% { transform: var(--va-tx) rotate(var(--va-rot)) scale(0.3); opacity: 0; }
            }
            @keyframes va-robot-slide-in {
                0%   { transform: translateX(460px) rotate(8deg) scale(0.85); opacity: 0; }
                55%  { transform: translateX(-18px) rotate(-3deg) scale(1.04); opacity: 1; }
                75%  { transform: translateX(8px) rotate(1deg) scale(1); opacity: 1; }
                100% { transform: translateX(0) rotate(0deg) scale(1); opacity: 1; }
            }
            @keyframes va-trophy-grabbed {
                0%   { transform: translateY(0) rotate(0deg); }
                40%  { transform: translateY(-30px) rotate(-12deg) scale(0.95); }
                100% { transform: translateX(340px) translateY(-60px) rotate(25deg) scale(0.7); opacity: 0; }
            }
            @keyframes va-robot-exit {
                0%   { transform: translateX(0) rotate(0deg); opacity: 1; }
                100% { transform: translateX(520px) rotate(12deg); opacity: 0; }
            }
            @keyframes va-evil-pulse {
                0%, 100% { filter: drop-shadow(0 0 6px #e05252); }
                50%       { filter: drop-shadow(0 0 22px #e05252) drop-shadow(0 0 8px #ff8a00); }
            }
            @keyframes va-close-bounce {
                0%   { transform: scale(0.7); opacity: 0; }
                80%  { transform: scale(1.08); opacity: 1; }
                100% { transform: scale(1); opacity: 1; }
            }
            @keyframes va-flag-wave {
                0%   { transform: translateX(-22px) rotate(-12deg); }
                50%  { transform: translateX(0) rotate(0deg); }
                100% { transform: translateX(22px) rotate(12deg); }
            }
            @keyframes va-laugh-pop {
                0%   { opacity: 0; transform: translateY(12px) scale(0.85); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes va-confetti-fall {
                0%   { transform: translateY(-30px) rotate(0deg); opacity: 1; }
                100% { transform: translateY(var(--va-cy)) rotate(var(--va-crot)); opacity: 0; }
            }
            #va-overlay {
                position: fixed; inset: 0; z-index: 99999;
                display: flex; align-items: center; justify-content: center;
                background: rgba(10, 9, 8, 0.88);
                animation: va-backdrop-in 0.4s ease forwards;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            #va-stage {
                position: relative;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                width: 480px; min-height: 460px;
                overflow: hidden;
            }
            #va-close-btn {
                position: absolute; top: -8px; right: -8px;
                width: 36px; height: 36px; border-radius: 50%;
                background: #3d3b37; color: #bababa; border: 1px solid #555;
                font-size: 16px; cursor: pointer; display: flex;
                align-items: center; justify-content: center;
                animation: va-close-bounce 0.35s 1.8s ease both;
                transition: background 0.15s, color 0.15s;
                z-index: 10;
            }
            #va-close-btn:hover { background: #e05252; color: white; }
        `;
        document.head.appendChild(s);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // SVG assets (inline, no external files)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    function trophySVG(scale = 1) {
        const s = scale;
        return `
        <svg id="va-trophy-svg" xmlns="http://www.w3.org/2000/svg"
             viewBox="0 0 120 140" width="${120*s}" height="${140*s}"
             style="display:block; filter: drop-shadow(0 8px 24px rgba(255,200,50,0.45));">
          <defs>
            <linearGradient id="cup-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffe066"/>
              <stop offset="50%" stop-color="#ffd700"/>
              <stop offset="100%" stop-color="#b8860b"/>
            </linearGradient>
            <linearGradient id="cup-shine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#fff9c4" stop-opacity="0.7"/>
              <stop offset="100%" stop-color="#ffd700" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="base-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#d4a017"/>
              <stop offset="100%" stop-color="#8b6914"/>
            </linearGradient>
          </defs>

          <!-- Handles -->
          <path d="M28 44 Q8 44 10 62 Q12 76 28 74" stroke="#b8860b" stroke-width="4"
                fill="none" stroke-linecap="round"/>
          <path d="M92 44 Q112 44 110 62 Q108 76 92 74" stroke="#b8860b" stroke-width="4"
                fill="none" stroke-linecap="round"/>

          <!-- Cup body -->
          <path d="M28 24 L28 74 Q28 96 60 100 Q92 96 92 74 L92 24 Z"
                fill="url(#cup-g)" stroke="#b8860b" stroke-width="1.5"/>

          <!-- Shine overlay -->
          <path d="M36 28 L36 72 Q36 88 60 91 L60 28 Z"
                fill="url(#cup-shine)" opacity="0.55"/>

          <!-- Stem -->
          <rect x="48" y="100" width="24" height="18" rx="3"
                fill="url(#base-g)" stroke="#8b6914" stroke-width="1"/>

          <!-- Base -->
          <rect x="34" y="116" width="52" height="14" rx="5"
                fill="url(#base-g)" stroke="#8b6914" stroke-width="1.5"/>

          <!-- Star on cup -->
          <text x="60" y="70" text-anchor="middle" font-size="26"
                fill="#fff9c4" opacity="0.85">&#9733;</text>
        </svg>`;
    }

    function crownSVG() {
        return `
        <svg id="va-crown" xmlns="http://www.w3.org/2000/svg"
             viewBox="0 0 80 46" width="80" height="46"
             style="display:block; margin:0 auto -6px;
                    animation: va-crown-drop 0.65s 0.85s cubic-bezier(0.34,1.56,0.64,1) both;
                    filter: drop-shadow(0 4px 12px rgba(255,200,50,0.6));">
          <polygon points="4,42 4,16 22,30 40,6 58,30 76,16 76,42"
                   fill="#ffd700" stroke="#b8860b" stroke-width="2" stroke-linejoin="round"/>
          <circle cx="4"  cy="14" r="4" fill="#ff6b6b"/>
          <circle cx="40" cy="4"  r="4" fill="#ff6b6b"/>
          <circle cx="76" cy="14" r="4" fill="#ff6b6b"/>
        </svg>`;
    }

    function robotSVG() {
        return `
        <svg id="va-robot" xmlns="http://www.w3.org/2000/svg"
             viewBox="0 0 150 230" width="152" height="210"
             style="display:block; position:absolute; right:0; bottom:20px;
                    animation: va-robot-slide-in 0.7s cubic-bezier(0.34,1.2,0.64,1) both;
                    filter: drop-shadow(0 0 18px rgba(224,82,82,0.58));
                    transform-origin: bottom center;">
          <defs>
            <linearGradient id="va-robot-red" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#6a0f14"/><stop offset="55%" stop-color="#a51620"/><stop offset="100%" stop-color="#45060b"/>
            </linearGradient>
            <linearGradient id="va-metal-dark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#2f3339"/><stop offset="100%" stop-color="#15181d"/>
            </linearGradient>
            <radialGradient id="va-eye-r" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stop-color="#ffffff"/><stop offset="35%" stop-color="#ff7171"/><stop offset="100%" stop-color="#d00808"/>
            </radialGradient>
          </defs>
          <polygon points="48,40 104,40 116,85 35,85" fill="url(#va-robot-red)" stroke="#d43a3a" stroke-width="2.3"/>
          <rect x="30" y="84" width="88" height="78" rx="12" fill="url(#va-robot-red)" stroke="#d43a3a" stroke-width="2.6"/>
          <rect x="42" y="95" width="64" height="24" rx="6" fill="url(#va-metal-dark)" stroke="#7d8898" stroke-width="1.3"/>
          <circle cx="74" cy="64" r="14" fill="#0f1115" stroke="#5e6572" stroke-width="2.1"/>
          <circle cx="74" cy="64" r="9" fill="url(#va-eye-r)"/>
          <circle cx="71" cy="61" r="2.7" fill="#fff" opacity="0.9"/>
          <path d="M58 76 L90 76 L84 88 L64 88 Z" fill="#1b1f25" stroke="#8e9bab" stroke-width="1.4"/>
          <path d="M60 33 L88 33 L82 24 L66 24 Z" fill="#2b3037" stroke="#8e9bab" stroke-width="1.2"/>
          <circle cx="74" cy="19" r="4.7" fill="#d70000"/>
          <rect x="10" y="96" width="34" height="14" rx="7" fill="url(#va-metal-dark)" stroke="#808a98" stroke-width="1.8"/>
          <rect x="0" y="109" width="22" height="11" rx="5.5" fill="#262b31" stroke="#808a98" stroke-width="1.6"/>
          <polygon points="0,114 -6,109 -6,119" fill="#b9c4d3"/>
          <rect x="108" y="92" width="35" height="14" rx="7" fill="url(#va-metal-dark)" stroke="#808a98" stroke-width="1.8"/>
          <rect x="128" y="84" width="20" height="11" rx="5.5" fill="#262b31" stroke="#808a98" stroke-width="1.6"/>
          <polygon points="148,90 154,86 154,96" fill="#b9c4d3"/>
          <rect x="52" y="162" width="44" height="20" rx="8" fill="#181b20" stroke="#7d8898" stroke-width="1.7"/>
          <rect x="54" y="181" width="16" height="33" rx="6" fill="#2b3037" stroke="#8e9bab" stroke-width="1.8"/>
          <rect x="80" y="181" width="16" height="33" rx="6" fill="#2b3037" stroke="#8e9bab" stroke-width="1.8"/>
          <rect x="48" y="211" width="24" height="10" rx="5" fill="#3b424d" stroke="#9aa5b4" stroke-width="1.5"/>
          <rect x="78" y="211" width="24" height="10" rx="5" fill="#3b424d" stroke="#9aa5b4" stroke-width="1.5"/>
        </svg>`;
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Particles
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    function spawnParticles(container, count, colors, x0, y0) {
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            const angle  = Math.random() * Math.PI * 2;
            const dist   = 80 + Math.random() * 180;
            const tx     = Math.cos(angle) * dist;
            const ty     = Math.sin(angle) * dist - 60;
            const rot    = (Math.random() - 0.5) * 720;
            const size   = 5 + Math.random() * 9;
            const color  = colors[Math.floor(Math.random() * colors.length)];
            const delay  = Math.random() * 0.4;
            const dur    = 0.8 + Math.random() * 0.8;
            const shape  = Math.random() > 0.5 ? '50%' : '2px';

            p.style.cssText = `
                position: absolute;
                left: ${x0 + (Math.random() - 0.5) * 40}px;
                top: ${y0 + (Math.random() - 0.5) * 20}px;
                width: ${size}px; height: ${size}px;
                background: ${color};
                border-radius: ${shape};
                --va-tx: translate(${tx}px, ${ty}px);
                --va-rot: ${rot}deg;
                animation: va-particle-float ${dur}s ${delay}s ease-out both;
                pointer-events: none;
            `;
            container.appendChild(p);
            setTimeout(() => p.remove(), (delay + dur + 0.1) * 1000);
        }
    }

    function spawnConfetti(container, count) {
        const confettiColors = ['#ffd700','#ff6b6b','#1baca6','#95bb4a','#a78bfa','#f472b6','#38bdf8'];
        for (let i = 0; i < count; i++) {
            const c    = document.createElement('div');
            const color = confettiColors[Math.floor(Math.random() * confettiColors.length)];
            const left  = 10 + Math.random() * 80;
            const cy    = 180 + Math.random() * 160;
            const rot   = (Math.random() - 0.5) * 1440 + 'deg';
            const delay = Math.random() * 1.8;
            const dur   = 1.4 + Math.random() * 1.2;
            const w     = 6 + Math.random() * 10;
            const h     = 3 + Math.random() * 6;

            c.style.cssText = `
                position: absolute;
                left: ${left}%;
                top: 0;
                width: ${w}px; height: ${h}px;
                background: ${color};
                border-radius: 2px;
                --va-cy: ${cy}px;
                --va-crot: ${rot};
                animation: va-confetti-fall ${dur}s ${delay}s ease-in both;
                pointer-events: none;
            `;
            container.appendChild(c);
            setTimeout(() => c.remove(), (delay + dur + 0.2) * 1000);
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //  SUNRAYS CANVAS  (requestAnimationFrame, ~120fps)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    function buildRayCanvas(container) {
        const canvas = document.createElement('canvas');
        canvas.width  = 480;
        canvas.height = 480;
        canvas.style.cssText = `
            position: absolute; inset: 0;
            width: 100%; height: 100%;
            pointer-events: none;
            opacity: 0.18;
        `;
        container.insertBefore(canvas, container.firstChild);

        const ctx  = canvas.getContext('2d');
        const cx   = 240, cy = 200;
        const RAY_COUNT = 18;
        let angle  = 0;
        let raf;

        function draw() {
            ctx.clearRect(0, 0, 480, 480);
            for (let i = 0; i < RAY_COUNT; i++) {
                const a  = angle + (i * Math.PI * 2) / RAY_COUNT;
                const grd = ctx.createLinearGradient(cx, cy, cx + Math.cos(a) * 280, cy + Math.sin(a) * 280);
                grd.addColorStop(0,   'rgba(255,215,0,0.9)');
                grd.addColorStop(1,   'rgba(255,215,0,0)');
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                const spread = 0.07;
                ctx.arc(cx, cy, 260, a - spread, a + spread);
                ctx.closePath();
                ctx.fillStyle = grd;
                ctx.fill();
            }
            angle += 0.008;
            raf = requestAnimationFrame(draw);
        }
        draw();
        return { canvas, stop: () => cancelAnimationFrame(raf) };
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Win animation
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    function playVictory() {
        injectStyles();

        const overlay = document.createElement('div');
        overlay.id = 'va-overlay';

        const stage = document.createElement('div');
        stage.id = 'va-stage';

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.id = 'va-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.onclick = () => { rayObj.stop(); overlay.remove(); };
        stage.appendChild(closeBtn);

        // Rays canvas (behind everything)
        const rayObj = buildRayCanvas(stage);

        // Crown (drops onto trophy)
        const crownWrap = document.createElement('div');
        crownWrap.innerHTML = crownSVG();
        crownWrap.style.cssText = 'position:relative; z-index:2;';
        stage.appendChild(crownWrap);

        // Trophy
        const trophyWrap = document.createElement('div');
        trophyWrap.id = 'va-trophy-wrap';
        trophyWrap.innerHTML = trophySVG(1.55);
        trophyWrap.style.cssText = `
            position: relative; z-index: 2;
            animation: va-trophy-rise 0.75s cubic-bezier(0.34,1.2,0.64,1) both;
            margin-top: -10px;
        `;
        stage.appendChild(trophyWrap);

        // Shimmer bar on trophy
        const shimmer = document.createElement('div');
        shimmer.style.cssText = `
            position: absolute; top: 30px; left: 0; right: 0; height: 180px;
            overflow: hidden; pointer-events: none; z-index: 3;
        `;
        const shimmerBar = document.createElement('div');
        shimmerBar.style.cssText = `
            position: absolute; top: 0; left: -100%;
            width: 40%; height: 100%;
            background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.38) 50%, transparent 70%);
            animation: va-shimmer 2.2s 1.1s infinite linear;
        `;
        shimmer.appendChild(shimmerBar);
        trophyWrap.appendChild(shimmer);

        // Title
        const title = document.createElement('div');
        title.textContent = 'VICTORY!';
        title.style.cssText = `
            font-size: 46px; font-weight: 900; letter-spacing: 0.08em;
            color: #ffd700; text-shadow: 0 0 30px rgba(255,215,0,0.5);
            animation: va-title-in 0.6s 0.55s cubic-bezier(0.34,1.4,0.64,1) both;
            position: relative; z-index: 2; margin-top: 10px;
        `;
        stage.appendChild(title);

        // Subtitle
        const sub = document.createElement('div');
        sub.textContent = 'A clean win. Well played.';
        sub.style.cssText = `
            font-size: 16px; color: #bababa; letter-spacing: 0.04em;
            animation: va-subtitle-in 0.5s 1.05s ease both;
            position: relative; z-index: 2; margin-top: 6px;
        `;
        stage.appendChild(sub);

        // Buttons row
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:12px; margin-top:28px; position:relative; z-index:2;';

        const btnStyle = `
            padding: 11px 26px; font-size: 14px; font-weight: 700;
            border: none; border-radius: 4px; cursor: pointer;
            animation: va-btn-in 0.4s 1.3s ease both; letter-spacing: 0.05em;
            transition: transform 0.1s, box-shadow 0.15s;
        `;
        const newGame = document.createElement('button');
        newGame.textContent = 'New Game';
        newGame.style.cssText = btnStyle + 'background:#779556; color:#fff;';
        newGame.addEventListener('mouseenter', () => newGame.style.transform = 'scale(1.04)');
        newGame.addEventListener('mouseleave', () => newGame.style.transform = 'scale(1)');
        newGame.onclick = () => { rayObj.stop(); overlay.remove(); if (typeof resetGame === 'function') resetGame(); };

        const analyseBtn = document.createElement('button');
        analyseBtn.textContent = 'Analyse';
        analyseBtn.style.cssText = btnStyle + 'background:#3d3b37; color:#bababa; border:1px solid #555;';
        analyseBtn.addEventListener('mouseenter', () => analyseBtn.style.transform = 'scale(1.04)');
        analyseBtn.addEventListener('mouseleave', () => analyseBtn.style.transform = 'scale(1)');
        analyseBtn.onclick = () => {
            rayObj.stop(); overlay.remove();
            const btn = document.getElementById('analysis-trigger-btn');
            if (btn) btn.click();
        };

        btnRow.appendChild(newGame);
        btnRow.appendChild(analyseBtn);
        stage.appendChild(btnRow);

        overlay.appendChild(stage);
        document.body.appendChild(overlay);

        // Bob trophy after rise
        setTimeout(() => {
            trophyWrap.style.animation = 'va-trophy-bob 2.8s 0s ease-in-out infinite';
        }, 900);

        // Confetti burst
        setTimeout(() => spawnConfetti(stage, 70), 550);

        // Particle bursts from trophy
        setTimeout(() => {
            const rect = trophyWrap.getBoundingClientRect();
            const stageRect = stage.getBoundingClientRect();
            const x = rect.left - stageRect.left + rect.width / 2;
            const y = rect.top  - stageRect.top  + rect.height / 2;
            spawnParticles(stage, 40, ['#ffd700','#ffe066','#ffeb3b','#fff176','#ffffff'], x, y);
        }, 600);
        setTimeout(() => {
            const rect = trophyWrap.getBoundingClientRect();
            const stageRect = stage.getBoundingClientRect();
            const x = rect.left - stageRect.left + rect.width / 2;
            const y = rect.top  - stageRect.top  + rect.height / 2;
            spawnParticles(stage, 25, ['#1baca6','#95bb4a','#a78bfa','#f472b6'], x, y);
        }, 950);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Defeat animation
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    
    function whiteFlagSVG() {
        return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="116" height="116" style="display:block; filter: drop-shadow(0 4px 12px rgba(255,255,255,0.22));">
          <rect x="16" y="14" width="7" height="92" rx="3.5" fill="#b6bcc8"/>
          <path d="M23 18 C48 8, 77 22, 100 14 L100 58 C78 66, 49 50, 23 61 Z" fill="#f7fafc" stroke="#d9dee6" stroke-width="2"/>
          <path d="M23 33 C46 25, 74 40, 100 31" fill="none" stroke="#d8dde5" stroke-width="2" opacity="0.75"/>
        </svg>`;
    }

    function playDefeat(options = {}) {
        const isResign = !!((options && options.resign) || window.__vaResignRequested);
        window.__vaResignRequested = false;
        injectStyles();

        const overlay = document.createElement('div');
        overlay.id = 'va-overlay';

        const stage = document.createElement('div');
        stage.id = 'va-stage';
        stage.style.position = 'relative';

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.id = 'va-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.style.animationDelay = '3.5s';
        stage.appendChild(closeBtn);

        // Dim rays (muted, sad)
        const rayObj = buildRayCanvas(stage);
        rayObj.canvas.style.opacity = '0.07';

        // Trophy — starts rising then gets interrupted
        const trophyWrap = document.createElement('div');
        trophyWrap.id = 'va-trophy-wrap';
        trophyWrap.innerHTML = trophySVG(1.4);
        trophyWrap.style.cssText = `
            position: relative; z-index: 2;
            animation: va-trophy-rise 0.7s cubic-bezier(0.34,1.2,0.64,1) both;
        `;
        stage.appendChild(trophyWrap);

        if (isResign) {
            const flagWrap = document.createElement('div');
            flagWrap.innerHTML = whiteFlagSVG();
            flagWrap.style.cssText = `
                position: relative; z-index: 3;
                margin-top: 8px; margin-bottom: -2px;
                animation: va-flag-wave 1.0s ease-in-out infinite alternate;
                transform-origin: 18% 16%;
                pointer-events: none;
            `;
            stage.appendChild(flagWrap);
        }

        // Outcome title
        const title = document.createElement('div');
        title.textContent = isResign ? 'RESIGNED' : 'DEFEATED';
        title.style.cssText = `
            font-size: 40px; font-weight: 900; letter-spacing: 0.08em;
            color: #bababa;
            animation: va-title-in 0.5s 0.55s cubic-bezier(0.34,1.4,0.64,1) both;
            position: relative; z-index: 2; margin-top: 12px;
        `;
        stage.appendChild(title);

        const sub = document.createElement('div');
        sub.textContent = isResign ? 'You conceded the match.' : 'Your opponent takes the win this round.';
        sub.style.cssText = `
            font-size: 15px; color: #666; letter-spacing: 0.03em;
            animation: va-subtitle-in 0.4s 1.0s ease both;
            position: relative; z-index: 2; margin-top: 6px;
        `;
        stage.appendChild(sub);

        overlay.appendChild(stage);
        document.body.appendChild(overlay);

        // ── Phase 2: robot crashes in at ~1.4s ───────────────────────────────
        setTimeout(() => {
            const robotWrap = document.createElement('div');
            let laugh = null;
            robotWrap.innerHTML = robotSVG();
            robotWrap.style.cssText = `
                position: absolute; bottom: 0; right: -10px; z-index: 5;
                overflow: visible;
                transform-origin: bottom center;
                animation: va-robot-slide-in 0.7s cubic-bezier(0.34,1.2,0.64,1) both;
            `;
            stage.appendChild(robotWrap);

            const robotSvg = robotWrap.querySelector('svg');
            if (robotSvg) robotSvg.style.animation = 'va-evil-pulse 1.2s 0.8s ease-in-out infinite';

            if (isResign) {
                laugh = document.createElement('div');
                laugh.textContent = 'HA  HA  HA';
                laugh.style.cssText = `
                    position: absolute; right: 118px; top: 96px; z-index: 8;
                    padding: 8px 12px; border-radius: 14px;
                    background: rgba(14,14,14,0.78); border: 1px solid rgba(224,82,82,0.46);
                    color: #ff7e7e; font-weight: 900; letter-spacing: 0.14em; font-size: 12px;
                    text-shadow: 0 0 10px rgba(224,82,82,0.8);
                    animation: va-laugh-pop 0.28s ease both, va-robot-slide-in 0.7s cubic-bezier(0.34,1.2,0.64,1) both, va-evil-pulse 1.1s 0.2s ease-in-out infinite;
                `;
                stage.appendChild(laugh);
            }

            setTimeout(() => {
                trophyWrap.style.animation = 'va-trophy-grabbed 0.9s 0s cubic-bezier(0.55,0,1,0.45) forwards';
                trophyWrap.style.zIndex = '6';

                setTimeout(() => {
                    if (robotSvg) {
                        robotSvg.style.animation = 'va-evil-pulse 1.1s 0s ease-in-out infinite';
                    }
                    robotWrap.style.animation = 'va-robot-exit 0.8s 0s ease-in forwards';
                    if (laugh) laugh.style.animation = 'va-robot-exit 0.8s 0s ease-in forwards, va-evil-pulse 1.1s 0s ease-in-out infinite';

                    setTimeout(() => {
                        title.style.transition = 'opacity 0.3s ease';
                        title.style.opacity = '0';
                        sub.style.transition = 'opacity 0.3s ease';
                        sub.style.opacity = '0';

                        const stolen = document.createElement('div');
                        stolen.textContent = isResign ? 'MATCH CONCEDED' : 'BETTER LUCK NEXT TIME';
                        stolen.style.cssText = `
                            font-size: 28px; font-weight: 900; color: #e05252;
                            letter-spacing: 0.1em;
                            text-shadow: 0 0 20px rgba(224,82,82,0.5);
                            animation: va-title-in 0.5s cubic-bezier(0.34,1.4,0.64,1) both;
                            position: relative; z-index: 2; margin-top: 16px;
                        `;
                        stage.appendChild(stolen);

                        const btnRow = document.createElement('div');
                        btnRow.style.cssText = 'display:flex; gap:12px; margin-top:24px; position:relative; z-index:2;';

                        const btnStyle = `
                            padding: 11px 26px; font-size: 14px; font-weight: 700;
                            border: none; border-radius: 4px; cursor: pointer;
                            animation: va-btn-in 0.4s 0.3s ease both;
                            transition: transform 0.1s;
                        `;
                        const revenge = document.createElement('button');
                        revenge.textContent = 'Take Revenge';
                        revenge.style.cssText = btnStyle + 'background:#e05252; color:#fff;';
                        revenge.addEventListener('mouseenter', () => revenge.style.transform = 'scale(1.04)');
                        revenge.addEventListener('mouseleave', () => revenge.style.transform = 'scale(1)');
                        revenge.onclick = () => { rayObj.stop(); overlay.remove(); if (typeof resetGame === 'function') resetGame(); };

                        const analyseBtn = document.createElement('button');
                        analyseBtn.textContent = 'Analyse';
                        analyseBtn.style.cssText = btnStyle + 'background:#3d3b37; color:#bababa; border:1px solid #555; animation-delay:0.45s;';
                        analyseBtn.addEventListener('mouseenter', () => analyseBtn.style.transform = 'scale(1.04)');
                        analyseBtn.addEventListener('mouseleave', () => analyseBtn.style.transform = 'scale(1)');
                        analyseBtn.onclick = () => {
                            rayObj.stop(); overlay.remove();
                            const btn = document.getElementById('analysis-trigger-btn');
                            if (btn) btn.click();
                        };

                        btnRow.appendChild(revenge);
                        btnRow.appendChild(analyseBtn);
                        stage.appendChild(btnRow);

                        spawnParticles(stage, 30, ['#e05252','#f5a623','#ff6b6b','#ff8a00'], 240, 200);
                    }, 300);
                }, 650);
            }, 750);
        }, 1350);

        closeBtn.onclick = () => { rayObj.stop(); overlay.remove(); };
    }

    // Hook into the chess game by patching updateStatus.
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    function installHook() {
        // Wait for window.updateStatus to be defined (set in l.html inline script)
        if (typeof window.updateStatus !== 'function' || typeof game === 'undefined') {
            setTimeout(installHook, 60);
            return;
        }

        // Expose manual triggers first.
        window.vaVictory = playVictory;
        window.vaDefeated = playDefeat;
        window.vaResign = function () {
            window.__vaResignRequested = true;
            playDefeat({ resign: true });
        };
        window.vaWin = playVictory;
        window.vaLose = playDefeat;
        window.vaLoseResign = window.vaResign;

        if (window.__useCentralOutcomeAnimations) {
            console.log('[victory-animation] Manual hooks installed (central outcome mode)');
            return;
        }

        const _orig = window.updateStatus;
        window.updateStatus = function () {
            _orig.apply(this, arguments);

            if (typeof game === 'undefined') return;
            if (!game.in_checkmate()) { _animPlayed = false; return; }
            if (_animPlayed) return;
            _animPlayed = true;

            // If it is black's turn now, black is the checkmated side and white won.
            // White = human (plays as white vs engine/black)
            const loser = game.turn(); // the side whose turn it would be = the checkmated side
            const humanWins = loser === 'b'; // human plays white

            // Small delay so checkmate highlight renders first
            setTimeout(() => {
                if (humanWins) {
                    playVictory();
                } else {
                    playDefeat({ resign: false });
                }
            }, 500);
        };

        console.log('[victory-animation] Hooks installed (test: vaVictory() / vaDefeated() / vaResign())');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installHook);
    } else {
        setTimeout(installHook, 0);
    }

})();




