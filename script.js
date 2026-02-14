const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mainMenu = document.getElementById('main-menu');
const hud = document.getElementById('hud');
const progressFill = document.getElementById('progress-fill');
const attemptSpan = document.getElementById('attempt-count');
const crashFlash = document.getElementById('crash-flash');
const modeDisplay = document.getElementById('mode-display');

canvas.width = 800;
canvas.height = 450;

// --- PHYSICS CONSTANTS (Tuned for 60Hz) ---
const PHY = {
    GRAVITY: 0.65,
    JUMP_FORCE: -10.5,
    SHIP_LIFT: -0.35,
    SHIP_GRAVITY: 0.25,
    UFO_JUMP: -9,       
    ROBOT_JUMP_MIN: -8, 
    WAVE_SPEED: 7,      
    TERMINAL_VEL: 12,
    SPEED: 6.5,
    GROUND: 380,
    BLOCK_SIZE: 40
};

// --- LEVEL DATA ---
// Types: 1=Block, 2=Spike, 3=Ship, 4=Cube, 5=Ball, 6=UFO, 7=Wave, 8=Robot
const LEVELS = [
    // Level 1: Stereo Madness
    [
        {x: 10, y: 0, t: 2}, {x: 20, y: 0, t: 1}, {x: 25, y: 0, t: 2}, 
        {x: 35, y: 0, t: 1}, {x: 36, y: 0, t: 1}, {x: 42, y: 0, t: 2}, {x: 43, y: 0, t: 2},
        {x: 55, y: 2, t: 3}, // Ship Portal
        {x: 65, y: 3, t: 1}, {x: 75, y: 6, t: 1}, {x: 85, y: 3, t: 1},
        {x: 100, y: 0, t: 4}, // Cube Portal
        {x: 110, y: 0, t: 2}, {x: 111, y: 0, t: 2}, {x: 112, y: 0, t: 2}
    ],
    // Level 2: Back on Track (FIXED SPAWN - Spikes moved further back)
    [
        {x: 15, y: 0, t: 2}, {x: 25, y: 1, t: 1}, {x: 28, y: 2, t: 1}, {x: 31, y: 3, t: 1},
        {x: 40, y: 0, t: 2}, {x: 41, y: 0, t: 2},
        {x: 50, y: 2, t: 3}, // Ship
        {x: 60, y: 1, t: 1}, {x: 60, y: 8, t: 1},
        {x: 70, y: 2, t: 1}, {x: 70, y: 7, t: 1},
        {x: 90, y: 0, t: 4}, // Cube
        {x: 100, y: 0, t: 1}, {x: 105, y: 0, t: 2}, {x: 110, y: 0, t: 1}
    ],
    // Level 3: Polargeist
    [
        {x: 10, y: 0, t: 2}, {x: 11, y: 0, t: 2}, {x: 12, y: 0, t: 2},
        {x: 25, y: 2, t: 3}, // Ship
        {x: 40, y: 4, t: 1}, {x: 50, y: 2, t: 1}, {x: 60, y: 6, t: 1},
        {x: 80, y: 0, t: 4}, // Cube
        {x: 90, y: 0, t: 2}, {x: 95, y: 1, t: 2}, {x: 100, y: 0, t: 2}
    ],
    // Level 4: Dry Out (Showcase of ALL Modes)
    [
        {x: 10, y: 0, t: 1}, {x: 15, y: 0, t: 2},
        {x: 25, y: 1, t: 5}, // BALL
        {x: 40, y: 0, t: 2}, {x: 50, y: 4, t: 2},
        {x: 65, y: 2, t: 6}, // UFO
        {x: 80, y: 0, t: 2}, {x: 85, y: 2, t: 2}, {x: 90, y: 0, t: 2},
        {x: 105, y: 2, t: 7}, // WAVE
        {x: 115, y: 1, t: 1}, {x: 125, y: 7, t: 1},
        {x: 140, y: 0, t: 8}, // ROBOT
        {x: 150, y: 0, t: 1}, {x: 155, y: 1, t: 1}, {x: 160, y: 3, t: 1}
    ]
];

