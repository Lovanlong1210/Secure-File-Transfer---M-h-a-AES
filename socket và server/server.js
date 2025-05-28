const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// In-memory storage for encrypted files (trong thực tế nên dùng database)
const fileStorage = new Map();

// Serve client HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
    
    // Send connection confirmation
    socket.emit('connection-status', {
        connected: true,
        message: 'Kết nối Socket thành công',
        socketId: socket.id
    });

    // Handle file upload
    socket.on('upload-file', (data, callback) => {
        try {
            console.log(`File upload request from ${socket.id}`);
            
            // Validate data
            if (!data.encryptedData || !data.fileName) {
                return callback({
                    success: false,
                    message: 'Dữ liệu file không hợp lệ'
                });
            }

            // Generate unique file ID
            const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            // Store encrypted file data
            fileStorage.set(fileId, {
                encryptedData: data.encryptedData,
                fileName: data.fileName,
                fileType: data.fileType || 'unknown',
                fileSize: data.fileSize || 0,
                uploadTime: new Date().toISOString(),
                uploaderId: socket.id
            });

            console.log(`File stored with ID: ${fileId}`);
            
            // Auto-delete file after 1 hour (3600000 ms)
            setTimeout(() => {
                if (fileStorage.has(fileId)) {
                    fileStorage.delete(fileId);
                    console.log(`File ${fileId} auto-deleted after 1 hour`);
                }
            }, 3600000);

            // Send success response
            callback({
                success: true,
                fileId: fileId,
                message: 'File đã được tải lên và mã hóa thành công!',
                uploadTime: new Date().toISOString()
            });

            // Broadcast upload event (optional)
            socket.broadcast.emit('file-uploaded', {
                fileId: fileId,
                fileName: data.fileName,
                uploader: socket.id
            });

        } catch (error) {
            console.error('Upload error:', error);
            callback({
                success: false,
                message: 'Lỗi server khi xử lý file: ' + error.message
            });
        }
    });

    // Handle file download
    socket.on('download-file', (data, callback) => {
        try {
            console.log(`File download request from ${socket.id} for file: ${data.fileId}`);
            
            if (!data.fileId) {
                return callback({
                    success: false,
                    message: 'ID file không hợp lệ'
                });
            }

            const fileData = fileStorage.get(data.fileId);
            
            if (!fileData) {
                return callback({
                    success: false,
                    message: 'Không tìm thấy file với ID này hoặc file đã hết hạn'
                });
            }

            console.log(`File found, sending to ${socket.id}`);

            // Send file data
            callback({
                success: true,
                encryptedData: fileData.encryptedData,
                fileName: fileData.fileName,
                fileType: fileData.fileType,
                fileSize: fileData.fileSize,
                uploadTime: fileData.uploadTime,
                message: 'File đã được tải xuống thành công!'
            });

            // Optional: Delete file after first download (one-time download)
            // fileStorage.delete(data.fileId);
            // console.log(`File ${data.fileId} deleted after download`);

        } catch (error) {
            console.error('Download error:', error);
            callback({
                success: false,
                message: 'Lỗi server khi tải file: ' + error.message
            });
        }
    });

    // Handle file info request
    socket.on('get-file-info', (data, callback) => {
        try {
            const fileData = fileStorage.get(data.fileId);
            
            if (!fileData) {
                return callback({
                    success: false,
                    message: 'Không tìm thấy file'
                });
            }

            callback({
                success: true,
                fileInfo: {
                    fileName: fileData.fileName,
                    fileType: fileData.fileType,
                    fileSize: fileData.fileSize,
                    uploadTime: fileData.uploadTime
                }
            });
        } catch (error) {
            callback({
                success: false,
                message: 'Lỗi khi lấy thông tin file'
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
        console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
        console.error(`Socket error from ${socket.id}:`, error);
    });
});

// API endpoints (REST API as backup)
app.get('/api/files/:fileId/info', (req, res) => {
    const fileData = fileStorage.get(req.params.fileId);
    
    if (!fileData) {
        return res.status(404).json({
            success: false,
            message: 'File not found'
        });
    }

    res.json({
        success: true,
        fileInfo: {
            fileName: fileData.fileName,
            fileType: fileData.fileType,
            fileSize: fileData.fileSize,
            uploadTime: fileData.uploadTime
        }
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        activeFiles: fileStorage.size,
        connectedClients: io.engine.clientsCount
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Start server
const PORT = process.env.PORT || 5500;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Socket.IO server ready`);
    console.log(`🌐 Access at: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed.');
        process.exit(0);
    });
});

// Export for testing
module.exports = { app, server, io };