package handlers

import (
	"backend/utils"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type Server struct {
	DB    *sql.DB
	WSHub *WebSocketHub
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (s *Server) LoginHandler(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "無効なリクエスト", http.StatusBadRequest) // 請求無効
		return
	}

	var userID int ///////////// 全ての場所で userID を使用する
	var storedHash string
	err := s.DB.QueryRow("SELECT id, password_hash FROM users WHERE username = $1", req.Username).Scan(&userID, &storedHash)
	if err == sql.ErrNoRows {
		http.Error(w, "ユーザーが存在しません", http.StatusUnauthorized) // ユーザーが存在していません
		return
	} else if err != nil {
		http.Error(w, "ユーザーの取得に失敗しました", http.StatusInternalServerError) // ユーザーの取得が失敗しました
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password)); err != nil {
		http.Error(w, "パスワードが間違っています", http.StatusUnauthorized) // パスワードが間違えました
		return
	}

	token, err := utils.GenerateJWT(userID, req.Username) ////// 全ての場所で userID を使用する
	if err != nil {
		http.Error(w, "トークンの生成に失敗しました", http.StatusInternalServerError) // tokenの生成が失敗しました
		return
	}

	// ✅ トークンを HttpOnly Cookie として保存（JS からはアクセス不可）
	http.SetCookie(w, &http.Cookie{
		Name:     "token",                            // Cookie の名前
		Value:    token,                              // JWT トークン
		HttpOnly: true,                               // JS からアクセス不可にする
		Path:     "/",                                // 全パスに有効
		SameSite: http.SameSiteLaxMode,               // クロスサイト防止
		Expires:  time.Now().Add(7 * 24 * time.Hour), // 1週間有効
		// Secure: true,                      // 本番環境では HTTPS のみ
	})

	// ✅ レスポンスとして username を返す（トークンは返さない）
	json.NewEncoder(w).Encode(map[string]string{
		"message":  "ログインに成功しました", // 登録成功
		"username": req.Username,  // 使用者名稱
	})
}
