const express = require('express');
const db = require('../db');
const authMiddleware = require('../auth');
const router = express.Router();

// 1. 패키지 추가
const multer = require('multer');

// 2. 저장 경로 및 파일명
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// api 호출
router.post('/upload', upload.array('file'), async (req, res) => {
    let {feedId} = req.body;
    const files = req.files;
    // const filename = req.file.filename; 
    // const destination = req.file.destination; 
    try{
        let results = [];
        for(let file of files){
            let filename = file.filename;
            let destination = file.destination;
            let query = "INSERT INTO POST_IMG VALUES(NULL, ?, ?, ?)";
            let result = await db.query(query, [feedId, filename, destination]);
            results.push(result);
            thumbnail = "N";
        }
        res.json({
            message : "result",
            result : results
        });
    } catch(err){
        console.log("에러 발생!");
        res.status(500).send("Server Error");
    }
});

router.post("/", async (req, res) => {
    let { email, content } = req.body;
    try{
        let sql = "INSERT INTO POST VALUES(NULL, ?, ?, NOW(), NOW())";
        let result = await db.query(sql, [email, content]);
        res.json({
            message : "result",
            result : result[0]
        });
    }catch(err){
        console.log("에러 발생!");
        console.log(err.message);
        res.status(500).send("Server Error");
    }
})

router.get("/", async (req, res) => {
  try {
    const sql = `
      SELECT 
        P.id AS postId,
        P.content,
        P.cdatetime,
        P.userId,
        I.imgName,
        I.imgPath,
        U.username,
        NULL AS retweeter,
        P.cdatetime AS sortTime
      FROM POST P
      LEFT JOIN POST_IMG I ON P.id = I.postId
      INNER JOIN USERS U ON P.userId = U.email

      UNION ALL

      SELECT 
        P.id AS postId,
        P.content,
        R.cdatetime AS cdatetime,
        R.userId AS userId,
        I.imgName,
        I.imgPath,
        U.username,
        RU.username AS retweeter,
        R.cdatetime AS sortTime
      FROM RETWEET R
      INNER JOIN POST P ON R.postId = P.id
      LEFT JOIN POST_IMG I ON P.id = I.postId
      INNER JOIN USERS U ON P.userId = U.email
      INNER JOIN USERS RU ON R.userId = RU.email

      ORDER BY sortTime DESC
    `;

    const [rows] = await db.query(sql);

    // 트윗 ID 기준 그룹화 + 이미지 묶기
    const tweetMap = new Map();

    rows.forEach((row) => {
      const {
        postId,
        content,
        cdatetime,
        userId,
        imgName,
        imgPath,
        username,
        retweeter,
      } = row;

      const key = `${postId}-${retweeter || ''}-${cdatetime}`; // 리트윗도 구분

      if (!tweetMap.has(key)) {
        tweetMap.set(key, {
          id: postId,
          content,
          cdatetime,
          userId,
          username,
          retweeter,
          images: [],
        });
      }

      if (imgName && imgPath) {
        tweetMap.get(key).images.push({
          imgName,
          imgPath,
        });
      }
    });

    const list = Array.from(tweetMap.values());

    res.json({
      message: "result",
      list,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});


router.get("/:id", async (req, res) => {
    let { id } = req.params;
    try{
        let sql = "SELECT * FROM TBL_FEED WHERE ID = " + id;
        let imgSql = "SELECT * FROM TBL_FEED_IMG WHERE FEEDID = " + id;
        let [list] = await db.query(sql);
        let [imgList] = await db.query(imgSql);
        res.json({
            message : "result",
            feed : list[0],
            imgList : imgList
        });
    }catch(err){
        console.log(err.message);
        res.status(500).send("Server Error");
    }
})

// 리트윗 API
// router.post('/retweet', async (req, res) => {
//     const { tweetId, userEmail } = req.body;
//     try {
//       // 리트윗 저장
//       const sql = "INSERT INTO POST (userId, content, createdAt) SELECT userId, content, NOW() FROM POST WHERE id = ?";
//       const result = await db.query(sql, [tweetId]);
//       res.json({ message: '리트윗 완료', result });
//     } catch (err) {
//       console.error('리트윗 저장 실패:', err);
//       res.status(500).send('서버 오류');
//     }
//   });

router.post("/retweet", authMiddleware, async (req, res) => {
  console.log("유저 정보:", req.user);
  try {
    const userId = req.user.email; // 로그인한 유저 ID
    const { postId } = req.body;

    // 중복 리트윗 방지 (1회만 가능하게 하려면)
    const [exists] = await db.query("SELECT * FROM RETWEET WHERE userId = ? AND postId = ?", [userId, postId]);
    if (exists.length > 0) {
      return res.status(400).send("이미 리트윗함");
    }

    await db.query("INSERT INTO RETWEET (userId, postId) VALUES (?, ?)", [userId, postId]);
    res.send("리트윗 성공");
  } catch (err) {
    console.error(err.message);
    res.status(500).send("서버 오류");
  }
});

  
//   // 답글 API
//   router.post('/reply', async (req, res) => {
//     const { tweetId, userEmail, content } = req.body;
//     try {
//       // 답글 저장
//       const sql = "INSERT INTO POST (userId, content, parentId, createdAt) VALUES (?, ?, ?, NOW())";
//       const result = await db.query(sql, [userEmail, content, tweetId]);
//       res.json({ message: '답글 작성 완료', result });
//     } catch (err) {
//       console.error('답글 저장 실패:', err);
//       res.status(500).send('서버 오류');
//     }
//   });
  
//   // 좋아요 API
//   router.post('/like', async (req, res) => {
//     const { tweetId, userId } = req.body;
//     try {
//       // 좋아요 등록 (존재하지 않으면 새로 추가, 존재하면 삭제)
//       const sql = "INSERT INTO LIKES (tweetId, userId) VALUES (?, ?) ON DUPLICATE KEY UPDATE userId = userId";
//       const result = await db.query(sql, [tweetId, userId]);
//       res.json({ message: '좋아요 처리 완료', result });
//     } catch (err) {
//       console.error('좋아요 처리 실패:', err);
//       res.status(500).send('서버 오류');
//     }
//   });
  

module.exports = router;