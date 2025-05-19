package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

type SignupRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
} // 定义前端发来的 JSON 数据结构

type SignupResponse struct {
	Message string `json:"message"`
} // 定义返回给前端的响应数据结构

func (s *Server) SignupHandler(w http.ResponseWriter, r *http.Request) {
	var req SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "无效请求", http.StatusBadRequest)
		return
	}

	// ✅ 檢查該用戶名是否已存在
	var existingID int
	err := s.DB.QueryRow("SELECT id FROM users WHERE username = $1", req.Username).Scan(&existingID)
	if err != sql.ErrNoRows {
		if err == nil {
			http.Error(w, "用户名已存在", http.StatusConflict)
			return
		}
		http.Error(w, "查询失败", http.StatusInternalServerError)
		return
	}

	// ✅ 密码加密處理
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "密码加密失败", http.StatusInternalServerError)
		return
	}

	// ✅ 插入新用户資料
	_, err = s.DB.Exec("INSERT INTO users (username, password_hash) VALUES ($1, $2)", req.Username, string(hashedPassword))
	if err != nil {
		http.Error(w, "注册失败", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(SignupResponse{Message: "注册成功"})
}
