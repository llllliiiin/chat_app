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
	//连接 PostgreSQL 数据库，host=db 表示连接的是 Docker Compose 中的 db 服务。
	db, err := sql.Open("postgres", "host=db port=5432 user=user password=password dbname=chat_app_db sslmode=disable")
	if err != nil {
		log.Fatal("数据库连接失败:", err)
	}

	err = db.Ping()
	if err != nil {
		log.Fatal("❌ 数据库连接失败:", err)
	}
	//初始化你的 Handler 层，传入数据库对象。
	s := &handlers.Server{DB: db}
	//初始化 HTTP 路由器（类似 Express 或 Gin 的路由定义）。
	// r := mux.NewRouter()

	///////////////////////////////////
	r := mux.NewRouter().StrictSlash(true)

	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Println("🔍", r.Method, r.URL.Path)
			next.ServeHTTP(w, r)
		})
	})
	///////////////////////////////////////////

	// 注册公开接口：注册和登录（POST 请求）。
	r.HandleFunc("/signup", s.SignupHandler).Methods("POST")
	r.HandleFunc("/login", s.LoginHandler).Methods("POST")

	r.Handle("/get-or-create-room", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetOrCreateRoomHandler))).Methods("POST")

	//注册受 JWT 保护的 /users 接口，用来获取用户列表。
	r.Handle("/users", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetUsersHandler)))

	r.Handle("/messages", middleware.JWTAuthMiddleware(http.HandlerFunc(s.SendMessageHandler))).Methods("POST")
	r.Handle("/messages", middleware.JWTAuthMiddleware(http.HandlerFunc(s.GetMessagesHandler))).Methods("GET")

	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000", "http://localhost:3001"}, // ✅ 允许你的前端域名
		AllowCredentials: true,
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
	})

	log.Println("🚀 服务器启动中: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", c.Handler(r)))

	// log.Println("🚀 服务器启动中: http://localhost:8080")
	// //启动服务，监听 8080 端口，支持跨域请求（CORS）。
	// log.Fatal(http.ListenAndServe(":8080", cors.Default().Handler(r)))//这个默认配置只允许部分最基本的请求，不支持自定义来源 localhost:3001、带 token 的认证请求等。
}
