package main

import (
	"database/sql"
	"log"
	"net/http"

	gen "backend/api/gen"
	"backend/handlers"
	"backend/middleware"

	_ "github.com/lib/pq"
	"github.com/rs/cors"
	//JWT用
)

func main() {
	// db, err := sql.Open("postgres", "host=localhost port=5432 user=user password=password dbname=chat_app_db sslmode=disable")
	db, err := sql.Open("postgres", "host=db port=5432 user=user password=password dbname=chat_app_db sslmode=disable")
	if err != nil {
		log.Fatal("数据库连接失败:", err)
	}

	err = db.Ping()
	if err != nil {
		log.Fatal("❌ 数据库连接失败:", err)
	}

	// 👇 你的 handler 实现 ServerInterface（包含 Signup 方法）
	s := &handlers.Server{DB: db}

	handler, err := gen.NewServer(s) // ogen 生成的路由注册器
	if err != nil {
		log.Fatal("构建路由失败:", err)
	}

	protected := middleware.JWTAuthMiddleware(handler)

	log.Println("🚀 服务器启动中: http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", cors.Default().Handler(protected)))
	// log.Fatal(http.ListenAndServe(":8080", cors.Default().Handler(handler)))
}

// package main

// import (
// 	"database/sql"
// 	"fmt" // 格式化输出（如打印）
// 	"log"

// 	_ "github.com/lib/pq"
// )

// func main() {
// 	hasRows := false
// 	// 数据库连接字符串：根据你的 docker-compose 填写
// 	connStr := "host=localhost port=5432 user=user password=password dbname=chat_app_db sslmode=disable"

// 	db, err := sql.Open("postgres", connStr)//是 Go 语言中通过 database/sql 标准库连接 PostgreSQL 数据库的典型用法。sql.Open(driverName string, dataSourceName string)
// driverName：字符串 "postgres"，告诉 database/sql 使用注册的 PostgreSQL 驱动。
// dataSourceName（通常叫 connStr）：一个连接字符串，包含连接数据库所需的所有信息，如用户名、密码、主机、端口、数据库名和可选参数（如 sslmode=disable）。

// 	if err != nil {//nil是null的意思
// 		log.Fatal("连接参数错误:", err)
// 	}

// 	err = db.Ping()
// 	if err != nil {
// 		log.Fatal("❌ 数据库连接失败:", err)
// 	}

// 	fmt.Println("✅ 成功连接到数据库！")

// 	// 查询 users 表中的所有记录
// 	rows, err := db.Query("SELECT * FROM users")//函数 Query() 是明确返回两个值的：一个是查询结果，一个是错误对象；Go 会按照函数签名顺序，把第一个返回值赋给第一个变量，第二个返回值赋给第二个变量。
// 	if err != nil {
// 		log.Fatal("查询失败:", err)
// 	}
// 	// 关闭数据库查询结果集，释放数据库
// 	defer rows.Close()

// 	// 遍历查询结果
// 	for rows.Next() {
// 		var id int
// 		var username, passwordHash string
// 		hasRows =true
// 		// 使用了 &（取地址符号），其目的是 将变量的地址传递给 Scan 函数。
// 		// rows 是 *sql.Rows 类型的变量，代表数据库查询返回的结果集。
// 		err := rows.Scan(&id, &username, &passwordHash)
// 		if err != nil {
// 			log.Fatal("读取行数据失败:", err)
// 		}
// 		fmt.Printf("ID: %d | Username: %s | Password Hash: %s\n", id, username, passwordHash)
// 	}
// 	if !hasRows {
// 		fmt.Println("⚠️  users 表中没有任何数据")
// 	}
// 	// 检查是否有 rows.Next() 报错
// 	if err = rows.Err(); err != nil {
// 		log.Fatal("读取过程中出错:", err)
// 	}

// }
