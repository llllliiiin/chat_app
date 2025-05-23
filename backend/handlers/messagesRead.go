package handlers

import (
	"backend/utils"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

// POST /messages/{message_id}/read
// ユーザーがメッセージを既読としてマークする
func (s *Server) MarkMessageAsReadHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "ログインされていません", http.StatusUnauthorized) // 未登入
		return
	}

	vars := mux.Vars(r)
	messageIDStr := vars["message_id"]
	messageID, err := strconv.Atoi(messageIDStr)
	if err != nil {
		http.Error(w, "無効なメッセージID", http.StatusBadRequest) // 無效訊息 ID
		return
	}

	// メッセージが属するルームIDを取得
	var roomID int
	err = s.DB.QueryRow("SELECT room_id FROM messages WHERE id = $1", messageID).Scan(&roomID)
	if err != nil {
		http.Error(w, "ルームIDの取得に失敗しました", http.StatusInternalServerError) // 查詢 room_id 失敗
		return
	}

	//// すでに存在する場合は、現在時刻で更新
	_, err = s.DB.Exec(`
		INSERT INTO message_reads (message_id, user_id, read_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW()
	`, messageID, userID)
	if err != nil {
		http.Error(w, "データベースの書き込みに失敗しました", http.StatusInternalServerError) // 寫入資料庫失敗
		return
	}

	// 現在このメッセージを既読にしているすべてのユーザー名を取得
	rows, err := s.DB.Query(`
		SELECT u.username
		FROM message_reads mr
		JOIN users u ON mr.user_id = u.id
		WHERE mr.message_id = $1
	`, messageID)
	if err != nil {
		http.Error(w, "既読者の取得に失敗しました", http.StatusInternalServerError) // 查詢已讀失敗
		return
	}
	defer rows.Close()

	var readers []string
	for rows.Next() {
		var name string
		_ = rows.Scan(&name)
		readers = append(readers, name)
	}

	// 既読ステータスをブロードキャスト
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
		"message": "メッセージは既読にマークされました", // 訊息已標記為已讀
	})
}

// GET /rooms/{room_id}/unread-count
// 指定されたルームの未読メッセージ数を返す（現在のユーザー向け）
func (s *Server) GetUnreadMessageCountHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "ログインされていません", http.StatusUnauthorized) // 未登入
		return
	}

	vars := mux.Vars(r)
	roomIDStr := vars["room_id"]
	roomID, err := strconv.Atoi(roomIDStr)
	if err != nil {
		http.Error(w, "無効なルームID", http.StatusBadRequest) // 無效聊天室 ID
		return
	}

	var count int
	/// まだ読まれていないメッセージの数を取得
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
	//// 指定ユーザーがこのメッセージを読んだかどうか確認（未読ならカウント）
	if err != nil {
		http.Error(w, "クエリの実行に失敗しました", http.StatusInternalServerError) // 查詢失敗
		return
	}

	json.NewEncoder(w).Encode(map[string]int{
		"unread_count": count,
	})
}

// GET /messages/{message_id}/readers
// メッセージの既読ユーザー一覧を取得
func (s *Server) GetMessageReadsHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	messageID, err := strconv.Atoi(vars["message_id"])
	if err != nil {
		http.Error(w, "無効なメッセージID", http.StatusBadRequest) // 無效訊息 ID
		return
	}

	rows, err := s.DB.Query(`
		SELECT u.username
		FROM message_reads mr
		JOIN users u ON mr.user_id = u.id
		WHERE mr.message_id = $1
	`, messageID)
	if err != nil {
		http.Error(w, "既読ユーザーの取得に失敗しました", http.StatusInternalServerError) // 查詢既読失敗
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
