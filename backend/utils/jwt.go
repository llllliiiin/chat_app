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

	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return 0, errors.New("無效的 token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("無效的 claims")
	}

	// ⚠️ 確保你登入時簽發了 user_id（如果只簽發了 username，這裡會報錯）
	idFloat, ok := claims["user_id"].(float64)
	if !ok {
		return 0, errors.New("token 中沒有 user_id")
	}

	return int(idFloat), nil
}

// ////////////
var jwtKey = []byte("your-secret-key")

type Claims struct {
	UserID   int    `json:"user_id"` //////////
	Username string `json:"username"`
	jwt.RegisteredClaims
}

func GenerateJWT(userID int, username string) (string, error) {
	expirationTime := time.Now().Add(24 * time.Hour)
	claims := &Claims{
		UserID:   userID, //////////
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtKey)
}

func ValidateJWT(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})

	if err != nil || !token.Valid {
		return nil, errors.New("无效或过期的 token")
	}

	return claims, nil
}
