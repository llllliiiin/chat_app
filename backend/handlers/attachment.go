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

	"github.com/gorilla/mux"
)

// POST /messages/upload
func (s *Server) UploadMessageAttachmentHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "ログインされていません", http.StatusUnauthorized) // 未登入
		return
	}

	err = r.ParseMultipartForm(10 << 20) // 最大 10MB
	if err != nil {
		http.Error(w, "ファイル形式エラー", http.StatusBadRequest) // 檔案格式錯誤
		return
	}

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "ファイルが提供されていません", http.StatusBadRequest) // 未提供檔案
		return
	}
	defer file.Close()

	roomIDStr := r.FormValue("room_id") // フォームフィールド（例：ファイルアップロード時）
	roomID, err := strconv.Atoi(roomIDStr)
	if err != nil {
		http.Error(w, "無効な room_id", http.StatusBadRequest) // 無效的 room_id
		return
	}

	uploadDir := "public/uploads"
	fileName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), handler.Filename)
	fullPath := filepath.Join(uploadDir, fileName)

	out, err := os.Create(fullPath)
	if err != nil {
		http.Error(w, "ファイル保存に失敗しました", http.StatusInternalServerError) // 無法儲存檔案
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
		http.Error(w, "メッセージ書き込みに失敗しました", http.StatusInternalServerError) // 寫入訊息失敗
		return
	}

	_, err = s.DB.Exec(`
		INSERT INTO message_attachments (message_id, file_name, created_at)
		VALUES ($1, $2, $3)
	`, messageID, fileName, now)
	if err != nil {
		http.Error(w, "添付ファイルの保存に失敗しました", http.StatusInternalServerError) // 寫入附件失敗
		return
	}

	// 送信者名を取得
	var sender string
	_ = s.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&sender)

	// WebSocket 経由で新メッセージをブロードキャスト
	s.WSHub.Broadcast <- WSMessage{
		RoomID: roomID,
		Data: map[string]any{
			"type": "new_message",
			"message": map[string]any{
				"id":         messageID,
				"room_id":    roomID,
				"sender":     sender,
				"content":    "", // 空のメッセージ
				"attachment": "/uploads/" + fileName,
				"created_at": now.Format(time.RFC3339),
			},
		},
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"message":   "アップロード成功", // 上傳成功
		"file_path": "/uploads/" + fileName,
	})
}

// GET /downloads/{filename}
func (s *Server) DownloadAttachmentHandler(w http.ResponseWriter, r *http.Request) {
	filename := mux.Vars(r)["filename"]
	if filename == "" {
		http.Error(w, "ファイル名が無効です", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join("public", "uploads", filename)

	file, err := os.Open(filePath)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Type", "application/octet-stream")
	io.Copy(w, file)
}
