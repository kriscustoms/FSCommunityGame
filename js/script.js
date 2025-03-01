'use strict';

console.log('Script started');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });
const scoreDisplay = document.getElementById('score');
const highScoreDisplay = document.getElementById('highScore');
const levelDisplay = document.getElementById('level');
const livesDisplay = document.getElementById('lives');

function resizeCanvas() {
    try {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(window.innerWidth * dpr);
        const height = Math.floor(window.innerHeight * dpr);
        if (width > 0 && height > 0) {
            canvas.width = width;
            canvas.height = height;
            canvas.style.width = window.innerWidth + 'px';
            canvas.style.height = window.innerHeight + 'px';
            ctx.scale(dpr, dpr);
            ctx.imageSmoothingEnabled = false;
            console.log(`Canvas resized: ${width}x${height}, DPR: ${dpr}`);
        } else {
            console.error('Invalid canvas dimensions');
        }
    } catch (e) {
        console.error('resizeCanvas error:', e);
    }
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function ensureAudioContext() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(frequencies, duration, type = 'square') {
    try {
        ensureAudioContext();
        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.connect(audioCtx.destination);
        const oscillator = audioCtx.createOscillator();
        oscillator.type = type;
        if (Array.isArray(frequencies)) {
            oscillator.frequency.setValueAtTime(frequencies[0], audioCtx.currentTime);
            oscillator.frequency.linearRampToValueAtTime(frequencies[1], audioCtx.currentTime + duration);
        } else {
            oscillator.frequency.setValueAtTime(frequencies, audioCtx.currentTime);
        }
        oscillator.connect(gainNode);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.error('playSound error:', e);
    }
}

const playRocketBoost = () => playSound([200, 400], 0.2);
const playCoinGrab = () => playSound([800, 1000], 0.1, 'sine');
const playPipePass = () => playSound([300, 350], 0.15);
const playCrash = () => playSound([200, 150], 0.2, 'sine');
const playFullSendShout = () => playSound([500, 600], 0.3, 'sawtooth');
const playPowerUp = () => playSound([600, 800], 0.2, 'sine');
const playHeartGrab = () => playSound([700, 900], 0.15, 'triangle');
const playVictory = () => playSound([1000, 1200], 0.5, 'sine');

const flyingObjects = [
    {
        name: 'UFO',
        unlockScore: 0,
        stats: { width: 60, height: 60, lift: -10, gravity: 0.5 }
    },
    {
        name: 'Rocket',
        unlockScore: 500,
        stats: { width: 60, height: 60, lift: -12, gravity: 0.5 }
    },
    {
        name: 'Spaceship',
        unlockScore: 1000,
        stats: { width: 60, height: 60, lift: -10, gravity: 0.45 }
    },
    {
        name: 'Drone',
        unlockScore: 5000,
        stats: { width: 50, height: 50, lift: -10, gravity: 0.5 }
    }
];

const unlocks = JSON.parse(localStorage.getItem('unlocks')) || flyingObjects.map(o => o.unlockScore === 0);
let currentObjectIndex = 0;

let player = {
    x: 50,
    y: canvas.height / 2,
    width: flyingObjects[0].stats.width,
    height: flyingObjects[0].stats.height,
    velocity: 0,
    gravity: flyingObjects[0].stats.gravity,
    lift: flyingObjects[0].stats.lift,
    boost: false,
    boostTimer: 0,
    invincible: false,
    invincibleTimer: 0,
    invincibleCount: 0
};
let obstacles = [];
let coins = [];
let particles = [];
let score = 0;
let highScore = localStorage.getItem('highScore') || 0;
let level = 1;
let lives = 3;
const maxLives = 5;
let coinCount = 0;
let pipeStreak = 0;
let powerUp = null;
highScoreDisplay.textContent = `${highScore}`;
levelDisplay.textContent = `${level}`;
livesDisplay.textContent = `${lives}`;
let gameOver = false;
let intro = true;
let victory = false;
let pipeGap = 300;
let pipeSpeed = 2.5;
let coinSize = 20;
let frame = 0;
let lastInputTime = 0;
let lastCollisionTime = 0;
let objectAreas = [];
let shakeTimer = 0;

let stars = Array(100).fill().map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    speed: Math.random() * 0.8 + 0.5,
    size: Math.random() * 3 + 1
}));
let nebulas = Array(7).fill().map(() => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    size: Math.random() * 120 + 60,
    color: `hsl(${Math.random() * 360}, 80%, 60%)`
}));

