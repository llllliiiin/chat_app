package handlers

import (
	"backend/utils"
	"encoding/json"
	"net/http"
)

// GET /me
// 現在ログインしているユーザーの情報を取得するエンドポイント
func (s *Server) GetMeHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "ログインされていません", http.StatusUnauthorized) // 未登入
		return
	}

	// ユーザー名を取得
	var username string
	err = s.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&username)
	if err != nil {
		http.Error(w, "ユーザー情報の取得に失敗しました", http.StatusInternalServerError) // 查詢用戶資訊失敗
		return
	}

	// JSON レスポンスとして返す
	json.NewEncoder(w).Encode(map[string]interface{}{
		"username": username,
		"user_id":  userID,
	})
}
