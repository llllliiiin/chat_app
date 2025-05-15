package handlers

import (
	"backend/utils"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"
)

type Message struct {
	ID           int       `json:"id"`
	RoomID       int       `json:"room_id"`
	SenderID     int       `json:"sender_id"`
	Content      string    `json:"content"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	ThreadRootID *int      `json:"thread_root_id,omitempty"`
}

type CreateMessageRequest struct {
	RoomID       int    `json:"room_id"`
	Content      string `json:"content"`
	ThreadRootID *int   `json:"thread_root_id"`
}

// //////////導入utils
func (s *Server) SendMessageHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("🟢 收到 POST /messages 請求")

	userID, err := utils.GetUserIDFromToken(r)

	if err != nil {
		log.Println("❌ Token 解碼失敗:", err)
		http.Error(w, "未登录", http.StatusUnauthorized)
		return
	}
	log.Println("🟢 寫入訊息，userID:", userID)

	var req CreateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Println("❌ JSON 解碼失敗:", err)
		http.Error(w, "请求格式错误", http.StatusBadRequest)
		return
	}
	////////////////////////////////////////////////////////
	log.Printf("📦 room_id: %d, content: %s\n", req.RoomID, req.Content)

	if req.RoomID <= 0 {
		http.Error(w, "无效 room_id", http.StatusBadRequest)
		return
	}
	////////////////////////////////////////////////////////
	now := time.Now() ////取得時間

	_, err = s.DB.Exec(`
		INSERT INTO messages (room_id, sender_id, content, created_at, updated_at, thread_root_id)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, req.RoomID, userID, req.Content, now, now, req.ThreadRootID)
	if err != nil {
		log.Println("❌ 寫入資料庫失敗:", err)
		http.Error(w, "数据库错误", http.StatusInternalServerError)
		return
	}

	log.Println("✅ 資料庫寫入成功")
	w.WriteHeader(http.StatusCreated)
}

func (s *Server) GetMessagesHandler(w http.ResponseWriter, r *http.Request) {
	roomIDStr := r.URL.Query().Get("room_id")
	roomID, err := strconv.Atoi(roomIDStr)
	if err != nil {
		http.Error(w, "无效 room_id", http.StatusBadRequest)
		return
	}

	rows, err := s.DB.Query(`
		SELECT id, room_id, sender_id, content, created_at, updated_at, thread_root_id
		FROM messages
		WHERE room_id = $1
		ORDER BY created_at ASC
	`, roomID)
	if err != nil {
		http.Error(w, "数据库查询错误", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.RoomID, &msg.SenderID, &msg.Content, &msg.CreatedAt, &msg.UpdatedAt, &msg.ThreadRootID); err != nil {
			http.Error(w, "读取数据错误", http.StatusInternalServerError)
			return
		}
		messages = append(messages, msg)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"messages": messages})
}
