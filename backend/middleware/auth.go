package middleware

import (
	"backend/utils"
	"net/http"
	"strings"
)

func JWTAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ✅ 白名单路径，直接放行
		if r.URL.Path == "/signup" || r.URL.Path == "/login" {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, "未提供 Token", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		_, err := utils.ValidateJWT(tokenString)
		if err != nil {
			http.Error(w, "Token 无效或已过期", http.StatusUnauthorized)
			return
		}

		// ✅ 验证通过，进入下一步
		next.ServeHTTP(w, r)
	})
}

// package middleware

// import (
// 	"backend/utils"
// 	"net/http"
// 	"strings"
// )

// func JWTAuthMiddleware(next http.Handler) http.Handler {
// 	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
// 		authHeader := r.Header.Get("Authorization")
// 		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
// 			http.Error(w, "未提供 Token", http.StatusUnauthorized)
// 			return
// 		}

// 		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
// 		_, err := utils.ValidateJWT(tokenString)
// 		if err != nil {
// 			http.Error(w, "Token 无效或已过期", http.StatusUnauthorized)
// 			return
// 		}

// 		next.ServeHTTP(w, r)
// 	})
// }