// --- GAME STATE ---
let gameState = {
    mode: "MENU",
    levelIndex: 0,
    objects: [],
    cameraX: 0,
    attempts: 1,
    levelLength: 0
};

let player = {
    x: 200, y: 0, w: 30, h: 30,
    dy: 0,
    gamemode: 'CUBE',
    rotation: 0,
    onGround: false,
    dead: false,
    gravityScale: 1, // 1 or -1 for Ball
    robotJumpTimer: 0
};

let input = { hold: false, jumpPressed: false, clickProcessed: false };

// --- INPUT HANDLING ---
function bindInput() {
    const handleDown = () => {
        if (gameState.mode === "PLAYING") {
            input.hold = true;
            input.jumpPressed = true;
            input.clickProcessed = false;
        }
    };
    const handleUp = () => { input.hold = false; player.robotJumpTimer = 0; };

    window.addEventListener('mousedown', handleDown);
    window.addEventListener('touchstart', (e) => { e.preventDefault(); handleDown(); }, {passive: false});
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') handleDown();
    });

    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp);
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') handleUp();
    });
}

// --- LEVEL MANAGEMENT ---
function startLevel(index) {
    gameState.levelIndex = index;
    gameState.attempts = 1;
    attemptSpan.innerText = gameState.attempts;
    loadLevelData(index);
    
    mainMenu.style.display = 'none';
    hud.style.display = 'block';
    gameState.mode = "PLAYING";
    
    // Start Physics Loop
    lastTime = performance.now();
    accumulator = 0;
    requestAnimationFrame(loop);
}

function loadLevelData(index) {
    gameState.objects = LEVELS[index].map(obj => ({
        x: obj.x * PHY.BLOCK_SIZE,
        y: PHY.GROUND - (obj.y * PHY.BLOCK_SIZE) - PHY.BLOCK_SIZE,
        type: obj.t,
        w: PHY.BLOCK_SIZE, h: PHY.BLOCK_SIZE
    }));
    
    if (gameState.objects.length > 0) {
        gameState.levelLength = gameState.objects[gameState.objects.length-1].x + 500;
    }
    resetPlayer();
}

function resetPlayer() {
    player.x = 200;
    player.y = PHY.GROUND - player.h;
    player.dy = 0;
    player.gamemode = 'CUBE';
    player.rotation = 0;
    player.dead = false;
    player.onGround = true;
    player.gravityScale = 1;
    gameState.cameraX = 0;
    modeDisplay.innerText = "MODE: CUBE";
    crashFlash.classList.remove('flash-active');
}

function exitToMenu() {
    gameState.mode = "MENU";
    mainMenu.style.display = 'flex';
    hud.style.display = 'none';
}

function crash() {
    if (player.dead) return;
    player.dead = true;
    gameState.attempts++;
    attemptSpan.innerText = gameState.attempts;
    
    crashFlash.classList.add('flash-active');
    setTimeout(() => crashFlash.classList.remove('flash-active'), 100);

    setTimeout(() => {
        resetPlayer();
    }, 600);
}

