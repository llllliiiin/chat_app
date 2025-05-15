package handlers

import (
	"encoding/json"
	"net/http"
)

type UserListResponse struct {
	Users []string `json:"users"`
}

// 结构体中已经有 DB 引用
func (s *Server) GetUsersHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := s.DB.Query("SELECT username FROM users")
	if err != nil {
		http.Error(w, "数据库查询失败", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []string
	for rows.Next() {
		var username string
		if err := rows.Scan(&username); err != nil {
			http.Error(w, "解析数据失败", http.StatusInternalServerError)
			return
		}
		users = append(users, username)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(UserListResponse{Users: users})
}
