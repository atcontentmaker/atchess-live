/**
 * stalemate-animation.js
 * Cinematic long-form high-refresh stalemate animation for ATchess.
 * Test: vaStalemate()
 * Integration: <script src="victory-animation.js"></script>
 *              <script src="stalemate-animation.js"></script>
 */
(function () {
    'use strict';

    let _animPlayed = false;

    function injectStyles() {
        if (document.getElementById('sm-styles')) return;
        const s = document.createElement('style');
        s.id = 'sm-styles';
        s.textContent = `
            @keyframes sm-backdrop-in { from{opacity:0} to{opacity:1} }
            @keyframes sm-trophy-rise {
                0%  {transform:translateX(-50%) translateY(120px) scale(0.6);opacity:0}
                60% {transform:translateX(-50%) translateY(-14px) scale(1.05);opacity:1}
                80% {transform:translateX(-50%) translateY(6px) scale(0.98)}
                100%{transform:translateX(-50%) translateY(0) scale(1);opacity:1}
            }
            @keyframes sm-stickman-enter {
                0%  {transform:translateX(-480px) rotate(-8deg) scale(0.85);opacity:0}
                55% {transform:translateX(14px) rotate(3deg) scale(1.04);opacity:1}
                75% {transform:translateX(-6px) rotate(-1deg)}
                100%{transform:translateX(0) rotate(0deg) scale(1);opacity:1}
            }
            @keyframes sm-robot-enter {
                0%  {transform:translateX(480px) rotate(8deg) scale(0.85);opacity:0}
                55% {transform:translateX(-14px) rotate(-3deg) scale(1.04);opacity:1}
                75% {transform:translateX(6px) rotate(1deg)}
                100%{transform:translateX(0) rotate(0deg) scale(1);opacity:1}
            }
            @keyframes sm-tug-stickman {
                0%,100%{transform:translateX(0) rotate(0deg)}
                30%{transform:translateX(-22px) rotate(-6deg)}
                65%{transform:translateX(-10px) rotate(-2deg)}
            }
            @keyframes sm-tug-robot {
                0%,100%{transform:translateX(0) rotate(0deg)}
                30%{transform:translateX(22px) rotate(6deg)}
                65%{transform:translateX(10px) rotate(2deg)}
            }
            @keyframes sm-robot-body-tilt {
                0%,100% { transform: translateX(0) rotateY(-10deg) rotateZ(0deg); }
                40% { transform: translateX(18px) rotateY(9deg) rotateZ(5deg); }
                75% { transform: translateX(7px) rotateY(2deg) rotateZ(1deg); }
            }
            @keyframes sm-stickman-body-tilt {
                0%,100% { transform: translateX(0) rotateY(10deg) rotateZ(0deg); }
                40% { transform: translateX(-18px) rotateY(-9deg) rotateZ(-5deg); }
                75% { transform: translateX(-7px) rotateY(-2deg) rotateZ(-1deg); }
            }
            @keyframes sm-stick-arm-grab {
                0%,100% { transform: rotate(16deg) translateZ(0); }
                40% { transform: rotate(-35deg) translateZ(10px); }
                75% { transform: rotate(-18deg) translateZ(8px); }
            }
            @keyframes sm-stick-arm-brace {
                0%,100% { transform: rotate(-22deg); }
                45% { transform: rotate(-48deg); }
            }
            @keyframes sm-robot-arm-grab {
                0%,100% { transform: rotate(-10deg) translateZ(0); }
                40% { transform: rotate(36deg) translateZ(14px); }
                75% { transform: rotate(20deg) translateZ(10px); }
            }
            @keyframes sm-robot-arm-brace {
                0%,100% { transform: rotate(14deg); }
                45% { transform: rotate(42deg); }
            }
            @keyframes sm-stick-legs-drive {
                0%,100% { transform: rotate(0deg); }
                50% { transform: rotate(8deg); }
            }
            @keyframes sm-robot-legs-drive {
                0%,100% { transform: rotate(0deg); }
                50% { transform: rotate(-8deg); }
            }
            @keyframes sm-cam-orbit {
                0%,100% { transform: perspective(1200px) rotateX(4deg) rotateY(0deg) scale(1); }
                25% { transform: perspective(1200px) rotateX(7deg) rotateY(-4deg) scale(1.01); }
                50% { transform: perspective(1200px) rotateX(5deg) rotateY(0deg) scale(1); }
                75% { transform: perspective(1200px) rotateX(7deg) rotateY(4deg) scale(1.01); }
            }
            @keyframes sm-cam-cut-flicker {
                0%,100% { opacity: 0; }
                20% { opacity: 0.12; }
                40% { opacity: 0.02; }
                60% { opacity: 0.14; }
            }
            @keyframes sm-noise-pan {
                0% { transform: translateY(-14px); }
                100% { transform: translateY(14px); }
            }
            @keyframes sm-focus-breathe {
                0%,100% { filter: contrast(1.06) saturate(0.96) blur(0.4px); }
                50% { filter: contrast(0.80) saturate(0.58) blur(2.4px); }
            }
            @keyframes sm-broken-lens-glint {
                0%,100% { opacity: 0.30; }
                50% { opacity: 0.62; }
            }
            @keyframes sm-panic-jitter {
                0% { transform: translate(0,0) rotate(0deg); }
                10% { transform: translate(-2px,1px) rotate(-0.25deg); }
                20% { transform: translate(3px,-2px) rotate(0.21deg); }
                30% { transform: translate(-3px,2px) rotate(-0.22deg); }
                40% { transform: translate(2px,1px) rotate(0.16deg); }
                50% { transform: translate(-1px,-2px) rotate(-0.15deg); }
                60% { transform: translate(3px,2px) rotate(0.18deg); }
                70% { transform: translate(-2px,-1px) rotate(-0.16deg); }
                80% { transform: translate(1px,2px) rotate(0.11deg); }
                90% { transform: translate(-1px,-1px) rotate(-0.09deg); }
                100% { transform: translate(0,0) rotate(0deg); }
            }
            @keyframes sm-zoom-punch {
                0% { transform: scale(1); opacity: 0; }
                30% { transform: scale(1.06); opacity: 0.16; }
                65% { transform: scale(1.01); opacity: 0.06; }
                100% { transform: scale(1); opacity: 0; }
            }
            @keyframes sm-rgb-warp {
                0%,100% { transform: translateX(0); }
                25% { transform: translateX(1.5px); }
                50% { transform: translateX(-2px); }
                75% { transform: translateX(1px); }
            }
            @keyframes sm-grip-left-pull {
                0%,100% { transform: rotate(-8deg) translateX(0) translateY(0); }
                40% { transform: rotate(-22deg) translateX(-18px) translateY(-4px); }
                75% { transform: rotate(-14deg) translateX(-8px) translateY(-1px); }
            }
            @keyframes sm-grip-right-pull {
                0%,100% { transform: rotate(188deg) translateX(0) translateY(0); }
                40% { transform: rotate(202deg) translateX(18px) translateY(-4px); }
                75% { transform: rotate(194deg) translateX(8px) translateY(-1px); }
            }
            @keyframes sm-trophy-tug {
                0%,100%{transform:translateX(-50%) rotate(0deg) scale(1)}
                25%{transform:translateX(-50%) rotate(-9deg) scale(1.04)}
                75%{transform:translateX(-50%) rotate(9deg) scale(0.97)}
            }
            @keyframes sm-trophy-shake {
                0%,100%{transform:translateX(-50%) rotate(0deg) scale(1)}
                10%{transform:translateX(calc(-50% - 9px)) rotate(-20deg) scale(1.09)}
                20%{transform:translateX(calc(-50% + 9px)) rotate(17deg) scale(0.92)}
                30%{transform:translateX(calc(-50% - 11px)) rotate(-24deg) scale(1.11)}
                40%{transform:translateX(calc(-50% + 11px)) rotate(21deg) scale(0.91)}
                50%{transform:translateX(calc(-50% - 13px)) rotate(-26deg) scale(1.13)}
                60%{transform:translateX(calc(-50% + 13px)) rotate(23deg) scale(0.90)}
                70%{transform:translateX(calc(-50% - 10px)) rotate(-20deg) scale(1.08)}
                80%{transform:translateX(calc(-50% + 10px)) rotate(18deg) scale(0.93)}
                90%{transform:translateX(calc(-50% - 6px)) rotate(-14deg) scale(1.05)}
            }
            @keyframes sm-screen-shake {
                0%,100%{transform:translate(0,0) rotate(0deg)}
                15%{transform:translate(-7px,4px) rotate(-0.4deg)}
                30%{transform:translate(6px,-5px) rotate(0.3deg)}
                45%{transform:translate(-5px,6px) rotate(-0.3deg)}
                60%{transform:translate(7px,-4px) rotate(0.4deg)}
                75%{transform:translate(-4px,5px) rotate(-0.2deg)}
            }
            @keyframes sm-flash { 0%,100%{opacity:0} 40%{opacity:1} }
            @keyframes sm-crack-draw {
                from{stroke-dashoffset:120;opacity:0}
                to{stroke-dashoffset:0;opacity:1}
            }
            @keyframes sm-glow-pulse {
                0%,100%{filter:drop-shadow(0 6px 18px rgba(140,100,220,0.5))}
                50%{filter:drop-shadow(0 0 28px rgba(220,60,60,0.9)) drop-shadow(0 0 14px rgba(255,120,0,0.7))}
            }
            @keyframes sm-half-left {
                0%{transform:translate(0,0) rotate(0deg);opacity:1}
                35%{transform:translate(-70px,-44px) rotate(-42deg);opacity:1}
                100%{transform:translate(-190px,210px) rotate(-85deg);opacity:0}
            }
            @keyframes sm-half-right {
                0%{transform:translate(0,0) rotate(0deg);opacity:1}
                35%{transform:translate(70px,-44px) rotate(42deg);opacity:1}
                100%{transform:translate(190px,210px) rotate(85deg);opacity:0}
            }
            @keyframes sm-stickman-flyback {
                0%{transform:translateX(0) rotate(0deg);opacity:1}
                50%{transform:translateX(-200px) rotate(-28deg) translateY(-28px);opacity:1}
                100%{transform:translateX(-430px) rotate(-18deg);opacity:0}
            }
            @keyframes sm-robot-flyback {
                0%{transform:translateX(0) rotate(0deg);opacity:1}
                50%{transform:translateX(200px) rotate(28deg) translateY(-28px);opacity:1}
                100%{transform:translateX(430px) rotate(18deg);opacity:0}
            }
            @keyframes sm-title-slam {
                0%{transform:scale(0.4) translateY(40px);opacity:0;letter-spacing:0.55em}
                65%{transform:scale(1.09) translateY(-5px);opacity:1;letter-spacing:0.09em}
                82%{transform:scale(0.97) translateY(2px);letter-spacing:0.10em}
                100%{transform:scale(1) translateY(0);opacity:1;letter-spacing:0.10em}
            }
            @keyframes sm-subtitle-in {
                from{opacity:0;transform:translateY(16px)}
                to{opacity:1;transform:translateY(0)}
            }
            @keyframes sm-btn-in {
                from{opacity:0;transform:translateY(10px) scale(0.92)}
                to{opacity:1;transform:translateY(0) scale(1)}
            }
            @keyframes sm-close-bounce {
                0%{transform:scale(0.7);opacity:0}
                80%{transform:scale(1.08);opacity:1}
                100%{transform:scale(1);opacity:1}
            }
            @keyframes sm-star-fly {
                0%{transform:translate(0,0) rotate(0deg) scale(1);opacity:1}
                100%{transform:var(--sm-tx) rotate(var(--sm-rot)) scale(0.2);opacity:0}
            }
            @keyframes sm-debris-fly {
                0%{transform:translate(0,0) rotate(0deg) scale(1);opacity:1}
                100%{transform:var(--sm-dx) rotate(var(--sm-dr)) scale(0.1);opacity:0}
            }
            #sm-overlay {
                position:fixed;inset:0;z-index:99999;
                display:flex;align-items:center;justify-content:center;
                background:rgba(10,9,8,0.90);
                animation:sm-backdrop-in 0.4s ease forwards;
                font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;
            }
            #sm-stage {
                --sm-energy: 0.15;
                position:relative;
                display:flex;flex-direction:column;
                align-items:center;justify-content:center;
                width:540px;min-height:480px;
                overflow:hidden;
                perspective: 1200px;
                transform-style: preserve-3d;
            }
            #sm-stage.sm-cam-fight {
                animation: sm-cam-orbit 1.2s ease-in-out infinite;
            }
            #sm-camera-shell {
                position:absolute;inset:0;
                transform-style:preserve-3d;
                z-index:17;
            }
            #sm-stage.sm-panic-cam #sm-camera-shell {
                animation: sm-panic-jitter calc(0.12s - (var(--sm-energy) * 0.05s)) steps(1,end) infinite;
            }
            #sm-noise-layer {
                position:absolute;inset:0;
                pointer-events:none;
                background-image:
                    repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 3px),
                    radial-gradient(circle at 15% 12%, rgba(255,255,255,0.10), transparent 32%),
                    radial-gradient(circle at 80% 78%, rgba(255,255,255,0.08), transparent 35%);
                opacity:0;
                mix-blend-mode:screen;
                z-index:18;
            }
            #sm-rgb-layer {
                position:absolute;inset:0;
                pointer-events:none;
                opacity:0;
                z-index:20;
                mix-blend-mode:screen;
                background:
                    linear-gradient(90deg, rgba(255,0,0,0.20), rgba(0,0,0,0) 30%, rgba(0,255,255,0.18));
                filter: blur(0.35px);
            }
            #sm-cut-layer {
                position:absolute;inset:0;
                pointer-events:none;
                opacity:0;
                background:linear-gradient(180deg, rgba(255,255,255,0.15), rgba(0,0,0,0.12));
                z-index:19;
            }
            #sm-punch-layer {
                position:absolute;inset:-4px;
                pointer-events:none;
                opacity:0;
                z-index:23;
                border: 1px solid rgba(255,255,255,0.16);
                box-shadow: inset 0 0 35px rgba(255,255,255,0.08), inset 0 0 120px rgba(0,0,0,0.55);
            }
            #sm-lens-layer {
                position:absolute;inset:0;
                pointer-events:none;
                opacity:0;
                z-index:21;
            }
            .sm-lens-crack {
                position:absolute;
                border:1.4px solid rgba(220,235,255,0.42);
                box-shadow:0 0 8px rgba(180,210,255,0.25);
                transform-origin:left center;
            }
            #sm-timecode {
                position:absolute;
                top:10px;left:12px;
                font-size:11px;
                letter-spacing:0.12em;
                color:rgba(210,230,255,0.72);
                text-shadow:0 0 6px rgba(150,180,255,0.4);
                z-index:22;
                opacity:0;
                font-family:Consolas, monospace;
                pointer-events:none;
            }
            #sm-ground {
                position:absolute;
                width:460px;height:90px;
                bottom:28px;left:40px;
                border-radius:50%;
                background:radial-gradient(ellipse at center, rgba(120,120,150,0.35) 0%, rgba(50,50,65,0.18) 45%, rgba(0,0,0,0) 80%);
                filter:blur(1px);
                z-index:1;
            }
            #sm-grip-left, #sm-grip-right {
                position:absolute;
                height:12px;
                border-radius:8px;
                background: linear-gradient(180deg, #e8e8f4 0%, #9999bb 45%, #5a5a80 100%);
                border: 1px solid rgba(255,255,255,0.24);
                box-shadow: 0 8px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.45);
                transform-origin: left center;
                z-index: 5;
            }
            #sm-close-btn {
                position:absolute;top:-8px;right:-8px;
                width:36px;height:36px;border-radius:50%;
                background:#3d3b37;color:#bababa;border:1px solid #555;
                font-size:16px;cursor:pointer;display:flex;
                align-items:center;justify-content:center;
                animation:sm-close-bounce 0.35s 0.6s ease both;
                transition:background 0.15s,color 0.15s;z-index:10;
            }
            #sm-close-btn:hover{background:#888;color:#fff;}
        `;
        document.head.appendChild(s);
    }

    /* â”€â”€ SVG assets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

    function smTrophySVG() {
        return `<svg id="sm-trophy-svg" xmlns="http://www.w3.org/2000/svg"
             viewBox="0 0 120 140" width="156" height="182"
             style="display:block;filter:drop-shadow(0 8px 24px rgba(160,160,220,0.5));transform-origin:bottom center;">
          <defs>
            <linearGradient id="sm-cup-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#e8e8f4"/><stop offset="50%" stop-color="#b8b8d0"/><stop offset="100%" stop-color="#7878a0"/>
            </linearGradient>
            <linearGradient id="sm-shine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.65"/><stop offset="100%" stop-color="#b8b8d0" stop-opacity="0"/>
            </linearGradient>
            <linearGradient id="sm-base-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#a0a0c0"/><stop offset="100%" stop-color="#5a5a7a"/>
            </linearGradient>
          </defs>
          <path d="M28 44 Q8 44 10 62 Q12 76 28 74" stroke="#7878a0" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M92 44 Q112 44 110 62 Q108 76 92 74" stroke="#7878a0" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M28 24 L28 74 Q28 96 60 100 Q92 96 92 74 L92 24 Z" fill="url(#sm-cup-g)" stroke="#7878a0" stroke-width="1.5"/>
          <path d="M36 28 L36 72 Q36 88 60 91 L60 28 Z" fill="url(#sm-shine)" opacity="0.55"/>
          <rect x="48" y="100" width="24" height="18" rx="3" fill="url(#sm-base-g)" stroke="#5a5a7a" stroke-width="1"/>
          <rect x="34" y="116" width="52" height="14" rx="5" fill="url(#sm-base-g)" stroke="#5a5a7a" stroke-width="1.5"/>
          <text x="60" y="72" text-anchor="middle" font-size="30" font-weight="900" fill="#e8e8f4" opacity="0.80" font-family="serif">?</text>
          <g id="sm-crack-1" style="opacity:0;pointer-events:none;">
            <polyline points="60,28 54,50 62,68 57,98" stroke="#222244" stroke-width="2.2" fill="none"
                      stroke-dasharray="120" stroke-dashoffset="120"
                      style="animation:sm-crack-draw 0.55s ease forwards;"/>
          </g>
          <g id="sm-crack-2" style="opacity:0;pointer-events:none;">
            <polyline points="60,30 67,52 59,72 64,98" stroke="#333355" stroke-width="1.6" fill="none"
                      stroke-dasharray="120" stroke-dashoffset="120"
                      style="animation:sm-crack-draw 0.45s 0.08s ease forwards;"/>
            <polyline points="58,40 50,58 55,74" stroke="#333355" stroke-width="1.2" fill="none"
                      stroke-dasharray="60" stroke-dashoffset="60"
                      style="animation:sm-crack-draw 0.35s 0.15s ease forwards;"/>
          </g>
        </svg>`;
    }

    function stickmanSVG() {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 210" width="116" height="198"
             style="display:block;transform-origin:bottom center;">
          <defs>
            <linearGradient id="sm-human-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#f3f2eb"/><stop offset="100%" stop-color="#cfcdbf"/>
            </linearGradient>
          </defs>
          <circle cx="60" cy="28" r="19" fill="url(#sm-human-g)" stroke="#bfbcae" stroke-width="2.3"/>

          <rect x="42" y="50" width="36" height="54" rx="10" fill="url(#sm-human-g)" stroke="#bfbcae" stroke-width="2.4"/>
          <rect x="46" y="63" width="28" height="11" rx="5" fill="#e7e4d8" opacity="0.85"/>

          <g id="sm-stick-arm-l" style="transform-origin:44px 64px;transform-box:fill-box;">
            <rect x="19" y="60" width="28" height="10" rx="5" fill="#eceadf" stroke="#bfbcae" stroke-width="2"/>
            <rect x="7" y="70" width="22" height="9" rx="4.5" fill="#eceadf" stroke="#bfbcae" stroke-width="2"/>
            <circle cx="6" cy="75" r="4" fill="#eceadf" stroke="#bfbcae" stroke-width="1.7"/>
          </g>

          <g id="sm-stick-arm-r" style="transform-origin:76px 62px;transform-box:fill-box;">
            <rect x="74" y="56" width="30" height="10" rx="5" fill="#eceadf" stroke="#bfbcae" stroke-width="2"/>
            <rect x="94" y="48" width="22" height="9" rx="4.5" fill="#eceadf" stroke="#bfbcae" stroke-width="2"/>
            <circle cx="114" cy="52" r="4.2" fill="#eceadf" stroke="#bfbcae" stroke-width="1.7"/>
          </g>

          <g id="sm-stick-leg-l" style="transform-origin:53px 103px;transform-box:fill-box;">
            <rect x="46" y="102" width="14" height="46" rx="7" fill="#eceadf" stroke="#bfbcae" stroke-width="2.1"/>
            <rect x="34" y="145" width="24" height="12" rx="6" fill="#eceadf" stroke="#bfbcae" stroke-width="2"/>
            <rect x="24" y="154" width="28" height="11" rx="5.5" fill="#d5d2c5" stroke="#bfbcae" stroke-width="1.8"/>
          </g>
          <g id="sm-stick-leg-r" style="transform-origin:67px 103px;transform-box:fill-box;">
            <rect x="62" y="102" width="14" height="46" rx="7" fill="#eceadf" stroke="#bfbcae" stroke-width="2.1"/>
            <rect x="68" y="145" width="24" height="12" rx="6" fill="#eceadf" stroke="#bfbcae" stroke-width="2"/>
            <rect x="74" y="154" width="28" height="11" rx="5.5" fill="#d5d2c5" stroke="#bfbcae" stroke-width="1.8"/>
          </g>
        </svg>`;
    }

    function robotSVG() {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 230" width="150" height="210"
             style="display:block;transform-origin:bottom center;filter:drop-shadow(0 0 18px rgba(224,82,82,0.58));">
          <defs>
            <linearGradient id="sm-robot-red" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#6a0f14"/><stop offset="55%" stop-color="#a51620"/><stop offset="100%" stop-color="#45060b"/>
            </linearGradient>
            <linearGradient id="sm-metal-dark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#2f3339"/><stop offset="100%" stop-color="#15181d"/>
            </linearGradient>
            <radialGradient id="sm-eye-r" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stop-color="#ffffff"/><stop offset="35%" stop-color="#ff7171"/><stop offset="100%" stop-color="#d00808"/>
            </radialGradient>
          </defs>
          <polygon points="48,40 104,40 116,85 35,85" fill="url(#sm-robot-red)" stroke="#d43a3a" stroke-width="2.3"/>
          <rect x="30" y="84" width="88" height="78" rx="12" fill="url(#sm-robot-red)" stroke="#d43a3a" stroke-width="2.6"/>
          <rect x="42" y="95" width="64" height="24" rx="6" fill="url(#sm-metal-dark)" stroke="#7d8898" stroke-width="1.3"/>
          <circle cx="74" cy="64" r="14" fill="#0f1115" stroke="#5e6572" stroke-width="2.1"/>
          <circle cx="74" cy="64" r="9" fill="url(#sm-eye-r)"/>
          <circle cx="71" cy="61" r="2.7" fill="#fff" opacity="0.9"/>
          <path d="M58 76 L90 76 L84 88 L64 88 Z" fill="#1b1f25" stroke="#8e9bab" stroke-width="1.4"/>
          <path d="M60 33 L88 33 L82 24 L66 24 Z" fill="#2b3037" stroke="#8e9bab" stroke-width="1.2"/>
          <circle cx="74" cy="19" r="4.7" fill="#d70000"/>

          <g id="sm-robot-arm-l" style="transform-origin:38px 102px;transform-box:fill-box;">
            <rect x="10" y="96" width="34" height="14" rx="7" fill="url(#sm-metal-dark)" stroke="#808a98" stroke-width="1.8"/>
            <rect x="0" y="109" width="22" height="11" rx="5.5" fill="#262b31" stroke="#808a98" stroke-width="1.6"/>
            <polygon points="0,114 -6,109 -6,119" fill="#b9c4d3"/>
          </g>
          <g id="sm-robot-arm-r" style="transform-origin:112px 100px;transform-box:fill-box;">
            <rect x="108" y="92" width="35" height="14" rx="7" fill="url(#sm-metal-dark)" stroke="#808a98" stroke-width="1.8"/>
            <rect x="128" y="84" width="20" height="11" rx="5.5" fill="#262b31" stroke="#808a98" stroke-width="1.6"/>
            <polygon points="148,90 154,86 154,96" fill="#b9c4d3"/>
          </g>

          <rect x="52" y="162" width="44" height="20" rx="8" fill="#181b20" stroke="#7d8898" stroke-width="1.7"/>
          <g id="sm-robot-leg-l" style="transform-origin:64px 183px;transform-box:fill-box;">
            <rect x="54" y="181" width="16" height="33" rx="6" fill="#2b3037" stroke="#8e9bab" stroke-width="1.8"/>
            <rect x="48" y="211" width="24" height="10" rx="5" fill="#3b424d" stroke="#9aa5b4" stroke-width="1.5"/>
          </g>
          <g id="sm-robot-leg-r" style="transform-origin:84px 183px;transform-box:fill-box;">
            <rect x="80" y="181" width="16" height="33" rx="6" fill="#2b3037" stroke="#8e9bab" stroke-width="1.8"/>
            <rect x="78" y="211" width="24" height="10" rx="5" fill="#3b424d" stroke="#9aa5b4" stroke-width="1.5"/>
          </g>
        </svg>`;
    }

    function leftHalfSVG() {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 140" width="78" height="168"
             style="display:block;filter:drop-shadow(0 4px 12px rgba(100,100,160,0.5));">
          <defs>
            <linearGradient id="sm-hl" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#e8e8f4"/><stop offset="100%" stop-color="#7878a0"/>
            </linearGradient>
          </defs>
          <path d="M28 44 Q8 44 10 62 Q12 76 28 74" stroke="#7878a0" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M28 24 L28 74 Q28 96 60 100 L60 24 Z" fill="url(#sm-hl)" stroke="#7878a0" stroke-width="1.5"/>
          <polyline points="60,24 55,36 62,54 56,70 60,90 57,100" stroke="#222244" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="36" y="100" width="24" height="18" rx="3" fill="#8080a0" stroke="#5a5a7a" stroke-width="1"/>
          <rect x="28" y="116" width="37" height="14" rx="5" fill="#8080a0" stroke="#5a5a7a" stroke-width="1.5"/>
        </svg>`;
    }

    function rightHalfSVG() {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 65 140" width="78" height="168"
             style="display:block;filter:drop-shadow(0 4px 12px rgba(100,100,160,0.5));">
          <defs>
            <linearGradient id="sm-hr" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#c0c0d8"/><stop offset="100%" stop-color="#5a5a80"/>
            </linearGradient>
          </defs>
          <path d="M37 44 Q57 44 55 62 Q53 76 37 74" stroke="#7878a0" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M5 24 L5 74 Q5 96 37 100 L37 24 Z" fill="url(#sm-hr)" stroke="#7878a0" stroke-width="1.5"/>
          <polyline points="5,24 10,36 3,54 9,70 5,90 8,100" stroke="#222244" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="5" y="100" width="24" height="18" rx="3" fill="#8080a0" stroke="#5a5a7a" stroke-width="1"/>
          <rect x="0" y="116" width="37" height="14" rx="5" fill="#8080a0" stroke="#5a5a7a" stroke-width="1.5"/>
        </svg>`;
    }

    /* â”€â”€ RAF ray canvas â€” same pattern as victory-animation.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function buildRayCanvas(container) {
        const canvas = document.createElement('canvas');
        canvas.width = 540; canvas.height = 540;
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0.13;';
        container.insertBefore(canvas, container.firstChild);
        const ctx2 = canvas.getContext('2d');
        const cx = 270, cy = 200, RAY_COUNT = 18;
        let angle = 0, raf;
        function draw() {
            ctx2.clearRect(0, 0, 540, 540);
            for (let i = 0; i < RAY_COUNT; i++) {
                const a = angle + (i / RAY_COUNT) * Math.PI * 2;
                const grd = ctx2.createRadialGradient(cx, cy, 10, cx, cy, 270);
                grd.addColorStop(0, 'rgba(140,140,210,0.9)');
                grd.addColorStop(1, 'rgba(140,140,210,0)');
                ctx2.beginPath(); ctx2.moveTo(cx, cy);
                ctx2.arc(cx, cy, 270, a - 0.068, a + 0.068);
                ctx2.closePath(); ctx2.fillStyle = grd; ctx2.fill();
            }
            angle += 0.008;
            raf = requestAnimationFrame(draw);
        }
        draw();
        return { canvas, stop: () => cancelAnimationFrame(raf) };
    }

    /* â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function spawnDebris(container, count, x0, y0) {
        const colors = ['#c8c8e0','#e8e8f4','#9090b8','#ffffff','#aaaacc','#ffd700','#ff8888'];
        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            const a = Math.random() * Math.PI * 2;
            const d = 100 + Math.random() * 260;
            const size  = 4 + Math.random() * 13;
            const delay = Math.random() * 0.25;
            const dur   = 0.55 + Math.random() * 1.0;
            p.style.cssText = `
                position:absolute;
                left:${x0+(Math.random()-0.5)*30}px;
                top:${y0+(Math.random()-0.5)*20}px;
                width:${size}px;height:${size}px;
                background:${colors[Math.floor(Math.random()*colors.length)]};
                border-radius:${Math.random()>0.35?'2px':'50%'};
                --sm-dx:translate(${Math.cos(a)*d}px,${Math.sin(a)*d-40}px);
                --sm-dr:${(Math.random()-0.5)*900}deg;
                animation:sm-debris-fly ${dur}s ${delay}s cubic-bezier(0.1,0,0.9,1) both;
                pointer-events:none;z-index:9;
            `;
            container.appendChild(p);
            setTimeout(() => p.remove(), (delay+dur+0.2)*1000);
        }
    }

    function spawnDizzyStars(container, x0, y0) {
        const glyphs = ['*', '+', '.', 'o', '.', 'O'];
        for (let i = 0; i < 6; i++) {
            const p = document.createElement('div');
            const a = (i/6)*Math.PI*2;
            const r = 28 + Math.random()*18;
            const delay = i*0.10, dur = 1.0+Math.random()*0.5;
            p.textContent = glyphs[i%glyphs.length];
            p.style.cssText = `
                position:absolute;left:${x0-9}px;top:${y0-9}px;
                font-size:18px;pointer-events:none;z-index:9;
                --sm-tx:translate(${Math.cos(a)*r*1.7}px,${Math.sin(a)*r-50}px);
                --sm-rot:${(Math.random()-0.5)*540}deg;
                animation:sm-star-fly ${dur}s ${delay}s ease-out both;
            `;
            container.appendChild(p);
            setTimeout(() => p.remove(), (delay+dur+0.15)*1000);
        }
    }

    function doFlash(stage, color, dur) {
        const f = document.createElement('div');
        f.style.cssText = `position:absolute;inset:0;background:${color};pointer-events:none;z-index:20;animation:sm-flash ${dur||0.28}s ease both;`;
        stage.appendChild(f);
        setTimeout(() => f.remove(), ((dur||0.28)+0.1)*1000);
    }

    /* â”€â”€ MAIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function playStalemateAnimation() {
        injectStyles();

        const overlay = document.createElement('div');
        overlay.id = 'sm-overlay';

        const stage = document.createElement('div');
        stage.id = 'sm-stage';

        const closeBtn = document.createElement('button');
        closeBtn.id = 'sm-close-btn';
        closeBtn.innerHTML = '&times;';
        stage.appendChild(closeBtn);

        const rayObj = buildRayCanvas(stage);
        const ground = document.createElement('div');
        ground.id = 'sm-ground';
        stage.appendChild(ground);

        // Trophy
        const trophyWrap = document.createElement('div');
        trophyWrap.id = 'sm-trophy-wrap';
        trophyWrap.innerHTML = smTrophySVG();
        trophyWrap.style.cssText = 'position:absolute;left:50%;bottom:60px;transform:translateX(-50%) translateY(120px) scale(0.6);opacity:0;z-index:3;transform-origin:bottom center;';
        stage.appendChild(trophyWrap);

        const gripLeft = document.createElement('div');
        gripLeft.id = 'sm-grip-left';
        gripLeft.style.cssText = 'left:158px;top:287px;width:84px;transform:rotate(-8deg);opacity:0;';
        stage.appendChild(gripLeft);

        const gripRight = document.createElement('div');
        gripRight.id = 'sm-grip-right';
        gripRight.style.cssText = 'left:300px;top:288px;width:86px;transform:rotate(188deg);opacity:0;';
        stage.appendChild(gripRight);

        // Stickman
        const stickWrap = document.createElement('div');
        stickWrap.innerHTML = stickmanSVG();
        stickWrap.style.cssText = 'position:absolute;left:18px;bottom:40px;opacity:0;transform:translateX(-480px) rotateY(16deg) rotate(-8deg) scale(0.85);transform-origin:bottom center;transform-style:preserve-3d;z-index:4;';
        stage.appendChild(stickWrap);

        // Robot
        const botWrap = document.createElement('div');
        botWrap.innerHTML = robotSVG();
        botWrap.style.cssText = 'position:absolute;right:8px;bottom:34px;opacity:0;transform:translateX(480px) rotateY(-16deg) rotate(8deg) scale(0.85);transform-origin:bottom center;transform-style:preserve-3d;z-index:4;';
        stage.appendChild(botWrap);
        const stickArmR = stickWrap.querySelector('#sm-stick-arm-r');
        const stickArmL = stickWrap.querySelector('#sm-stick-arm-l');
        const stickLegL = stickWrap.querySelector('#sm-stick-leg-l');
        const stickLegR = stickWrap.querySelector('#sm-stick-leg-r');
        const botArmR = botWrap.querySelector('#sm-robot-arm-r');
        const botArmL = botWrap.querySelector('#sm-robot-arm-l');
        const botLegL = botWrap.querySelector('#sm-robot-leg-l');
        const botLegR = botWrap.querySelector('#sm-robot-leg-r');

        const cameraShell = document.createElement('div');
        cameraShell.id = 'sm-camera-shell';
        stage.appendChild(cameraShell);

        const noiseLayer = document.createElement('div');
        noiseLayer.id = 'sm-noise-layer';
        stage.appendChild(noiseLayer);

        const rgbLayer = document.createElement('div');
        rgbLayer.id = 'sm-rgb-layer';
        stage.appendChild(rgbLayer);

        const cutLayer = document.createElement('div');
        cutLayer.id = 'sm-cut-layer';
        stage.appendChild(cutLayer);

        const punchLayer = document.createElement('div');
        punchLayer.id = 'sm-punch-layer';
        stage.appendChild(punchLayer);

        const lensLayer = document.createElement('div');
        lensLayer.id = 'sm-lens-layer';
        stage.appendChild(lensLayer);

        const crackA = document.createElement('div');
        crackA.className = 'sm-lens-crack';
        crackA.style.cssText = 'left:290px;top:160px;width:170px;transform:rotate(24deg);';
        lensLayer.appendChild(crackA);

        const crackB = document.createElement('div');
        crackB.className = 'sm-lens-crack';
        crackB.style.cssText = 'left:252px;top:214px;width:210px;transform:rotate(-17deg);';
        lensLayer.appendChild(crackB);

        const timecode = document.createElement('div');
        timecode.id = 'sm-timecode';
        timecode.textContent = 'REC 00:00:00';
        stage.appendChild(timecode);

        overlay.appendChild(stage);
        document.body.appendChild(overlay);

        const timerIds = [];
        let cutInterval = null;
        let timecodeInterval = null;
        let panicInterval = null;
        let beatInterval = null;
        const startedAt = Date.now();
        let reactive = null;

        function schedule(ms, fn) {
            const id = setTimeout(fn, ms);
            timerIds.push(id);
            return id;
        }

        function clearScheduled() {
            timerIds.forEach(clearTimeout);
            timerIds.length = 0;
            if (cutInterval) { clearInterval(cutInterval); cutInterval = null; }
            if (timecodeInterval) { clearInterval(timecodeInterval); timecodeInterval = null; }
            if (panicInterval) { clearInterval(panicInterval); panicInterval = null; }
            if (beatInterval) { clearInterval(beatInterval); beatInterval = null; }
            if (reactive) reactive.stop();
        }

        function createReactiveRig() {
            let energy = 0;
            let raf = null;
            let ctx = null;
            let master = null;
            let analyser = null;
            let beatOn = false;

            function ensureAudio() {
                if (ctx) return true;
                try {
                    const Ctx = window.AudioContext || window.webkitAudioContext;
                    if (!Ctx) return false;
                    ctx = new Ctx();
                    master = ctx.createGain();
                    master.gain.value = 0.018;
                    analyser = ctx.createAnalyser();
                    analyser.fftSize = 256;
                    analyser.smoothingTimeConstant = 0.72;
                    master.connect(analyser);
                    analyser.connect(ctx.destination);
                    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
                    return true;
                } catch (e) {
                    return false;
                }
            }

            function pulse(strength, dur, hz) {
                if (!ensureAudio()) {
                    energy = Math.max(energy, Math.min(1, strength));
                    return;
                }
                const now = ctx.currentTime;
                const g = ctx.createGain();
                const o = ctx.createOscillator();
                const m = ctx.createOscillator();
                const mg = ctx.createGain();
                o.type = 'sawtooth';
                o.frequency.value = hz || 72;
                m.type = 'sine';
                m.frequency.value = (hz || 72) * 2.03;
                g.gain.setValueAtTime(0.0001, now);
                g.gain.exponentialRampToValueAtTime(0.025 + (strength * 0.07), now + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
                mg.gain.setValueAtTime(0.0001, now);
                mg.gain.exponentialRampToValueAtTime(0.011 + (strength * 0.025), now + 0.016);
                mg.gain.exponentialRampToValueAtTime(0.0001, now + dur);
                o.connect(g).connect(master);
                m.connect(mg).connect(master);
                o.start(now); m.start(now);
                o.stop(now + dur + 0.05); m.stop(now + dur + 0.05);
                energy = Math.max(energy, Math.min(1, strength));
            }

            function startBattleBeat() {
                beatOn = true;
                if (beatInterval) clearInterval(beatInterval);
                beatInterval = setInterval(() => {
                    if (!beatOn) return;
                    pulse(0.36, 0.18, 58 + Math.random() * 10);
                    if (Math.random() > 0.68) {
                        setTimeout(() => pulse(0.64, 0.13, 92 + Math.random() * 28), 110);
                    }
                }, 420);
            }

            function stopBattleBeat() {
                beatOn = false;
                if (beatInterval) { clearInterval(beatInterval); beatInterval = null; }
            }

            function impact(strength) {
                pulse(Math.min(1, Math.max(0.15, strength || 0.7)), 0.24, 85 + Math.random() * 36);
            }

            function tick() {
                if (analyser) {
                    const data = new Uint8Array(analyser.fftSize);
                    analyser.getByteTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) {
                        const v = (data[i] - 128) / 128;
                        sum += v * v;
                    }
                    const rms = Math.sqrt(sum / data.length);
                    energy = (energy * 0.88) + Math.min(1, rms * 4.5);
                } else {
                    energy *= 0.94;
                }
                stage.style.setProperty('--sm-energy', energy.toFixed(3));
                const n = 0.2 + energy * 0.65;
                noiseLayer.style.opacity = `${n}`;
                rgbLayer.style.opacity = `${Math.min(0.68, 0.16 + energy * 0.74)}`;
                raf = requestAnimationFrame(tick);
            }

            raf = requestAnimationFrame(tick);
            return {
                impact,
                startBattleBeat,
                stopBattleBeat,
                stop: () => {
                    stopBattleBeat();
                    if (raf) cancelAnimationFrame(raf);
                    raf = null;
                    if (ctx) {
                        try { ctx.close(); } catch (e) {}
                    }
                    ctx = null;
                }
            };
        }

        function setCamPreset(styleText) {
            stage.style.transform = styleText;
        }

        function doCut(styleText) {
            cutLayer.style.animation = 'none';
            void cutLayer.offsetWidth;
            cutLayer.style.animation = 'sm-cam-cut-flicker 0.24s ease';
            setCamPreset(styleText);
            if (reactive) reactive.impact(0.42);
        }

        function startCameraCuts() {
            if (cutInterval) clearInterval(cutInterval);
            cutInterval = setInterval(() => {
                const picks = [
                    'perspective(1200px) translateX(-22px) translateY(12px) rotateX(14deg) rotateY(-18deg) scale(1.09)',
                    'perspective(1200px) translateX(28px) translateY(-14px) rotateX(15deg) rotateY(21deg) scale(1.10)',
                    'perspective(1200px) translateX(0px) translateY(0px) rotateX(7deg) rotateY(0deg) scale(1.01)',
                    'perspective(1200px) translateX(-30px) translateY(-4px) rotateX(11deg) rotateY(-24deg) scale(1.11)',
                    'perspective(1200px) translateX(30px) translateY(6px) rotateX(11deg) rotateY(24deg) scale(1.11)',
                    'perspective(1200px) translateX(-6px) translateY(18px) rotateX(18deg) rotateY(-8deg) scale(1.08)'
                ];
                doCut(picks[Math.floor(Math.random() * picks.length)]);
            }, 900);
        }

        function startPanicCam() {
            stage.classList.add('sm-panic-cam');
            rgbLayer.style.opacity = '0.38';
            rgbLayer.style.animation = 'sm-rgb-warp 0.18s steps(2,end) infinite';
            if (panicInterval) clearInterval(panicInterval);
            panicInterval = setInterval(() => {
                punchLayer.style.animation = 'none';
                void punchLayer.offsetWidth;
                punchLayer.style.animation = 'sm-zoom-punch 0.22s cubic-bezier(0.2,0,0.4,1)';
                doCut([
                    'perspective(1200px) translateX(-34px) translateY(18px) rotateX(18deg) rotateY(-28deg) scale(1.13)',
                    'perspective(1200px) translateX(36px) translateY(-16px) rotateX(18deg) rotateY(28deg) scale(1.13)',
                    'perspective(1200px) translateX(-12px) translateY(22px) rotateX(20deg) rotateY(-6deg) scale(1.12)'
                ][Math.floor(Math.random() * 3)]);
            }, 2200);
        }

        function enableBrokenLensMode() {
            lensLayer.style.opacity = '1';
            lensLayer.style.animation = 'sm-broken-lens-glint 1.4s ease-in-out infinite';
            noiseLayer.style.opacity = '1';
            noiseLayer.style.animation = 'sm-noise-pan 0.07s linear infinite';
            timecode.style.opacity = '1';
            stage.style.animation = 'sm-focus-breathe 0.8s ease-in-out infinite';
            startPanicCam();
            if (timecodeInterval) clearInterval(timecodeInterval);
            timecodeInterval = setInterval(() => {
                const sec = Math.floor((Date.now() - startedAt) / 1000);
                const mm = String(Math.floor(sec / 60)).padStart(2, '0');
                const ss = String(sec % 60).padStart(2, '0');
                timecode.textContent = `REC 00:${mm}:${ss}`;
            }, 1000);
        }

        reactive = createReactiveRig();

        // Phase 1 â€” Trophy rises
        schedule(350, () => {
            trophyWrap.style.animation = 'sm-trophy-rise 0.8s cubic-bezier(0.34,1.2,0.64,1) both';
            trophyWrap.style.opacity = '1';
        });

        // Phase 2 â€” Stickman enters
        schedule(2200, () => {
            stickWrap.style.opacity = '1';
            stickWrap.style.animation = 'sm-stickman-enter 0.72s cubic-bezier(0.34,1.2,0.64,1) both';
        });

        // Phase 3 â€” Robot enters
        schedule(5000, () => {
            botWrap.style.opacity = '1';
            botWrap.style.animation = 'sm-robot-enter 0.72s cubic-bezier(0.34,1.2,0.64,1) both';
        });

        // Phase 4 â€” Tug-of-war
        schedule(8200, () => {
            stage.classList.add('sm-cam-fight');
            if (reactive) reactive.startBattleBeat();
            stickWrap.style.animation  = 'sm-stickman-body-tilt 0.52s ease-in-out infinite';
            botWrap.style.animation    = 'sm-robot-body-tilt    0.52s ease-in-out infinite';
            trophyWrap.style.animation = 'sm-trophy-tug         0.52s ease-in-out infinite';
            gripLeft.style.opacity = '1';
            gripRight.style.opacity = '1';
            gripLeft.style.animation = 'sm-grip-left-pull 0.52s ease-in-out infinite';
            gripRight.style.animation = 'sm-grip-right-pull 0.52s ease-in-out infinite';
            if (stickArmR) stickArmR.style.animation = 'sm-stick-arm-grab 0.52s ease-in-out infinite';
            if (stickArmL) stickArmL.style.animation = 'sm-stick-arm-brace 0.52s ease-in-out infinite';
            if (botArmR) botArmR.style.animation = 'sm-robot-arm-grab 0.52s ease-in-out infinite';
            if (botArmL) botArmL.style.animation = 'sm-robot-arm-brace 0.52s ease-in-out infinite';
            if (stickLegL) stickLegL.style.animation = 'sm-stick-legs-drive 0.52s ease-in-out infinite';
            if (stickLegR) stickLegR.style.animation = 'sm-stick-legs-drive 0.52s ease-in-out infinite reverse';
            if (botLegL) botLegL.style.animation = 'sm-robot-legs-drive 0.52s ease-in-out infinite';
            if (botLegR) botLegR.style.animation = 'sm-robot-legs-drive 0.52s ease-in-out infinite reverse';
            const lbl = document.createElement('div');
            lbl.style.cssText = 'position:absolute;top:18px;left:50%;transform:translateX(-50%);font-size:14px;color:#9999bb;letter-spacing:0.04em;white-space:nowrap;z-index:10;animation:sm-subtitle-in 0.4s ease both;';
            lbl.textContent = 'Neither will let go!';
            stage.appendChild(lbl);
            startCameraCuts();
            setTimeout(() => { lbl.style.transition='opacity 0.5s'; lbl.style.opacity='0'; setTimeout(()=>lbl.remove(),600); }, 2800);
        });

        // Phase 5 â€” Escalation
        schedule(22000, () => {
            trophyWrap.style.animation = 'sm-trophy-shake 0.22s ease-in-out infinite';
            stage.style.animation      = 'sm-screen-shake 0.16s ease-in-out infinite';
            doFlash(stage, 'rgba(160,160,255,0.35)', 0.3);
            if (reactive) reactive.impact(0.74);
            setTimeout(() => doFlash(stage, 'rgba(180,150,255,0.40)', 0.25), 700);
            setTimeout(() => doFlash(stage, 'rgba(210,140,255,0.45)', 0.25), 1400);
            punchLayer.style.animation = 'sm-zoom-punch 0.22s cubic-bezier(0.2,0,0.4,1)';
        });

        // Phase 6 â€” First crack
        schedule(34000, () => {
            enableBrokenLensMode();
            if (reactive) reactive.impact(0.9);
            doCut('perspective(1200px) translateX(-22px) translateY(12px) rotateX(12deg) rotateY(-14deg) scale(1.06)');
            doFlash(stage, 'rgba(200,200,255,0.55)', 0.22);
            setTimeout(() => doCut('perspective(1200px) translateX(32px) translateY(-16px) rotateX(17deg) rotateY(24deg) scale(1.14)'), 180);
            setTimeout(() => doCut('perspective(1200px) translateX(-28px) translateY(20px) rotateX(19deg) rotateY(-22deg) scale(1.15)'), 360);
            const c1 = document.getElementById('sm-crack-1');
            if (c1) c1.style.opacity = '1';
            const tsvg = trophyWrap.querySelector('svg');
            if (tsvg) tsvg.style.animation = 'sm-glow-pulse 0.9s ease-in-out infinite';
        });

        // Phase 7 â€” Second crack
        schedule(45000, () => {
            doFlash(stage, 'rgba(220,140,255,0.60)', 0.22);
            if (reactive) reactive.impact(0.95);
            punchLayer.style.animation = 'sm-zoom-punch 0.22s cubic-bezier(0.2,0,0.4,1)';
            const c2 = document.getElementById('sm-crack-2');
            if (c2) c2.style.opacity = '1';
            stage.style.animationDuration = '0.10s';
        });

        // Phase 8 â€” SHATTER
        schedule(56000, () => {
            stage.style.animation      = '';
            stage.classList.remove('sm-cam-fight');
            stage.classList.remove('sm-panic-cam');
            if (reactive) reactive.stopBattleBeat();
            stickWrap.style.animation  = '';
            botWrap.style.animation    = '';
            trophyWrap.style.animation = '';
            gripLeft.style.animation = '';
            gripRight.style.animation = '';
            gripLeft.style.opacity = '0';
            gripRight.style.opacity = '0';
            if (stickArmR) stickArmR.style.animation = '';
            if (stickArmL) stickArmL.style.animation = '';
            if (botArmR) botArmR.style.animation = '';
            if (botArmL) botArmL.style.animation = '';
            if (stickLegL) stickLegL.style.animation = '';
            if (stickLegR) stickLegR.style.animation = '';
            if (botLegL) botLegL.style.animation = '';
            if (botLegR) botLegR.style.animation = '';
            rgbLayer.style.animation = '';
            rgbLayer.style.opacity = '0';
            punchLayer.style.animation = '';
            if (panicInterval) { clearInterval(panicInterval); panicInterval = null; }

            doFlash(stage, 'rgba(255,255,255,0.94)', 0.35);
            setTimeout(() => doFlash(stage, 'rgba(180,150,255,0.50)', 0.20), 180);
            doCut('perspective(1200px) translateX(0px) translateY(24px) rotateX(21deg) rotateY(0deg) scale(1.16)');

            trophyWrap.style.opacity = '0';
            spawnDebris(stage, 80, 270, 160);

            const lh = document.createElement('div');
            lh.innerHTML = leftHalfSVG();
            lh.style.cssText = 'position:absolute;left:calc(50% - 80px);bottom:60px;z-index:7;transform-origin:bottom right;animation:sm-half-left 1.35s cubic-bezier(0.3,0,1,0.6) both;';
            stage.appendChild(lh);

            const rh = document.createElement('div');
            rh.innerHTML = rightHalfSVG();
            rh.style.cssText = 'position:absolute;left:calc(50% + 2px);bottom:60px;z-index:7;transform-origin:bottom left;animation:sm-half-right 1.35s cubic-bezier(0.3,0,1,0.6) both;';
            stage.appendChild(rh);

            setTimeout(() => { lh.remove(); rh.remove(); }, 1600);

            stickWrap.style.animation = 'sm-stickman-flyback 0.78s cubic-bezier(0.2,0.8,0.3,1) both';
            botWrap.style.animation   = 'sm-robot-flyback    0.78s cubic-bezier(0.2,0.8,0.3,1) both';
        });

        // Phase 9 â€” Dizzy stars
        schedule(61000, () => {
            spawnDizzyStars(stage, 68,  60);
            spawnDizzyStars(stage, 468, 60);
        });

        // Phase 10 â€” STALEMATE title
        schedule(66000, () => {
            const title = document.createElement('div');
            title.textContent = 'STALEMATE';
            title.style.cssText = 'font-size:44px;font-weight:900;letter-spacing:0.10em;color:#c8c8e8;text-shadow:0 0 32px rgba(140,140,220,0.65),0 2px 0 #111;animation:sm-title-slam 0.6s cubic-bezier(0.34,1.35,0.64,1) both;position:relative;z-index:10;margin-top:14px;';
            stage.appendChild(title);
        });

        // Phase 11 â€” Subtitle
        schedule(69500, () => {
            const sub = document.createElement('div');
            sub.textContent = 'They fought so hard... the trophy paid the price.';
            sub.style.cssText = 'font-size:15px;color:#666;letter-spacing:0.03em;text-align:center;max-width:360px;line-height:1.5;animation:sm-subtitle-in 0.45s ease both;position:relative;z-index:10;margin-top:8px;';
            stage.appendChild(sub);
        });

        // Phase 12 â€” Buttons
        schedule(73000, () => {
            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:12px;margin-top:24px;position:relative;z-index:10;';

            const base = 'padding:11px 26px;font-size:14px;font-weight:700;border:none;border-radius:4px;cursor:pointer;letter-spacing:0.05em;transition:transform 0.1s;animation:sm-btn-in 0.4s ease both;';

            const newGame = document.createElement('button');
            newGame.textContent = 'New Game';
            newGame.style.cssText = base + 'background:#779556;color:#fff;';
            newGame.addEventListener('mouseenter', () => newGame.style.transform = 'scale(1.04)');
            newGame.addEventListener('mouseleave', () => newGame.style.transform = 'scale(1)');
            newGame.onclick = () => { clearScheduled(); rayObj.stop(); overlay.remove(); if (typeof resetGame==='function') resetGame(); };

            const analyse = document.createElement('button');
            analyse.textContent = 'Analyse';
            analyse.style.cssText = base + 'background:#3d3b37;color:#bababa;border:1px solid #555;animation-delay:0.18s;';
            analyse.addEventListener('mouseenter', () => analyse.style.transform = 'scale(1.04)');
            analyse.addEventListener('mouseleave', () => analyse.style.transform = 'scale(1)');
            analyse.onclick = () => {
                clearScheduled(); rayObj.stop(); overlay.remove();
                const btn = document.getElementById('analysis-trigger-btn');
                if (btn) btn.click();
            };

            btnRow.appendChild(newGame);
            btnRow.appendChild(analyse);
            stage.appendChild(btnRow);
        });

        closeBtn.onclick = () => { clearScheduled(); rayObj.stop(); overlay.remove(); };
    }

    /* â”€â”€ Hook into updateStatus (same pattern as victory-animation.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function installHook() {
        if (typeof window.updateStatus !== 'function' || typeof game === 'undefined') {
            setTimeout(installHook, 60);
            return;
        }
        window.vaStalemate = playStalemateAnimation;
        if (window.__useCentralOutcomeAnimations) {
            console.log('[stalemate-animation] Manual hook installed (central outcome mode)');
            return;
        }
        const _orig = window.updateStatus;
        window.updateStatus = function () {
            _orig.apply(this, arguments);
            if (typeof game === 'undefined') return;
            if (!game.in_stalemate()) { _animPlayed = false; return; }
            if (_animPlayed) return;
            _animPlayed = true;
            setTimeout(playStalemateAnimation, 500);
        };
        window.vaStalemate = playStalemateAnimation;
        console.log('[stalemate-animation] Hooks installed (test: vaStalemate())');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', installHook);
    } else {
        setTimeout(installHook, 0);
    }

})();