// --- PHYSICS ENGINE ---
function updatePhysics() {
    if (player.dead || gameState.mode !== "PLAYING") return;

    gameState.cameraX += PHY.SPEED;
    let gravity = PHY.GRAVITY * player.gravityScale;

    // --- GAMEMODE BEHAVIOR ---
    if (player.gamemode === 'CUBE') {
        player.dy += gravity;
        if (player.onGround && input.hold) {
            player.dy = PHY.JUMP_FORCE * player.gravityScale;
            player.onGround = false;
        }
        if (!player.onGround) player.rotation += 5 * player.gravityScale;
        else player.rotation = Math.round(player.rotation / 90) * 90;
    } 
    else if (player.gamemode === 'SHIP') {
        player.dy += input.hold ? PHY.SHIP_LIFT : PHY.SHIP_GRAVITY;
        player.rotation = player.dy * 2.5;
        // Ship Floor Ceiling
        if (player.y < 0) { player.y = 0; player.dy = 0; }
        if (player.y + player.h > PHY.GROUND) {
            player.y = PHY.GROUND - player.h;
            player.dy = 0;
            player.rotation = 0;
        }
    }
    else if (player.gamemode === 'BALL') {
        player.dy += gravity;
        if (player.onGround && input.jumpPressed) {
            player.gravityScale *= -1; // Flip
            player.dy = 2 * player.gravityScale; // Small push
            player.onGround = false;
            input.jumpPressed = false;
        }
        player.rotation += 5 * player.gravityScale;
    }
    else if (player.gamemode === 'UFO') {
        player.dy += gravity;
        if (input.jumpPressed && !input.clickProcessed) {
            player.dy = PHY.UFO_JUMP;
            input.clickProcessed = true; // Debounce click
            input.jumpPressed = false;
        }
    }
    else if (player.gamemode === 'WAVE') {
        player.dy = input.hold ? -PHY.WAVE_SPEED : PHY.WAVE_SPEED;
        player.rotation = player.dy * 5;
        if (player.y < 0 || player.y + player.h > PHY.GROUND) crash();
    }
    else if (player.gamemode === 'ROBOT') {
        player.dy += gravity;
        if (player.onGround && input.hold) {
            player.dy = PHY.ROBOT_JUMP_MIN;
            player.onGround = false;
            player.robotJumpTimer = 15; // Max hold time
        } else if (input.hold && player.robotJumpTimer > 0) {
            player.dy -= 0.6; // Boost
            player.robotJumpTimer--;
        }
    }

    // Terminal Velocity
    if (Math.abs(player.dy) > PHY.TERMINAL_VEL) player.dy = PHY.TERMINAL_VEL * Math.sign(player.dy);
    player.y += player.dy;

    // --- COLLISION RESOLUTION ---
    player.onGround = false; 

    // Floor Bounds (Generic)
    if (player.gamemode !== 'WAVE' && player.gamemode !== 'SHIP') {
        if (player.gravityScale === 1 && player.y + player.h >= PHY.GROUND) {
            player.y = PHY.GROUND - player.h;
            player.dy = 0;
            player.onGround = true;
        } else if (player.gravityScale === -1 && player.y <= 0) {
            player.y = 0;
            player.dy = 0;
            player.onGround = true;
        }
    }

    // Object Collision
    let pRect = {
        l: gameState.cameraX + player.x + 8, // Hitbox padding
        r: gameState.cameraX + player.x + player.w - 8,
        t: player.y + 8,
        b: player.y + player.h - 8
    };

    let nearby = gameState.objects.filter(o => 
        o.x > gameState.cameraX + 100 && o.x < gameState.cameraX + 500
    );

    for (let obj of nearby) {
        if (pRect.r > obj.x && pRect.l < obj.x + obj.w &&
            pRect.b > obj.y && pRect.t < obj.y + obj.h) {
            
            // Spikes (2)
            if (obj.type === 2) crash();

            // Portals (3-8)
            if (obj.type >= 3 && obj.type <= 8) {
                switch(obj.type) {
                    case 3: player.gamemode = 'SHIP'; break;
                    case 4: player.gamemode = 'CUBE'; break;
                    case 5: player.gamemode = 'BALL'; break;
                    case 6: player.gamemode = 'UFO'; break;
                    case 7: player.gamemode = 'WAVE'; break;
                    case 8: player.gamemode = 'ROBOT'; break;
                }
                player.gravityScale = 1;
                modeDisplay.innerText = "MODE: " + player.gamemode;
            }

            // Blocks (1)
            if (obj.type === 1) {
                if (player.gamemode === 'WAVE') crash(); // Wave dies on blocks

                let prevY = player.y - player.dy;
                let hitTop = false;

                // Collision Logic: Top vs Side/Bottom
                if (player.gravityScale === 1) {
                    // Falling down onto block
                    if (prevY + player.h <= obj.y + 15 && player.dy >= 0) {
                        player.y = obj.y - player.h;
                        player.dy = 0;
                        player.onGround = true;
                        hitTop = true;
                        if (player.gamemode === 'CUBE' || player.gamemode === 'ROBOT')
                            player.rotation = Math.round(player.rotation / 90) * 90;
                    } 
                    // Hitting head on bottom of block
                    else if (prevY >= obj.y + obj.h - 15 && player.dy < 0) {
                        player.y = obj.y + obj.h;
                        player.dy = 0;
                    } 
                    // Side collision
                    else { crash(); }
                } 
                else { // Reverse Gravity (Ball)
                    // Falling UP onto block
                    if (prevY >= obj.y + obj.h - 15 && player.dy <= 0) {
                        player.y = obj.y + obj.h;
                        player.dy = 0;
                        player.onGround = true;
                        hitTop = true;
                    } else { crash(); }
                }
            }
        }
    }

    // Level Complete
    if (gameState.cameraX > gameState.levelLength) exitToMenu();

    // UI
    let pct = Math.min((gameState.cameraX / gameState.levelLength) * 100, 100);
    progressFill.style.width = pct + '%';
}