const mockLeaders = [
    ['@Fromoon888', 2305],
    ['@BecsterCrypto', 1375],
    ['@KrisCustoms_', 1140]
];

function createParticles(x, y, type, count = 10) {
    if (particles.length + count > 200) return;
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: type === 'crash' ? 30 : type === 'victory' ? 50 : 20,
            color: type === 'coin' ? '#FFD700' : type === 'heart' ? '#FF4444' : type === 'crash' ? '#FF0000' : type === 'victory' ? `hsl(${Math.random() * 360}, 100%, 50%)` : '#FFFFFF',
            size: Math.random() * 4 + 2
        });
    }
}

function updateParticles() {
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        p.size *= 0.97;
    });
}

function drawParticles() {
    try {
        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        });
    } catch (e) {
        console.error('drawParticles error:', e);
    }
}

function handleMobileInput(event) {
    try {
        event.preventDefault();
        const currentTime = Date.now();
        if (currentTime - lastInputTime < 150) return;
        lastInputTime = currentTime;

        const touch = event.touches[0];
        const x = touch.clientX;
        const y = touch.clientY;

        console.log(`Touch at: ${x}, ${y}`);

        if (intro) {
            for (let i = 0; i < flyingObjects.length; i++) {
                const area = objectAreas[i];
                if (area && x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height && unlocks[i]) {
                    currentObjectIndex = i;
                    Object.assign(player, flyingObjects[i].stats);
                    intro = false;
                    playRocketBoost();
                    console.log(`Selected object: ${flyingObjects[i].name}`);
                    break;
                }
            }
        } else if (!gameOver && !victory) {
            player.velocity = player.lift;
            playRocketBoost();
        } else {
            const buttonWidth = 220;
            const buttonHeight = 50;
            const centerX = canvas.width / 2 - buttonWidth / 2;
            const playAgainY = canvas.height / 2 + 80;
            const postScoreY = canvas.height / 2 + 150;
            const touchBuffer = 20;

            if (x >= centerX && x <= centerX + buttonWidth && 
                y >= playAgainY - touchBuffer && y <= playAgainY + buttonHeight + touchBuffer) {
                resetGame();
                console.log('Reset game');
            } else if (x >= centerX && x <= centerX + buttonWidth && 
                     y >= postScoreY - touchBuffer && y <= postScoreY + buttonHeight + touchBuffer) {
                const tweet = victory ? `I escaped the galaxy with ${score} points in $fullsend Community Challenge! #FullSend` : `Scored ${score} in $fullsend Community Challenge! #FullSend`;
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`, '_blank');
                console.log('Tweet posted');
            }
        }
    } catch (e) {
        console.error('handleMobileInput error:', e);
    }
}

function handleDesktopInput(event) {
    try {
        if (event.code !== 'Space') return;
        event.preventDefault();
        const currentTime = Date.now();
        if (currentTime - lastInputTime < 150) return;
        lastInputTime = currentTime;

        if (intro) {
            currentObjectIndex = 0;
            Object.assign(player, flyingObjects[0].stats);
            intro = false;
            playRocketBoost();
            console.log('Started with default UFO via spacebar');
        } else if (!gameOver && !victory) {
            player.velocity = player.lift;
            playRocketBoost();
        } else {
            resetGame();
            console.log('Reset game via spacebar');
        }
    } catch (e) {
        console.error('handleDesktopInput error:', e);
    }
}

function handleDesktopInputMouse(event) {
    try {
        event.preventDefault();
        const currentTime = Date.now();
        if (currentTime - lastInputTime < 150) return;
        lastInputTime = currentTime;

        const x = event.clientX;
        const y = event.clientY;

        console.log(`Mouse click at: ${x}, ${y}`);

        if (intro) {
            for (let i = 0; i < flyingObjects.length; i++) {
                const area = objectAreas[i];
                if (area && x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height && unlocks[i]) {
                    currentObjectIndex = i;
                    Object.assign(player, flyingObjects[i].stats);
                    intro = false;
                    playRocketBoost();
                    console.log(`Selected object: ${flyingObjects[i].name}`);
                    break;
                }
            }
        } else if (gameOver || victory) {
            const buttonWidth = 220;
            const buttonHeight = 50;
            const centerX = canvas.width / 2 - buttonWidth / 2;
            const playAgainY = canvas.height / 2 + 80;
            const postScoreY = canvas.height / 2 + 150;

            if (x >= centerX && x <= centerX + buttonWidth && 
                y >= playAgainY && y <= playAgainY + buttonHeight) {
                resetGame();
                console.log('Reset game via mouse');
            } else if (x >= centerX && x <= centerX + buttonWidth && 
                     y >= postScoreY && y <= postScoreY + buttonHeight) {
                const tweet = victory ? `I escaped the galaxy with ${score} points in $fullsend Community Challenge! #FullSend` : `Scored ${score} in $fullsend Community Challenge! #FullSend`;
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`, '_blank');
                console.log('Tweet posted via mouse');
            }
        }
    } catch (e) {
        console.error('handleDesktopInputMouse error:', e);
    }
}

canvas.addEventListener('touchstart', handleMobileInput, { passive: false });
window.addEventListener('keydown', handleDesktopInput);
canvas.addEventListener('mousedown', handleDesktopInputMouse);

class Obstacle {
    constructor(x, height, isTop) {
        this.x = x;
        this.height = height;
        this.isTop = isTop;
        this.width = 80;
        this.passed = false;
        this.rings = [];
        for (let i = 0; i < 3; i++) {
            this.rings.push({
                y: Math.random() * this.height,
                alpha: 1,
                speed: (Math.random() - 0.5) * 0.5
            });
        }
    }
    draw() {
        try {
            const gradient = ctx.createLinearGradient(this.x, 0, this.x + this.width, 0);
            gradient.addColorStop(0, score < 200 ? 'rgba(192, 192, 192, 0.8)' : 'rgba(255, 0, 0, 0.8)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
            ctx.fillStyle = gradient;
            if (this.isTop) {
                ctx.fillRect(this.x, 0, this.width, this.height);
            } else {
                ctx.fillRect(this.x, canvas.height - this.height, this.width, this.height);
            }
            ctx.strokeStyle = score < 200 ? '#FFFFFF' : '#FF4444';
            ctx.lineWidth = 2;
            this.rings.forEach(ring => {
                const ringY = this.isTop ? ring.y : canvas.height - this.height + ring.y;
                ctx.globalAlpha = ring.alpha;
                ctx.beginPath();
                ctx.arc(this.x + this.width / 2, ringY, this.width / 2, 0, Math.PI * 2);
                ctx.stroke();
            });
            ctx.globalAlpha = 1;
        } catch (e) {
            console.error('Obstacle.draw error:', e);
        }
    }
    update() {
        this.x -= pipeSpeed;
        this.rings.forEach(ring => {
            ring.y += ring.speed;
            ring.alpha = Math.max(0, ring.alpha - 0.01);
            if (ring.y < 0 || ring.y > this.height) {
                ring.y = this.isTop ? this.height : 0;
                ring.alpha = 1;
            }
        });
    }
}

class Coin {
    constructor(x, y, type = 'coin') {
        this.x = x;
        this.y = y;
        this.type = type;
    }
    draw() {
        try {
            if (this.type === 'heart') {
                ctx.fillStyle = '#FF4444';
                ctx.beginPath();
                ctx.moveTo(this.x, this.y + coinSize / 4);
                ctx.quadraticCurveTo(this.x - coinSize / 2, this.y - coinSize / 4, this.x, this.y - coinSize / 2);
                ctx.quadraticCurveTo(this.x + coinSize / 2, this.y - coinSize / 4, this.x, this.y + coinSize / 4);
                ctx.fill();
            } else if (this.type === 'powerUp') {
                ctx.fillStyle = '#FF0000';
                ctx.beginPath();
                ctx.arc(this.x, this.y, coinSize / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('$', this.x, this.y + 3);
            } else {
                ctx.fillStyle = '#FFD700';
                ctx.beginPath();
                ctx.arc(this.x, this.y, coinSize / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000000';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('$', this.x, this.y + 3);
            }
        } catch (e) {
            console.error('Coin.draw error:', e);
        }
    }
    update() {
        this.x -= pipeSpeed;
    }
}

function resetGame() {
    try {
        player = {
            x: 50,
            y: canvas.height / 2,
            width: flyingObjects[currentObjectIndex].stats.width,
            height: flyingObjects[currentObjectIndex].stats.height,
            velocity: 0,
            gravity: flyingObjects[currentObjectIndex].stats.gravity,
            lift: flyingObjects[currentObjectIndex].stats.lift,
            boost: false,
            boostTimer: 0,
            invincible: false,
            invincibleTimer: 0,
            invincibleCount: 0
        };
        obstacles = [];
        coins = [];
        particles = [];
        score = 0;
        level = 1;
        lives = 3;
        coinCount = 0;
        pipeStreak = 0;
        powerUp = null;
        pipeSpeed = 2.5;
        pipeGap = 300;
        scoreDisplay.textContent = `${score}`;
        levelDisplay.textContent = `${level}`;
        livesDisplay.textContent = `${lives}`;
        gameOver = false;
        intro = true;
        victory = false;
        frame = 0;
        lastCollisionTime = 0;
        shakeTimer = 0;
        resetBackground();
        console.log('Game reset');
    } catch (e) {
        console.error('resetGame error:', e);
    }
}

function resetBackground() {
    try {
        stars = Array(100).fill().map(() => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            speed: Math.random() * 0.8 + 0.5,
            size: Math.random() * 3 + 1
        }));
        nebulas = Array(7).fill().map(() => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 120 + 60,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`
        }));
    } catch (e) {
        console.error('resetBackground error:', e);
    }
}

