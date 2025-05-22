package handlers

import (
	"backend/utils"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// POST /messages/upload
func (s *Server) UploadMessageAttachmentHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "未登入", http.StatusUnauthorized)
		return
	}

	err = r.ParseMultipartForm(10 << 20) // 最多 10MB
	if err != nil {
		http.Error(w, "檔案格式錯誤", http.StatusBadRequest)
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "未提供檔案", http.StatusBadRequest)
		return
	}
	defer file.Close()

	roomIDStr := r.FormValue("room_id") //表單欄位（比如你上傳檔案時）
	roomID, err := strconv.Atoi(roomIDStr)
	if err != nil {
		http.Error(w, "無效的 room_id", http.StatusBadRequest)
		return
	}

	uploadDir := "public/uploads"
	fileName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), handler.Filename)
	fullPath := filepath.Join(uploadDir, fileName)

	out, err := os.Create(fullPath)
	if err != nil {
		http.Error(w, "無法儲存檔案", http.StatusInternalServerError)
		return
	}
	defer out.Close()
	io.Copy(out, file)

	now := time.Now()
	var messageID int
	err = s.DB.QueryRow(`
		INSERT INTO messages (room_id, sender_id, content, created_at, updated_at)
		VALUES ($1, $2, '', $3, $4) RETURNING id
	`, roomID, userID, now, now).Scan(&messageID)
	if err != nil {
		http.Error(w, "寫入訊息失敗", http.StatusInternalServerError)
		return
	}

	_, err = s.DB.Exec(`
		INSERT INTO message_attachments (message_id, file_name, created_at)
		VALUES ($1, $2, $3)
	`, messageID, fileName, now)
	if err != nil {
		http.Error(w, "寫入附件失敗", http.StatusInternalServerError)
		return
	}

	// 查發送者名稱
	var sender string
	_ = s.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&sender)

	// 推播 WebSocket
	s.WSHub.Broadcast <- WSMessage{
		RoomID: roomID,
		Data: map[string]any{
			"type": "new_message",
			"message": map[string]any{
				"id":         messageID,
				"room_id":    roomID,
				"sender":     sender,
				"content":    "", // 空內容
				"attachment": "/uploads/" + fileName,
				"created_at": now.Format(time.RFC3339),
			},
		},
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message":   "上傳成功",
		"file_path": "/uploads/" + fileName,
	})
}
