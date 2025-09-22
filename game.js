class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // WebSocket and player data properties
        this.ws = null;
        this.connected = false;
        this.myPlayerId = null;
        this.myPlayer = null;
        this.players = new Map(); // Store all players by ID
        this.avatars = new Map(); // Store avatar data by name
        
        // Keyboard movement properties
        this.keysPressed = new Set(); // Track currently pressed keys
        this.movementKeys = {
            'ArrowUp': 'up',
            'ArrowDown': 'down', 
            'ArrowLeft': 'left',
            'ArrowRight': 'right'
        };
        
        // Viewport/camera properties
        this.viewportX = 0;
        this.viewportY = 0;
        this.avatarSize = 32; // Size of avatars in pixels
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.loadWorldMap();
        this.setupEventListeners();
        this.setupKeyboardEvents();
        this.connectToServer();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.drawWorld();
        });
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.drawWorld();
        };
        this.worldImage.src = 'world.jpg';
    }
    
    drawWorld() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update viewport to center on my avatar
        this.updateViewport();
        
        // Calculate which portion of the world to draw
        const startX = Math.max(0, this.viewportX);
        const startY = Math.max(0, this.viewportY);
        const endX = Math.min(this.worldWidth, this.viewportX + this.canvas.width);
        const endY = Math.min(this.worldHeight, this.viewportY + this.canvas.height);
        
        const sourceWidth = endX - startX;
        const sourceHeight = endY - startY;
        
        // Draw only the visible portion of the world map
        this.ctx.drawImage(
            this.worldImage,
            startX, startY, sourceWidth, sourceHeight,  // Source rectangle (visible portion)
            0, 0, sourceWidth, sourceHeight             // Destination rectangle (same size)
        );
        
        // Draw all avatars
        this.drawAvatars();
    }
    
    updateViewport() {
        if (!this.myPlayer) return;
        
        // Center viewport on my avatar
        const centerX = this.myPlayer.x - this.canvas.width / 2;
        const centerY = this.myPlayer.y - this.canvas.height / 2;
        
        // Clamp viewport to world boundaries
        this.viewportX = Math.max(0, Math.min(centerX, this.worldWidth - this.canvas.width));
        this.viewportY = Math.max(0, Math.min(centerY, this.worldHeight - this.canvas.height));
    }
    
    drawAvatars() {
        console.log(`Drawing ${this.players.size} avatars`);
        for (const [playerId, player] of this.players) {
            console.log(`Drawing avatar for ${player.username} at (${player.x}, ${player.y})`);
            this.drawAvatar(player);
        }
    }
    
    drawAvatar(player) {
        if (!player || !player.avatar) return;
        
        const avatarData = this.avatars.get(player.avatar);
        if (!avatarData) return;
        
        // Calculate screen position
        const screenX = player.x - this.viewportX;
        const screenY = player.y - this.viewportY;
        
        // Only draw if avatar is visible on screen
        if (screenX < -this.avatarSize || screenX > this.canvas.width + this.avatarSize ||
            screenY < -this.avatarSize || screenY > this.canvas.height + this.avatarSize) {
            return;
        }
        
        // Get the appropriate frame based on facing direction and animation
        const direction = player.facing || 'south';
        const frameIndex = player.animationFrame || 0;
        const frames = avatarData.frames[direction];
        
        if (!frames || !frames[frameIndex]) return;
        
        // Create image from base64 data
        const img = new Image();
        img.onload = () => {
            // Draw avatar
            this.ctx.drawImage(
                img,
                screenX - this.avatarSize / 2,
                screenY - this.avatarSize / 2,
                this.avatarSize,
                this.avatarSize
            );
            
            // Draw username label
            this.drawUsernameLabel(player.username, screenX, screenY);
        };
        img.src = frames[frameIndex];
    }
    
    drawUsernameLabel(username, x, y) {
        if (!username) return;
        
        // Set text properties
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        // Draw text with outline
        this.ctx.strokeText(username, x, y - this.avatarSize / 2 - 5);
        this.ctx.fillText(username, x, y - this.avatarSize / 2 - 5);
    }
    
    setupEventListeners() {
        // Add click-to-move functionality (for future implementation)
        this.canvas.addEventListener('click', (event) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // Convert screen coordinates to world coordinates
            const worldX = Math.floor(x);
            const worldY = Math.floor(y);
            
            console.log(`Clicked at world coordinates: (${worldX}, ${worldY})`);
        });
    }
    
    setupKeyboardEvents() {
        // Handle keydown events
        document.addEventListener('keydown', (event) => {
            const key = event.code;
            
            // Only handle movement keys
            if (this.movementKeys[key] && !this.keysPressed.has(key)) {
                this.keysPressed.add(key);
                this.startMovement(this.movementKeys[key]);
            }
        });
        
        // Handle keyup events  
        document.addEventListener('keyup', (event) => {
            const key = event.code;
            
            if (this.movementKeys[key]) {
                this.keysPressed.delete(key);
                this.stopMovement();
            }
        });
    }
    
    connectToServer() {
        try {
            this.ws = new WebSocket('wss://codepath-mmorg.onrender.com');
            
            this.ws.onopen = () => {
                console.log('Connected to game server');
                this.connected = true;
                this.joinGame();
            };
            
            this.ws.onmessage = (event) => {
                this.handleServerMessage(JSON.parse(event.data));
            };
            
            this.ws.onclose = () => {
                console.log('Disconnected from game server');
                this.connected = false;
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Failed to connect to server:', error);
        }
    }
    
    joinGame() {
        if (!this.connected) return;
        
        const joinMessage = {
            action: "join_game",
            username: "jasleen"
        };
        
        this.ws.send(JSON.stringify(joinMessage));
        console.log('Sent join game message');
    }
    
    handleServerMessage(message) {
        console.log('Received message:', message);
        
        switch (message.action) {
            case 'join_game':
                if (message.success) {
                    this.handleJoinGameResponse(message);
                } else {
                    console.error('Join game failed:', message.error);
                }
                break;
            case 'players_moved':
                this.handlePlayersMoved(message);
                break;
            case 'player_joined':
                this.handlePlayerJoined(message);
                break;
            case 'player_left':
                this.handlePlayerLeft(message);
                break;
            default:
                console.log('Unknown message type:', message.action);
        }
    }
    
    startMovement(direction) {
        if (!this.connected) return;
        
        const moveMessage = {
            action: "move",
            direction: direction
        };
        
        this.ws.send(JSON.stringify(moveMessage));
        console.log(`Started moving ${direction}`);
    }
    
    stopMovement() {
        if (!this.connected) return;
        
        // Only send stop if no movement keys are pressed
        if (this.keysPressed.size === 0) {
            const stopMessage = {
                action: "stop"
            };
            
            this.ws.send(JSON.stringify(stopMessage));
            console.log('Stopped moving');
        }
    }
    
    handleJoinGameResponse(message) {
        console.log('Successfully joined game!');
        this.myPlayerId = message.playerId;
        
        // Store all players
        for (const [playerId, playerData] of Object.entries(message.players)) {
            this.players.set(playerId, playerData);
            if (playerId === this.myPlayerId) {
                this.myPlayer = playerData;
            }
        }
        
        // Store avatar data
        for (const [avatarName, avatarData] of Object.entries(message.avatars)) {
            this.avatars.set(avatarName, avatarData);
        }
        
        console.log('My player:', this.myPlayer);
        console.log('All players:', this.players);
        console.log('Number of players:', this.players.size);
        console.log('Available avatars:', this.avatars);
        
        // Debug: Log each player's position
        for (const [playerId, player] of this.players) {
            console.log(`Player ${player.username} at (${player.x}, ${player.y})`);
        }
        
        // Redraw the game with avatars
        this.drawWorld();
    }
    
    handlePlayersMoved(message) {
        // Update player positions
        for (const [playerId, playerData] of Object.entries(message.players)) {
            this.players.set(playerId, playerData);
            if (playerId === this.myPlayerId) {
                this.myPlayer = playerData;
            }
        }
        
        // Redraw the game
        this.drawWorld();
    }
    
    handlePlayerJoined(message) {
        this.players.set(message.player.id, message.player);
        this.avatars.set(message.avatar.name, message.avatar);
        console.log('Player joined:', message.player);
    }
    
    handlePlayerLeft(message) {
        this.players.delete(message.playerId);
        console.log('Player left:', message.playerId);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
