// routes/chat.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// ✅ 1:1 채팅방 생성 or 조회
router.post('/create/direct', async (req, res) => {
  const { user1, user2 } = req.body;

  try {
    // 두 사람이 있는 1:1 방이 있는지 확인
    const [rows] = await db.query(`
      SELECT crm.room_id
      FROM chat_room_members crm
      JOIN chat_rooms cr ON crm.room_id = cr.id
      WHERE crm.user_id IN (?, ?)
      AND cr.is_group = false
      GROUP BY crm.room_id
      HAVING COUNT(DISTINCT crm.user_id) = 2
    `, [user1, user2]);

    console.log(rows);

    if (rows.length > 0) {
        // 이미 방 있음
        const roomId = rows[0].room_id;
        // 'is_group' 필드를 응답에 포함시켜 반환
        const isGroup = rows[0].is_group || false;
        return res.json({ success: true, roomId, existed: true, isGroup });
    }

    // 없으면 새 방 생성
    const [result] = await db.query(`
      INSERT INTO chat_rooms (is_group) VALUES (false)
    `);

    const roomId = result.insertId;

    await db.query(`
      INSERT INTO chat_room_members (room_id, user_id)
      VALUES (?, ?), (?, ?)
    `, [roomId, user1, roomId, user2]);

    res.json({ success: true, roomId, existed: false, isGroup: false });

  } catch (err) {
    console.error('1:1 채팅방 생성 오류:', err);
    res.status(500).json({ success: false });
  }
});


// ✅ 그룹 채팅방 생성
router.post('/create/group', async (req, res) => {
  const { name, users } = req.body; // users: [user1, user2, ...]

  if (!name || !Array.isArray(users) || users.length < 2) {
    return res.status(400).json({ success: false, message: '이름 또는 유저 목록이 부족합니다.' });
  }

  try {
    const [result] = await db.query(`
      INSERT INTO chat_rooms (name, is_group) VALUES (?, true)
    `, [name]);

    const roomId = result.insertId;

    const values = users.map(user => `(${roomId}, ${db.escape(user)})`).join(',');

    await db.query(`
      INSERT INTO chat_room_members (room_id, user_id)
      VALUES ${values}
    `);

    res.json({ success: true, roomId });

  } catch (err) {
    console.error('그룹 채팅방 생성 오류:', err);
    res.status(500).json({ success: false });
  }
});