function generateObstacles() {
    try {
        if (frame % 150 === 0) {
            const minHeight = canvas.height * 0.2;
            const maxHeight = canvas.height * 0.6;
            const pipeHeight = Math.random() * (maxHeight - minHeight) + minHeight;
            obstacles.push(new Obstacle(canvas.width, pipeHeight, true));
            obstacles.push(new Obstacle(canvas.width, canvas.height - pipeHeight - pipeGap, false));
            const coinY = pipeHeight + pipeGap / 2;
            const rand = Math.random();
            if (rand < 0.1) {
                coins.push(new Coin(canvas.width + 80 / 2, coinY, 'powerUp'));
            } else if (rand < 0.15) {
                coins.push(new Coin(canvas.width + 80 / 2, coinY, 'heart'));
            } else {
                coins.push(new Coin(canvas.width + 80 / 2, coinY, 'coin'));
            }
        }
    } catch (e) {
        console.error('generateObstacles error:', e);
    }
}

function getLevelThreshold(level) {
    if (level === 1) return 50;
    if (level === 2) return 100;
    if (level === 3) return 175;
    if (level === 4) return 275;
    return 275 + (level - 4) * 100;
}

function updateLevel() {
    try {
        const threshold = getLevelThreshold(level);
        if (score >= threshold && (level === 1 || score < getLevelThreshold(level + 1))) {
            level++;
            pipeSpeed = 2.5 + (level - 1) * 0.2;
            pipeGap = level >= 3 ? Math.max(200, 300 - (level - 2) * 20) : 300;
            levelDisplay.textContent = `${level}`;
        }
    } catch (e) {
        console.error('updateLevel error:', e);
    }
}

