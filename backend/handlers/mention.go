package handlers

import (
	"backend/utils"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

// SaveMentionsAndNotify handles saving mentions into DB and sending notification via WebSocket
func (s *Server) SaveMentionsAndNotify(messageID int, usernames []string) {
	for _, username := range usernames {
		var userID int
		err := s.DB.QueryRow("SELECT id FROM users WHERE username = $1", username).Scan(&userID)
		if err != nil {
			log.Printf("🔴 メンション対象のユーザーが見つかりません: %s\n", username)
			continue
		}

		// 保存到 mentions 表
		_, err = s.DB.Exec(`
			INSERT INTO mentions (message_id, mention_target_id)
			VALUES ($1, $2)
		`, messageID, userID)
		if err != nil {
			log.Printf("❌ メンション挿入失敗 (message_id: %d, user_id: %d): %v\n", messageID, userID, err)
			continue
		}

		// 取得消息和发送者信息用于构建通知
		var roomID int
		var content string
		var senderID int
		err = s.DB.QueryRow("SELECT room_id, content, sender_id FROM messages WHERE id = $1", messageID).Scan(&roomID, &content, &senderID)
		if err != nil {
			log.Printf("❌ メッセージ取得失敗: %v\n", err)
			continue
		}

		var senderName string
		s.DB.QueryRow("SELECT username FROM users WHERE id = $1", senderID).Scan(&senderName)

		// 通知 WebSocket 経由で送信
		s.WSHub.Broadcast <- WSMessage{
			RoomID: roomID, // 或者可设为 0 表示私密通知
			Data: map[string]any{
				"type":       "mention_notify",
				"to_user":    userID,
				"message_id": messageID,
				"room_id":    roomID,
				"from":       senderName,
				"content":    content,
				"timestamp":  time.Now().Format(time.RFC3339),
			},
		}

		s.WSHub.Broadcast <- WSMessage{
			RoomID: 0, // 或者可设为 0 表示私密通知
			Data: map[string]any{
				"type":       "mention_notify",
				"to_user":    userID,
				"message_id": messageID,
				"room_id":    roomID,
				"from":       senderName,
				"content":    content,
				"timestamp":  time.Now().Format(time.RFC3339),
			},
		}
	}
}

// GetMentionsForUser returns a list of message IDs where the given user was mentioned
func (s *Server) GetMentionsForUser(userID int) ([]int, error) {
	rows, err := s.DB.Query(`
		SELECT message_id FROM mentions WHERE mention_target_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messageIDs []int
	for rows.Next() {
		var mid int
		if err := rows.Scan(&mid); err == nil {
			messageIDs = append(messageIDs, mid)
		}
	}
	return messageIDs, nil
}

// GetMentionNotificationsHandler exposes a REST API for fetching mentions for current user
func (s *Server) GetMentionNotificationsHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未ログイン", http.StatusUnauthorized)
		return
	}

	messageIDs, err := s.GetMentionsForUser(userID)
	if err != nil {
		http.Error(w, "取得失敗", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]any{
		"mentioned_message_ids": messageIDs,
	})
}

// GET /mention-notifications
func (s *Server) GetMentionNotifications(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	rows, err := s.DB.Query(`
		SELECT m.room_id, u.username
		FROM mentions me
		JOIN messages m ON me.message_id = m.id
		JOIN users u ON m.sender_id = u.id
		WHERE me.mention_target_id = $1
		AND NOT EXISTS (
			SELECT 1 FROM message_reads r
			WHERE r.message_id = me.message_id AND r.user_id = $1
		)
	`, userID)
	if err != nil {
		http.Error(w, "DB error", 500)
		return
	}
	defer rows.Close()

	results := map[int]string{} // room_id → from_user
	for rows.Next() {
		var roomID int
		var from string
		if err := rows.Scan(&roomID, &from); err == nil {
			results[roomID] = from
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