// --- RENDERER ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dynamic Background
    let bgCol = '#001133';
    if (player.gamemode === 'SHIP') bgCol = '#1a0022';
    if (player.gamemode === 'BALL') bgCol = '#330000';
    if (player.gamemode === 'WAVE') bgCol = '#003311';
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Floor
    ctx.fillStyle = '#000';
    ctx.fillRect(0, PHY.GROUND, canvas.width, canvas.height - PHY.GROUND);
    ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, PHY.GROUND); ctx.lineTo(canvas.width, PHY.GROUND); ctx.stroke();

    // Draw Objects
    gameState.objects.forEach(obj => {
        let drawX = obj.x - gameState.cameraX;
        if (drawX > -50 && drawX < 850) {
            // Block
            if (obj.type === 1) {
                ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
                ctx.strokeRect(drawX, obj.y, obj.w, obj.h);
                ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(drawX, obj.y, obj.w, obj.h);
            } 
            // Spike
            else if (obj.type === 2) {
                ctx.fillStyle = 'red'; ctx.beginPath();
                if (player.gravityScale === 1) {
                    ctx.moveTo(drawX, obj.y + obj.h); ctx.lineTo(drawX + obj.w/2, obj.y); ctx.lineTo(drawX + obj.w, obj.y + obj.h);
                } else {
                    ctx.moveTo(drawX, obj.y); ctx.lineTo(drawX + obj.w/2, obj.y + obj.h); ctx.lineTo(drawX + obj.w, obj.y);
                }
                ctx.fill(); ctx.stroke();
            } 
            // Portals
            else if (obj.type >= 3) {
                let colors = {3:'pink', 4:'cyan', 5:'orange', 6:'purple', 7:'blue', 8:'white'};
                ctx.fillStyle = colors[obj.type] || 'gray';
                ctx.fillRect(drawX, 0, 40, 450);
                // Portal Label
                ctx.fillStyle = 'black'; ctx.font = "12px Arial"; ctx.fillText(player.gamemode, drawX, 50);
            }
        }
    });

    // Draw Player
    if (!player.dead) {
        ctx.save();
        ctx.translate(player.x + player.w/2, player.y + player.h/2);
        ctx.rotate(player.rotation * Math.PI / 180);
        
        ctx.fillStyle = player.gamemode === 'SHIP' ? '#ff55aa' : '#00ffff';
        
        if (player.gamemode === 'WAVE') {
            ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(15, 0); ctx.lineTo(-15, 15); ctx.fill();
        } else {
            ctx.fillRect(-player.w/2, -player.w/2, player.w, player.w);
            ctx.strokeStyle = 'black'; ctx.lineWidth = 2;
            ctx.strokeRect(-player.w/2 + 5, -player.w/2 + 5, player.w - 10, player.w - 10);
            // Face
            ctx.fillStyle = 'black'; ctx.fillRect(5, -5, 5, 5);
        }
        ctx.restore();
    }
}

// --- GAME LOOP (Fixed Time Step) ---
let lastTime = 0;
let accumulator = 0;
const STEP = 1/60;

function loop(timestamp) {
    if (gameState.mode !== "PLAYING") return;
    if (!lastTime) lastTime = timestamp;
    let deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (deltaTime > 0.1) deltaTime = 0.1;

    accumulator += deltaTime;
    while (accumulator >= STEP) {
        updatePhysics();
        accumulator -= STEP;
    }
    draw();
    requestAnimationFrame(loop);
}

bindInput();
