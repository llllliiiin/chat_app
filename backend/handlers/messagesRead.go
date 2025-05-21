package handlers

import (
	"backend/utils"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

// POST /messages/{message_id}/read
// 用戶標記訊息為已讀
func (s *Server) MarkMessageAsReadHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未登入", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	messageIDStr := vars["message_id"]
	messageID, err := strconv.Atoi(messageIDStr)
	if err != nil {
		http.Error(w, "無效訊息 ID", http.StatusBadRequest)
		return
	}
	// 查訊息在哪個 room 中
	var roomID int
	err = s.DB.QueryRow("SELECT room_id FROM messages WHERE id = $1", messageID).Scan(&roomID)
	if err != nil {
		http.Error(w, "查詢 room_id 失敗", http.StatusInternalServerError)
		return
	}

	////如果已經存在，就更新成爲現在的時間
	_, err = s.DB.Exec(`
		INSERT INTO message_reads (message_id, user_id, read_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW()
	`, messageID, userID)
	if err != nil {
		http.Error(w, "寫入資料庫失敗", http.StatusInternalServerError)
		return
	}

	// 查目前這則訊息所有已讀者名稱
	rows, err := s.DB.Query(`
		SELECT u.username
		FROM message_reads mr
		JOIN users u ON mr.user_id = u.id
		WHERE mr.message_id = $1
	`, messageID)
	if err != nil {
		http.Error(w, "查詢已讀失敗", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var readers []string
	for rows.Next() {
		var name string
		_ = rows.Scan(&name)
		readers = append(readers, name)
	}

	// 廣播已讀狀態
	s.WSHub.Broadcast <- WSMessage{
		RoomID: roomID,
		Data: map[string]any{
			"type":       "read_update",
			"message_id": messageID,
			"readers":    readers,
		},
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "訊息已標記為已讀",
	})
}

// GET /rooms/{room_id}/unread-count
// 回傳某聊天室的未讀訊息數量（對當前使用者而言）
func (s *Server) GetUnreadMessageCountHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未登入", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	roomIDStr := vars["room_id"]
	roomID, err := strconv.Atoi(roomIDStr)
	if err != nil {
		http.Error(w, "無效聊天室 ID", http.StatusBadRequest)
		return
	}

	var count int
	///查詢還沒有被閲讀的數量
	err = s.DB.QueryRow(`
		SELECT COUNT(*)
		FROM messages m
		WHERE m.room_id = $1
		AND m.sender_id != $2
		AND NOT EXISTS (
			SELECT 1 FROM message_reads mr 
			WHERE mr.message_id = m.id AND mr.user_id = $2
		)
	`, roomID, userID).Scan(&count)
	////查詢這段資料有沒有被使用者讀過，則exist，如果沒有，則no exist
	if err != nil {
		http.Error(w, "查詢失敗", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]int{
		"unread_count": count,
	})
}

// 查詢訊息既読人員
func (s *Server) GetMessageReadsHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	messageID, err := strconv.Atoi(vars["message_id"])
	if err != nil {
		http.Error(w, "無效訊息 ID", http.StatusBadRequest)
		return
	}

	rows, err := s.DB.Query(`
		SELECT u.username
		FROM message_reads mr
		JOIN users u ON mr.user_id = u.id
		WHERE mr.message_id = $1
	`, messageID)
	if err != nil {
		http.Error(w, "查詢既読失敗", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var readers []string
	for rows.Next() {
		var name string
		_ = rows.Scan(&name)
		readers = append(readers, name)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"readers": readers,
	})
}