// ✅ 참여 중인 채팅방 목록 조회
router.get('/rooms/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [rooms] = await db.query(`
      SELECT 
        cr.id AS roomId, 
        cr.name, 
        cr.is_group, 
        cr.created_at,
        (
          SELECT u.username
          FROM chat_room_members crm2
          JOIN users u ON crm2.user_id = u.email
          WHERE crm2.room_id = cr.id AND crm2.user_id != ?
          LIMIT 1
        ) AS otherUsername,
        (
          SELECT COUNT(*) 
          FROM chat_messages cm
          WHERE cm.room_id = cr.id 
          AND cm.id > COALESCE((
            SELECT last_read_message_id 
            FROM chat_read_status 
            WHERE room_id = cr.id AND user_id = ?
          ), 0)
        ) AS unreadCount
      FROM chat_rooms cr
      JOIN chat_room_members crm ON cr.id = crm.room_id
      WHERE crm.user_id = ?
      ORDER BY cr.created_at DESC
    `, [userId, userId, userId]);

    res.json({ success: true, rooms });

  } catch (err) {
    console.error('채팅방 목록 조회 오류:', err);
    res.status(500).json({ success: false });
  }
});

// 채팅방 정보 조회 API
router.get('/room/:roomId', async (req, res) => {
  const roomId = req.params.roomId;

  try {
    // 채팅방 기본 정보 (is_group 여부와 이름)
    const [roomRows] = await db.query(`
      SELECT id AS roomId, is_group, name
      FROM chat_rooms
      WHERE id = ?
    `, [roomId]);

    if (roomRows.length === 0) {
      return res.status(404).json({ success: false, message: '채팅방을 찾을 수 없습니다.' });
    }

    const room = roomRows[0];

    // 멤버 정보도 포함하고 싶다면 아래도 추가 (선택)
    const [members] = await db.query(`
      SELECT u.id, u.username, u.email, u.profilImg
      FROM chat_room_members crm
      JOIN users u ON crm.user_id = u.email
      WHERE crm.room_id = ?
    `, [roomId]);

    res.json({
      success: true,
      room: {
        ...room,
        members: members || []
      }
    });
  } catch (err) {
    console.error('채팅방 조회 오류:', err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// ✅ 채팅방의 채팅 기록 조회 API (무한 스크롤 방식)
router.get('/room/:roomId/messages', async (req, res) => {
  const { roomId } = req.params;
  const { lastMessageId, limit = 20 } = req.query;

  try {
    // 쿼리 문자열 및 파라미터 동적 구성
    let query = `
      SELECT cm.id, cm.sender_id, cm.message, cm.sent_at, u.username
    (
      SELECT JSON_ARRAYAGG(crs.user_id)
      FROM chat_read_status crs
      WHERE crs.room_id = cm.room_id
        AND crs.last_read_message_id >= cm.id
    ) AS read_by
      FROM chat_messages cm
      LEFT JOIN users u ON cm.sender_id = u.email
      WHERE cm.room_id = ?
    `;
    const queryParams = [roomId];

    if (lastMessageId && lastMessageId !== 'null') {
      query += ' AND cm.id < ?';
      queryParams.push(lastMessageId);
    }

    query += ' ORDER BY cm.sent_at ASC LIMIT ?';
    queryParams.push(Number(limit));

    const [messages] = await db.query(query, queryParams);

    res.json({
      success: true,
      messages: messages, // 최신 메시지를 맨 아래로 정렬
    });

  } catch (err) {
    console.error('채팅 기록 조회 오류:', err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// 알림
router.post('/read', async (req, res) => {
  const { userId, roomId } = req.body;

  console.log('읽음 처리 요청:', { userId, roomId });

  if (!userId || !roomId) {
    return res.status(400).json({ success: false, message: 'userId, roomId 모두 필요합니다.' });
  }

  try {
    const [[lastMessage]] = await db.query(`
      SELECT id FROM chat_messages
      WHERE room_id = ?
      ORDER BY sent_at DESC
      LIMIT 1
    `, [roomId]);

    const lastMessageId = lastMessage?.id || 0;

    console.log('마지막 메시지 ID:', lastMessageId);

    const [result] = await db.query(`
      INSERT INTO chat_read_status (room_id, user_id, last_read_message_id)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id)
    `, [roomId, userId, lastMessageId]);

    console.log('읽음 상태 업데이트 결과:', result);

    res.json({ success: true });
  } catch (err) {
    console.error('읽음 상태 업데이트 오류:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/unread', async (req, res) => {
  const userId = req.query.user;

  const sql = `
    SELECT 
      cm.room_id,
      COUNT(*) AS unreadCount
    FROM chat_messages cm
    INNER JOIN chat_room_members crm 
      ON cm.room_id = crm.room_id 
      AND crm.user_id = ?
    LEFT JOIN chat_read_status crs 
      ON cm.room_id = crs.room_id 
      AND crs.user_id = ?
    WHERE (crs.last_read_message_id IS NULL OR cm.id > crs.last_read_message_id)
      AND cm.sender_id != ?
    GROUP BY cm.room_id
  `;

  try {
    const [rows] = await db.query(sql, [userId, userId, userId]);

    const unreadMap = {};
    rows.forEach(row => {
      unreadMap[row.room_id] = row.unreadCount;
    });

    res.json({
  success: true,
  unreadByRoom: unreadMap,
});
  } catch (error) {
    console.error('unread 메시지 조회 오류:', error);
    res.status(500).json({ error: '서버 오류' });
  }
});


router.get('/unreadByRoom', async (req, res) => {
  const userId = req.query.user;
  const sql = `
    SELECT cm.room_id, COUNT(*) AS unread_count
    FROM chat_messages cm
    LEFT JOIN chat_read_status crs ON cm.room_id = crs.room_id AND crs.user_id = ?
    WHERE (crs.last_read_message_id IS NULL OR cm.id > crs.last_read_message_id)
      AND cm.sender_id != ?
    GROUP BY cm.room_id
  `;

  try {
    const [result] = await db.query(sql, [userId, userId]);
    // result: [{ room_id: 1, unread_count: 3 }, { room_id: 2, unread_count: 0 }, ...]
    
    // JS 객체로 변환 { roomId: count }
    const unreadByRoom = {};
    for (const row of result) {
      unreadByRoom[row.room_id] = row.unread_count;
    }

    res.json({ success: true, unreadByRoom });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'DB 조회 실패' });
  }
});


module.exports = router;
