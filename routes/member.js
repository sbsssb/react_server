const express = require('express');
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const fs = require('fs'); // 파일 시스템 모듈
const path = require('path');

// 1. 패키지 추가
const multer  = require('multer')

// 2. 저장 경로 및 파일명
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

router.patch('/update', upload.single('profileImg'), async (req, res) => {
    const { email, username, bio } = req.body;
    const filename = req.file ? req.file.filename : null; 
    const destination = req.file ? req.file.destination : null;
    let filePath = null;

    if (filename && destination) {
        filePath = path.join(destination, filename);
    }

    try {
        // 기존 프로필 이미지 경로 조회
        const [prevImgResult] = await db.query("SELECT PROFILEIMG FROM USERS WHERE EMAIL = ?", [email]);
        const prevImgPath = prevImgResult[0]?.PROFILEIMG;

        // 새 이미지가 업로드된 경우에만 기존 이미지 삭제
        if (req.file && prevImgPath && fs.existsSync(prevImgPath)) {
            fs.unlinkSync(prevImgPath);
        }

        if (filePath) {
            // 새 이미지 포함 업데이트
            await db.query(
                "UPDATE USERS SET USERNAME = ?, BIO = ?, PROFILEIMG = ? WHERE EMAIL = ?",
                [username, bio, filePath, email]
            );
        } else {
            // 이미지 없이 username과 bio만 업데이트
            await db.query(
                "UPDATE USERS SET USERNAME = ?, BIO = ? WHERE EMAIL = ?",
                [username, bio, email]
            );
        }

        res.json({
            message: "Profile updated successfully",
            result: "success"
        });
    } catch (err) {
        console.error("Error occurred:", err);
        res.status(500).send("Server Error");
    }
});


const JWT_KEY = "show-me-the-money";
router.post("/", async (req, res) => {
    let {email, password} = req.body;
    try{
        let query = "SELECT email, username, password FROM USERS WHERE EMAIL = ?";
        let [user] = await db.query(query, [email]);
        let result = {};
        if(user.length > 0){
            let isMatch = await bcrypt.compare(password, user[0].password);
            if(isMatch){
                // 세션 값 저장
                let payload = {
                    sessionEmail : user[0].email,
                    sessionName : user[0].username,
                }
                const token = jwt.sign(payload, JWT_KEY, {expiresIn : '1h'});
    
                result = {
                    message : "로그인 성공!",
                    success : true,
                    token : token
                }
            } else {
                result = {
                    message : "비밀번호를 확인해 주세요."
                }
            }
            
        } else {
            result = {
                message : "아이디를 확인해 주세요."
            }
        }
        res.json(result);
    }catch(err){
        console.log("에러 발생!");
        res.status(500).send("Server Error");
    }
})

router.get("/:email", async (req, res) => {
    let { email } = req.params;
    try{
        let [list] = await db.query("SELECT * FROM USERS WHERE EMAIL = '" + email + "'");
        res.json({
            message : "result",
            info : list[0]
        });
    }catch(err){
        console.log(err.message);
        res.status(500).send("Server Error");
    }
})


router.post('/join', upload.single('file'), async (req, res) => {
    const { email, password, userName, phone } = req.body;
    const filename = req.file?.filename;
    const destination = req.file?.destination;
  
    try {
      const hashPwd = await bcrypt.hash(password, 10);
      const profileImgPath = filename ? destination + filename : null;
  
      const query = `
        INSERT INTO USERS (EMAIL, PASSWORD, USERNAME, PHONE, PROFILEIMG, BIO)
        VALUES (?, ?, ?, ?, ?, '소개글을 입력해 주세요.')
      `;
      await db.query(query, [email, hashPwd, userName, phone, profileImgPath]);
  
      res.json({ message: '회원가입 완료' });
    } catch (err) {
      console.error("회원가입 오류:", err.message);
      res.status(500).send("Server Error");
    }
  });
  

module.exports = router;