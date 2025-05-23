// POST /rooms/{room_id}/enter
package handlers

import (
	"backend/utils"
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

func (s *Server) EnterRoomHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		log.Println("❌ トークンの検証に失敗:", err)                     // Token 驗證失敗
		http.Error(w, "ログインされていません", http.StatusUnauthorized) // 未登入
		return
	}

	vars := mux.Vars(r)
	roomID, err := strconv.Atoi(vars["room_id"])
	if err != nil {
		log.Println("❌ roomID の変換に失敗:", err)                // 轉換 roomID 失敗
		http.Error(w, "無効な room_id", http.StatusBadRequest) // 無效 room_id
		return
	}

	// ユーザー名を取得
	var username string
	err = s.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&username)
	if err != nil {
		log.Println("❌ ユーザー名の取得に失敗:", err)                                // 查詢 username 失敗
		http.Error(w, "ユーザー情報の取得に失敗しました", http.StatusInternalServerError) // 查詢用戶失敗
		return
	}

	// ✅ このルーム内の未読メッセージをすべて既読としてマーク
	_, err = s.DB.Exec(`
		INSERT INTO message_reads (user_id, message_id, read_at)
		SELECT $1, m.id, NOW()
		FROM messages m
		WHERE m.room_id = $2
		  AND m.sender_id != $1
		  AND NOT EXISTS (
			SELECT 1 FROM message_reads r
			WHERE r.user_id = $1 AND r.message_id = m.id
		  )
		ON CONFLICT DO NOTHING
	`, userID, roomID)
	log.Printf("➡️ userID: %d が roomID: %d に入室しました\n", userID, roomID)
	if err != nil {
		log.Println("❌ データベースの書き込み失敗：", err)                               // DB 寫入失敗
		http.Error(w, "既読ステータスの更新に失敗しました", http.StatusInternalServerError) // 更新已讀狀態失敗
		return
	}

	// 入室イベントをルーム内の他ユーザーにブロードキャスト
	s.WSHub.Broadcast <- WSMessage{
		RoomID: roomID,
		Data: map[string]any{
			"type":    "user_entered",
			"user":    username,
			"room_id": roomID,
		},
	}

	json.NewEncoder(w).Encode(map[string]string{
		"message": "ルームに入り、既読ステータスが更新されました", // 進入聊天室並標記已讀完成
	})
}
