package handlers

import (
	"backend/utils"
	"database/sql"
	"encoding/json"
	"net/http"
	"sort"
)

type RoomRequest struct {
	User1 string `json:"user1"` // currentUser
	User2 string `json:"user2"` // targetUser
}

type RoomResponse struct {
	RoomID int `json:"room_id"`
}

func (s *Server) GetOrCreateRoomHandler(w http.ResponseWriter, r *http.Request) {
	var req RoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "请求体格式错误", http.StatusBadRequest)
		return
	}

	// 查兩個用戶 id
	var userIDs [2]int
	err := s.DB.QueryRow(`SELECT id FROM users WHERE username=$1`, req.User1).Scan(&userIDs[0])
	if err != nil {
		http.Error(w, "找不到用户1", http.StatusBadRequest)
		return
	}
	err = s.DB.QueryRow(`SELECT id FROM users WHERE username=$1`, req.User2).Scan(&userIDs[1])
	if err != nil {
		http.Error(w, "找不到用户2", http.StatusBadRequest)
		return
	}
	sort.Ints(userIDs[:]) // 確保順序一致

	// 生成唯一的 room_name（通过拼接两个用户的用户名）
	roomName := req.User1 + "_" + req.User2

	// 查詢是否已有這兩人參與、且為 is_group = false 的房間
	var roomID int
	query := `
		SELECT cr.id FROM chat_rooms cr
		JOIN room_members rm1 ON cr.id = rm1.room_id AND rm1.user_id = $1
		JOIN room_members rm2 ON cr.id = rm2.room_id AND rm2.user_id = $2
		WHERE cr.is_group = false
		LIMIT 1;
	`
	err = s.DB.QueryRow(query, userIDs[0], userIDs[1]).Scan(&roomID)

	if err == sql.ErrNoRows {
		// 創建新房間
		err = s.DB.QueryRow(`INSERT INTO chat_rooms (is_group,room_name) VALUES(false, $1) RETURNING id`, roomName).Scan(&roomID)
		if err != nil {
			http.Error(w, "创建房间失败", http.StatusInternalServerError)
			return
		}
		// 加入 room_members
		_, err = s.DB.Exec(`INSERT INTO room_members (room_id, user_id) VALUES ($1, $2), ($1, $3)`,
			roomID, userIDs[0], userIDs[1])
		if err != nil {
			http.Error(w, "添加房间成员失败", http.StatusInternalServerError)
			return
		}
	} else if err != nil {
		http.Error(w, "查询房间失败", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(RoomResponse{RoomID: roomID})
}

// GET /oneroom取得用戶參與的所有的聊天室
func (s *Server) GetUserOneroomHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未登录或無效 token", http.StatusUnauthorized)
		return
	}

	// 查询一对一房间（is_group = false）
	rows, err := s.DB.Query(`
		SELECT cr.id, cr.room_name, cr.is_group
		FROM chat_rooms cr
		JOIN room_members rm ON cr.id = rm.room_id
		WHERE rm.user_id = $1 AND cr.is_group = false
	`, userID)
	if err != nil {
		http.Error(w, "查詢房間失敗", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var rooms []RoomInfo
	for rows.Next() {
		var room RoomInfo
		if err := rows.Scan(&room.ID, &room.RoomName, &room.IsGroup); err == nil {
			rooms = append(rooms, room)
		}
	}

	// 返回一对一房间列表
	json.NewEncoder(w).Encode(rooms)
}
