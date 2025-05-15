package handlers

import (
	"encoding/json"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

type SignupRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
} //定义前端发来的 JSON 数据结构。

type SignupResponse struct {
	Message string `json:"message"`
} //定义返回给前端的响应数据结构。

func (s *Server) SignupHandler(w http.ResponseWriter, r *http.Request) {
	var req SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "无效请求", http.StatusBadRequest)
		return
	} //从请求体中读取 JSON 并转成结构体，如果失败就返回 400。

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "密码加密失败", http.StatusInternalServerError)
		return
	}

	_, err = s.DB.Exec("INSERT INTO users (username, password_hash) VALUES ($1, $2)", req.Username, string(hashedPassword))
	if err != nil {
		http.Error(w, "用户名可能已存在", http.StatusInternalServerError)
		return
	} //把用户名和加密后的密码写入数据库。

	json.NewEncoder(w).Encode(SignupResponse{Message: "注册成功"})
}
