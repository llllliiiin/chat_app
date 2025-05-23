package handlers

import (
	"encoding/json"
	"net/http"
)

type UserListResponse struct {
	Users []string `json:"users"`
}

// サーバー構造体にはすでに DB への参照が含まれている
func (s *Server) GetUsersHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query("SELECT username FROM users") // rows は返された結果セット（ResultSet）
	if err != nil {
		http.Error(w, "データベースクエリに失敗しました", http.StatusInternalServerError) // 数据库查询失败
		return
	}
	defer rows.Close() // Query の場合は手動で close が必要

	var users []string
	for rows.Next() {
		var username string // username を一時変数に格納
		if err := rows.Scan(&username); err != nil {
			http.Error(w, "データ解析に失敗しました", http.StatusInternalServerError) // 解析数据失败
			return
		}
		users = append(users, username) // username を配列に追加
	}

	json.NewEncoder(w).Encode(UserListResponse{Users: users})
}
