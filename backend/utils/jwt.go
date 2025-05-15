package utils

import (
	"errors"
	"time"

	"net/http" //////
	"strings"  //////

	"github.com/golang-jwt/jwt/v5"
)

// //////////////
// 根據你的 JWT Secret
var jwtSecret = []byte("your-secret-key")

func GetUserIDFromToken(r *http.Request) (int, error) {
	tokenStr := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	/////從取得的header中去掉bearer
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return 0, errors.New("無效的 token")
	}

	claims, ok := token.Claims.(jwt.MapClaims) ///取得claims，但並不是intint
	if !ok {
		return 0, errors.New("無效的 claims")
	}

	// ⚠️ 確保你登入時簽發了 user_id（如果只簽發了 username，這裡會報錯）
	idFloat, ok := claims["user_id"].(float64) //////不是int
	if !ok {
		return 0, errors.New("token 中沒有 user_id")
	}

	return int(idFloat), nil //最後返回int，返回id
}

// //用於定義json web token簽名與驗證的密鑰，用於將"your-secret-key"轉化爲byte
// /防止被篡改
var jwtKey = []byte("your-secret-key")

// var jwtSecret = []byte(os.Getenv("JWT_SECRET"))最好像這樣用環境變量

// ////自定義claim結構**jwt的主題内容
type Claims struct {
	UserID               int    `json:"user_id"` //////////表示轉成json時的key名稱
	Username             string `json:"username"`
	jwt.RegisteredClaims        ////定義了jw標準格式的内容，建議引用
}

func GenerateJWT(userID int, username string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour) //截至日期
	claims := &Claims{
		UserID:   userID, //////////
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			//將time.time格式轉化爲jwt的numericdate格式，賦值給expiresAT
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	/////將payload部分放入token，用的是hs256方法，這個階段做聲明
	return token.SignedString(jwtKey)
	/////用定義的密鑰生成簽名并返回
}

// ////驗證jwt並還原claims
func ValidateJWT(tokenString string) (*Claims, error) {
	claims := &Claims{}
	/////把 JWT 字串 tokenStr 解碼，傳入claims，用來裝載解析出來的資料
	//////是前一段的進階版，不需要再轉類型，已經定義好了
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})

	if err != nil || !token.Valid {
		return nil, errors.New("无效或过期的 token")
	}

	return claims, nil
}
