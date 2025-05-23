package handlers

import (
	"backend/utils"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sort"
)

type RoomRequest struct {
	User1 string `json:"user1"` // 現在のユーザー
	User2 string `json:"user2"` // 対象ユーザー
}

type RoomResponse struct {
	RoomID int `json:"room_id"`
}

// POST /oneroom 2人の間に1対1の部屋を取得または作成
func (s *Server) GetOrCreateRoomHandler(w http.ResponseWriter, r *http.Request) {
	var req RoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "リクエストボディの形式が無効です", http.StatusBadRequest) // 请求体格式错误
		return
	}

	// 2人のユーザーIDを取得
	var userIDs [2]int
	err := s.DB.QueryRow(`SELECT id FROM users WHERE username=$1`, req.User1).Scan(&userIDs[0])
	if err != nil {
		http.Error(w, "ユーザー1が見つかりません", http.StatusBadRequest) // 找不到用户1
		return
	}
	err = s.DB.QueryRow(`SELECT id FROM users WHERE username=$1`, req.User2).Scan(&userIDs[1])
	if err != nil {
		http.Error(w, "ユーザー2が見つかりません", http.StatusBadRequest) // 找不到用户2
		return
	}
	sort.Ints(userIDs[:]) // 一意性を保つため順番を固定する

	// 一意なルーム名を生成（ユーザー名を結合）
	roomName := req.User1 + "_" + req.User2

	// すでに2人が参加していて is_group = false の部屋が存在するか確認
	var roomID int
	query := `
		SELECT cr.id FROM chat_rooms cr
		JOIN room_members rm1 ON cr.id = rm1.room_id AND rm1.user_id = $1
		JOIN room_members rm2 ON cr.id = rm2.room_id AND rm2.user_id = $2
		WHERE cr.is_group = false
		LIMIT 1;
	`
	err = s.DB.QueryRow(query, userIDs[0], userIDs[1]).Scan(&roomID)

	if err == sql.ErrNoRows {
		// 新しい部屋を作成
		err = s.DB.QueryRow(
			`INSERT INTO chat_rooms (is_group, room_name) VALUES (false, $1) RETURNING id`,
			roomName,
		).Scan(&roomID)
		if err != nil {
			http.Error(w, "ルームの作成に失敗しました", http.StatusInternalServerError) // 创建房间失败
			return
		}
		// 両方のユーザーを room_members に追加
		_, err = s.DB.Exec(
			`INSERT INTO room_members (room_id, user_id) VALUES ($1, $2), ($1, $3)`,
			roomID, userIDs[0], userIDs[1],
		)
		if err != nil {
			http.Error(w, "ルームメンバーの追加に失敗しました", http.StatusInternalServerError) // 添加房间成员失败
			return
		}
	} else if err != nil {
		http.Error(w, "ルームの検索に失敗しました", http.StatusInternalServerError) // 查询房间失败
		return
	}

	json.NewEncoder(w).Encode(RoomResponse{RoomID: roomID})
}

// GET /oneroom 現在のユーザーが参加しているすべての1対1チャットルームを取得
func (s *Server) GetUserOneroomHandler(w http.ResponseWriter, r *http.Request) {
	userID, err := utils.GetUserIDFromToken(r)
	if err != nil {
		log.Println("❌ トークンの検証に失敗:", err)                              // token 驗證失敗
		http.Error(w, "ログインしていないか、トークンが無効です", http.StatusUnauthorized) // 未登录或無效 token
		return
	}

	// is_group = false の一対一チャットルームを取得
	rows, err := s.DB.Query(`
		SELECT cr.id, cr.room_name, cr.is_group
		FROM chat_rooms cr
		JOIN room_members rm ON cr.id = rm.room_id
		WHERE rm.user_id = $1 AND cr.is_group = false
	`, userID)
	if err != nil {
		log.Println("❌ ルームの取得に失敗:", err)                               // 查詢房間失敗
		http.Error(w, "ルームの取得に失敗しました", http.StatusInternalServerError) // 查詢房間失敗
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

	// 一対一チャットルームのリストを返す
	json.NewEncoder(w).Encode(rooms)
}
