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
		log.Println("❌ Token 驗證失敗:", err)
		http.Error(w, "未登入", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	roomID, err := strconv.Atoi(vars["room_id"])
	if err != nil {
		log.Println("❌ 轉換 roomID 失敗:", err)
		http.Error(w, "無效 room_id", http.StatusBadRequest)
		return
	}

	// 查出 username
	var username string
	err = s.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&username)
	if err != nil {
		log.Println("❌ 查詢 username 失敗:", err)
		http.Error(w, "查詢用戶失敗", http.StatusInternalServerError)
		return
	}

	// ✅ 標記該使用者在這個房間中所有尚未讀的訊息為已讀
	_, err = s.DB.Exec(`
		INSERT INTO message_reads (user_id, message_id,read_at)
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
	log.Printf("➡️ userID: %d is entering roomID: %d\n", userID, roomID)
	if err != nil {
		log.Println("❌ DB 寫入失敗：", err) // ⬅️ 加這個！
		http.Error(w, "更新已讀狀態失敗", http.StatusInternalServerError)
		return
	}

	// 廣播至該房間：user_entered
	s.WSHub.Broadcast <- WSMessage{
		RoomID: roomID,
		Data: map[string]any{
			"type":    "user_entered",
			"user":    username,
			"room_id": roomID,
		},
	}

	json.NewEncoder(w).Encode(map[string]string{
		"message": "進入聊天室並標記已讀完成",
	})
}
