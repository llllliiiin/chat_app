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
		log.Fatal("資料庫連線失敗:", err)
	}

	err = db.Ping()
	if err != nil {
		log.Fatal("❌ 資料庫連線失敗:", err)
	}

	s := &handlers.Server{DB: db}
	r := mux.NewRouter().StrictSlash(true)

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Println("🔍", r.Method, r.URL.Path)
			next.ServeHTTP(w, r)
		})
	})

	// 公開接口
	r.HandleFunc("/signup", s.SignupHandler).Methods("POST")
	r.HandleFunc("/login", s.LoginHandler).Methods("POST")

	// 受保護接口
	r.Handle("/get-or-create-room", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetOrCreateRoomHandler))).Methods("POST")
	r.Handle("/users", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetUsersHandler)))
	r.Handle("/messages", middleware.JWTAuthMiddleware(http.HandlerFunc(s.SendMessageHandler))).Methods("POST")
	r.Handle("/messages", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetMessagesHandler))).Methods("GET")

	// ✅ 加入群組相關接口，rooms指代資源集合，是一種命名規範，因爲必須要取得roomid所以要這麽寫
	r.Handle("/rooms", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetUserRoomsHandler))).Methods("GET")
	r.Handle("/create-group-room", middleware.JWTAuthMiddleware(http.HandlerFunc(s.CreateGroupRoomHandler))).Methods("POST")
	r.Handle("/rooms/{room_id}/join-group", middleware.JWTAuthMiddleware(http.HandlerFunc(s.JoinGroupRoomHandler))).Methods("GET")
	r.Handle("/rooms/{room_id}/info", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetRoomInfoHandler))).Methods("GET")
	r.Handle("/rooms/{room_id}/leave", middleware.JWTAuthMiddleware(http.HandlerFunc(s.LeaveGroupHandler))).Methods("POST")
	log.Println("✅ 所有路由成功掛載，包括 /create-group-room")

	r.Handle("/messages/{message_id}/read", middleware.JWTAuthMiddleware(http.HandlerFunc(s.MarkMessageAsReadHandler))).Methods("POST")
	r.Handle("/rooms/{room_id}/unread-count", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetUnreadMessageCountHandler))).Methods("GET")
	r.Handle("/messages/{message_id}/reads", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetMessageReadsHandler))).Methods("GET")

	// CORS 設定
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3001"},
		AllowCredentials: true,
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
	})

	log.Println("🚀 Server running on http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", c.Handler(r)))
}
