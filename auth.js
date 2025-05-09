//JWT 토큰 검증
const jwt = require('jsonwebtoken');
const JWT_SECRET = 'testtesttesttesttesttesttesttest'; // .env 없이 하드코딩

module.exports = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: '인증 토큰 없음', isLogin: false });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log("decoded ==>", decoded);
        req.user = decoded; // 이후 라우터에서 req.user로 사용자 정보 사용 가능
        next();
    } catch (err) {
        return res.status(403).json({ message: '유효하지 않은 토큰', isLogin: false });
    }
};