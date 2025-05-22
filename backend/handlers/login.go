package handlers

import (
	"backend/utils"
	"database/sql"
	"encoding/json"
	"net/http"

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

type LoginResponse struct {
	Message  string `json:"message"`
	Token    string `json:"token"`
	Username string `json:"username"`
}

func (s *Server) LoginHandler(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "請求無効", http.StatusBadRequest)
		return
	}

	var userID int ///////////// 全部加入 userID
	var storedHash string
	err := s.DB.QueryRow("SELECT id, password_hash FROM users WHERE username = $1", req.Username).Scan(&userID, &storedHash)
	if err == sql.ErrNoRows {
		http.Error(w, "ユーザーが存在していません", http.StatusUnauthorized)
		return
	} else if err != nil {
		http.Error(w, "ユーザーの取得が失敗しました", http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password)); err != nil {
		http.Error(w, "パスワードが間違えました", http.StatusUnauthorized)
		return
	}

	token, err := utils.GenerateJWT(userID, req.Username) ////// 全部加入 userID
	if err != nil {
		http.Error(w, "tokenの生成が失敗しました", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(LoginResponse{
		Message:  "登録成功",
		Token:    token,
		Username: req.Username,
	})
}
