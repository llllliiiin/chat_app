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
	rows, err := s.DB.Query("SELECT username FROM users") // rows 是回傳的結果集合 resultset
	if err != nil {
		http.Error(w, "数据库查询失败", http.StatusInternalServerError)
		return
	}
	defer rows.Close() // 只有 query 的時候需要，因為回傳了 rows，需要手動關閉

	var users []string
	for rows.Next() {
		var username string // 把 username 暫存放進 username 變數
		if err := rows.Scan(&username); err != nil {
			http.Error(w, "解析数据失败", http.StatusInternalServerError)
			return
		}
		users = append(users, username) // 將 username 放入 users
	}

	json.NewEncoder(w).Encode(UserListResponse{Users: users})
}
