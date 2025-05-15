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
        let sql = "INSERT INTO POST VALUES(NULL, ?, ?, NOW(), NOW(), 0)";
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
        const userId = req.query.email;
        
        if (!userId) {
            return res.status(401).send("Unauthorized");
        }

        const sql = `
          SELECT 
            P.id AS postId,
            P.content,
            P.cdatetime,
            P.userId,
            I.imgName,
            I.imgPath,
            U.username,
            U.profileImg,
            NULL AS retweeter,
            NULL AS retweeterProfileImg,
            NULL AS retweeterId,
            P.cdatetime AS sortTime
          FROM POST P
          LEFT JOIN POST_IMG I ON P.id = I.postId
          INNER JOIN USERS U ON P.userId = U.email

          UNION ALL

          SELECT 
            P.id AS postId,
            P.content,
            R.cdatetime AS cdatetime,
            P.userId AS userId,
            I.imgName,
            I.imgPath,
            U.username,
            U.profileImg,
            RU.username AS retweeter,
            RU.profileImg AS retweeterProfileImg,
            RU.email AS retweeterId,
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
                profileImg,
                retweeterId,
                retweeterProfileImg,
            } = row;

            const key = `${postId}-${retweeter || ''}-${cdatetime}`; // 리트윗도 구분

            if (!tweetMap.has(key)) {
                tweetMap.set(key, {
                    id: postId,
                    content,
                    cdatetime,
                    userId,
                    username: username, // 리트윗시 리트윗한 사람 이름 사용
                    retweeter,
                    retweeterId,
                    profileImg, // 리트윗한 사람의 프로필을 사용
                    retweeterProfileImg,
                    images: [],
                    likeCount: 0,       // 좋아요 카운트
                    retweetCount: 0,    // 리트윗 카운트
                    likedByMe: false,   // 내가 좋아요를 눌렀는지
                    retweetedByMe: false, // 내가 리트윗을 눌렀는지
                });
            }

            if (imgName && imgPath) {
                tweetMap.get(key).images.push({
                    imgName,
                    imgPath,
                });
            }
        });

        // 좋아요와 리트윗 관련 데이터 추가
        const likeSql = `
          SELECT postId, COUNT(*) AS likeCount
          FROM LIKE_TABLE
          GROUP BY postId
        `;

        const retweetSql = `
          SELECT postId, COUNT(*) AS retweetCount
          FROM RETWEET
          GROUP BY postId
        `;

        const [likeRows] = await db.query(likeSql);
        const [retweetRows] = await db.query(retweetSql);

        // 좋아요와 리트윗 카운트 적용
        likeRows.forEach((row) => {
            const postId = row.postId;
            if (tweetMap.has(postId)) {
                tweetMap.get(postId).likeCount = row.likeCount;
            }
        });

        retweetRows.forEach((row) => {
            const postId = row.postId;
            const retweetCount = row.retweetCount;

            // tweetMap에서 해당 postId를 찾고, retweetCount를 갱신
            for (const [key, tweet] of tweetMap.entries()) {
                if (tweet.id === postId) {
                    tweet.retweetCount = retweetCount;  // retweetCount 갱신
                }
            }
        });

        // 내가 좋아요와 리트윗을 했는지 확인
        const userLikeSql = `
          SELECT postId
          FROM LIKE_TABLE
          WHERE userId = ?
        `;
        const userRetweetSql = `
          SELECT postId
          FROM RETWEET
          WHERE userId = ?
        `;

        const [userLikes] = await db.query(userLikeSql, [userId]);
        const [userRetweets] = await db.query(userRetweetSql, [userId]);

        // 좋아요/리트윗 여부 설정
        userLikes.forEach((row) => {
            const postId = row.postId;

            for (const [key, tweet] of tweetMap.entries()) {
                if (tweet.id === postId) {
                    tweet.likedByMe = true;
                }
            }
        });

        userRetweets.forEach((row) => {
            const postId = row.postId;

            // key 기준으로 순회하면서 postId가 일치하는 항목 모두에 반영
            for (const [key, tweet] of tweetMap.entries()) {
                if (tweet.id === postId) {
                    tweet.retweetedByMe = true;
                }
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

// GET 마이페이지에 트윗 출력
router.get('/user/:email', async (req, res) => {
  const { email } = req.params;

  try {
    // 1. 기본 트윗 + 이미지 데이터
    const [tweets] = await db.query(
      `SELECT 
        p.id AS postId,
        p.content AS content,              
        p.cdatetime AS cdatetime,          
        u.username AS username,
        u.profileImg AS profileImg,       
        i.imgName AS imgName,             
        i.imgPath AS imgPath,
        p.userId AS userId             
      FROM post p
      JOIN users u ON p.userId = u.email
      LEFT JOIN post_img i ON p.id = i.postId
      WHERE p.userId = ?
      ORDER BY p.cdatetime DESC`,
      [email]
    );

    // 2. 트윗 ID 기준으로 그룹핑 + 이미지 묶기
    const formattedTweets = tweets.reduce((acc, tweet) => {
      let existingTweet = acc.find(t => t.postId === tweet.postId);
      if (existingTweet) {
        if (tweet.imgName) {
          existingTweet.images.push({
            imgName: tweet.imgName,
            imgPath: tweet.imgPath
          });
        }
      } else {
        acc.push({
          postId: tweet.postId,
          content: tweet.content,
          userId: tweet.userId,
          cdatetime: tweet.cdatetime,
          username: tweet.username,
          profileImg: tweet.profileImg,
          images: tweet.imgName ? [{
            imgName: tweet.imgName,
            imgPath: tweet.imgPath
          }] : [],
          likeCount: 0,
          likedByMe: false,
          retweetCount: 0,
          retweetedByMe: false
        });
      }
      return acc;
    }, []);

    const postIds = formattedTweets.map(t => t.postId);
    if (postIds.length === 0) return res.json({ success: true, tweets: formattedTweets });

    // 3. 좋아요 수
    const [likeCounts] = await db.query(`
      SELECT postId, COUNT(*) AS likeCount
      FROM LIKE_TABLE
      WHERE postId IN (?)
      GROUP BY postId
    `, [postIds]);

    likeCounts.forEach(({ postId, likeCount }) => {
      const tweet = formattedTweets.find(t => t.postId === postId);
      if (tweet) tweet.likeCount = likeCount;
    });

    // 4. 리트윗 수
    const [retweetCounts] = await db.query(`
      SELECT postId, COUNT(*) AS retweetCount
      FROM RETWEET
      WHERE postId IN (?)
      GROUP BY postId
    `, [postIds]);

    retweetCounts.forEach(({ postId, retweetCount }) => {
      const tweet = formattedTweets.find(t => t.postId === postId);
      if (tweet) tweet.retweetCount = retweetCount;
    });

    // 5. 내가 좋아요/리트윗한 트윗
    const [userLikes] = await db.query(`
      SELECT postId FROM LIKE_TABLE WHERE userId = ? AND postId IN (?)
    `, [email, postIds]);

    const [userRetweets] = await db.query(`
      SELECT postId FROM RETWEET WHERE userId = ? AND postId IN (?)
    `, [email, postIds]);

    userLikes.forEach(({ postId }) => {
      const tweet = formattedTweets.find(t => t.postId === postId);
      if (tweet) tweet.likedByMe = true;
    });

    userRetweets.forEach(({ postId }) => {
      const tweet = formattedTweets.find(t => t.postId === postId);
      if (tweet) tweet.retweetedByMe = true;
    });

    res.json({ success: true, tweets: formattedTweets });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '트윗 조회 실패' });
  }
});

// 트윗 삭제 API
router.delete('/delete/:tweetId', async (req, res) => {
  const tweetId = req.params.tweetId;

  try {
    // 예: MySQL 쿼리 실행
    const result = await db.query('DELETE FROM post WHERE id = ?', [tweetId]);

    // DB 삭제 성공 여부 체크 (예시는 affectedRows 사용)
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "게시글을 찾을 수 없습니다." });
    }

    // 여기서는 DB 삭제 성공했다고 가정
    res.status(200).json({ message: "게시글이 삭제되었습니다." });
  } catch (err) {
    console.error('게시글 삭제 오류:', err);
    res.status(500).json({ message: "서버 오류가 발생했습니다." });
  }
});

// 리트윗 등록 또는 취소 (토글)
router.post("/retweet", async (req, res) => {
  const { userId, postId } = req.body;
  try {
    // 이미 리트윗했는지 확인
    const [exist] = await db.query(
      "SELECT id FROM RETWEET WHERE userId = ? AND postId = ?",
      [userId, postId]
    );

    if (exist.length > 0) {
      // 이미 리트윗했으면 삭제 (취소)
      await db.query("DELETE FROM RETWEET WHERE userId = ? AND postId = ?", [
        userId,
        postId,
      ]);

      // 원본 글의 retweetCount 감소
      await db.query(
        "UPDATE POST SET retweetCount = retweetCount - 1 WHERE id = ?",
        [postId]
      );

      res.json({ message: "unretweeted" });
    } else {
      // 리트윗 등록
      await db.query(
        "INSERT INTO RETWEET (userId, postId) VALUES (?, ?)",
        [userId, postId]
      );

      // 원본 글의 retweetCount 증가
      await db.query(
        "UPDATE POST SET retweetCount = retweetCount + 1 WHERE id = ?",
        [postId]
      );

      res.json({ message: "retweeted" });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});


// 리트윗 카운트와 유저가 리트윗했는지 여부
router.get("/retweet/status/:postId/:userId", async (req, res) => {
  const { postId, userId } = req.params;
  try {
    const [countResult] = await db.query(
      "SELECT COUNT(*) AS count FROM RETWEET WHERE postId = ?",
      [postId]
    );
    const [exist] = await db.query(
      "SELECT id FROM RETWEET WHERE postId = ? AND userId = ?",
      [postId, userId]
    );

    res.json({
      count: countResult[0].count,
      isRetweeted: exist.length > 0,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
});

// 답글
router.post("/reply", async (req, res) => {
  const { userId, tweetId, content } = req.body;

  if (!userId || !tweetId || !content) {
    return res.status(400).json({ message: "필수 값 누락" });
  }

  try {
    const sql = `
      INSERT INTO REPLY (userId, postId, content, cdatetime)
      VALUES (?, ?, ?, NOW())
    `;
    await db.query(sql, [userId, tweetId, content]);

    res.json({ message: "답글 등록 완료" });
  } catch (err) {
    console.error("답글 등록 오류:", err.message);
    res.status(500).send("Server Error");
  }
});

router.get("/:postId/replies", async (req, res) => {
  const { postId } = req.params;

  try {
    // 1. 댓글 조회
    const replySql = `
      SELECT 
        R.id AS replyId,
        R.content,
        R.cdatetime,
        R.userId,
        U.username,
        U.profileImg
      FROM REPLY R
      LEFT JOIN USERS U ON R.userId = U.email
      WHERE R.postId = ?
      ORDER BY R.cdatetime ASC
    `;
    const [replies] = await db.query(replySql, [postId]);

    // 댓글이 없으면 바로 응답
    if (replies.length === 0) {
      return res.json({ list: [] });
    }

    // 2. 댓글 ID 목록 추출
    const replyIds = replies.map((r) => r.replyId);

    // 3. 대댓글 조회
    const subSql = `
      SELECT 
        SR.id AS subreplyId,
        SR.replyId,
        SR.content,
        SR.cdatetime,
        SR.userId,
        U.username,
        U.profileImg
      FROM SUB_REPLY SR
      LEFT JOIN USERS U ON SR.userId = U.email
      WHERE SR.replyId IN (?)
      ORDER BY SR.cdatetime ASC
    `;
    const [subreplies] = await db.query(subSql, [replyIds]);

    // 4. 대댓글을 replyId 기준으로 그룹핑
    const subMap = {};
    subreplies.forEach((sub) => {
      if (!subMap[sub.replyId]) {
        subMap[sub.replyId] = [];
      }
      subMap[sub.replyId].push(sub);
    });

    // 5. 각 댓글에 대댓글 붙이기
    const result = replies.map((reply) => ({
      ...reply,
      subreplies: subMap[reply.replyId] || []
    }));

    res.json({ list: result });

  } catch (err) {
    console.error("답글 조회 오류:", err.message);
    res.status(500).send("Server Error");
  }
});


// 답글 삭제
router.delete("/reply/:replyId", async (req, res) => {
  const { replyId } = req.params;

  try {
    const sql = "DELETE FROM reply WHERE id = ?";
    const [result] = await db.query(sql, [replyId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "해당 답글을 찾을 수 없습니다." });
    }

    res.json({ message: "삭제 성공" });
  } catch (error) {
    console.error("답글 삭제 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 대댓글 등록 API
router.post("/:replyId/sub", async (req, res) => {
  const { replyId } = req.params;
  const { userId, content } = req.body;

  try {
    // 1. INSERT
    await db.query(
      `INSERT INTO SUB_REPLY (replyId, userId, content, cdatetime)
       VALUES (?, ?, ?, NOW())`,
      [replyId, userId, content]
    );

    // 2. 최신 subreplies 가져오기 (user 정보 포함해서)
    const [subReplies] = await db.query(
      `SELECT S.id AS subreplyId, S.content, S.cdatetime, S.userId,
              U.username, U.profileImg, S.replyId
       FROM SUB_REPLY S
       LEFT JOIN USERS U ON S.userId = U.email
       WHERE S.replyId = ?
       ORDER BY S.cdatetime ASC`,
      [replyId]
    );

    res.json({ subReplies }); // 👉 여기서 username, profileImg 포함
  } catch (err) {
    console.error("대댓글 등록 오류:", err);
    res.status(500).send("Server Error");
  }
});

// 대댓글 삭제
router.delete("/subreply/:subreplyId", async (req, res) => {
  const { subreplyId } = req.params;
  const { replyId } = req.query;

  try {
    // 1. 삭제
    await db.query("DELETE FROM SUB_REPLY WHERE id = ?", [subreplyId]);

    // 2. 최신 subreplies 가져오기 (user 정보 포함해서)
    const [subReplies] = await db.query(
      `SELECT S.id AS subreplyId, S.content, S.cdatetime, S.userId,
              U.username, U.profileImg, S.replyId
       FROM SUB_REPLY S
       LEFT JOIN USERS U ON S.userId = U.email
       WHERE S.replyId = ?
       ORDER BY S.cdatetime ASC`,
      [replyId]
    );
    res.json({ subReplies });
  } catch (err) {
    console.error("대댓글 삭제 오류:", err.message);
    res.status(500).send("Server Error");
  }
});

router.get("/followfeed", async (req, res) => {
    try {
        const userId = req.query.email;
        
        if (!userId) {
            return res.status(401).send("Unauthorized");
        }

        const sql = `
        SELECT 
          P.id AS postId,
          P.content,
          P.cdatetime,
          P.userId,
          I.imgName,
          I.imgPath,
          U.username,
          U.profileImg,
          NULL AS retweeter,
          NULL AS retweeterProfileImg,
          NULL AS retweeterId,
          P.cdatetime AS sortTime
        FROM FOLLOW F
        INNER JOIN POST P ON F.following_Id = P.userId
        LEFT JOIN POST_IMG I ON P.id = I.postId
        INNER JOIN USERS U ON P.userId = U.email
        WHERE F.follower_Id = ?

        UNION ALL

        SELECT 
          P.id AS postId,
          P.content,
          R.cdatetime AS cdatetime,
          P.userId AS userId,
          I.imgName,
          I.imgPath,
          U.username,
          U.profileImg,
          RU.username AS retweeter,
          RU.profileImg AS retweeterProfileImg,
          RU.email AS retweeterId,
          R.cdatetime AS sortTime
        FROM FOLLOW F
        INNER JOIN RETWEET R ON F.following_Id = R.userId
        INNER JOIN POST P ON R.postId = P.id
        LEFT JOIN POST_IMG I ON P.id = I.postId
        INNER JOIN USERS U ON P.userId = U.email
        INNER JOIN USERS RU ON R.userId = RU.email
        WHERE F.follower_Id = ?

        ORDER BY sortTime DESC
      `;

        const [rows] = await db.query(sql, [userId, userId]);

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
                profileImg,
                retweeterId,
                retweeterProfileImg,
            } = row;

            const key = `${postId}-${retweeter || ''}-${cdatetime}`; // 리트윗도 구분

            if (!tweetMap.has(key)) {
                tweetMap.set(key, {
                    id: postId,
                    content,
                    cdatetime,
                    userId,
                    username: username, // 리트윗시 리트윗한 사람 이름 사용
                    retweeter,
                    retweeterId,
                    profileImg, // 리트윗한 사람의 프로필을 사용
                    retweeterProfileImg,
                    images: [],
                    likeCount: 0,       // 좋아요 카운트
                    retweetCount: 0,    // 리트윗 카운트
                    likedByMe: false,   // 내가 좋아요를 눌렀는지
                    retweetedByMe: false, // 내가 리트윗을 눌렀는지
                });
            }

            if (imgName && imgPath) {
                tweetMap.get(key).images.push({
                    imgName,
                    imgPath,
                });
            }
        });

        // 좋아요와 리트윗 관련 데이터 추가
        const likeSql = `
          SELECT postId, COUNT(*) AS likeCount
          FROM LIKE_TABLE
          GROUP BY postId
        `;

        const retweetSql = `
          SELECT postId, COUNT(*) AS retweetCount
          FROM RETWEET
          GROUP BY postId
        `;

        const [likeRows] = await db.query(likeSql);
        const [retweetRows] = await db.query(retweetSql);

        // 좋아요와 리트윗 카운트 적용
        likeRows.forEach((row) => {
            const postId = row.postId;
            if (tweetMap.has(postId)) {
                tweetMap.get(postId).likeCount = row.likeCount;
            }
        });

        retweetRows.forEach((row) => {
            const postId = row.postId;
            const retweetCount = row.retweetCount;

            // tweetMap에서 해당 postId를 찾고, retweetCount를 갱신
            for (const [key, tweet] of tweetMap.entries()) {
                if (tweet.id === postId) {
                    tweet.retweetCount = retweetCount;  // retweetCount 갱신
                }
            }
        });

        // 내가 좋아요와 리트윗을 했는지 확인
        const userLikeSql = `
          SELECT postId
          FROM LIKE_TABLE
          WHERE userId = ?
        `;
        const userRetweetSql = `
          SELECT postId
          FROM RETWEET
          WHERE userId = ?
        `;

        const [userLikes] = await db.query(userLikeSql, [userId]);
        const [userRetweets] = await db.query(userRetweetSql, [userId]);

        // 좋아요/리트윗 여부 설정
        userLikes.forEach((row) => {
            const postId = row.postId;

            for (const [key, tweet] of tweetMap.entries()) {
                if (tweet.id === postId) {
                    tweet.likedByMe = true;
                }
            }
        });

        userRetweets.forEach((row) => {
            const postId = row.postId;

            // key 기준으로 순회하면서 postId가 일치하는 항목 모두에 반영
            for (const [key, tweet] of tweetMap.entries()) {
                if (tweet.id === postId) {
                    tweet.retweetedByMe = true;
                }
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

module.exports = router;