function checkInvincibility() {
    try {
        const nextThreshold = 250 * (player.invincibleCount + 1);
        if (score >= nextThreshold && !player.invincible && !powerUp) {
            player.invincible = true;
            player.invincibleCount++;
            player.invincibleTimer = 900;
            playPowerUp();
        }
        if (player.invincible) {
            player.invincibleTimer--;
            if (player.invincibleTimer <= 0) {
                player.invincible = false;
            }
        }
    } catch (e) {
        console.error('checkInvincibility error:', e);
    }
}

function detectCollision() {
    try {
        if (Date.now() - lastCollisionTime < 200) return;

        for (let i = coins.length - 1; i >= 0; i--) {
            const coin = coins[i];
            if (
                player.x < coin.x + coinSize &&
                player.x + player.width > coin.x &&
                player.y < coin.y + coinSize &&
                player.y + player.height > coin.y
            ) {
                if (coin.type === 'powerUp') {
                    const rand = Math.random();
                    if (rand < 0.33) powerUp = { type: 'double', timer: 600 };
                    else if (rand < 0.66) powerUp = { type: 'slow', timer: 600 };
                    else if (rand < 0.83) powerUp = { type: 'shield', timer: 300 };
                    else powerUp = { type: 'blast', timer: 10 };
                    playPowerUp();
                    createParticles(coin.x, coin.y, 'coin');
                } else if (coin.type === 'heart' && lives < maxLives) {
                    lives++;
                    livesDisplay.textContent = `${lives}`;
                    playHeartGrab();
                    createParticles(coin.x, coin.y, 'heart');
                } else if (coin.type === 'coin') {
                    score += powerUp?.type === 'double' ? 20 : 10;
                    coinCount++;
                    playCoinGrab();
                    createParticles(coin.x, coin.y, 'coin');
                    if (coinCount >= 5) {
                        player.boost = true;
                        player.boostTimer = 200;
                        coinCount = 0;
                        playFullSendShout();
                    }
                }
                coins.splice(i, 1);
            }
        }

        if (player.invincible) return;

        let collisionDetected = false;
        if (player.y + player.height > canvas.height || player.y < 0) collisionDetected = true;

        for (const obstacle of obstacles) {
            if (
                player.x + player.width > obstacle.x &&
                player.x < obstacle.x + obstacle.width &&
                ((obstacle.isTop && player.y < obstacle.height) || 
                 (!obstacle.isTop && player.y + player.height > canvas.height - obstacle.height))
            ) {
                collisionDetected = true;
                break;
            }
        }

        if (collisionDetected) {
            lastCollisionTime = Date.now();
            if (powerUp && powerUp.type === 'shield') {
                powerUp = null;
                createParticles(player.x + player.width / 2, player.y + player.height / 2, 'crash', 20);
                playCrash();
            } else if (lives > 1) {
                lives--;
                livesDisplay.textContent = `${lives}`;
                player.y = canvas.height / 2;
                player.velocity = 0;
                obstacles = obstacles.filter(o => o.x + o.width < player.x);
                createParticles(player.x + player.width / 2, player.y + player.height / 2, 'crash', 20);
                playCrash();
                shakeTimer = 10;
            } else {
                lives = 0;
                livesDisplay.textContent = `${lives}`;
                gameOver = true;
                createParticles(player.x + player.width / 2, player.y + player.height / 2, 'crash', 20);
                playCrash();
                shakeTimer = 10;
            }
        }

        if (powerUp && powerUp.type === 'blast' && powerUp.timer > 0) {
            obstacles = [];
            powerUp.timer--;
            createParticles(canvas.width / 2, canvas.height / 2, 'crash');
        }
    } catch (e) {
        console.error('detectCollision error:', e);
    }
}

