package utils

import (
	"errors"
	"time"

	"net/http" ////// HTTP リクエストのため
	"strings"  ////// トークン抽出用

	"github.com/golang-jwt/jwt/v5"
)

// //////////////
// JWT シークレットキーの定義
var jwtSecret = []byte("your-secret-key")

// ✅ JWT トークンから user_id を取得（優先順位：Cookie → Authorization ヘッダー）
func GetUserIDFromToken(r *http.Request) (int, error) {
	// ✅ Cookie から token を取得（推奨）
	cookie, err := r.Cookie("token")
	var tokenStr string
	if err == nil {
		tokenStr = cookie.Value
	} else {
		// ⚠️ Fallback: Authorization ヘッダーから取得（例：WebSocket 接続時）
		tokenStr = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	}

	// トークン解析
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return 0, errors.New("無効なトークン") // 無效的 token
	}

	claims, ok := token.Claims.(jwt.MapClaims) /// Claims を取得（型アサーション）
	if !ok {
		return 0, errors.New("無効なクレーム") // 無效的 claims
	}

	// ⚠️ ログイン時に user_id を発行していない場合、ここでエラーになる
	idFloat, ok := claims["user_id"].(float64) ////// float64 に変換する必要がある
	if !ok {
		return 0, errors.New("トークンに user_id が含まれていません") // token 中沒有 user_id
	}

	return int(idFloat), nil // 最後に int を返す
}

// シグネチャとバリデーションのための JWT キー（署名鍵）
var jwtKey = []byte("your-secret-key")

// ////カスタムクレーム構造体：JWT の主な内容定義
type Claims struct {
	UserID               int    `json:"user_id"` ////////// JSON に変換する際のキー名
	Username             string `json:"username"`
	jwt.RegisteredClaims        //// JWT 標準項目のセット（推奨）
}

// ✅ JWT トークンを生成（userID + username）
func GenerateJWT(userID int, username string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour) // 有効期限：24時間
	claims := &Claims{
		UserID:   userID, //////////
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			// time.Time を JWT 用の NumericDate に変換して ExpiresAt に代入
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	///// ペイロード（claims）をトークンに格納、署名方法 HS256 を指定
	return token.SignedString(jwtKey)
	///// 秘密鍵で署名を生成して返す
}

// ✅ JWT を検証し、クレームを復元する
func ValidateJWT(tokenString string) (*Claims, error) {
	claims := &Claims{}
	///// JWT 文字列をデコードして claims に格納
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})

	if err != nil || !token.Valid {
		return nil, errors.New("トークンが無効または期限切れです") // 无效或过期的 token
	}

	return claims, nil
}
