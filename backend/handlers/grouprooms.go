package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"backend/utils"

	"github.com/gorilla/mux"
)

type RoomInfo struct {
	ID       int    `json:"id"`
	RoomName string `json:"room_name"`
	IsGroup  bool   `json:"is_group"`
}

type RoomMembersResponse struct {
	Members []string `json:"members"`
}

// GET /rooms
func (s *Server) GetUserRoomsHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未登录或無效 token", http.StatusUnauthorized)
		return
	}

	rows, err := s.DB.Query(`
		SELECT cr.id, cr.room_name, cr.is_group
		FROM chat_rooms cr
		JOIN room_members rm ON cr.id = rm.room_id
		WHERE rm.user_id = $1
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

	json.NewEncoder(w).Encode(rooms)
}

// POST /create-group-room
func (s *Server) CreateGroupRoomHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未登录或無效 token", http.StatusUnauthorized)
		return
	}

	var payload struct {
		RoomName string `json:"room_name"`
		UserIDs  []int  `json:"user_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "解析請求失敗", http.StatusBadRequest)
		return
	}

	var roomID int
	err = s.DB.QueryRow(`SELECT id FROM chat_rooms WHERE room_name = $1 AND is_group = true`, payload.RoomName).Scan(&roomID)
	if err == sql.ErrNoRows {
		err = s.DB.QueryRow(
			`INSERT INTO chat_rooms (room_name, is_group) VALUES ($1, true) RETURNING id`,
			payload.RoomName,
		).Scan(&roomID)
		if err != nil {
			http.Error(w, "創建群組房失敗", http.StatusInternalServerError)
			return
		}
	} else if err != nil {
		http.Error(w, "查詢房間失敗", http.StatusInternalServerError)
		return
	}

	memberSet := append(payload.UserIDs, userID)
	for _, uid := range memberSet {
		_, _ = s.DB.Exec(`INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, roomID, uid)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"room_id": roomID,
		"message": "群組房處理完成",
	})
}

// GET /rooms/{room_id}/join-group
func (s *Server) JoinGroupRoomHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未登录或无效 token", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	roomIDStr := vars["room_id"]
	roomID, err := strconv.Atoi(roomIDStr)
	if err != nil {
		http.Error(w, "無效的 room_id", http.StatusBadRequest)
		return
	}

	err = s.DB.QueryRow("SELECT id FROM chat_rooms WHERE id = $1 AND is_group = true", roomID).Scan(&roomID)
	if err == sql.ErrNoRows {
		http.Error(w, "群組房間不存在", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "查询房间失败", http.StatusInternalServerError)
		return
	}

	var exists int
	s.DB.QueryRow("SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2", roomID, userID).Scan(&exists)
	if exists != 1 {
		_, err := s.DB.Exec("INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)", roomID, userID)
		if err != nil {
			http.Error(w, "加入群組失敗", http.StatusInternalServerError)
			return
		}
	}

	rows, err := s.DB.Query(`
		SELECT u.username
		FROM room_members rm
		JOIN users u ON rm.user_id = u.id
		WHERE rm.room_id = $1
	`, roomID)
	if err != nil {
		http.Error(w, "查询成员失败", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var members []string
	for rows.Next() {
		var username string
		if err := rows.Scan(&username); err == nil {
			members = append(members, username)
		}
	}

	json.NewEncoder(w).Encode(RoomMembersResponse{Members: members})
}

// GET /rooms/{room_id}/info
func (s *Server) GetRoomInfoHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["room_id"]

	var roomName string
	var isGroup bool
	err := s.DB.QueryRow("SELECT room_name, is_group FROM chat_rooms WHERE id = $1", roomID).Scan(&roomName, &isGroup)
	if err == sql.ErrNoRows {
		http.Error(w, "房間不存在", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "查詢房間資訊失敗", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"room_name": roomName,
		"is_group":  isGroup,
	})
}

// POST /rooms/{room_id}/leave
func (s *Server) LeaveGroupHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未登录或無效 token", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	roomID := vars["room_id"]

	_, err = s.DB.Exec("DELETE FROM room_members WHERE room_id = $1 AND user_id = $2", roomID, userID)
	if err != nil {
		http.Error(w, "退出群組失敗", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "成功退出群組",
	})
}