function updateScore() {
    try {
        for (const obstacle of obstacles) {
            if (obstacle.x + obstacle.width < player.x && !obstacle.passed) {
                obstacle.passed = true;
                if (!obstacle.isTop) {
                    score += powerUp?.type === 'double' ? 10 : 5;
                    pipeStreak++;
                    if (pipeStreak % 3 === 0) {
                        score += 10;
                        playCoinGrab();
                    }
                    playPipePass();
                }
            }
        }
        scoreDisplay.textContent = `${score}`;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('highScore', highScore);
            highScoreDisplay.textContent = `${highScore}`;
        }
        flyingObjects.forEach((obj, i) => {
            if (score >= obj.unlockScore && !unlocks[i]) {
                unlocks[i] = true;
                localStorage.setItem('unlocks', JSON.stringify(unlocks));
                console.log(`Unlocked ${obj.name} at score ${score}`);
            }
        });
        if (score >= 10000 && !victory) {
            victory = true;
            playVictory();
            createParticles(canvas.width / 2, canvas.height / 2, 'victory', 50);
        }
        updateLevel();
        if (score > 0 && score % 200 === 0) resetBackground();
    } catch (e) {
        console.error('updateScore error:', e);
    }
}

function drawBackground() {
    try {
        const stage = Math.floor(score / 200);
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, `#${stage % 2 === 0 ? '000033' : '1A0033'}`);
        gradient.addColorStop(1, '#000000');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        stars.forEach(star => {
            ctx.fillStyle = `hsl(${Math.random() * 360}, 100%, 80%)`;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size * (1 + stage * 0.1), 0, Math.PI * 2);
            ctx.fill();
            star.x -= star.speed * (1 + stage * 0.1);
            if (star.x < 0) star.x = canvas.width;
        });

        nebulas.forEach(nebula => {
            const pulse = Math.sin(frame * 0.03) * 0.1 + 1;
            ctx.fillStyle = nebula.color;
            ctx.globalAlpha = 0.4 + (stage % 2) * 0.2;
            ctx.beginPath();
            ctx.arc(nebula.x, nebula.y, nebula.size * pulse * (1 + stage * 0.1), 0, Math.PI * 2);
            ctx.fill();
            nebula.x -= pipeSpeed * 0.5;
            if (nebula.x + nebula.size < 0) {
                nebula.x = canvas.width + nebula.size;
                nebula.y = Math.random() * canvas.height;
                nebula.color = `hsl(${Math.random() * 360}, 80%, 60%)`;
            }
        });
        ctx.globalAlpha = 1;
    } catch (e) {
        console.error('drawBackground error:', e);
    }
}

