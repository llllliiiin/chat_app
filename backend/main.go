package main

import (
	"database/sql"
	"log"
	"net/http"

	"backend/handlers"
	"backend/middleware"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
	"github.com/rs/cors"
)

func main() {
	db, err := sql.Open("postgres", "host=db port=5432 user=user password=password dbname=chat_app_db sslmode=disable")
	if err != nil {
		log.Fatal("❌ データベース接続失敗:", err) // 資料庫連線失敗
	}

	err = db.Ping()
	if err != nil {
		log.Fatal("❌ データベース接続確認失敗:", err) // 資料庫連線失敗
	}

	s := &handlers.Server{DB: db}
	r := mux.NewRouter().StrictSlash(true)

	// リクエストログ用ミドルウェア
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Println("🔍", r.Method, r.URL.Path)
			next.ServeHTTP(w, r)
		})
	})

	// 公開エンドポイント
	r.HandleFunc("/signup", s.SignupHandler).Methods("POST")
	r.HandleFunc("/login", s.LoginHandler).Methods("POST")

	// 保護されたエンドポイント（CookieベースのJWT検証）
	r.Handle("/get-or-create-room", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetOrCreateRoomHandler))).Methods("POST")
	r.Handle("/users", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetUsersHandler)))
	r.Handle("/messages", middleware.JWTAuthMiddleware(http.HandlerFunc(s.SendMessageHandler))).Methods("POST")
	r.Handle("/messages", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetMessagesHandler))).Methods("GET")

	// メッセージ撤回（2分以内・本人限定・全員から削除）
	r.Handle("/messages/{message_id}/revoke", middleware.JWTAuthMiddleware(http.HandlerFunc(s.RevokeMessageHandler))).Methods("POST")
	// メッセージ削除（本人の画面からのみ非表示）
	r.Handle("/messages/{message_id}/hide", middleware.JWTAuthMiddleware(http.HandlerFunc(s.HideMessageHandler))).Methods("POST")

	// ✅ グループチャット関連のエンドポイント（命名規則として rooms 使用）
	r.Handle("/rooms", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetUserRoomsHandler))).Methods("GET")
	r.Handle("/create-group-room", middleware.JWTAuthMiddleware(http.HandlerFunc(s.CreateGroupRoomHandler))).Methods("POST")
	r.Handle("/rooms/{room_id}/join-group", middleware.JWTAuthMiddleware(http.HandlerFunc(s.JoinGroupRoomHandler))).Methods("GET")
	r.Handle("/rooms/{room_id}/info", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetRoomInfoHandler))).Methods("GET")
	r.Handle("/rooms/{room_id}/leave", middleware.JWTAuthMiddleware(http.HandlerFunc(s.LeaveGroupHandler))).Methods("POST")
	log.Println("✅ /create-group-room を含むすべてのルートが登録されました")

	// メッセージ既読処理
	r.Handle("/messages/{message_id}/markread", middleware.JWTAuthMiddleware(http.HandlerFunc(s.MarkMessageAsReadHandler))).Methods("POST")
	r.Handle("/rooms/{room_id}/unread-count", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetUnreadMessageCountHandler))).Methods("GET")
	r.Handle("/messages/{message_id}/readers", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetMessageReadsHandler))).Methods("GET")

	// 一対一チャットルームの取得
	r.Handle("/oneroom", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetUserOneroomHandler))).Methods("GET")

	// ✅ 入室時の既読処理
	r.Handle("/rooms/{room_id}/enter", middleware.JWTAuthMiddleware(http.HandlerFunc(s.EnterRoomHandler))).Methods("POST")
	//tokenの取得
	r.Handle("/me", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetMeHandler))).Methods("GET")
	//tokenの削除
	r.Handle("/logout", http.HandlerFunc(s.LogoutHandler)).Methods("POST")

	//// WebSocket Hub を初期化
	hub := handlers.NewHub()
	// Goroutine を使って Hub のイベント処理をバックグラウンドで実行
	go hub.Run()
	// Hub を Server 構造体にバインド
	s.WSHub = hub

	// WebSocket 接続エンドポイント
	r.HandleFunc("/ws", s.WebSocketHandler(hub))

	// CORS 設定
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3001"},
		AllowCredentials: true,
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
	})

	// ✅ 添付ファイルのアップロードエンドポイント
	r.Handle("/messages/upload", middleware.JWTAuthMiddleware(http.HandlerFunc(s.UploadMessageAttachmentHandler))).Methods("POST")

	// ✅ 静的ファイル（画像）を提供 /uploads/xx.jpg
	r.PathPrefix("/uploads/").Handler(http.StripPrefix("/uploads/", http.FileServer(http.Dir("public/uploads"))))

	log.Println("🚀 サーバー起動: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", c.Handler(r)))
}
