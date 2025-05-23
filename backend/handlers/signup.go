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
} // クライアントから送られる JSON データ構造

type SignupResponse struct {
	Message string `json:"message"`
} // クライアントに返すレスポンスデータ構造

func (s *Server) SignupHandler(w http.ResponseWriter, r *http.Request) {
	var req SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "無効なリクエストです", http.StatusBadRequest) // 无效请求
		return
	}

	// ✅ ユーザー名がすでに存在しているかチェック
	var existingID int
	err := s.DB.QueryRow("SELECT id FROM users WHERE username = $1", req.Username).Scan(&existingID)
	if err != sql.ErrNoRows {
		if err == nil {
			http.Error(w, "ユーザー名は既に存在します", http.StatusConflict) // 用户名已存在
			return
		}
		http.Error(w, "データベース照会に失敗しました", http.StatusInternalServerError) // 查询失败
		return
	}

	// ✅ パスワードのハッシュ化処理
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "パスワードの暗号化に失敗しました", http.StatusInternalServerError) // 密码加密失败
		return
	}

	// ✅ 新しいユーザー情報を挿入
	_, err = s.DB.Exec("INSERT INTO users (username, password_hash) VALUES ($1, $2)", req.Username, string(hashedPassword))
	if err != nil {
		http.Error(w, "登録に失敗しました", http.StatusInternalServerError) // 注册失败
		return
	}

	json.NewEncoder(w).Encode(SignupResponse{Message: "登録成功"}) // 注册成功
}