function drawPlayer() {
    try {
        if (frame % 10 < 5 && (player.invincible || powerUp?.type === 'shield')) {
            ctx.globalAlpha = 0.5;
        } else {
            ctx.globalAlpha = 1;
        }
        if (player.boost || powerUp || player.invincible) {
            const effectColor = player.boost ? '#FF0000' : 
                               powerUp?.type === 'double' ? '#FFFF00' : 
                               powerUp?.type === 'slow' ? '#00FF00' : 
                               powerUp?.type === 'shield' ? '#00FFFF' : 
                               player.invincible ? '#FFFFFF' : '#FFFFFF';
            ctx.fillStyle = effectColor;
            ctx.beginPath();
            ctx.arc(player.x + player.width / 2, player.y + player.height / 2, player.width / 2 + 5, 0, Math.PI * 2);
            ctx.fill();

            if (player.boost && frame % 2 === 0) {
                for (let i = 0; i < 3; i++) {
                    particles.push({
                        x: player.x + player.width / 2,
                        y: player.y + player.height / 2,
                        vx: -(Math.random() * 3 + 1),
                        vy: (Math.random() - 0.5) * 2,
                        life: 15,
                        color: '#FF4500',
                        size: Math.random() * 3 + 1
                    });
                }
            }
        }

        // Draw player based on currentObjectIndex without SVG
        switch (currentObjectIndex) {
            case 0: // UFO
                ctx.fillStyle = '#FF0000';
                ctx.beginPath();
                ctx.ellipse(player.x + player.width / 2, player.y + player.height * 2 / 3, player.width / 2, player.height / 4, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#C0C0C0';
                ctx.beginPath();
                ctx.ellipse(player.x + player.width / 2, player.y + player.height / 3, player.width / 3, player.height / 5, 0, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 1: // Rocket
                ctx.fillStyle = '#FF4500';
                ctx.fillRect(player.x + player.width / 3, player.y + player.height / 6, player.width / 3, player.height * 2 / 3);
                ctx.fillStyle = '#FFFF00';
                ctx.beginPath();
                ctx.moveTo(player.x + player.width / 2, player.y + player.height);
                ctx.quadraticCurveTo(player.x + player.width * 2 / 3, player.y + player.height * 4 / 3, player.x + player.width, player.y + player.height);
                ctx.fill();
                break;
            case 2: // Spaceship
                ctx.fillStyle = '#00CED1';
                ctx.beginPath();
                ctx.moveTo(player.x, player.y + player.height / 2);
                ctx.lineTo(player.x + player.width / 2, player.y);
                ctx.lineTo(player.x + player.width, player.y + player.height / 2);
                ctx.lineTo(player.x + player.width * 2 / 3, player.y + player.height);
                ctx.lineTo(player.x + player.width / 3, player.y + player.height);
                ctx.closePath();
                ctx.fill();
                break;
            case 3: // Drone
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(player.x + player.width / 4, player.y + player.height * 2 / 5, player.width / 2, player.height / 5);
                ctx.fillStyle = '#000000';
                ctx.beginPath();
                ctx.arc(player.x + player.width / 3, player.y + player.height / 3, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(player.x + player.width * 2 / 3, player.y + player.height / 3, 5, 0, Math.PI * 2);
                ctx.fill();
                break;
        }
        ctx.globalAlpha = 1;
    } catch (e) {
        console.error('drawPlayer error:', e);
    }
}

function drawMockLeaderboard() {
    try {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '28px "Impact", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Top $fullsend Scores:', canvas.width / 2, canvas.height / 2 - 80);
        mockLeaders.forEach((leader, i) => {
            ctx.fillText(`${i + 1}. ${leader[0]} - ${leader[1]}`, canvas.width / 2, canvas.height / 2 - 40 + i * 40);
        });
        ctx.textAlign = 'left';
    } catch (e) {
        console.error('drawMockLeaderboard error:', e);
    }
}

let lastFrameTime = 0;
function gameLoop(timestamp) {
    try {
        if (!lastFrameTime) lastFrameTime = timestamp;
        const deltaTime = Math.min(timestamp - lastFrameTime, 100);
        if (deltaTime > 50) return;
        lastFrameTime = timestamp;

        ctx.save();
        if (shakeTimer > 0) {
            const shakeX = (Math.random() - 0.5) * 10;
            const shakeY = (Math.random() - 0.5) * 10;
            ctx.translate(shakeX, shakeY);
            shakeTimer--;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();

        if (intro) {
            console.log('Rendering intro screen');
            const objectSize = 50;
            const objectSpacing = 20;
            const totalWidth = flyingObjects.length * objectSize + (flyingObjects.length - 1) * objectSpacing;
            const startX = (canvas.width / 2 - totalWidth / 2);
            const objectY = canvas.height / 2 - 120;
            objectAreas = flyingObjects.map((_, i) => ({
                x: startX + i * (objectSize + objectSpacing),
                y: objectY,
                width: objectSize,
                height: objectSize
            }));

            ctx.fillStyle = '#FF0000';
            ctx.font = `bold ${Math.min(36, canvas.width / 20)}px "Impact", sans-serif`;
            ctx.textAlign = 'center';
            ctx.shadowBlur = 3;
            ctx.shadowColor = '#FF0000';
            ctx.fillText('$FULLSEND', canvas.width / 2, 50);
            ctx.fillText('COMMUNITY CHALLENGE', canvas.width / 2, 80);
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#FFFFFF';
            ctx.font = `${Math.min(24, canvas.width / 30)}px "Impact", sans-serif`;
            ctx.fillText('Tap an object to start (Unlock at scores):', canvas.width / 2, 116);

            flyingObjects.forEach((obj, i) => {
                ctx.globalAlpha = unlocks[i] ? 1 : 0.3;
                switch (i) {
                    case 0: // UFO
                        ctx.fillStyle = '#FF0000';
                        ctx.beginPath();
                        ctx.ellipse(objectAreas[i].x + objectSize / 2, objectAreas[i].y + objectSize * 2 / 3, objectSize / 2, objectSize / 4, 0, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = '#C0C0C0';
                        ctx.beginPath();
                        ctx.ellipse(objectAreas[i].x + objectSize / 2, objectAreas[i].y + objectSize / 3, objectSize / 3, objectSize / 5, 0, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 1: // Rocket
                        ctx.fillStyle = '#FF4500';
                        ctx.fillRect(objectAreas[i].x + objectSize / 3, objectAreas[i].y + objectSize / 6, objectSize / 3, objectSize * 2 / 3);
                        ctx.fillStyle = '#FFFF00';
                        ctx.beginPath();
                        ctx.moveTo(objectAreas[i].x + objectSize / 2, objectAreas[i].y + objectSize);
                        ctx.quadraticCurveTo(objectAreas[i].x + objectSize * 2 / 3, objectAreas[i].y + objectSize * 4 / 3, objectAreas[i].x + objectSize, objectAreas[i].y + objectSize);
                        ctx.fill();
                        break;
                    case 2: // Spaceship
                        ctx.fillStyle = '#00CED1';
                        ctx.beginPath();
                        ctx.moveTo(objectAreas[i].x, objectAreas[i].y + objectSize / 2);
                        ctx.lineTo(objectAreas[i].x + objectSize / 2, objectAreas[i].y);
                        ctx.lineTo(objectAreas[i].x + objectSize, objectAreas[i].y + objectSize / 2);
                        ctx.lineTo(objectAreas[i].x + objectSize * 2 / 3, objectAreas[i].y + objectSize);
                        ctx.lineTo(objectAreas[i].x + objectSize / 3, objectAreas[i].y + objectSize);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    case 3: // Drone
                        ctx.fillStyle = '#FFD700';
                        ctx.fillRect(objectAreas[i].x + objectSize / 4, objectAreas[i].y + objectSize * 2 / 5, objectSize / 2, objectSize / 5);
                        ctx.fillStyle = '#000000';
                        ctx.beginPath();
                        ctx.arc(objectAreas[i].x + objectSize / 3, objectAreas[i].y + objectSize / 3, 5, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.arc(objectAreas[i].x + objectSize * 2 / 3, objectAreas[i].y + objectSize / 3, 5, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                }
                ctx.fillStyle = '#FFFFFF';
                ctx.font = `${Math.min(16, canvas.width / 40)}px "Impact", sans-serif`;
                ctx.fillText(obj.unlockScore.toString(), objectAreas[i].x + objectSize / 2, objectAreas[i].y + objectSize + 15);
            });
            ctx.globalAlpha = 1;

            const keyStartY = objectY + objectSize + 40;
            ctx.font = `${Math.min(16, canvas.width / 40)}px "Impact", sans-serif`;
            ctx.textAlign = 'left';
            const keyX = 20;
            let currentY = keyStartY;

            ctx.fillText('Power-Ups:', keyX, currentY);
            currentY += 20;
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(keyX + 7.5, currentY - 5, 7.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.font = '10px sans-serif';
            ctx.fillText('$', keyX + 7.5, currentY - 2);
            ctx.font = `${Math.min(16, canvas.width / 40)}px "Impact", sans-serif`;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Boost (5 Coins, Red)', keyX + 20, currentY);
            currentY += 20;
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.arc(keyX + 7.5, currentY - 5, 7.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '10px sans-serif';
            ctx.fillText('$', keyX + 7.5, currentY - 2);
            ctx.font = `${Math.min(16, canvas.width / 40)}px "Impact", sans-serif`;
            ctx.fillText('Random:', keyX + 20, currentY);
            currentY += 20;

            const powerUps = [
                { color: '#FFFF00', text: 'Double Score' },
                { color: '#00FF00', text: 'Slow Motion' },
                { color: '#00FFFF', text: 'Shield' },
                { color: '#FF0000', text: 'Blast' }
            ];
            powerUps.forEach(p => {
                ctx.fillStyle = p.color;
                ctx.fillRect(keyX + 5, currentY - 10, 15, 15);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(p.text, keyX + 25, currentY);
                currentY += 20;
            });

            ctx.fillStyle = '#FF4444';
            ctx.beginPath();
            ctx.moveTo(keyX + 7.5, currentY - 2.5);
            ctx.quadraticCurveTo(keyX, currentY - 7.5, keyX + 7.5, currentY - 12.5);
            ctx.quadraticCurveTo(keyX + 15, currentY - 7.5, keyX + 7.5, currentY - 2.5);
            ctx.fill();
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Extra Life', keyX + 20, currentY);
            currentY += 20;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(keyX, currentY - 10, 15, 15);
            ctx.fillText('Invincibility (Milestones)', keyX + 20, currentY);

            ctx.textAlign = 'left';
        } else if (!gameOver && !victory) {
            console.log('Rendering gameplay');
            player.velocity += player.gravity * (deltaTime / 16.67);
            player.y += player.velocity * (deltaTime / 16.67);
            if (player.boost) {
                player.velocity -= 0.2 * (deltaTime / 16.67);
                pipeGap = 350;
                player.boostTimer -= (deltaTime / 16.67);
                if (player.boostTimer <= 0) player.boost = false;
            }
            if (powerUp) {
                if (powerUp.type === 'slow') pipeSpeed = 1.5;
                powerUp.timer -= (deltaTime / 16.67);
                if (powerUp.timer <= 0 && powerUp.type !== 'blast') {
                    powerUp = null;
                    pipeSpeed = 2.5 + (level - 1) * 0.2;
                }
            }
            checkInvincibility();
            generateObstacles();
            obstacles.forEach(obstacle => {
                obstacle.update();
                obstacle.draw();
            });
            coins.forEach(coin => {
                coin.update();
                coin.draw();
            });
            drawPlayer();
            detectCollision();
            updateScore();
            updateParticles();
            drawParticles();
            obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width > 0);
            coins = coins.filter(coin => coin.x + coinSize > 0);
            frame++;
        } else {
            console.log('Rendering game over/victory screen');
            ctx.fillStyle = victory ? '#00FF00' : '#FF0000';
            ctx.font = 'bold 48px "Impact", sans-serif';
            ctx.textAlign = 'center';
            ctx.shadowBlur = 10;
            ctx.shadowColor = victory ? '#00FF00' : '#FFFFFF';
            ctx.fillText(victory ? 'Victory!' : 'Game Over', canvas.width / 2, canvas.height / 2 - 150);
            ctx.shadowBlur = 0;

            if (victory) {
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '24px "Impact", sans-serif';
                ctx.fillText('You Escaped the Galaxy!', canvas.width / 2, canvas.height / 2 - 100);
            } else {
                drawMockLeaderboard();
            }

            const buttonWidth = 220;
            const buttonHeight = 50;
            const centerX = canvas.width / 2 - buttonWidth / 2;
            const playAgainY = canvas.height / 2 + 80;
            const postScoreY = canvas.height / 2 + 150;

            ctx.fillStyle = '#FF0000';
            ctx.fillRect(centerX, playAgainY, buttonWidth, buttonHeight);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.strokeRect(centerX, playAgainY, buttonWidth, buttonHeight);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '24px "Impact", sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText('SEND AGAIN', canvas.width / 2, playAgainY + buttonHeight / 2);

            ctx.fillStyle = '#FF0000';
            ctx.fillRect(centerX, postScoreY, buttonWidth, buttonHeight);
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.strokeRect(centerX, postScoreY, buttonWidth, buttonHeight);
            ctx.fillStyle = '#FFFFFF';
            ctx.font = '24px "Impact", sans-serif';
            ctx.fillText('POST SCORE TO X', canvas.width / 2, postScoreY + buttonHeight / 2);

            updateParticles();
            drawParticles();

            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
        }
        ctx.restore();
        requestAnimationFrame(gameLoop);
    } catch (e) {
        console.error('gameLoop error:', e);
    }
}

console.log('Starting game loop');
requestAnimationFrame(gameLoop);