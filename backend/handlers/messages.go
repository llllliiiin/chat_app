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
	RoomID       int      `json:"room_id"`
	Content      string   `json:"content"`
	ThreadRootID *int     `json:"thread_root_id"`
	Mentions     []string `json:"mentions"`
}

// POST /messages メッセージ送信エンドポイント
func (s *Server) SendMessageHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("🟢 POST /messages リクエストを受信")

	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		log.Println("❌ トークンの解析に失敗:", err)                     // Token 解碼失敗
		http.Error(w, "ログインされていません", http.StatusUnauthorized) // 未登录
		return
	}

	var req CreateMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Println("❌ JSON デコード失敗:", err)                       // JSON 解碼失敗
		http.Error(w, "リクエスト形式が正しくありません", http.StatusBadRequest) // 请求格式错误
		return
	}

	if req.RoomID <= 0 {
		http.Error(w, "無効な room_id", http.StatusBadRequest) // 无效 room_id
		return
	}

	now := time.Now()

	// ✅ データベースに挿入して ID を取得
	var messageID int
	err = s.DB.QueryRow(`
		INSERT INTO messages (room_id, sender_id, content, created_at, updated_at, thread_root_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, req.RoomID, userID, req.Content, now, now, req.ThreadRootID).Scan(&messageID)

	if err != nil {
		log.Println("❌ データベース書き込み失敗:", err)                        // 資料庫寫入失敗
		http.Error(w, "データベースエラー", http.StatusInternalServerError) // 数据库错误
		return
	}

	// ✅ メンション保存
	if len(req.Mentions) > 0 {
		s.SaveMentionsAndNotify(messageID, req.Mentions)
	}

	// ✅ 送信者のユーザー名を取得
	var senderName string
	err = s.DB.QueryRow(`SELECT username FROM users WHERE id = $1`, userID).Scan(&senderName)
	if err != nil {
		log.Println("❌ 送信者名の取得失敗:", err) // 查詢發送者名稱失敗
		senderName = "不明"
	}

	// ✅ 該当ルームに WebSocket 経由でブロードキャスト
	s.WSHub.Broadcast <- WSMessage{
		RoomID: req.RoomID,
		Data: map[string]any{
			"type": "new_message",
			"message": map[string]any{
				"id":             messageID,
				"room_id":        req.RoomID,
				"sender":         senderName,
				"content":        req.Content,
				"created_at":     now.Format(time.RFC3339),
				"thread_root_id": req.ThreadRootID,
			},
		},
	}

	if len(req.Content) < 9 || req.Content[:9] != "reaction:" {
		unreadMap := s.GetUnreadMapForRoom(req.RoomID)

		s.WSHub.Broadcast <- WSMessage{
			RoomID: req.RoomID,
			Data: map[string]any{
				"type":       "unread_update",
				"room_id":    req.RoomID,
				"unread_map": unreadMap,
			},
		}
		s.WSHub.Broadcast <- WSMessage{
			RoomID: 0,
			Data: map[string]any{
				"type":       "unread_update",
				"room_id":    req.RoomID,
				"unread_map": unreadMap,
			},
		}
	}

	log.Println("✅ データベースへの書き込みとブロードキャスト成功") // 資料庫寫入與廣播成功
	w.WriteHeader(http.StatusCreated)
}

// GET /messages ルームのメッセージ一覧を取得
func (s *Server) GetMessagesHandler(w http.ResponseWriter, r *http.Request) {
	roomIDStr := r.URL.Query().Get("room_id")
	roomID, err := strconv.Atoi(roomIDStr)
	if err != nil {
		http.Error(w, "無効な room_id", http.StatusBadRequest)
		return
	}

	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "ログインが必要です", http.StatusUnauthorized)
		return
	}

	type MessageResponse struct {
		ID           int       `json:"id"`
		RoomID       int       `json:"room_id"`
		SenderID     int       `json:"sender_id"`
		Sender       string    `json:"sender"`
		Content      string    `json:"content"`
		CreatedAt    time.Time `json:"created_at"`
		UpdatedAt    time.Time `json:"updated_at"`
		ThreadRootID *int      `json:"thread_root_id,omitempty"`
		Attachment   *string   `json:"attachment,omitempty"`
	}

	rows, err := s.DB.Query(`
		SELECT 
			m.id, m.room_id, m.sender_id, u.username, 
			m.content, m.created_at, m.updated_at, m.thread_root_id,
			a.file_name
		FROM messages m
		JOIN users u ON m.sender_id = u.id
		LEFT JOIN message_attachments a ON a.message_id = m.id
		WHERE m.room_id = $1
		AND NOT EXISTS (
			SELECT 1 FROM message_hidden h 
			WHERE h.message_id = m.id AND h.user_id = $2
		)
		ORDER BY m.created_at ASC
	`, roomID, userID)
	if err != nil {
		http.Error(w, "データベースのクエリに失敗しました", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var messages []MessageResponse
	for rows.Next() {
		var msg MessageResponse
		var attachment sql.NullString
		if err := rows.Scan(
			&msg.ID, &msg.RoomID, &msg.SenderID, &msg.Sender,
			&msg.Content, &msg.CreatedAt, &msg.UpdatedAt, &msg.ThreadRootID,
			&attachment,
		); err != nil {
			log.Println("❌ データ読み取り失敗:", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": "データの取得に失敗しました"})
			return
		}
		if attachment.Valid {
			msg.Attachment = &attachment.String
		}
		messages = append(messages, msg)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"messages": messages})
}
