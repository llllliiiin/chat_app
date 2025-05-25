package handlers

import (
	"backend/utils"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
)

// POST /messages/{message_id}/revoke
// 撤回メッセージ（2分以内）
func (s *Server) RevokeMessageHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "ログインが必要です", http.StatusUnauthorized)
		return
	}

	msgIDStr := mux.Vars(r)["message_id"]
	msgID, err := strconv.Atoi(msgIDStr)
	if err != nil {
		http.Error(w, "メッセージIDが無効です", http.StatusBadRequest)
		return
	}

	var senderID, roomID int
	var createdAt time.Time
	err = s.DB.QueryRow("SELECT sender_id, room_id, created_at FROM messages WHERE id = $1", msgID).Scan(&senderID, &roomID, &createdAt)
	if err == sql.ErrNoRows {
		http.Error(w, "メッセージが存在しません", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "データベースエラー", http.StatusInternalServerError)
		return
	}

	if senderID != userID {
		http.Error(w, "撤回できるのは送信者のみです", http.StatusForbidden)
		return
	}

	if time.Since(createdAt) > 2*time.Minute {
		http.Error(w, "2分経過後は撤回できません", http.StatusBadRequest)
		return
	}

	_, err = s.DB.Exec("DELETE FROM messages WHERE id = $1", msgID)
	if err != nil {
		http.Error(w, "削除に失敗しました", http.StatusInternalServerError)
		return
	}

	// WebSocket 経由で通知（撤回）
	s.WSHub.Broadcast <- WSMessage{
		RoomID: roomID,
		Data: map[string]any{
			"type":       "message_revoked",
			"message_id": msgID,
		},
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "メッセージを撤回しました",
	})
}

// POST /messages/{message_id}/hide
// 自分の画面でのみメッセージを非表示にする（DB記録あり）
func (s *Server) HideMessageHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "ログインが必要です", http.StatusUnauthorized)
		return
	}

	msgIDStr := mux.Vars(r)["message_id"]
	msgID, err := strconv.Atoi(msgIDStr)
	if err != nil {
		http.Error(w, "メッセージIDが無効です", http.StatusBadRequest)
		return
	}

	_, err = s.DB.Exec(`
		INSERT INTO message_hidden (message_id, user_id)
		VALUES ($1, $2) ON CONFLICT DO NOTHING
	`, msgID, userID)
	if err != nil {
		http.Error(w, "非表示記録の保存に失敗しました", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "メッセージを非表示にしました",
	})
}
