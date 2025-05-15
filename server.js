const express = require('express');
const db = require('./db');
const path = require('path');
const cors = require('cors');
const session = require('express-session');

// 라우터
const memberRouter = require("./routes/member");
const feedRouter = require("./routes/feed");
const followRouter = require("./routes/follow");
const chatRouter = require('./routes/chat');

// express 설정
const app = express();
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:3001"],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(session({
  secret: 'test1234',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 30
  }
}));

// 라우터 설정
app.use("/feed", feedRouter);
app.use("/member", memberRouter);
app.use("/follow", followRouter);
app.use("/chat", chatRouter);

// ✅ 기존 app.listen 대신 http + WebSocket 서버로 전환
const http = require('http');
const server = http.createServer(app);

// ✅ WebSocket 서버 구성
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

// WebSocket 클라이언트 관리용 Map 객체 (방 정보 저장)
const clients = new Map();

wss.on('connection', (ws) => {
  console.log('클라이언트 연결됨');

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (err) {
      console.error('JSON 파싱 오류:', err);
      return;
    }

    if (msg.type === 'chat') {
      // DB에 메시지 저장
      const sql = 'INSERT INTO chat_messages (room_id, sender_id, message, sent_at) VALUES (?, ?, ?, NOW())';
      await db.query(sql, [msg.roomId, msg.sender_id, msg.message]);

      // 모든 클라이언트에게 전송
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(msg));
        }
      });

    } else if (msg.type === 'read') {
      const { roomId, userId, lastMessageId } = msg;
      await db.query(`
        INSERT INTO chat_read_status (room_id, user_id, last_read_message_id)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE last_read_message_id = ?, updated_at = NOW()
      `, [roomId, userId, lastMessageId, lastMessageId]);

    } else if (msg.type === 'joinRoom') {
      clients.set(ws, msg.roomId); // 방 ID 등록
    }
  });

  ws.on('close', () => {
    console.log('클라이언트 연결 종료');
    clients.delete(ws);
  });
});

// 서버 시작
server.listen(3005, () => {
  console.log("Express + WebSocket 서버 실행 중! 포트: 3005");
});
