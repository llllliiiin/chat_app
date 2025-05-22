package handlers

import (
	"backend/utils"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"
)

type CreateMessageRequest struct {
	RoomID       int    `json:"room_id"`
	Content      string `json:"content"`
	ThreadRootID *int   `json:"thread_root_id"`
}

func (s *Server) SendMessageHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("🟢 收到 POST /messages 請求")

	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		log.Println("❌ Token 解碼失敗:", err)
		http.Error(w, "未登录", http.StatusUnauthorized)
		return
	}

	var req CreateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Println("❌ JSON 解碼失敗:", err)
		http.Error(w, "请求格式错误", http.StatusBadRequest)
		return
	}

	if req.RoomID <= 0 {
		http.Error(w, "无效 room_id", http.StatusBadRequest)
		return
	}

	now := time.Now()

	// ✅ 寫入資料庫並取出自動產生的訊息 ID
	var messageID int
	err = s.DB.QueryRow(`
		INSERT INTO messages (room_id, sender_id, content, created_at, updated_at, thread_root_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, req.RoomID, userID, req.Content, now, now, req.ThreadRootID).Scan(&messageID)

	if err != nil {
		log.Println("❌ 資料庫寫入失敗:", err)
		http.Error(w, "数据库错误", http.StatusInternalServerError)
		return
	}

	// ✅ 查詢 sender 使用者名稱
	var senderName string
	err = s.DB.QueryRow(`SELECT username FROM users WHERE id = $1`, userID).Scan(&senderName)
	if err != nil {
		log.Println("❌ 查詢發送者名稱失敗:", err)
		senderName = "Unknown"
	}

	// ✅ 廣播至該房間所有連線用戶
	s.WSHub.Broadcast <- WSMessage{
		RoomID: req.RoomID,
		Data: map[string]any{
			"type": "new_message",
			"message": map[string]any{
				"id":         messageID,
				"room_id":    req.RoomID,
				"sender":     senderName,
				"content":    req.Content,
				"created_at": now.Format(time.RFC3339),
			},
		},
	}

	log.Println("✅ 資料庫寫入與廣播成功")
	w.WriteHeader(http.StatusCreated)
}

// func (s *Server) SendMessageHandler(w http.ResponseWriter, r *http.Request) {
// 	log.Println("🟢 收到 POST /messages 請求")

// 	userID, err := utils.GetUserIDFromToken(r) // 從 JWT 中取出 userID
// 	if err != nil {
// 		log.Println("❌ Token 解碼失敗:", err)
// 		http.Error(w, "未登录", http.StatusUnauthorized)
// 		return
// 	}
// 	log.Println("🟢 寫入訊息，userID:", userID)

// 	var req CreateMessageRequest
// 	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
// 		log.Println("❌ JSON 解碼失敗:", err)
// 		http.Error(w, "请求格式错误", http.StatusBadRequest)
// 		return
// 	}
// 	log.Printf("📦 room_id: %d, content: %s\n", req.RoomID, req.Content)

// 	if req.RoomID <= 0 {
// 		http.Error(w, "无效 room_id", http.StatusBadRequest)
// 		return
// 	}

// 	now := time.Now()
// 	_, err = s.DB.Exec(`
// 		INSERT INTO messages (room_id, sender_id, content, created_at, updated_at, thread_root_id)
// 		VALUES ($1, $2, $3, $4, $5, $6)
// 	`, req.RoomID, userID, req.Content, now, now, req.ThreadRootID)
// 	if err != nil {
// 		log.Println("❌ 寫入資料庫失敗:", err)
// 		http.Error(w, "数据库错误", http.StatusInternalServerError)
// 		return
// 	}

//   	// ...插入資料後...
// 	s.WSHub.Broadcast <- WSMessage{
// 		RoomID: req.RoomID,
// 		Data: map[string]any{
// 			"type": "new_message",
// 			"message": map[string]any{
// 				"sender":  userID,
// 				"content": req.Content,
// 			},
// 		},
// 	}

// 	log.Println("✅ 資料庫寫入成功")
// 	w.WriteHeader(http.StatusCreated)
// }

func (s *Server) GetMessagesHandler(w http.ResponseWriter, r *http.Request) {
	roomIDStr := r.URL.Query().Get("room_id")
	roomID, err := strconv.Atoi(roomIDStr)
	if err != nil {
		http.Error(w, "无效 room_id", http.StatusBadRequest)
		return
	}

	rows, err := s.DB.Query(`
		SELECT 
			m.id, m.room_id, m.sender_id, u.username, 
			m.content, m.created_at, m.updated_at, m.thread_root_id,
			a.file_name -- nullable
		FROM messages m
		JOIN users u ON m.sender_id = u.id
		LEFT JOIN message_attachments a ON a.message_id = m.id
		WHERE m.room_id = $1
		ORDER BY m.created_at ASC
	`, roomID)
	if err != nil {
		http.Error(w, "数据库查询错误", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type MessageResponse struct {
		ID           int       `json:"id"`
		RoomID       int       `json:"room_id"`
		SenderID     int       `json:"sender_id"`
		Sender       string    `json:"sender"`
		Content      string    `json:"content"`
		CreatedAt    time.Time `json:"created_at"`
		UpdatedAt    time.Time `json:"updated_at"`
		ThreadRootID *int      `json:"thread_root_id,omitempty"`
		Attachment   *string   `json:"attachment,omitempty"` // ✅ 新增附件欄位
	}

	var messages []MessageResponse
	for rows.Next() {
		var msg MessageResponse
		var attachment sql.NullString
		if err := rows.Scan(
			&msg.ID, &msg.RoomID, &msg.SenderID, &msg.Sender,
			&msg.Content, &msg.CreatedAt, &msg.UpdatedAt, &msg.ThreadRootID,
			&attachment,
		); err != nil {
			log.Println("❌ 資料掃描失敗:", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "读取数据错误"})
			return
		}
		if attachment.Valid {
			msg.Attachment = &attachment.String
		}
		messages = append(messages, msg)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"messages": messages})
}
