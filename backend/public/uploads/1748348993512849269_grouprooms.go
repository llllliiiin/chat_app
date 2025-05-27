package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"backend/utils"

	"github.com/gorilla/mux"
)

type RoomInfo struct {
	ID       int    `json:"id"`
	RoomName string `json:"room_name"`
	IsGroup  bool   `json:"is_group"`
}

type RoomMembersResponse struct {
	Members []string `json:"members"`
}

// GET /rooms ユーザーが参加しているすべてのチャットルームを取得
func (s *Server) GetUserRoomsHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "トークンが無効です", http.StatusUnauthorized) // token無効
		return
	}

	rows, err := s.DB.Query(`
		SELECT cr.id, cr.room_name, cr.is_group
		FROM chat_rooms cr
		JOIN room_members rm ON cr.id = rm.room_id
		WHERE rm.user_id = $1
	`, userID)
	if err != nil {
		http.Error(w, "ルームの取得に失敗しました", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var rooms []RoomInfo
	for rows.Next() {
		var room RoomInfo
		if err := rows.Scan(&room.ID, &room.RoomName, &room.IsGroup); err == nil {
			rooms = append(rooms, room)
		}
	}

	json.NewEncoder(w).Encode(rooms)
}

// POST /create-group-room グループチャットルームを作成
func (s *Server) CreateGroupRoomHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "トークンが無効です", http.StatusUnauthorized) // token無効
		return
	}

	var payload struct {
		RoomName string `json:"room_name"`
		UserIDs  []int  `json:"user_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "データの解析に失敗しました", http.StatusBadRequest) // データの解析が失敗しました
		return
	}

	var roomID int
	err = s.DB.QueryRow(`SELECT id FROM chat_rooms WHERE room_name = $1 AND is_group = true`, payload.RoomName).Scan(&roomID)
	if err == sql.ErrNoRows {
		err = s.DB.QueryRow(
			`INSERT INTO chat_rooms (room_name, is_group) VALUES ($1, true) RETURNING id`,
			payload.RoomName,
		).Scan(&roomID)
		if err != nil {
			http.Error(w, "グループルームの作成に失敗しました", http.StatusInternalServerError)
			return
		}
	} else if err != nil {
		http.Error(w, "ルームデータの取得に失敗しました", http.StatusInternalServerError)
		return
	}

	memberSet := append(payload.UserIDs, userID)
	for _, uid := range memberSet {
		_, _ = s.DB.Exec(`INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, roomID, uid) // すでに存在する場合は何もしない
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"room_id": roomID,
		"message": "グループルームの作成に成功しました",
	})
}

// GET /rooms/{room_id}/join-group グループに参加
func (s *Server) JoinGroupRoomHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "トークンが無効です", http.StatusUnauthorized) // token無効
		return
	}

	///// ルーターで定義されたURLから変数を取得
	vars := mux.Vars(r)
	roomIDStr := vars["room_id"]
	roomID, err := strconv.Atoi(roomIDStr) // 文字列をintに変換
	if err != nil {
		http.Error(w, "無効な room_id", http.StatusBadRequest) // room_id無効
		return
	}

	err = s.DB.QueryRow("SELECT id FROM chat_rooms WHERE id = $1 AND is_group = true", roomID).Scan(&roomID)
	if err == sql.ErrNoRows {
		http.Error(w, "ルームが存在していません", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "ルームデータの取得に失敗しました", http.StatusInternalServerError)
		return
	}

	// var exists int
	// /// 実際のデータではなく、存在チェックをするだけ
	// s.DB.QueryRow("SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2", roomID, userID).Scan(&exists)
	// if exists != 1 {
	// 	_, err := s.DB.Exec("INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)", roomID, userID)
	// 	if err != nil {
	// 		http.Error(w, "参加に失敗しました", http.StatusInternalServerError)
	// 		return
	// 	}
	// }
	var exists bool
	err = s.DB.QueryRow(`
		SELECT EXISTS (
			SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2
		)
	`, roomID, userID).Scan(&exists)

	if err != nil {
		http.Error(w, "存在チェック失敗", http.StatusInternalServerError)
		return
	}

	if !exists {
		_, err := s.DB.Exec("INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)", roomID, userID)
		if err != nil {
			http.Error(w, "参加に失敗しました", http.StatusInternalServerError)
			return
		}
		// 👇 新しく入った場合にだけ入室通知を送る
		var username string
		err = s.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&username)
		if err != nil {
			http.Error(w, "ユーザー名の取得に失敗しました", http.StatusInternalServerError)
			return
		}

		s.WSHub.Broadcast <- WSMessage{
			RoomID: roomID,
			Data: map[string]any{
				"type": "user_entered",
				"user": username,
			},
		}
	}

	rows, err := s.DB.Query(`
		SELECT u.username
		FROM room_members rm
		JOIN users u ON rm.user_id = u.id
		WHERE rm.room_id = $1
	`, roomID)
	if err != nil {
		http.Error(w, "メンバーの取得に失敗しました", http.StatusInternalServerError)
		return
	}

	defer rows.Close()

	var members []string
	for rows.Next() {
		var username string
		if err := rows.Scan(&username); err == nil {
			members = append(members, username)
		}
	}

	json.NewEncoder(w).Encode(RoomMembersResponse{Members: members})
}

// GET /rooms/{room_id}/info ルーム名とグループかどうかを取得
func (s *Server) GetRoomInfoHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["room_id"]

	var roomName string
	var isGroup bool
	err := s.DB.QueryRow("SELECT room_name, is_group FROM chat_rooms WHERE id = $1", roomID).Scan(&roomName, &isGroup)
	if err == sql.ErrNoRows {
		http.Error(w, "ルームが存在していません", http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, "ルームデータの取得に失敗しました", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"room_name": roomName,
		"is_group":  isGroup,
	})
}

// POST /rooms/{room_id}/leave グループから退出
func (s *Server) LeaveGroupHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		http.Error(w, "トークンが無効です", http.StatusUnauthorized) // token無効
		return
	}

	vars := mux.Vars(r)
	roomIDStr := vars["room_id"]

	roomID, err := strconv.Atoi(roomIDStr)
	if err != nil {
		http.Error(w, "無効な room_id", http.StatusBadRequest) // room_id無効
		return
	}

	// ユーザー名を取得
	var username string
	err = s.DB.QueryRow("SELECT username FROM users WHERE id = $1", userID).Scan(&username)
	if err != nil {
		http.Error(w, "メンバーの取得に失敗しました", http.StatusInternalServerError)
		return
	}

	// room_members 関係を削除
	_, err = s.DB.Exec("DELETE FROM room_members WHERE room_id = $1 AND user_id = $2", roomID, userID)
	if err != nil {
		http.Error(w, "退室に失敗しました", http.StatusInternalServerError)
		return
	}

	// 退室通知を他のユーザーにブロードキャスト
	s.WSHub.Broadcast <- WSMessage{
		RoomID: roomID,
		Data: map[string]any{
			"type": "user_left",
			"user": username,
		},
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "退室に成功しました",
	})
}
