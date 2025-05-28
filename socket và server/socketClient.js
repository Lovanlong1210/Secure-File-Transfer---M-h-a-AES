/**
 * Socket.IO Client Handler
 * Quản lý kết nối và giao tiếp với server
 */

class SocketClient {
    constructor(serverUrl = 'http://localhost:5500') {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.eventHandlers = new Map();
        
        this.init();
    }

    // Khởi tạo kết nối Socket
    init() {
        try {
            this.socket = io(this.serverUrl, {
                autoConnect: false,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                maxReconnectionAttempts: this.maxReconnectAttempts,
                timeout: 20000,
                transports: ['websocket', 'polling']
            });

            this.setupEventListeners();
            this.connect();
        } catch (error) {
            console.error('Failed to initialize socket:', error);
            this.handleConnectionError(error);
        }
    }

    // Thiết lập các event listeners
    setupEventListeners() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('✅ Connected to server');
            this.connected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            this.emit('connection-established');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ Disconnected from server:', reason);
            this.connected = false;
            this.updateConnectionStatus(false);
            this.emit('connection-lost', { reason });
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.connected = false;
            this.reconnectAttempts++;
            this.updateConnectionStatus(false, `Lỗi kết nối (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            this.handleConnectionError(error);
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`✅ Reconnected after ${attemptNumber} attempts`);
            this.connected = true;
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true, 'Đã kết nối lại');
        });

        this.socket.on('reconnect_failed', () => {
            console.error('❌ Failed to reconnect after maximum attempts');
            this.updateConnectionStatus(false, 'Không thể kết nối lại');
            this.emit('reconnect-failed');
        });

        // Server messages
        this.socket.on('connection-status', (data) => {
            console.log('Server connection status:', data);
            if (data.connected) {
                this.updateConnectionStatus(true, data.message);
            }
        });

        this.socket.on('file-uploaded', (data) => {
            console.log('File uploaded by another user:', data);
            this.emit('file-uploaded-notification', data);
        });
    }

    // Kết nối tới server
    connect() {
        if (!this.socket.connected) {
            this.updateConnectionStatus(false, 'Đang kết nối...');
            this.socket.connect();
        }
    }

    // Ngắt kết nối
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    // Upload file
    async uploadFile(fileData, progressCallback) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('Không có kết nối Socket'));
                return;
            }

            // Simulate progress
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.random() * 20;
                if (progress > 90) {
                    clearInterval(progressInterval);
                }
                if (progressCallback) progressCallback(Math.min(progress, 90));
            }, 200);

            this.socket.emit('upload-file', fileData, (response) => {
                clearInterval(progressInterval);
                if (progressCallback) progressCallback(100);

                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.message || 'Upload failed'));
                }
            });

            // Timeout handler
            setTimeout(() => {
                clearInterval(progressInterval);
                reject(new Error('Upload timeout'));
            }, 30000);
        });
    }

    // Download file
    async downloadFile(fileId, progressCallback) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('Không có kết nối Socket'));
                return;
            }

            // Simulate progress
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += Math.random() * 25;
                if (progress > 90) {
                    clearInterval(progressInterval);
                }
                if (progressCallback) progressCallback(Math.min(progress, 90));
            }, 150);

            this.socket.emit('download-file', { fileId }, (response) => {
                clearInterval(progressInterval);
                if (progressCallback) progressCallback(100);

                if (response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response.message || 'Download failed'));
                }
            });

            // Timeout handler
            setTimeout(() => {
                clearInterval(progressInterval);
                reject(new Error('Download timeout'));
            }, 30000);
        });
    }

    // Get file info
    async getFileInfo(fileId) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('Không có kết nối Socket'));
                return;
            }

            this.socket.emit('get-file-info', { fileId }, (response) => {
                if (response.success) {
                    resolve(response.fileInfo);
                } else {
                    reject(new Error(response.message || 'Failed to get file info'));
                }
            });
        });
    }

    // Event handler management
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            const handlers = this.eventHandlers.get(event);
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        }
    }

    emit(event, data = null) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    // Update connection status in UI
    updateConnectionStatus(connected, message = null) {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');
        
        if (statusDot && statusText) {
            if (connected) {
                statusDot.classList.add('connected');
                statusText.textContent = message || '✅ Kết nối Socket thành công';
                statusText.style.color = '#48bb78';
            } else {
                statusDot.classList.remove('connected');
                statusText.textContent = message || '❌ Mất kết nối Socket';
                statusText.style.color = '#e53e3e';
            }
        }
    }

    // Handle connection errors
    handleConnectionError(error) {
        console.error('Socket connection error:', error);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.updateConnectionStatus(false, '❌ Không thể kết nối server');
            
            // Show retry button
            this.showRetryButton();
        }
    }

    // Show retry connection button
    showRetryButton() {
        const existingButton = document.getElementById('retryConnection');
        if (existingButton) return;

        const statusContainer = document.querySelector('.socket-status');
        if (statusContainer) {
            const retryButton = document.createElement('button');
            retryButton.id = 'retryConnection';
            retryButton.textContent = '🔄 Thử lại';
            retryButton.className = 'btn';
            retryButton.style.marginLeft = '10px';
            retryButton.style.padding = '8px 16px';
            retryButton.style.fontSize = '14px';
            
            retryButton.onclick = () => {
                this.reconnectAttempts = 0;
                this.connect();
                retryButton.remove();
            };
            
            statusContainer.appendChild(retryButton);
        }
    }

    // Get connection status
    isConnected() {
        return this.connected && this.socket && this.socket.connected;
    }

    // Get socket ID
    getSocketId() {
        return this.socket ? this.socket.id : null;
    }

    // Get server URL
    getServerUrl() {
        return this.serverUrl;
    }

    // Ping server
    ping() {
        return new Promise((resolve) => {
            if (!this.connected) {
                resolve(false);
                return;
            }

            const startTime = Date.now();
            this.socket.emit('ping', startTime, (responseTime) => {
                const latency = Date.now() - startTime;
                resolve({ latency, responseTime });
            });
        });
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SocketClient;
} else {
    window.SocketClient = SocketClient;
}