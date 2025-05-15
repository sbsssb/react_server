const express = require('express');
const router = express.Router();
const db = require('../db'); // MySQL 연결 (db.js에서 export한 promisePool 사용)

// ✅ 팔로우
router.post('/follow', async (req, res) => {
  const { userId, targetId } = req.body;
  try {
    await db.query(  // pool -> db로 변경
      'INSERT INTO follow (follower_id, following_id) VALUES (?, ?)',
      [userId, targetId]
    );
    res.json({ success: true, message: '팔로우 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '팔로우 실패' });
  }
});

// ✅ 언팔로우
router.post('/unfollow', async (req, res) => {
  const { userId, targetId } = req.body;
  try {
    await db.query(  // pool -> db로 변경
      'DELETE FROM follow WHERE follower_id = ? AND following_id = ?',
      [userId, targetId]
    );
    res.json({ success: true, message: '언팔로우 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: '언팔로우 실패' });
  }
});

// ✅ 팔로우 여부 확인
router.get('/isFollowing', async (req, res) => {
  const { userId, targetId } = req.query;
  try {
    const [rows] = await db.query(  // pool -> db로 변경
      'SELECT 1 FROM follow WHERE follower_id = ? AND following_id = ?',
      [userId, targetId]
    );
    res.json({ isFollowing: rows.length > 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '팔로우 여부 확인 실패' });
  }
});

// ✅ 팔로잉 목록
router.get('/followings/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // 팔로잉 목록을 가져오되, 유저 정보도 함께 반환
    const [rows] = await db.query(
      'SELECT u.email, u.username, u.profileImg FROM follow f ' +
      'JOIN users u ON f.following_id = u.email ' +
      'WHERE f.follower_id = ?',
      [userId]
    );
    res.json({ following: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '팔로잉 목록 조회 실패' });
  }
});

// ✅ 팔로워 목록
router.get('/followers/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    // 팔로워 목록을 가져오되, 유저 정보도 함께 반환
    const [rows] = await db.query(
      'SELECT u.email, u.username, u.profileImg FROM follow f ' +
      'JOIN users u ON f.follower_id = u.email ' +
      'WHERE f.following_id = ?',
      [userId]
    );
    res.json({ followers: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '팔로워 목록 조회 실패' });
  }
});


// ✅ 팔로우/팔로잉 수 가져오기
router.get('/count/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const [followers] = await db.query(  // pool -> db로 변경
      'SELECT COUNT(*) AS followerCount FROM follow WHERE following_id = ?',
      [userId]
    );
    const [followings] = await db.query(  // pool -> db로 변경
      'SELECT COUNT(*) AS followingCount FROM follow WHERE follower_id = ?',
      [userId]
    );
    res.json({
      success: true,
      followerCount: followers[0].followerCount,
      followingCount: followings[0].followingCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});


module.exports = router;
