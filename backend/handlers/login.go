package handlers

import (
	"backend/utils"
	"database/sql"
	"encoding/json"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

type Server struct {
	DB *sql.DB
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
		http.Error(w, "无效请求", http.StatusBadRequest)
		return
	}

	var userID int ///////////// 全部加入 userID
	var storedHash string
	err := s.DB.QueryRow("SELECT id, password_hash FROM users WHERE username = $1", req.Username).Scan(&userID, &storedHash)
	if err == sql.ErrNoRows {
		http.Error(w, "用户不存在", http.StatusUnauthorized)
		return
	} else if err != nil {
		http.Error(w, "查询失败", http.StatusInternalServerError)
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(req.Password)); err != nil {
		http.Error(w, "密码错误", http.StatusUnauthorized)
		return
	}

	token, err := utils.GenerateJWT(userID, req.Username) ////// 全部加入 userID
	if err != nil {
		http.Error(w, "生成 token 失败", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(LoginResponse{
		Message:  "登录成功",
		Token:    token,
		Username: req.Username,
	})
}
