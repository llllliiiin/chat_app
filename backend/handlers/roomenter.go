// POST /rooms/{room_id}/enter
package handlers

import (
	"backend/utils"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
)

func (s *Server) EnterRoomHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未登入", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	roomID, err := strconv.Atoi(vars["room_id"])
	if err != nil {
		http.Error(w, "無效 room_id", http.StatusBadRequest)
		return
	}

	// 查出 username
	var username string
	err = s.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&username)
	if err != nil {
		http.Error(w, "查詢用戶失敗", http.StatusInternalServerError)
		return
	}

	// 廣播至該房間
	s.WSHub.Broadcast <- WSMessage{
		RoomID: roomID,
		Data: map[string]any{
			"type":    "user_entered",
			"user":    username,
			"room_id": roomID,
		},
	}

	json.NewEncoder(w).Encode(map[string]string{
		"message": "進入聊天室通知已發送",
	})
}
